import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as THREE from 'three';
import { AvatarCharacter, WALK_SPEED_MPS, GeoOrigin } from '../lib/avatar-system';
import { fetchOsmGeometry, buildOsmMeshes, disposeOsmMeshes, OsmMeshes } from '../lib/osm-geometry';
import { fetchTerrainElevation, buildTerrainGeometry, sampleHeight, ElevationGrid } from '../lib/terrain-elevation';

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
  const terrainGridRef = useRef<ElevationGrid | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const loopRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const activeRef = useRef(active);
  const coordsRef = useRef<HTMLParagraphElement>(null);
  const zoomControlRef = useRef<L.Control.Zoom | null>(null);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(true);
  const [isMinimapExpanded, setIsMinimapExpanded] = useState(false);
  // Mirrors isMinimapExpanded for the render-loop closure below, which is created
  // once per [avatarUrl, startLocation] mount and can't see fresh React state --
  // same reason activeRef exists.
  const expandedRef = useRef(isMinimapExpanded);

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

    // A divIcon, not an icon: Leaflet positions a marker by writing
    // `transform: translate3d(...)` onto its root element, so rotating that same root
    // (which the previous L.icon forced us to do) destroys the translate and pins the
    // arrow to the map-pane origin. Wrapping the SVG lets Leaflet keep the root and us
    // rotate the child.
    //
    // A plain heading arrow, deliberately not the verification ring: "which way am I
    // facing" is not a trust signal, and sharing the motif would dilute what a closed
    // ring means.
    const arrowMarker = L.marker([startLocation[0], startLocation[1]], {
      icon: L.divIcon({
        className: 'avatar-heading-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html:
          '<svg class="avatar-direction-marker" width="28" height="28" viewBox="0 0 28 28" ' +
          'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          // Wedge with its apex at the top, so it points north at 0deg -- which is the
          // character's heading when rotation.y is 0.
          '<path d="M14 3 L20 15 L14 12 L8 15 Z" fill="#3E82F6" stroke="white" ' +
          'stroke-width="1.5" stroke-linejoin="round" />' +
          '</svg>',
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

    // Real-world roads/plots, fetched from OSM live. Fire-and-handle, not awaited:
    // the scene/ground/avatar below are already set up synchronously before this
    // resolves. `cancelled` guards against adding meshes to a scene this same
    // effect has already torn down (e.g. startLocation changing again before the
    // fetch returns) -- the geometry equivalent of the keyboard-listener leak
    // AvatarCharacter used to have.
    const sceneOrigin: GeoOrigin = { lat: startLocation[0], lng: startLocation[1] };
    let osmMeshes: OsmMeshes | null = null;
    let osmCancelled = false;
    fetchOsmGeometry(sceneOrigin).then((data) => {
      if (osmCancelled) return;
      const meshes = buildOsmMeshes(data, sceneOrigin);
      if (meshes.roads) scene.add(meshes.roads);
      if (meshes.plots) scene.add(meshes.plots);
      osmMeshes = meshes;
    });

    // Real-world ground elevation, fetched from Open Topo Data. Independent of the
    // OSM fetch above -- in parallel with it, not blocking on nor blocked by it,
    // same bounded one-shot pattern. `terrainCancelled` mirrors `osmCancelled`: a
    // response landing after this effect has already torn down (unmount, or
    // startLocation changing again) must not mutate a mesh that's no longer part
    // of the live scene.
    let terrainCancelled = false;
    fetchTerrainElevation(sceneOrigin).then((grid) => {
      if (terrainCancelled || !grid) return;
      terrainGridRef.current = grid;
      const displaced = buildTerrainGeometry(grid);
      ground.geometry.dispose();
      ground.geometry = displaced;
    });

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
        // Suppressed while expanded so auto-follow doesn't fight the user's manual
        // pan/zoom (movement is paused then anyway, so there's nothing to follow).
        if (currentTime - lastMinimapPan > MINIMAP_PAN_INTERVAL_MS) {
          if (!expandedRef.current) {
            mapRef.current.setView([lat, lng], mapRef.current.getZoom(), { animate: false });
          }
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
          // Ground height at the character's current plane position. A no-op (y
          // stays exactly what it already was, i.e. 0) until the terrain fetch
          // resolves, which is the graceful-failure path: if it never resolves,
          // the character walks the old flat plane exactly as before. The camera
          // below already derives its height from avatarModel.position.y + a
          // fixed offset, so it follows correctly with no changes of its own.
          const terrainGrid = terrainGridRef.current;
          if (terrainGrid) {
            avatarModel.position.y = sampleHeight(terrainGrid, avatarModel.position.x, avatarModel.position.z);
          }

          // rotation.y is a compass bearing already: 0 faces north (+z) and it increases
          // clockwise toward east (+x), matching geoToPlane's axes. CSS rotate() is also
          // clockwise from up, so the bearing maps straight through. The previous `+ 180`
          // would have pointed the arrow south while walking north.
          const rotation = avatarModel.rotation.y;
          const headingDeg = ((THREE.MathUtils.radToDeg(rotation) % 360) + 360) % 360;

          // Rotate the SVG *inside* the icon. Rotating the marker root would overwrite
          // the translate3d Leaflet just wrote there, and would also make the CSS
          // transition animate the marker's position rather than only its heading.
          const arrowSvg = arrowMarkerRef.current.getElement()?.querySelector('svg');
          if (arrowSvg) {
            (arrowSvg as SVGElement).style.transform = `rotate(${headingDeg}deg)`;
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
      osmCancelled = true;
      if (osmMeshes) {
        if (osmMeshes.roads) scene.remove(osmMeshes.roads);
        if (osmMeshes.plots) scene.remove(osmMeshes.plots);
        disposeOsmMeshes(osmMeshes);
      }
      terrainCancelled = true;
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
  // position and the character model is not refetched when the user comes back to World.
  //
  // Movement has two independent reasons to be paused -- this tab isn't active, or
  // the minimap is expanded -- so enablement is always the AND of both rather than
  // either effect setting it unconditionally. Without this, returning to the World
  // tab while the minimap is still expanded would incorrectly resume movement.
  useEffect(() => {
    activeRef.current = active;
    avatarRef.current?.setEnabled(active && !expandedRef.current);

    if (active) {
      loopRef.current?.start();
    } else {
      loopRef.current?.stop();
    }
  }, [active]);

  // Expanding the minimap turns it from a passive readout into a full pan/zoom
  // surface, which would otherwise fight the character's WASD control and the
  // auto-follow setView above -- so movement pauses and auto-follow is suppressed
  // (via expandedRef) for the duration.
  useEffect(() => {
    expandedRef.current = isMinimapExpanded;

    const map = mapRef.current;
    if (!map) return;

    if (isMinimapExpanded) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      if (!zoomControlRef.current) {
        zoomControlRef.current = L.control.zoom().addTo(map);
      }
      avatarRef.current?.setEnabled(false);
    } else {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      if (zoomControlRef.current) {
        zoomControlRef.current.remove();
        zoomControlRef.current = null;
      }

      // Collapsing is meant to read as "back to a tidy position readout", not
      // "wherever the user last panned/zoomed to" -- so it re-centres and resets
      // zoom rather than leaving the view as the user left it.
      const [lat, lng] = avatarRef.current?.getPosition() ?? startLocation;
      map.setView([lat, lng], 16, { animate: false });

      avatarRef.current?.setEnabled(activeRef.current);
    }

    // The container's size class has just changed on this same render, but the
    // browser hasn't necessarily reflowed to the new box yet in this tick --
    // Leaflet caches its container size internally and invalidateSize() needs to
    // run after the resize has actually happened, not synchronously with it.
    const raf = requestAnimationFrame(() => {
      map.invalidateSize();
    });

    return () => cancelAnimationFrame(raf);
  }, [isMinimapExpanded, startLocation]);

  // `relative` matters: the overlays below are absolutely positioned, and without a
  // positioned ancestor they anchor to the viewport and float over the shell's nav
  // rail and top bar instead of staying inside this pane.
  return (
    <div className="relative w-full h-full overflow-hidden bg-dusk-900">
      <div className="absolute inset-0" ref={threeContainerRef} />

      {/*
        Minimap: real-world position readout, pinned to the corner of the viewport.
        Expanding grows this same panel in place (still anchored bottom-right) rather
        than opening a modal -- the Leaflet container and the button are separate
        elements so React never has to manage children inside the div Leaflet owns.
      */}
      <div
        className={`absolute bottom-6 right-6 z-40 aspect-[7/5] rounded-lg overflow-hidden border border-dusk-700 shadow-2xl transition-[width] duration-200 ${
          isMinimapExpanded
            ? // Capped at the viewport minus margin, not a bare 28rem: anchored bottom-right
              // with no left-side offset, a fixed 448px would push off-screen on a narrow
              // (e.g. mobile-width) viewport instead of shrinking to fit. Height follows from
              // width via aspect-[7/5] -- same 1.4:1 ratio as the collapsed w-56 h-40 -- and
              // max-h guards the same overflow on short/landscape viewports.
              'w-[min(28rem,calc(100vw-3rem))] max-h-[min(20rem,calc(100vh-3rem))]'
            : 'w-56'
        }`}
      >
        <div className="absolute inset-0" ref={mapContainerRef} />

        <button
          type="button"
          onClick={() => setIsMinimapExpanded((expanded) => !expanded)}
          title={isMinimapExpanded ? 'Collapse minimap' : 'Expand minimap'}
          aria-label={isMinimapExpanded ? 'Collapse minimap' : 'Expand minimap'}
          className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-md bg-dusk-950/80 backdrop-blur-sm border border-dusk-700 flex items-center justify-center text-dusk-100 hover:bg-dusk-800 transition-colors"
        >
          {isMinimapExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {isLoadingCharacter && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-dusk-950 bg-opacity-95 backdrop-blur-sm rounded-xl px-8 py-6 border border-dusk-800 shadow-2xl">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-dusk-700 border-t-accent rounded-full animate-spin"></div>
            <p className="text-dusk-100 text-sm font-medium">Loading character...</p>
          </div>
        </div>
      )}

      <div className="absolute top-6 left-6 z-40 bg-dusk-950 bg-opacity-90 backdrop-blur-sm rounded-lg p-4 border border-dusk-800">
        <div className="text-dusk-100">
          <p className="text-xs text-dusk-400 mb-1">COORDINATES</p>
          <p ref={coordsRef} className="text-sm font-mono">
            {startLocation[0].toFixed(5)}, {startLocation[1].toFixed(5)}
          </p>
        </div>
      </div>
    </div>
  );
}
