import * as THREE from 'three';
import { geoToPlane, GeoOrigin, METERS_PER_DEGREE_LAT } from './avatar-system';

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Comfortably past WORLD_HALF_EXTENT_METERS (48) so roads/plots crossing the
 * world boundary aren't awkwardly truncated right at the edge the character
 * can actually reach.
 */
const FETCH_RADIUS_METERS = 65;

export const ROAD_WIDTH_METERS = 5;

/**
 * Small, distinct y-offsets so flat road/plot surfaces don't z-fight with the
 * ground plane (y=0) or each other -- this is the actual fix for flat-surface
 * flicker, not a road-width concern.
 */
const ROAD_LAYER_Y = 0.02;
const PLOT_LAYER_Y = 0.04;

const HIGHWAY_TYPES =
  '^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified|service|pedestrian|footway|path|track)$';

interface OverpassNode {
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassNode[];
}

export interface OverpassResponse {
  elements: OverpassWay[];
}

export interface OsmMeshes {
  roads: THREE.Mesh | null;
  plots: THREE.Mesh | null;
}

function bboxAround(origin: GeoOrigin, radiusMeters: number) {
  // Same projection convention as geoToPlane/AvatarCharacter: latitude is a flat
  // metres-per-degree constant, longitude is scaled by cos(origin.lat) so the
  // bbox is roughly square in real-world metres rather than degrees.
  const latRadiusDegrees = radiusMeters / METERS_PER_DEGREE_LAT;
  const lngScale = Math.cos(origin.lat * (Math.PI / 180));
  const lngRadiusDegrees = radiusMeters / (METERS_PER_DEGREE_LAT * lngScale);

  return {
    south: origin.lat - latRadiusDegrees,
    north: origin.lat + latRadiusDegrees,
    west: origin.lng - lngRadiusDegrees,
    east: origin.lng + lngRadiusDegrees,
  };
}

function buildQuery(bbox: { south: number; west: number; north: number; east: number }): string {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `
    [out:json][timeout:25];
    (
      way["highway"~"${HIGHWAY_TYPES}"](${bboxStr});
      way["building"](${bboxStr});
    );
    out geom;
  `;
}

/**
 * One Overpass round trip per world load, centered on the spawn origin.
 * Matches road-snapper.ts's exact failure pattern: try/catch around the fetch,
 * console.warn (not console.error) on failure, and a benign empty fallback
 * instead of throwing -- so a network hiccup degrades to today's plain flat
 * world rather than blocking load or crashing. A legitimately empty result
 * (sparse/remote spawn point) takes the same non-error path as a filled one;
 * it's never routed through the catch block.
 */
export async function fetchOsmGeometry(
  origin: GeoOrigin,
  radiusMeters: number = FETCH_RADIUS_METERS
): Promise<OverpassResponse> {
  try {
    const bbox = bboxAround(origin, radiusMeters);
    const query = buildQuery(bbox);

    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'application/osm3s' },
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('OSM geometry fetch failed, world will render without roads/plots:', error);
    return { elements: [] };
  }
}

function buildRoadsMesh(ways: OverpassWay[], origin: GeoOrigin): THREE.Mesh | null {
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;
  const halfWidth = ROAD_WIDTH_METERS / 2;

  for (const way of ways) {
    const nodes = way.geometry;
    if (!nodes || nodes.length < 2) continue;

    const points = nodes.map((node) => geoToPlane(node.lat, node.lon, origin));

    // Quad strip per segment, simple overlapping joins at corners (not
    // mitered) -- acceptable at this fidelity per spec.
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      if (length === 0) continue;

      // Perpendicular unit vector in the XZ plane.
      const nx = -dz / length;
      const nz = dx / length;

      positions.push(
        a.x + nx * halfWidth, ROAD_LAYER_Y, a.z + nz * halfWidth,
        a.x - nx * halfWidth, ROAD_LAYER_Y, a.z - nz * halfWidth,
        b.x + nx * halfWidth, ROAD_LAYER_Y, b.z + nz * halfWidth,
        b.x - nx * halfWidth, ROAD_LAYER_Y, b.z - nz * halfWidth
      );
      indices.push(
        vertexOffset, vertexOffset + 1, vertexOffset + 2,
        vertexOffset + 1, vertexOffset + 3, vertexOffset + 2
      );
      vertexOffset += 4;
    }
  }

  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildPlotsMesh(ways: OverpassWay[], origin: GeoOrigin): THREE.Mesh | null {
  const shapes: THREE.Shape[] = [];

  for (const way of ways) {
    const nodes = way.geometry;
    // Need at least 3 distinct corners plus the closing repeat of the first.
    if (!nodes || nodes.length < 4) continue;

    const points = nodes.map((node) => geoToPlane(node.lat, node.lon, origin));

    // THREE.Shape is built in local XY, then the mesh below is rotated the same
    // way the ground plane is (rotation.x = -Math.PI/2). That rotation maps
    // local (x, y, 0) -> world (x, 0, -y), so using -z here is what makes the
    // rotated result land at the same world (x, z) that geoToPlane produced.
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, -points[0].z);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, -points[i].z);
    }
    shapes.push(shape);
  }

  if (shapes.length === 0) return null;

  // Flat (ShapeGeometry, not ExtrudeGeometry) -- these are vacant parcel
  // markers, not structures. PLACEHOLDER VISUAL ONLY: the real claimable-plot
  // visual standard (what a business/user's claimed plot looks like once
  // Avante World custom-builds it) is a separate, not-yet-defined effort. This
  // translucent amber fill + outline is deliberately plain and meant to be
  // trivially swappable, not a design decision about that standard.
  const geometry = new THREE.ShapeGeometry(shapes);
  const material = new THREE.MeshBasicMaterial({
    color: 0xef9f27, // mirrors the Tailwind `accent` token (#EF9F27) -- not importable into a Three.js material, so duplicated here intentionally.
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = PLOT_LAYER_Y;

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xef9f27 })
  );
  mesh.add(outline);

  return mesh;
}

/**
 * Pure -- takes already-parsed Overpass data and an origin, returns Three.js
 * meshes. Kept apart from fetchOsmGeometry so it's testable without a live
 * network call.
 */
export function buildOsmMeshes(data: OverpassResponse, origin: GeoOrigin): OsmMeshes {
  const elements = data.elements ?? [];

  const roadWays = elements.filter((el) => el.type === 'way' && el.tags?.highway);
  const buildingWays = elements.filter((el) => el.type === 'way' && el.tags?.building);

  return {
    roads: buildRoadsMesh(roadWays, origin),
    plots: buildPlotsMesh(buildingWays, origin),
  };
}

/** Mirrors AvatarCharacter.dispose()'s traverse-and-dispose idiom for its own model. */
export function disposeOsmMeshes(meshes: OsmMeshes): void {
  [meshes.roads, meshes.plots].forEach((mesh) => {
    if (!mesh) return;
    mesh.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
        node.geometry.dispose();
        if (Array.isArray(node.material)) {
          node.material.forEach((m) => m.dispose());
        } else {
          node.material.dispose();
        }
      }
    });
  });
}
