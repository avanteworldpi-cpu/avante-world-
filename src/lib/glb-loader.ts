import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface LoadedAvatar {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

export async function loadAvatarGLB(url: string): Promise<LoadedAvatar> {
  const loader = new GLTFLoader();
  loader.crossOrigin = 'anonymous';

  return new Promise((resolve, reject) => {
    let finalUrl = url;

    if (url.includes('readyplayer.me')) {
      finalUrl = url + (url.includes('?') ? '&' : '?') + 'quality=medium&lod=0&textureAtlas=1024';
    }

    loader.load(
      finalUrl,
      (gltf) => {
        const scene = gltf.scene;
        const animations = gltf.animations || [];
        const mixer = new THREE.AnimationMixer(scene);

        scene.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        scene.scale.set(1, 1, 1);
        scene.position.set(0, 0, 0);

        resolve({ scene, animations, mixer });
      },
      undefined,
      (error) => {
        console.error('Failed to load avatar from', finalUrl, error);
        reject(error);
      }
    );
  });
}

export async function loadCharacterGLB(): Promise<LoadedAvatar> {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      '/assets/character.glb',
      (gltf) => {
        const scene = gltf.scene;
        const animations = gltf.animations || [];
        const mixer = new THREE.AnimationMixer(scene);

        scene.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
          }
        });

        scene.scale.set(0.00005, 0.00005, 0.00005);
        scene.position.set(0, 0, 0);

        resolve({ scene, animations, mixer });
      },
      undefined,
      (error) => {
        console.error('Failed to load character from /assets/character.glb', error);
        reject(error);
      }
    );
  });
}

// ---------------------------------------------------------
// ANIMATION HELPERS
// ---------------------------------------------------------
export function getAnimationClip(
  animations: THREE.AnimationClip[],
  name: string
): THREE.AnimationClip | undefined {
  return animations.find((clip) =>
    clip.name.toLowerCase().includes(name.toLowerCase())
  );
}

export function playAnimation(
  mixer: THREE.AnimationMixer,
  animationClip: THREE.AnimationClip,
  loop: boolean = true
): THREE.AnimationAction {
  const action = mixer.clipAction(animationClip);
  action.clampWhenFinished = !loop;
  action.play();
  return action;
}

export function stopAnimation(action: THREE.AnimationAction): void {
  action.stop();
}

// ---------------------------------------------------------
// FALLBACK PLACEHOLDER SPHERE CHARACTER
// ---------------------------------------------------------
export function createIdleCharacter(): THREE.Group {
  const group = new THREE.Group();

  const geometry = new THREE.CapsuleGeometry(0.3, 1.5, 8, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6495ed,
    metalness: 0.1,
    roughness: 0.8,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = 0.75;
  group.add(mesh);

  const headGeometry = new THREE.SphereGeometry(0.25, 32, 32);
  const headMesh = new THREE.Mesh(headGeometry, material);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.position.set(0, 2, 0);
  group.add(headMesh);

  return group;
}
