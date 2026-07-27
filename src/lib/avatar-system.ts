import * as THREE from 'three';
import { loadAvatarGLB, loadCharacterGLB, getAnimationClip, playAnimation, stopAnimation, createIdleCharacter } from './glb-loader';
import { AVATAR_URLS, AvatarType, SHARED_AVATAR_URL } from './supabase';

export const METERS_PER_DEGREE_LAT = 111320;

export interface PlanePosition {
  x: number;
  z: number;
}

export interface GeoOrigin {
  lat: number;
  lng: number;
}

/**
 * Converts a geographic coordinate into scene-plane metres relative to a fixed
 * origin: x = metres east of origin, z = metres north. One scene unit is one metre.
 *
 * Longitude is scaled by cos(origin.lat) — the *origin's* latitude, never the
 * current one, so the projection stays linear and invertible. Omitting the cosine
 * understates east-west distance by ~12% at Johannesburg but ~61% at London,
 * which is how a units error hides at one latitude and not another.
 */
export function geoToPlane(lat: number, lng: number, origin: GeoOrigin): PlanePosition {
  const lngScale = Math.cos(origin.lat * (Math.PI / 180));
  return {
    x: (lng - origin.lng) * METERS_PER_DEGREE_LAT * lngScale,
    z: (lat - origin.lat) * METERS_PER_DEGREE_LAT
  };
}

/**
 * Exact inverse of geoToPlane. Kept beside it and derived from the same two
 * constants (METERS_PER_DEGREE_LAT, cos(origin.lat)) so the pair can never
 * disagree — a round trip through both is the regression test for that.
 */
export function planeToGeo(x: number, z: number, origin: GeoOrigin): { lat: number; lng: number } {
  const lngScale = Math.cos(origin.lat * (Math.PI / 180));
  return {
    lat: origin.lat + z / METERS_PER_DEGREE_LAT,
    lng: origin.lng + x / (METERS_PER_DEGREE_LAT * lngScale)
  };
}

/**
 * Half-extent of the walkable world in plane-space metres. The ground mesh is a
 * 100x100 PlaneGeometry centred on the spawn origin (AvatarMapView.tsx), so the
 * true edge is +/-50. This sits 2m inside that so the character eases back before
 * ever standing flush with the visible edge of the ground plane.
 */
export const WORLD_HALF_EXTENT_METERS = 48;

/** Per-second rate the boundary spring eases a penetrating coordinate back toward
 * the boundary line. Same exponential-approach shape as ACCELERATION_RATE/TURN_RATE
 * below, so a boundary hit reads as the same movement model, not a separate hard
 * clamp bolted on top of it. */
const BOUNDARY_SPRING_RATE = 8;

/**
 * Softly eases a single plane-space axis back toward +/-halfExtent once it has been
 * exceeded. A no-op (returns coord unchanged) while inside the boundary — this is
 * the behaviour the "no early creep" test checks, since a spring that leaks force
 * inside the boundary would be indistinguishable from a subtly wrong margin.
 *
 * Deliberately pure and stateless (no `this`, no side effects) so it can be
 * unit-tested without constructing an AvatarCharacter or a THREE.Scene.
 */
export function applyBoundarySpring(coord: number, halfExtent: number, dt: number): number {
  if (Math.abs(coord) <= halfExtent) return coord;
  const target = Math.sign(coord) * halfExtent;
  const smoothing = 1 - Math.exp(-BOUNDARY_SPRING_RATE * dt);
  return coord + (target - coord) * smoothing;
}

/** Real-world movement speeds, metres per second. */
export const WALK_SPEED_MPS = 1.4;
export const RUN_SPEED_MPS = 3.8;

/**
 * Rate of exponential approach to target velocity, per second. Picked so the
 * per-frame smoothing factor lands near the original 0.2 at 60fps
 * (1 - e^(-13.4/60) ~= 0.2), keeping the old acceleration feel while making it
 * independent of frame rate.
 */
const ACCELERATION_RATE = 13.4;

/**
 * Rate of exponential approach to the target facing, per second. Derived like
 * ACCELERATION_RATE: chosen so the per-frame turn factor lands at the original flat
 * 0.1 at 60fps (1 - e^(-6.32/60) ~= 0.1, i.e. -60*ln(0.9)), keeping the same turn feel
 * while making it frame-rate independent. Movement was already time-based (107ba41);
 * this extends that to rotation, which the earlier pass left as a flat lerp.
 */
const TURN_RATE = 6.32;

/**
 * requestAnimationFrame stops firing in a backgrounded tab, so the first frame
 * after refocus can report a deltaTime of minutes. Capping it stops a held key
 * from teleporting the character across the world in a single step.
 */
const MAX_FRAME_DELTA_SECONDS = 0.1;

/**
 * Aliases for clip names that mean the same animation but differ by more than
 * case across authored assets (e.g. a Blender/Mixamo export named "Run" where
 * the game logic asks for "RUNNING"). Keyed and valued in upper-case to match
 * buildAnimationMap's normalization. Extend this when swapping in new assets
 * rather than renaming clips in switchAnim() call sites.
 */
const ANIMATION_NAME_ALIASES: Record<string, string> = {
  RUN: 'RUNNING',
};

export interface AvatarConfig {
  scale?: number;
  /** Walking speed in metres per second. Running uses RUN_SPEED_MPS. */
  speed?: number;
  animationSpeed?: number;
}

export class AvatarCharacter {
  private scene: THREE.Scene;
  private position: { lng: number; lat: number };
  private readonly origin: GeoOrigin;
  private avatarUrl: string | null;
  private avatarModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;

  private animations: Map<string, THREE.AnimationAction> = new Map();
  // Empty, not 'IDLE', so the initial switchAnim('IDLE') on load isn't skipped by
  // the currentAnimName === name guard — otherwise idle never plays and the
  // character stands in bind pose (T-pose) until first movement.
  private currentAnimName = '';
  private isLoadingCharacter = false;
  private useCharacterGLB = false;
  private jumpTimeout: NodeJS.Timeout | null = null;

  private velocity = { x: 0, y: 0 };
  private speed: number;
  private readonly metersToLatDegrees: number;
  private readonly metersToLngDegrees: number;
  private keys: { [key: string]: boolean } = {};
  private enabled = true;
  private direction = 0;
  private isMoving = false;
  private wasMoving = false;
  private animationFrame = 0;
  private animationSpeed = 0.1;
  /**
   * 'third-person' (default): each key maps to a fixed world compass direction,
   * exactly as before this mode existed. 'first-person': movement is relative to
   * the current look yaw instead (see updateMovement) and rotation.y is driven
   * externally by mouse-look (see setFirstPersonYaw) rather than by this class's
   * own turn-toward-movement lerp.
   */
  private viewMode: 'third-person' | 'first-person' = 'third-person';

  private config: Required<AvatarConfig>;

  constructor(scene: THREE.Scene, startLocation: [lat: number, lng: number], avatarUrl: string | null, config: AvatarConfig = {}) {
    this.scene = scene;
    this.position = { lat: startLocation[0], lng: startLocation[1] };
    this.origin = { lat: startLocation[0], lng: startLocation[1] };
    this.avatarUrl = avatarUrl || this.getDefaultAvatarUrl();

    this.config = {
      scale: config.scale ?? 1,
      speed: config.speed ?? WALK_SPEED_MPS,
      animationSpeed: config.animationSpeed ?? 0.1
    };

    this.speed = this.config.speed;
    this.animationSpeed = this.config.animationSpeed;

    // Inverse of geoToPlane's scale, so a speed in metres/second becomes degrees/second
    // on each axis. Derived from the same constants, so the two can never disagree.
    const lngScale = Math.cos(this.origin.lat * (Math.PI / 180));
    this.metersToLatDegrees = 1 / METERS_PER_DEGREE_LAT;
    this.metersToLngDegrees = 1 / (METERS_PER_DEGREE_LAT * lngScale);

    this.setupKeyboardControls();
    this.init();
  }

  private getDefaultAvatarUrl(): string {
    const storedUrl = localStorage.getItem('sharedAvatarUrl');
    if (storedUrl) return storedUrl;
    return SHARED_AVATAR_URL;
  }

  private async init(): Promise<void> {
    this.isLoadingCharacter = true;
    try {
      await this.loadCharacterModel();
      this.useCharacterGLB = true;
      this.isLoadingCharacter = false;
    } catch (error) {
      console.error('Failed to load character model, falling back to avatar:', error);
      this.isLoadingCharacter = false;
      if (this.avatarUrl) {
        await this.loadAvatarModel();
      } else {
        this.createPlaceholderAvatar();
      }
    }
  }

  private async loadCharacterModel(): Promise<void> {
    try {
      const loaded = await loadCharacterGLB();
      this.avatarModel = loaded.scene;
      this.mixer = loaded.mixer;

      this.avatarModel.position.set(0, 0, 0);
      this.scene.add(this.avatarModel);
      this.applyViewModeVisibility();

      this.buildAnimationMap(loaded.animations);
      this.switchAnim('IDLE');

      console.log('Character model loaded successfully');
    } catch (error) {
      console.error('Failed to load character model:', error);
      throw error;
    }
  }

  private buildAnimationMap(animations: THREE.AnimationClip[]): void {
    if (!this.mixer) return;

    animations.forEach((clip) => {
      const action = this.mixer!.clipAction(clip);
      // Key by upper-case name so lookups are case-insensitive: clip names vary
      // by asset (character.glb ships "Walking", female_boss_character.glb "WALKING").
      // Then resolve known aliases (e.g. "RUN" -> "RUNNING") so differently-named
      // clips for the same animation still match switchAnim()'s canonical names.
      const upperName = clip.name.toUpperCase();
      const canonicalName = ANIMATION_NAME_ALIASES[upperName] ?? upperName;
      this.animations.set(canonicalName, action);
    });

    console.log('Animation map built:', Array.from(this.animations.keys()));
  }

  private switchAnim(name: string): void {
    if (this.currentAnimName === name || !this.mixer) return;

    const prevAction = this.animations.get(this.currentAnimName.toUpperCase());
    const nextAction = this.animations.get(name.toUpperCase());

    if (!nextAction) {
      console.warn(`Animation not found: ${name}`);
      return;
    }

    if (prevAction) {
      nextAction.reset().play();
      prevAction.crossFadeTo(nextAction, 0.2, true);
    } else {
      nextAction.reset().play();
    }

    this.currentAnimName = name;
  }

  private async loadAvatarModel(): Promise<void> {
    try {
      const loaded = await loadAvatarGLB(this.avatarUrl!);
      this.avatarModel = loaded.scene;
      this.mixer = loaded.mixer;

      this.avatarModel.scale.set(this.config.scale, this.config.scale, this.config.scale);
      this.avatarModel.position.set(0, 0, 0);

      this.scene.add(this.avatarModel);
      this.applyViewModeVisibility();

      const idleClip = getAnimationClip(loaded.animations, 'idle');
      if (idleClip && this.mixer) {
        this.idleAction = playAnimation(this.mixer, idleClip, true);
      }

      const walkClip = getAnimationClip(loaded.animations, 'walk');
      if (walkClip) {
        this.walkAction = this.mixer.clipAction(walkClip);
      }

      console.log('Avatar model loaded and added to scene');
    } catch (error) {
      console.error('Failed to load avatar model, using placeholder:', error);
      this.createPlaceholderAvatar();
    }
  }

  private createPlaceholderAvatar(): void {
    this.avatarModel = createIdleCharacter();
    this.avatarModel.scale.set(this.config.scale, this.config.scale, this.config.scale);
    this.scene.add(this.avatarModel);
    this.applyViewModeVisibility();
    console.log('Placeholder avatar created');
  }

  /**
   * True when the key event is destined for a text field. Movement keys are
   * swallowed with preventDefault(), so without this guard typing "swap" into a
   * search box would insert no 'w', 'a' or 's', block the space bar, and walk the
   * character across the world at the same time.
   */
  private isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
  }

  private shouldIgnoreKeyEvent(e: KeyboardEvent): boolean {
    return !this.enabled || this.isTypingTarget(e.target);
  }

  /**
   * Enable/disable keyboard control, e.g. while a non-World tab is showing.
   * Held keys and velocity are cleared so the character doesn't resume walking
   * from a key that was never released.
   */
  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.keys = {};
      this.velocity.x = 0;
      this.velocity.y = 0;
    }
  }

  /**
   * Switches between third-person's fixed-per-key world directions and
   * first-person's yaw-relative movement (see updateMovement). Third-person's
   * own code path is untouched by this class either way -- this only affects
   * which branch runs.
   *
   * Also hides the whole avatarModel in first-person. male_humanoid.glb is one
   * continuous "body" mesh (head, torso, arms, legs all together, confirmed by
   * parsing the GLB directly) -- there's no separate head mesh to hide, so the
   * choice is between the camera clipping through the face or the limbs vanishing
   * too. Losing the limbs already reads better than visible face-clipping did.
   */
  public setViewMode(mode: 'third-person' | 'first-person'): void {
    this.viewMode = mode;
    this.applyViewModeVisibility();
  }

  /**
   * Applies the current viewMode's visibility to whatever avatarModel exists right
   * now. Split out from setViewMode so a model that finishes loading *after* a mode
   * switch (the GLB fetch is async; nothing stops a V-press landing during that
   * window) still ends up in the correct state, rather than defaulting to
   * THREE.Group's visible=true regardless of which mode is actually active.
   */
  private applyViewModeVisibility(): void {
    if (this.avatarModel) {
      this.avatarModel.visible = this.viewMode !== 'first-person';
    }
  }

  /**
   * First-person mouse-look yaw, applied directly with no easing -- unlike
   * third-person's turn-toward-movement-direction lerp, first-person facing must
   * track the mouse instantly, not ease toward it a frame behind. Pitch is
   * deliberately not accepted here: a humanoid doesn't tilt its whole body to
   * look up/down, so pitch stays camera-local (AvatarMapView.tsx) and never
   * touches this model's rotation.
   */
  public setFirstPersonYaw(yaw: number): void {
    if (this.avatarModel) {
      this.avatarModel.rotation.y = yaw;
    }
  }

  // Bound once so dispose() can actually remove them again.
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.shouldIgnoreKeyEvent(e)) return;

    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '].includes(key)) {
      if (key !== ' ' && key !== 'shift') {
        e.preventDefault();
      }
      this.keys[key] = true;

      if (key === ' ' && this.useCharacterGLB) {
        e.preventDefault();
        this.switchAnim('JUMP');
        if (this.jumpTimeout) clearTimeout(this.jumpTimeout);
        this.jumpTimeout = setTimeout(() => {
          this.jumpTimeout = null;
        }, 1000);
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (this.shouldIgnoreKeyEvent(e)) return;

    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '].includes(key)) {
      if (key !== ' ' && key !== 'shift') {
        e.preventDefault();
      }
      this.keys[key] = false;
    }
  };

  private setupKeyboardControls(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  public update(deltaTime: number = 0.016): void {
    this.updateMovement(deltaTime);
    this.syncModelToPosition();

    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }

  /**
   * The single place the mesh's plane position is derived from the authoritative
   * geographic position. Leaves y untouched for future ground-height sampling.
   */
  private syncModelToPosition(): void {
    if (!this.avatarModel) return;

    const { x, z } = geoToPlane(this.position.lat, this.position.lng, this.origin);
    this.avatarModel.position.x = x;
    this.avatarModel.position.z = z;
  }

  private updateMovement(deltaTime: number): void {
    const dt = Math.min(deltaTime, MAX_FRAME_DELTA_SECONDS);

    let targetVx = 0;
    let targetVy = 0;
    let moveX = 0;
    let moveZ = 0;

    // Velocity is degrees/second, derived from a metres/second speed so that the
    // distance covered on the plane is the same whichever way the character faces.
    const speedMps = this.keys['shift'] ? RUN_SPEED_MPS : this.speed;
    const latStep = speedMps * this.metersToLatDegrees;
    const lngStep = speedMps * this.metersToLngDegrees;

    if (this.keys['w'] || this.keys['arrowup']) {
      targetVy += latStep;
      this.direction = 0;
      moveZ = 1;
    }
    if (this.keys['s'] || this.keys['arrowdown']) {
      targetVy -= latStep;
      this.direction = 180;
      moveZ = -1;
    }
    if (this.keys['a'] || this.keys['arrowleft']) {
      targetVx -= lngStep;
      this.direction = 90;
      moveX = -1;
    }
    if (this.keys['d'] || this.keys['arrowright']) {
      targetVx += lngStep;
      this.direction = -90;
      moveX = 1;
    }

    // First-person: recomputed from the same raw key intent (moveX/moveZ) rather
    // than replacing the fixed-direction block above, so third-person's exact
    // existing code path runs untouched either way. moveZ (w/s) is "forward" and
    // moveX (a/d) is "strafe" *relative to the current look yaw* here, instead of
    // the fixed compass directions third-person uses. Rotating a (forward,
    // strafe) vector by yaw under this project's heading convention (0 = facing
    // +z/north, increasing clockwise toward +x/east, per geoToPlane/the camera
    // fix): forward contributes sin(yaw) to x and cos(yaw) to z; strafe-right
    // contributes cos(yaw) to x and -sin(yaw) to z.
    if (this.viewMode === 'first-person') {
      const yaw = this.avatarModel?.rotation.y ?? 0;
      const forward = moveZ;
      const strafe = moveX;
      targetVx = (forward * Math.sin(yaw) + strafe * Math.cos(yaw)) * lngStep;
      targetVy = (forward * Math.cos(yaw) - strafe * Math.sin(yaw)) * latStep;
    }

    const smoothing = 1 - Math.exp(-ACCELERATION_RATE * dt);
    this.velocity.x += (targetVx - this.velocity.x) * smoothing;
    this.velocity.y += (targetVy - this.velocity.y) * smoothing;

    this.isMoving = Math.abs(this.velocity.x) > 0.000001 || Math.abs(this.velocity.y) > 0.000001;

    if (this.avatarModel) {
      if (this.isMoving) {
        this.position.lng += this.velocity.x * dt;
        this.position.lat += this.velocity.y * dt;

        if (this.useCharacterGLB) {
          const targetAngle = Math.atan2(moveX, moveZ);
          // Time-based, not a flat per-frame factor: turning was frame-rate dependent
          // (slower on slow devices) while translation was already time-based. The
          // exponential form makes the recurrence exact -- the facing at a given elapsed
          // time is the same at any frame rate. Only the rate changes; the target and the
          // linear-toward-target path (and its wrap behaviour) are untouched.
          //
          // Skipped in first-person: rotation.y there is mouse-look yaw, applied
          // directly (and already correct) via setFirstPersonYaw -- lerping toward
          // a movement-derived angle here would fight the mouse every frame.
          if (this.viewMode !== 'first-person') {
            this.avatarModel.rotation.y = THREE.MathUtils.lerp(
              this.avatarModel.rotation.y,
              targetAngle,
              1 - Math.exp(-TURN_RATE * dt)
            );
          }

          if (!this.wasMoving && this.currentAnimName !== 'JUMP') {
            if (this.keys['shift'] && (this.keys['w'] || this.keys['arrowup'])) {
              this.switchAnim('RUNNING');
            } else if (this.keys['a'] || this.keys['arrowleft']) {
              this.switchAnim('LEFT TURN');
            } else if (this.keys['d'] || this.keys['arrowright']) {
              this.switchAnim('RIGHT TURN');
            } else {
              this.switchAnim('WALKING');
            }
          }
        } else {
          this.avatarModel.rotation.y = THREE.MathUtils.degToRad(this.direction);
          if (!this.wasMoving && this.mixer) {
            if (this.idleAction) {
              this.idleAction.stop();
            }
            if (this.walkAction) {
              this.walkAction.reset();
              this.walkAction.play();
            }
          }
        }
        this.wasMoving = true;
      } else if (this.wasMoving) {
        if (this.useCharacterGLB && this.currentAnimName !== 'JUMP') {
          this.switchAnim('IDLE');
        } else if (this.mixer) {
          if (this.walkAction) {
            this.walkAction.stop();
          }
          if (this.idleAction) {
            this.idleAction.reset();
            this.idleAction.play();
          }
        }
        this.wasMoving = false;
      }

      if (this.useCharacterGLB && this.jumpTimeout === null && this.currentAnimName === 'JUMP') {
        this.switchAnim('IDLE');
      }
    }

    // World-boundary spring. Deliberately unconditional on isMoving/avatarModel: a
    // future push or teleport could leave the character outside the boundary with
    // zero velocity, and it should still ease back. Runs in plane-space metres, per
    // axis independently (so a corner slide isn't blocked by the other axis), and
    // writes back through planeToGeo -- this.position.lat/lng is never clamped
    // directly, which is what corrupted the earlier lat/lng-based boundary attempt.
    const { x: planeX, z: planeZ } = geoToPlane(this.position.lat, this.position.lng, this.origin);
    const correctedX = applyBoundarySpring(planeX, WORLD_HALF_EXTENT_METERS, dt);
    const correctedZ = applyBoundarySpring(planeZ, WORLD_HALF_EXTENT_METERS, dt);
    if (correctedX !== planeX || correctedZ !== planeZ) {
      const corrected = planeToGeo(correctedX, correctedZ, this.origin);
      this.position.lat = corrected.lat;
      this.position.lng = corrected.lng;
    }
  }

  public getPosition(): [lat: number, lng: number] {
    return [this.position.lat, this.position.lng];
  }

  public setPosition(lat: number, lng: number): void {
    this.position.lat = lat;
    this.position.lng = lng;
  }

  public getModel(): THREE.Group | null {
    return this.avatarModel;
  }

  public isCharacterMoving(): boolean {
    return this.isMoving;
  }

  public dispose(): void {
    // These were never removed: every mount/unmount cycle left two live window
    // listeners belonging to a dead AvatarCharacter, still mutating its own keys.
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);

    if (this.jumpTimeout) {
      clearTimeout(this.jumpTimeout);
    }
    if (this.avatarModel) {
      this.scene.remove(this.avatarModel);
      this.avatarModel.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          if (Array.isArray(node.material)) {
            node.material.forEach((mat) => mat.dispose());
          } else {
            node.material.dispose();
          }
        }
      });
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
  }
}
