import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as THREE from 'three';
import { AvatarCharacter, WALK_SPEED_MPS } from '../lib/avatar-system';

/** The minimap is a readout; re-centring it every frame is needless work. */
const MINIMAP_PAN_INTERVAL_MS = 200;

interface AvatarMapViewProps {
  avatarUrl: string | null;
  startLocation: [number, number];
  /**
   * False while another shell tab is showing. The scene stays mounted (so the
   * character keeps its position and the GLB isn't refetched) but the render loop
   * is cancelled and keyboard control is released.
   */
  active?: boolean;
}

export function AvatarMapView({ avatarUrl, startLocation, active = true }: AvatarMapViewProps) {
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
  const loopRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const activeRef = useRef(active);
  const coordsRef = useRef<HTMLParagraphElement>(null);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(true);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Minimap: a position readout, not a control surface. Interaction is off so it
    // can't steal drags or scroll-zoom from the 3D viewport it sits on top of.
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      attributionControl: false,
    }).setView([startLocation[0], startLocation[1]], 16);

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

    // The shell resizes panes without firing window.resize (e.g. collapsing the
    // DM panel), and Leaflet renders blank tiles unless told its box changed.
    const mapResizeObserver = new ResizeObserver(() => map.invalidateSize());
    mapResizeObserver.observe(mapContainerRef.current);

    return () => {
      mapResizeObserver.disconnect();
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
      speed: WALK_SPEED_MPS,
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

    // Observe the *container*, not the window: the shell resizes this pane on its
    // own (DM panel collapsing, tab overlays) without any window resize event, and
    // a stale size leaves the camera aspect wrong and the render stretched.
    const handleResize = () => {
      const newWidth = threeContainerRef.current?.clientWidth || width;
      const newHeight = threeContainerRef.current?.clientHeight || height;
      if (newWidth === 0 || newHeight === 0) return;   // guard against aspect = NaN
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(threeContainerRef.current);

    let lastTime = Date.now();
    let lastMinimapPan = 0;
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      const currentTime = Date.now();
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      avatar.update(deltaTime);

      const [lat, lng] = avatar.getPosition();
      if (mapRef.current && markerRef.current && arrowMarkerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        arrowMarkerRef.current.setLatLng([lat, lng]);

        // Keep the character centred in the minimap, or they'd simply walk off the
        // edge of it. Throttled: setView every frame is needless work for a readout.
        if (currentTime - lastMinimapPan > MINIMAP_PAN_INTERVAL_MS) {
          mapRef.current.setView([lat, lng], mapRef.current.getZoom(), { animate: false });
          lastMinimapPan = currentTime;

          // Written straight to the DOM rather than through state: this runs inside
          // the render loop, and setState here would re-render every 200ms for what
          // is only a text readout. The box previously showed the spawn coordinate
          // forever, so it never actually reported where the character was.
          if (coordsRef.current) {
            coordsRef.current.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          }
        }

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

    // Stopping the loop (rather than letting it spin on a hidden pane) is what
    // makes persistence affordable: the scene, the character and its position all
    // stay in memory, only the per-frame work stops. Resetting lastTime on resume
    // avoids integrating the whole time spent on another tab in one step -- which
    // MAX_FRAME_DELTA_SECONDS would clamp anyway, but this keeps it honest.
    const start = () => {
      if (animationFrameRef.current !== null) return;
      lastTime = Date.now();
      animate();
    };
    const stop = () => {
      if (animationFrameRef.current === null) return;
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
    loopRef.current = { start, stop };

    if (activeRef.current) start();

    return () => {
      loopRef.current = null;
      resizeObserver.disconnect();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        // Must null it, not just cancel: start() refuses to run when this is
        // non-null, so a stale id here leaves the next mount's loop dead. React
        // StrictMode's mount/cleanup/mount cycle hits this on every dev mount.
        animationFrameRef.current = null;
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

  // Pause/resume without unmounting: the scene survives, so the character keeps its
  // position and character.glb is not refetched when the user comes back to World.
  useEffect(() => {
    activeRef.current = active;
    avatarRef.current?.setEnabled(active);

    if (active) {
      loopRef.current?.start();
    } else {
      loopRef.current?.stop();
    }
  }, [active]);

  // `relative` matters: the overlays below are absolutely positioned, and without a
  // positioned ancestor they anchor to the viewport and float over the shell's nav
  // rail and top bar instead of staying inside this pane.
  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-900">
      <div className="absolute inset-0" ref={threeContainerRef} />

      {/* Minimap: real-world position readout, pinned to the corner of the viewport. */}
      <div
        className="absolute bottom-6 right-6 z-40 w-56 h-40 rounded-lg overflow-hidden border border-gray-700 shadow-2xl"
        ref={mapContainerRef}
      />

      {isLoadingCharacter && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-gray-900 bg-opacity-95 backdrop-blur-sm rounded-xl px-8 py-6 border border-gray-700 shadow-2xl">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-gray-600 border-t-white rounded-full animate-spin"></div>
            <p className="text-white text-sm font-medium">Loading character...</p>
          </div>
        </div>
      )}

      <div className="absolute top-6 left-6 z-40 bg-gray-900 bg-opacity-90 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
        <div className="text-white">
          <p className="text-xs text-gray-400 mb-1">COORDINATES</p>
          <p ref={coordsRef} className="text-sm font-mono">
            {startLocation[0].toFixed(5)}, {startLocation[1].toFixed(5)}
          </p>
        </div>
      </div>
    </div>
  );
}
