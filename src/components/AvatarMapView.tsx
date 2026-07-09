import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as THREE from 'three';
import { AvatarCharacter } from '../lib/avatar-system';

interface AvatarMapViewProps {
  avatarUrl: string | null;
  startLocation: [number, number];
}

export function AvatarMapView({ avatarUrl, startLocation }: AvatarMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const arrowMarkerRef = useRef<L.Marker | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const avatarRef = useRef<AvatarCharacter | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(true);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current).setView([startLocation[0], startLocation[1]], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([startLocation[0], startLocation[1]], {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNCIgZmlsbD0iIzNFODJGNiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iOCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
    }).addTo(map);

    const arrowMarker = L.marker([startLocation[0], startLocation[1]], {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTYgMkwzMCAzMEgySiBmaWxsPSIjMzU4OEZCIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        className: 'avatar-direction-marker',
      }),
    }).addTo(map);

    markerRef.current = marker;
    arrowMarkerRef.current = arrowMarker;
    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, [startLocation]);

  useEffect(() => {
    if (!threeContainerRef.current) return;

    const width = threeContainerRef.current.clientWidth;
    const height = threeContainerRef.current.clientHeight;

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
    threeContainerRef.current.appendChild(renderer.domElement);
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
      speed: 0.00004,
      animationSpeed: 0.1,
    });
    avatarRef.current = avatar;

    setIsLoadingCharacter(true);
    const checkLoaded = setInterval(() => {
      if (avatarRef.current?.getModel()) {
        setIsLoadingCharacter(false);
        clearInterval(checkLoaded);
      }
    }, 100);
    const maxLoadTime = setTimeout(() => {
      setIsLoadingCharacter(false);
      clearInterval(checkLoaded);
    }, 5000);

    const handleResize = () => {
      const newWidth = threeContainerRef.current?.clientWidth || width;
      const newHeight = threeContainerRef.current?.clientHeight || height;
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

      const [lng, lat] = avatar.getPosition();
      if (mapRef.current && markerRef.current && arrowMarkerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        arrowMarkerRef.current.setLatLng([lat, lng]);

        const avatarModel = avatar.getModel();
        if (avatarModel) {
          const rotation = avatarModel.rotation.y;
          const angle = (THREE.MathUtils.radToDeg(rotation) + 180) % 360;
          const element = arrowMarkerRef.current.getElement();
          if (element) {
            element.style.transform = `rotate(${angle}deg)`;
          }

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
      if (threeContainerRef.current?.contains(renderer.domElement)) {
        threeContainerRef.current.removeChild(renderer.domElement);
      }
      clearInterval(checkLoaded);
      clearTimeout(maxLoadTime);
    };
  }, [avatarUrl, startLocation]);

  return (
    <div className="w-full h-screen flex gap-4 p-4 bg-gray-900">
      <div className="flex-1 rounded-lg overflow-hidden shadow-lg" ref={mapContainerRef} />
      <div className="flex-1 rounded-lg overflow-hidden shadow-lg" ref={threeContainerRef} />

      {isLoadingCharacter && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-gray-900 bg-opacity-95 backdrop-blur-sm rounded-xl px-8 py-6 border border-gray-700 shadow-2xl">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-gray-600 border-t-white rounded-full animate-spin"></div>
            <p className="text-white text-sm font-medium">Loading character...</p>
          </div>
        </div>
      )}

      <div className="absolute top-6 left-6 z-50 bg-gray-900 bg-opacity-90 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
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
