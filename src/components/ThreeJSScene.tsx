import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AvatarCharacter, WALK_SPEED_MPS } from '../lib/avatar-system';

interface ThreeJSSceneProps {
  avatarUrl: string | null;
  startLocation: [number, number];
}

export function ThreeJSScene({ avatarUrl, startLocation }: ThreeJSSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const avatarRef = useRef<AvatarCharacter | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 6);
    camera.lookAt(0, 0.8, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a4e,
      metalness: 0.1,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const avatar = new AvatarCharacter(scene, startLocation, avatarUrl, {
      scale: 1,
      speed: WALK_SPEED_MPS,
      animationSpeed: 0.1,
    });
    avatarRef.current = avatar;

    const handleResize = () => {
      const newWidth = containerRef.current?.clientWidth || width;
      const newHeight = containerRef.current?.clientHeight || height;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    let lastTime = Date.now();
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      const currentTime = Date.now();
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      avatar.update(deltaTime);

      const avatarModel = avatar.getModel();
      if (avatarModel) {
        const targetDistance = 6;
        const targetHeight = 1.5;
        const targetLookHeight = 0.8;

        const direction = new THREE.Vector3();
        direction.subVectors(avatarModel.position, camera.position);
        direction.normalize();

        const desiredX = avatarModel.position.x + direction.x * -targetDistance;
        const desiredZ = avatarModel.position.z + direction.z * -targetDistance;
        const desiredY = avatarModel.position.y + targetHeight;

        const smoothing = 0.05;
        camera.position.x += (desiredX - camera.position.x) * smoothing;
        camera.position.y += (desiredY - camera.position.y) * smoothing;
        camera.position.z += (desiredZ - camera.position.z) * smoothing;

        camera.lookAt(avatarModel.position.x, avatarModel.position.y + targetLookHeight, avatarModel.position.z);
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      avatar.dispose();
      renderer.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [avatarUrl, startLocation]);

  return (
    <div ref={containerRef} className="w-full h-screen relative">
      <div className="absolute top-6 left-6 z-10 bg-gray-900 bg-opacity-80 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
        <div className="text-white">
          <p className="text-xs text-gray-400 mb-1">COORDINATES</p>
          <p className="text-sm font-mono">
            {startLocation[0].toFixed(4)}, {startLocation[1].toFixed(4)}
          </p>
        </div>
      </div>

    </div>
  );
}
