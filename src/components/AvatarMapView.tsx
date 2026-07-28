import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as THREE from 'three';
import { AvatarCharacter, WALK_SPEED_MPS, GeoOrigin } from '../lib/avatar-system';
import { fetchOsmGeometry, buildOsmMeshes, disposeOsmMeshes, OsmMeshes } from '../lib/osm-geometry';
import { fetchTerrainElevation, buildTerrainGeometry, sampleHeight, ElevationGrid } from '../lib/terrain-elevation';
import { buildVegetation, applyVegetationHeights, disposeVegetation } from '../lib/vegetation';

/** The minimap is a readout; re-centring it every frame is needless work. */
const MINIMAP_PAN_INTERVAL_MS = 200;

type ViewMode = 'third-person' | 'first-person';

/**
 * Eye height, not full model height (~1.78m per glb-loader.ts) -- the camera sits
 * a little below the top of the head, roughly where eyes actually are.
 */
const FIRST_PERSON_HEAD_HEIGHT = 1.65;

/** Radians per pixel of mouse movement. A conventional FPS-ish sensitivity. */
const MOUSE_LOOK_SENSITIVITY = 0.0025;

/** Keeps the view from flipping upside down when looking straight up/down. */
const PITCH_LIMIT_RAD = THREE.MathUtils.degToRad(85);

/**
 * Comfortably outside the -50/+50m terrain footprint and the camera's own 1000m
 * far-clip plane, so the dome is never clipped and the camera (which never
 * leaves the walkable area) is always well inside it.
 */
const SKY_RADIUS_METERS = 400;

/**
 * Per-fragment (not per-vertex) gradient, so even a coarse sphere reads as
 * perfectly smooth -- no faceting to hide the way the low-poly tree geometry
 * below deliberately doesn't hide its own.
 */
const SKY_VERTEX_SHADER = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform float offset;
  uniform float exponent;
  varying vec3 vWorldPosition;
  void main() {
    float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
    gl_FragColor = vec4(mix(horizonColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
  }
`;

/**
 * A large inverted (BackSide) sphere lit by a static two-colour gradient shader,
 * standing in for scene.background -- deep indigo-dusk overhead (this app's own
 * dusk-950 surface token) fading to warm amber (the accent hex) at the horizon.
 * Static on purpose: no day/night cycle, no animation, matching this app's other
 * "cheap and simple" decorative additions.
 */
function createSkyDome(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS_METERS, 24, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x0a0d19) },
      horizonColor: { value: new THREE.Color(0xef9f27) },
      offset: { value: 20 },
      exponent: { value: 0.6 },
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}

/**
 * Same check AvatarCharacter.isTypingTarget() uses (that one's private to its own
 * class, so this is a small, deliberate duplication rather than a shared import)
 * -- without it, pressing V while typing in TopBar's search field would toggle
 * the view instead of inserting the letter.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

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
  // No React state for view mode: nothing in this component's JSX depends on it
  // any more now that the toggle is a keyboard shortcut rather than a button whose
  // label/icon needed to reflect the current mode -- a plain ref is enough, and
  // skips a re-render on every V-press that wouldn't have changed any output.
  const viewModeRef = useRef<ViewMode>('third-person');
  // Holds the real mode-switch logic, defined inside the scene-setup effect
  // (where camera/avatar/renderer are in scope) and called from the V-key
  // handler below and from the active/minimap effects further down. Assigning it
  // through a ref keeps viewModeRef updated in the same synchronous tick as the
  // pointer-lock calls, rather than lagging a render behind.
  const setViewModeRef = useRef<(mode: ViewMode) => void>(() => {});

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
    sceneRef.current = scene;

    const sky = createSkyDome();
    scene.add(sky);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 6);
    camera.lookAt(0, 0.8, 0);
    // YXZ (yaw outer, pitch inner) is the standard order for FPS-style mouse
    // look: applying pitch as a *local* tilt after yaw is what keeps looking up
    // and down from coupling into unwanted roll once yaw is non-zero. Harmless
    // for third-person, which drives the camera via lookAt() every frame instead
    // (lookAt sets the quaternion directly; three.js keeps quaternion and this
    // Euler in sync either way, so setting the order here doesn't affect it).
    camera.rotation.order = 'YXZ';
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

    // Decorative only -- no OSM greenery data, no collision. Built on flat ground
    // (null grid) so trees appear instantly rather than waiting on the terrain
    // fetch below; applyVegetationHeights() resettles them onto real elevation
    // once/if that fetch resolves, the same two-step the ground geometry itself
    // goes through.
    const vegetation = buildVegetation(null);
    scene.add(vegetation.trunks);
    scene.add(vegetation.foliage);

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
      applyVegetationHeights(vegetation, grid);
    });

    const avatar = new AvatarCharacter(scene, startLocation, avatarUrl, {
      scale: 1,
      speed: WALK_SPEED_MPS,
      animationSpeed: 0.1,
    });
    avatarRef.current = avatar;

    // First-person mouse-look state. Plain closure variables, not refs: they're
    // only ever read/written from code defined in this same effect (handleMouseMove,
    // enterFirstPerson, and the animate() loop below), the same pattern lastTime/
    // lastMinimapPan already use.
    let yaw = 0;
    let pitch = 0;

    const exitFirstPerson = () => {
      viewModeRef.current = 'third-person';
      avatar.setViewMode('third-person');
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
    };

    const enterFirstPerson = () => {
      const avatarModel = avatar.getModel();
      // Continue facing whatever direction third-person last faced, rather than
      // snapping to 0 -- the switch shouldn't itself spin the character around.
      yaw = avatarModel?.rotation.y ?? 0;
      pitch = 0;
      viewModeRef.current = 'first-person';
      avatar.setViewMode('first-person');

      // requestPointerLock() returns a Promise in newer browsers but not older
      // ones -- guard the .catch rather than assume every browser gives us one.
      const maybeLockPromise = renderer.domElement.requestPointerLock() as unknown;
      if (maybeLockPromise && typeof (maybeLockPromise as Promise<void>).then === 'function') {
        (maybeLockPromise as Promise<void>).catch((err) => {
          console.warn('Pointer lock request failed, staying in third-person:', err);
          exitFirstPerson();
        });
      }
    };

    setViewModeRef.current = (mode) => {
      if (mode === 'first-person') {
        enterFirstPerson();
      } else {
        exitFirstPerson();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (viewModeRef.current !== 'first-person') return;
      if (document.pointerLockElement !== renderer.domElement) return;

      // Verified live, not derived on paper (this project has hit sign/axis bugs
      // from trusting a plausible formula before): moving the mouse right must
      // turn the view right (clockwise, i.e. toward increasing heading in this
      // project's north=0/east=+90 convention), which means yaw *increases* with
      // positive movementX -- the opposite of the naive "subtract" most examples
      // use, since heading here isn't three.js's own default yaw convention.
      yaw += e.movementX * MOUSE_LOOK_SENSITIVITY;
      pitch -= e.movementY * MOUSE_LOOK_SENSITIVITY;
      pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT_RAD, PITCH_LIMIT_RAD);

      // rotation.y is this project's one source of truth for heading (the
      // minimap arrow, the third-person camera fix, and now this all read it) --
      // yaw goes straight there. Pitch is deliberately not: a humanoid doesn't
      // tilt its whole body to look up/down, so it only ever touches the camera's
      // own local rotation below, never avatarModel.rotation.
      avatar.setFirstPersonYaw(yaw);
    };

    // Esc (which the browser always honours and we can't prevent) or any other
    // unexpected pointer-lock loss must not leave mouse-look silently dead while
    // the UI still claims first-person -- fail back to third-person instead.
    const handlePointerLockChange = () => {
      if (document.pointerLockElement !== renderer.domElement && viewModeRef.current === 'first-person') {
        exitFirstPerson();
      }
    };
    const handlePointerLockError = () => {
      console.warn('Pointer lock error, staying in third-person.');
      if (viewModeRef.current === 'first-person') {
        exitFirstPerson();
      }
    };

    // V toggles view mode -- replaces the old on-screen button. Guarded the same
    // way the minimap-expanded and tab-switch effects already treat first-person:
    // inert while typing (isTypingTarget), while this tab isn't the active one, or
    // while the minimap is expanded (entering first-person there would just get
    // immediately kicked back out by the isMinimapExpanded effect, a pointless
    // flicker). e.repeat guards against OS key-repeat re-firing this on every tick
    // of a held key, which would otherwise flip the mode back and forth rapidly.
    const handleViewToggleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'v' || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (!activeRef.current || expandedRef.current) return;

      setViewModeRef.current(viewModeRef.current === 'first-person' ? 'third-person' : 'first-person');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockError);
    window.addEventListener('keydown', handleViewToggleKey);

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

          if (viewModeRef.current === 'first-person') {
            // Rigidly attached to the head, not lerped like third-person's follow
            // below -- any lag between body and camera in first-person reads as
            // broken, not cinematic. x/z track the avatar's plane position exactly;
            // y sits at head height above whatever the terrain sampling above just
            // set as the feet/ground height.
            camera.position.set(
              avatarModel.position.x,
              avatarModel.position.y + FIRST_PERSON_HEAD_HEIGHT,
              avatarModel.position.z
            );
            // Yaw (rotation.y) and pitch (camera-local tilt) are both already
            // being kept up to date by handleMouseMove as the mouse moves; this
            // is only re-asserting them onto the camera itself, since something
            // else in the scene could in principle touch camera.rotation between
            // mouse events.
            //
            // +PI, not the bare heading: verified live, not assumed. This
            // project's heading convention has 0 mean "facing +Z", but a
            // THREE.PerspectiveCamera's own default forward is -Z -- so setting
            // rotation.y to the heading value directly pointed the camera at the
            // character's own back. Confirmed via the camera's actual world-space
            // forward vector at heading 0 (came out (0,0,-1), not (0,0,1)) before
            // adding this offset, and (0,0,1) after.
            camera.rotation.set(pitch, avatarModel.rotation.y + Math.PI, 0);
          } else {
            const targetDistance = 6;
            const targetHeight = 1.5;
            const targetLookHeight = 0.8;

            // Derived from the character's actual facing (rotation.y), not from where
            // the camera already happens to sit relative to the avatar's position --
            // the old position-delta approach never referenced heading at all, so
            // turning in place (without moving) left the camera exactly where it was,
            // often in front of the character instead of behind them. `rotation` above
            // is this same heading, using the already-verified convention (0 = facing
            // +z/north, increasing clockwise toward +x/east).
            const heading = avatarModel.rotation.y;
            const desiredX = avatarModel.position.x - Math.sin(heading) * targetDistance;
            const desiredZ = avatarModel.position.z - Math.cos(heading) * targetDistance;
            const desiredY = avatarModel.position.y + targetHeight;

            const smoothing = 0.05;
            camera.position.x += (desiredX - camera.position.x) * smoothing;
            camera.position.y += (desiredY - camera.position.y) * smoothing;
            camera.position.z += (desiredZ - camera.position.z) * smoothing;

            camera.lookAt(avatarModel.position.x, avatarModel.position.y + targetLookHeight, avatarModel.position.z);
          }
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
      scene.remove(vegetation.trunks);
      scene.remove(vegetation.foliage);
      disposeVegetation(vegetation);
      scene.remove(sky);
      sky.geometry.dispose();
      (sky.material as THREE.ShaderMaterial).dispose();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('pointerlockerror', handlePointerLockError);
      window.removeEventListener('keydown', handleViewToggleKey);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
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
  // position and the character model is not refetched when the user comes back to World.
  //
  // Movement has two independent reasons to be paused -- this tab isn't active, or
  // the minimap is expanded -- so enablement is always the AND of both rather than
  // either effect setting it unconditionally. Without this, returning to the World
  // tab while the minimap is still expanded would incorrectly resume movement.
  useEffect(() => {
    activeRef.current = active;

    // Switching away from World while pointer-locked would otherwise leave the
    // lock engaged (and mouse-look silently updating a hidden camera) underneath
    // whatever tab is now showing -- first-person only makes sense while this
    // pane is the one actually on screen.
    if (!active && viewModeRef.current === 'first-person') {
      setViewModeRef.current('third-person');
    }

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

    // Pointer lock captures the mouse globally -- the cursor doesn't visibly move
    // at all, which is incompatible with actually dragging/clicking the now-larger
    // interactive minimap. Expanding it has to kick first-person out first, not
    // just pause movement like it already does.
    if (isMinimapExpanded && viewModeRef.current === 'first-person') {
      setViewModeRef.current('third-person');
    }

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
