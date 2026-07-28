import * as THREE from 'three';
import { ElevationGrid, sampleHeight } from './terrain-elevation';

/** "Simple decorative," not a forest -- a modest scatter across the walkable area. */
const TREE_COUNT = 30;

/**
 * Matches the terrain grid's own footprint (ElevationGrid.halfExtent) so every
 * scattered position is one sampleHeight() can actually answer, rather than
 * falling outside the sampled area and silently clamping to its edge.
 */
const SCATTER_HALF_EXTENT_METERS = 50;

const TRUNK_RADIUS_TOP = 0.11;
const TRUNK_RADIUS_BOTTOM = 0.16;
const TRUNK_HEIGHT = 1.4;
/** Low segment counts throughout -- same low-poly aesthetic as the OSM roads/plots. */
const TRUNK_RADIAL_SEGMENTS = 6;

const FOLIAGE_RADIUS = 0.9;
const FOLIAGE_HEIGHT = 2.2;
const FOLIAGE_RADIAL_SEGMENTS = 7;
/** Sunk slightly into the trunk top so the two shapes read as one tree, not a stacked pair. */
const FOLIAGE_TRUNK_OVERLAP = 0.3;

const TRUNK_COLOR = 0x4a3728;
const FOLIAGE_COLOR = 0x2f6b3a;

/** Fixed per-tree placement chosen once at build time; only the Y each resolves to changes. */
interface TreeInstance {
  x: number;
  z: number;
  scale: number;
  rotationY: number;
}

export interface VegetationMeshes {
  trunks: THREE.InstancedMesh;
  foliage: THREE.InstancedMesh;
  instances: TreeInstance[];
}

const dummy = new THREE.Object3D();

/**
 * Writes every instance's matrix from its fixed x/z/scale/rotation plus a ground
 * Y looked up in `grid` (flat, at 0, if `grid` is null). Called once at build time
 * with whatever's available yet, and again with the resolved grid once
 * fetchTerrainElevation lands -- the same "instant flat, then settle onto real
 * terrain" two-step the ground mesh itself already goes through, so trees don't
 * end up floating above or sunk into the displaced ground once it arrives.
 */
export function applyVegetationHeights(vegetation: VegetationMeshes, grid: ElevationGrid | null): void {
  const { trunks, foliage, instances } = vegetation;

  instances.forEach(({ x, z, scale, rotationY }, i) => {
    const groundY = grid ? sampleHeight(grid, x, z) : 0;
    const trunkTopY = groundY + TRUNK_HEIGHT * scale;

    dummy.position.set(x, groundY + (TRUNK_HEIGHT * scale) / 2, z);
    dummy.rotation.set(0, rotationY, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    const foliageBaseY = trunkTopY - FOLIAGE_TRUNK_OVERLAP * scale;
    dummy.position.set(x, foliageBaseY + (FOLIAGE_HEIGHT * scale) / 2, z);
    dummy.updateMatrix();
    foliage.setMatrixAt(i, dummy.matrix);
  });

  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
}

/**
 * Procedural trees (cone + cylinder), scattered at random x/z with no real-world
 * basis -- no OSM greenery data involved. `grid` is read once for the initial
 * placement (pass null to plant on flat ground before terrain has resolved; call
 * applyVegetationHeights again later to resettle onto real elevation).
 *
 * One InstancedMesh per part rather than one mesh per tree, so `count` trees cost
 * two draw calls total regardless of how many there are.
 */
export function buildVegetation(grid: ElevationGrid | null, count = TREE_COUNT): VegetationMeshes {
  const trunkGeometry = new THREE.CylinderGeometry(
    TRUNK_RADIUS_TOP,
    TRUNK_RADIUS_BOTTOM,
    TRUNK_HEIGHT,
    TRUNK_RADIAL_SEGMENTS
  );
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: TRUNK_COLOR,
    roughness: 0.9,
    flatShading: true,
  });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
  trunks.castShadow = true;
  trunks.receiveShadow = true;

  const foliageGeometry = new THREE.ConeGeometry(FOLIAGE_RADIUS, FOLIAGE_HEIGHT, FOLIAGE_RADIAL_SEGMENTS);
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: FOLIAGE_COLOR,
    roughness: 0.85,
    flatShading: true,
  });
  const foliage = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, count);
  foliage.castShadow = true;
  foliage.receiveShadow = true;

  // A little per-tree size variance and a random heading keep the low-poly
  // facets from all lining up identically across every instance.
  const instances: TreeInstance[] = Array.from({ length: count }, () => ({
    x: (Math.random() * 2 - 1) * SCATTER_HALF_EXTENT_METERS,
    z: (Math.random() * 2 - 1) * SCATTER_HALF_EXTENT_METERS,
    scale: 0.8 + Math.random() * 0.5,
    rotationY: Math.random() * Math.PI * 2,
  }));

  const vegetation: VegetationMeshes = { trunks, foliage, instances };
  applyVegetationHeights(vegetation, grid);
  return vegetation;
}

/** Same shape as disposeOsmMeshes: disposes GPU resources; removing from the scene is the caller's job. */
export function disposeVegetation(vegetation: VegetationMeshes): void {
  [vegetation.trunks, vegetation.foliage].forEach((mesh) => {
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => m.dispose());
    } else {
      mesh.material.dispose();
    }
  });
}
