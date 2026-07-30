import * as THREE from 'three';
import { geoToPlane, GeoOrigin, METERS_PER_DEGREE_LAT } from './avatar-system';
import { ElevationGrid, sampleHeight } from './terrain-elevation';

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Comfortably past WORLD_HALF_EXTENT_METERS (48) so roads/plots crossing the
 * world boundary aren't awkwardly truncated right at the edge the character
 * can actually reach.
 */
const FETCH_RADIUS_METERS = 65;

export const ROAD_WIDTH_METERS = 5;

/**
 * Small, distinct offsets ABOVE the sampled terrain height at each vertex, so
 * road/plot surfaces don't z-fight with the (possibly-displaced) ground plane
 * or each other -- this is the actual fix for flat-surface flicker, not a
 * road-width concern. Added on top of sampleHeight()'s result per vertex, not
 * used as an absolute Y -- a flat absolute Y only ever looked right exactly at
 * the spawn origin (where the terrain grid is rebased to 0), and floated or
 * buried everywhere else once real elevation varied.
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

function buildRoadsMesh(ways: OverpassWay[], origin: GeoOrigin, grid: ElevationGrid | null): THREE.Mesh | null {
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;
  const halfWidth = ROAD_WIDTH_METERS / 2;

  // Real terrain height at this vertex's own (x, z), same sampleHeight() used
  // for the ground plane, vegetation, and the character's own Y -- falls back
  // to flat (0) if the terrain fetch hasn't resolved yet, same as the ground
  // plane's own pre-terrain state.
  const groundY = (x: number, z: number) => (grid ? sampleHeight(grid, x, z) : 0) + ROAD_LAYER_Y;

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

      const ax0 = a.x + nx * halfWidth;
      const az0 = a.z + nz * halfWidth;
      const ax1 = a.x - nx * halfWidth;
      const az1 = a.z - nz * halfWidth;
      const bx0 = b.x + nx * halfWidth;
      const bz0 = b.z + nz * halfWidth;
      const bx1 = b.x - nx * halfWidth;
      const bz1 = b.z - nz * halfWidth;

      positions.push(
        ax0, groundY(ax0, az0), az0,
        ax1, groundY(ax1, az1), az1,
        bx0, groundY(bx0, bz0), bz0,
        bx1, groundY(bx1, bz1), bz1
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

function buildPlotsMesh(ways: OverpassWay[], origin: GeoOrigin, grid: ElevationGrid | null): THREE.Mesh | null {
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

  // ShapeGeometry is flat -- every vertex's local z is 0, which after the
  // rotation.x = -PI/2 below becomes a uniform world Y across the whole plot.
  // Displace each vertex's local z individually instead, using the real
  // terrain height at ITS OWN world (x, z) -- same sampleHeight() used for the
  // ground plane, roads, vegetation, and the character's own Y. Local (x, y)
  // -> world (x, z) here is (x, -y), the inverse of the shape.moveTo/lineTo
  // authoring convention above; local z -> world Y is what we're writing.
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const worldX = position.getX(i);
    const worldZ = -position.getY(i);
    position.setZ(i, (grid ? sampleHeight(grid, worldX, worldZ) : 0) + PLOT_LAYER_Y);
  }
  position.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    color: 0xef9f27, // mirrors the Tailwind `accent` token (#EF9F27) -- not importable into a Three.js material, so duplicated here intentionally.
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xef9f27 })
  );
  mesh.add(outline);

  return mesh;
}

/**
 * Pure -- takes already-parsed Overpass data, an origin, and whatever terrain
 * grid is available yet (null if that fetch hasn't resolved, since this and
 * fetchTerrainElevation run in parallel with no ordering guarantee between
 * them), returns Three.js meshes. Kept apart from fetchOsmGeometry so it's
 * testable without a live network call.
 *
 * If grid is null here, call applyOsmHeights() once the terrain fetch does
 * resolve to resettle these onto real elevation -- the same two-step pattern
 * vegetation.ts's buildVegetation/applyVegetationHeights already use for
 * exactly this "built before its height data existed" case.
 */
export function buildOsmMeshes(data: OverpassResponse, origin: GeoOrigin, grid: ElevationGrid | null): OsmMeshes {
  const elements = data.elements ?? [];

  const roadWays = elements.filter((el) => el.type === 'way' && el.tags?.highway);
  const buildingWays = elements.filter((el) => el.type === 'way' && el.tags?.building);

  return {
    roads: buildRoadsMesh(roadWays, origin, grid),
    plots: buildPlotsMesh(buildingWays, origin, grid),
  };
}

/**
 * Resamples every road/plot vertex's height against a newly-resolved terrain
 * grid, in place. Only needed when buildOsmMeshes ran before the terrain
 * fetch resolved (grid was null then) -- if terrain had already resolved by
 * the time the OSM fetch landed, buildOsmMeshes already sampled real heights
 * directly and there's nothing to redo. No-op per mesh that's null (OSM fetch
 * failed or returned no matching data).
 */
export function applyOsmHeights(meshes: OsmMeshes, grid: ElevationGrid): void {
  if (meshes.roads) {
    const position = meshes.roads.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, sampleHeight(grid, position.getX(i), position.getZ(i)) + ROAD_LAYER_Y);
    }
    position.needsUpdate = true;
    meshes.roads.geometry.computeVertexNormals();
  }

  if (meshes.plots) {
    const position = meshes.plots.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const worldX = position.getX(i);
      const worldZ = -position.getY(i);
      position.setZ(i, sampleHeight(grid, worldX, worldZ) + PLOT_LAYER_Y);
    }
    position.needsUpdate = true;

    // The outline is a one-time snapshot (EdgesGeometry) of the geometry taken
    // at construction -- it doesn't track position updates on its own, so it
    // needs rebuilding from the now-resampled geometry too.
    const outline = meshes.plots.children.find(
      (child): child is THREE.LineSegments => child instanceof THREE.LineSegments
    );
    if (outline) {
      outline.geometry.dispose();
      outline.geometry = new THREE.EdgesGeometry(meshes.plots.geometry);
    }
  }
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
