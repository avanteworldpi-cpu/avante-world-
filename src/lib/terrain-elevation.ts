import * as THREE from 'three';
import { GeoOrigin, planeToGeo } from './avatar-system';
import { supabase } from './supabase';

/**
 * Open Topo Data's public server never sends Access-Control-Allow-Origin, so a
 * direct browser fetch to it is blocked by CORS in every environment (confirmed
 * live, not assumed -- this cost real debugging time before the proxy went in).
 * The `terrain-elevation` Supabase Edge Function makes the same request
 * server-to-server, where CORS doesn't apply, and re-serves the result with its
 * own CORS headers so the browser only ever talks to our own project's origin.
 */
const TERRAIN_ELEVATION_FUNCTION = 'terrain-elevation';

/**
 * 9x9 = 81 points, safely under Open Topo Data's 100-point batch limit in a
 * single request. Coarse on purpose -- this is a low-poly world, and over-fetching
 * against a free public service for terrain nobody will see the fine detail of
 * would be a poor trade.
 */
const GRID_SIZE = 9;

/**
 * Matches the ground plane's own half-extent (AvatarMapView.tsx's 100x100
 * PlaneGeometry, centred on the spawn origin) so the sampled footprint lines up
 * exactly with the mesh being displaced.
 */
const GRID_HALF_EXTENT_METERS = 50;

/** Row/col index of the grid's centre point -- exact since GRID_SIZE is odd. */
const CENTER_INDEX = Math.floor(GRID_SIZE / 2);

/**
 * Multiplier applied to real elevation variance after rebasing to the spawn
 * origin. 1.0 = true real-world elevation (the original intensity). Lower
 * values flatten the terrain while keeping its real shape/contours -- this
 * is a visual-intensity dial, not a removal of the real elevation system.
 */
const ELEVATION_INTENSITY = 0.25; // starting guess, tune after a live look

export interface ElevationGrid {
  size: number;
  halfExtent: number;
  /**
   * Row-major, length size*size: index = col + size*row. Row 0 is the southern
   * edge (plane z = -halfExtent), row size-1 the northern edge; col 0 is the
   * western edge (plane x = -halfExtent), col size-1 the eastern edge. This is
   * the same row-major order PlaneGeometry itself lays out vertices in (traced
   * in a throwaway experiment against the ground mesh's own rotation, not
   * assumed), so buildTerrainGeometry can write these values straight across
   * without remapping indices.
   *
   * Values are rebased so the spawn origin (the exact centre point of this
   * grid) sits at 0 -- see fetchTerrainElevation for why.
   */
  values: number[];
}

/**
 * Regular in PLANE space (metres), not lat/lng: projecting a regular lat/lng grid
 * would distort east-west spacing away from the equator (the same cos(lat) effect
 * geoToPlane corrects for), leaving the sampled points *not* lined up with the
 * evenly-spaced mesh vertices they're meant to displace. Projecting a
 * plane-regular grid through planeToGeo keeps the two regular in the space that
 * actually matters -- the mesh.
 */
function buildSampleGrid(origin: GeoOrigin): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  const step = (2 * GRID_HALF_EXTENT_METERS) / (GRID_SIZE - 1);

  for (let row = 0; row < GRID_SIZE; row++) {
    const z = row * step - GRID_HALF_EXTENT_METERS;
    for (let col = 0; col < GRID_SIZE; col++) {
      const x = col * step - GRID_HALF_EXTENT_METERS;
      points.push(planeToGeo(x, z, origin));
    }
  }

  return points;
}

interface OpenTopoDataResult {
  elevation: number | null;
}

interface OpenTopoDataResponse {
  status: string;
  results?: OpenTopoDataResult[];
}

/**
 * One Open Topo Data round trip (via the terrain-elevation edge function) per
 * world load, centred on the spawn origin. Same failure shape as
 * fetchOsmGeometry: try/catch, console.warn (not console.error), and a null
 * fallback rather than throwing, so a rate-limited or down free public service
 * (or a down/misconfigured proxy function) degrades to today's flat ground
 * rather than blocking world load or crashing.
 */
export async function fetchTerrainElevation(origin: GeoOrigin): Promise<ElevationGrid | null> {
  try {
    const points = buildSampleGrid(origin);
    const locations = points.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');

    const { data, error } = await supabase.functions.invoke<OpenTopoDataResponse>(
      TERRAIN_ELEVATION_FUNCTION,
      { body: { locations } }
    );

    if (error) {
      throw error;
    }
    if (!data || data.status !== 'OK' || !data.results || data.results.length !== GRID_SIZE * GRID_SIZE) {
      throw new Error(`Unexpected terrain-elevation response: ${JSON.stringify(data).slice(0, 200)}`);
    }

    const raw = data.results.map((r) => r.elevation ?? 0);
    const centerIndex = CENTER_INDEX + GRID_SIZE * CENTER_INDEX;
    const originElevation = raw[centerIndex];

    // Rebased relative to the spawn origin's own elevation, not used raw: real
    // elevation is above-sea-level, and everything else in this scene (the
    // avatar's initial position, the camera, the ground plane's old flat y=0)
    // assumes the spawn point sits near y=0. Johannesburg sits ~1750m above sea
    // level -- displacing by raw elevation would put the whole ground plane
    // (and, via sampleHeight, the character) ~1750 units away from the camera
    // and lighting that were set up assuming a near-zero origin.
    const values = raw.map((v) => (v - originElevation) * ELEVATION_INTENSITY);

    return { size: GRID_SIZE, halfExtent: GRID_HALF_EXTENT_METERS, values };
  } catch (error) {
    console.warn('Terrain elevation fetch failed, ground will render flat:', error);
    return null;
  }
}

/**
 * Pure -- takes an already-fetched, already-rebased grid and returns a displaced
 * ground geometry. Kept apart from fetchTerrainElevation so it's testable without
 * a live network call, same split as buildOsmMeshes/fetchOsmGeometry.
 *
 * Displacement writes each vertex's LOCAL Z, not X or Y: the ground mesh uses the
 * same rotation.x = -Math.PI/2 as the OSM plot markers, under which local (x,y,z)
 * becomes world (x,z,-y) -- so world Y (height) comes from local Z. Confirmed with
 * a throwaway script that built a real PlaneGeometry, applied that exact rotation
 * via THREE's own matrix math, and logged local-vs-world positions for distinct
 * per-vertex dummy values -- not assumed from reading PlaneGeometry's source.
 * PlaneGeometry(2*halfExtent, 2*halfExtent, size-1, size-1) produces exactly
 * size*size vertices in the same row-major order grid.values is already in, so
 * no index remapping is needed between the two.
 */
export function buildTerrainGeometry(grid: ElevationGrid): THREE.PlaneGeometry {
  const span = grid.halfExtent * 2;
  const segments = grid.size - 1;
  const geometry = new THREE.PlaneGeometry(span, span, segments, segments);
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i++) {
    position.setZ(i, grid.values[i]);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Bilinearly interpolated ground height at plane-space (x, z), for the character
 * to walk on. The grid is deliberately coarse/blocky (matching the low-poly
 * roads/plots aesthetic), so bilinear-within-the-enclosing-cell is precise enough
 * -- matching the mesh's own flat-shaded-per-quad surface exactly would be
 * over-engineering for terrain this coarse.
 *
 * Clamped to the grid's sampled bounds rather than extrapolating: the boundary
 * spring keeps the character within +/-48m (WORLD_HALF_EXTENT_METERS), safely
 * inside this +/-50m grid, so clamping should never actually engage in practice --
 * but a future change to that margin, or a caller passing an unclamped position,
 * should degrade to "nearest edge height" rather than NaN or a crash.
 */
export function sampleHeight(grid: ElevationGrid, x: number, z: number): number {
  const { size, halfExtent, values } = grid;
  const cellSize = (halfExtent * 2) / (size - 1);

  const clampedX = Math.max(-halfExtent, Math.min(halfExtent, x));
  const clampedZ = Math.max(-halfExtent, Math.min(halfExtent, z));

  const gx = (clampedX + halfExtent) / cellSize;
  const gz = (clampedZ + halfExtent) / cellSize;

  // floor(gx)/floor(gz) land in [0, size-1] since clampedX/clampedZ are already
  // bounded to +/-halfExtent; capped at size-2 so col1/row1 (col0+1/row0+1)
  // never reach past the last valid index.
  const col0 = Math.min(Math.floor(gx), size - 2);
  const row0 = Math.min(Math.floor(gz), size - 2);
  const col1 = col0 + 1;
  const row1 = row0 + 1;

  const tx = gx - col0;
  const tz = gz - row0;

  const h00 = values[col0 + size * row0];
  const h10 = values[col1 + size * row0];
  const h01 = values[col0 + size * row1];
  const h11 = values[col1 + size * row1];

  const h0 = h00 + (h10 - h00) * tx;
  const h1 = h01 + (h11 - h01) * tx;
  return h0 + (h1 - h0) * tz;
}
