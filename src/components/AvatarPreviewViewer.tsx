import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Loader2, AlertCircle } from 'lucide-react';

interface AvatarPreviewViewerProps {
  modelUrl: string;
  showSpinning?: boolean;
}

export function AvatarPreviewViewer({ modelUrl, showSpinning = true }: AvatarPreviewViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const animationIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      setIsLoading(true);
      setError(null);

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight || 300;

      const scene = new THREE.Scene();
      // dusk-950. The lights below are raised to compensate: against the old light-grey
      // backdrop the model picked up plenty of bounce, and the same intensities over a dark
      // surface leave it muddy and short of silhouette definition.
      scene.background = new THREE.Color(0x0a0d19);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        50,
        width / height,
        0.1,
        1000
      );
      camera.position.set(0, 1.5, 2.5);
      camera.lookAt(0, 1, 0);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      rendererRef.current = renderer;

      containerRef.current.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
      directionalLight.position.set(5, 10, 7);
      scene.add(directionalLight);

      // Rim light from behind and opposite the key. A single key light can't separate the
      // silhouette from a dark backdrop; this keeps the edges readable.
      const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
      rimLight.position.set(-4, 4, -6);
      scene.add(rimLight);

      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          const model = gltf.scene;
          model.position.set(0, 0, 0);

          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 1.5 / maxDim;

          model.scale.multiplyScalar(scale);
          model.position.sub(center.multiplyScalar(scale));
          model.position.y += 0.3;

          scene.add(model);
          modelRef.current = model;
          setIsLoading(false);

          if (showSpinning) {
            animate();
          }
        },
        undefined,
        (error) => {
          console.error('Error loading model:', error);
          setError('Failed to load avatar preview');
          setIsLoading(false);
        }
      );

      function animate() {
        animationIdRef.current = requestAnimationFrame(animate);

        if (modelRef.current && showSpinning) {
          modelRef.current.rotation.y += 0.005;
        }

        renderer.render(scene, camera);
      }

      if (showSpinning) {
        animate();
      } else {
        renderer.render(scene, camera);
      }

      const handleResize = () => {
        if (!containerRef.current) return;

        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight || 300;

        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);

        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
        }

        renderer.dispose();
        if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(renderer.domElement);
        }
      };
    } catch (err) {
      console.error('Error setting up viewer:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize preview');
      setIsLoading(false);
    }
  }, [modelUrl, showSpinning]);

  return (
    <div
      ref={containerRef}
      className="w-full h-80 rounded-lg bg-dusk-950 border border-dusk-800 relative overflow-hidden"
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-dusk-950 bg-opacity-60">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-danger/10">
          <AlertCircle className="w-8 h-8 text-danger mb-2" />
          <p className="text-sm text-danger font-medium">Preview unavailable</p>
        </div>
      )}
    </div>
  );
}
