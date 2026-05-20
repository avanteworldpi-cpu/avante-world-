import * as THREE from 'three';
import { loadAvatarGLB, loadCharacterGLB, getAnimationClip, playAnimation, stopAnimation, createIdleCharacter } from './glb-loader';
import { AVATAR_URLS, AvatarType, SHARED_AVATAR_URL } from './supabase';

export interface AvatarConfig {
  scale?: number;
  speed?: number;
  animationSpeed?: number;
}

export class AvatarCharacter {
  private scene: THREE.Scene;
  private position: { lng: number; lat: number };
  private avatarUrl: string | null;
  private avatarModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;

  private animations: Map<string, THREE.AnimationAction> = new Map();
  private currentAnimName = 'IDLE';
  private isLoadingCharacter = false;
  private useCharacterGLB = false;
  private jumpTimeout: NodeJS.Timeout | null = null;

  private velocity = { x: 0, y: 0 };
  private speed: number;
  private keys: { [key: string]: boolean } = {};
  private direction = 0;
  private isMoving = false;
  private wasMoving = false;
  private animationFrame = 0;
  private animationSpeed = 0.1;

  private config: Required<AvatarConfig>;

  constructor(scene: THREE.Scene, startLocation: [number, number], avatarUrl: string | null, config: AvatarConfig = {}) {
    this.scene = scene;
    this.position = { lng: startLocation[0], lat: startLocation[1] };
    this.avatarUrl = avatarUrl || this.getDefaultAvatarUrl();

    this.config = {
      scale: config.scale ?? 1,
      speed: config.speed ?? 0.00004,
      animationSpeed: config.animationSpeed ?? 0.1
    };

    this.speed = this.config.speed;
    this.animationSpeed = this.config.animationSpeed;

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
      console.error('Failed to load character.glb, falling back to avatar:', error);
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
      this.animations.set(clip.name, action);
    });

    console.log('Animation map built:', Array.from(this.animations.keys()));
  }

  private switchAnim(name: string): void {
    if (this.currentAnimName === name || !this.mixer) return;

    const prevAction = this.animations.get(this.currentAnimName);
    const nextAction = this.animations.get(name);

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
    console.log('Placeholder avatar created');
  }

  private setupKeyboardControls(): void {
    window.addEventListener('keydown', (e) => {
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
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '].includes(key)) {
        if (key !== ' ' && key !== 'shift') {
          e.preventDefault();
        }
        this.keys[key] = false;
      }
    });
  }

  public update(deltaTime: number = 0.016): void {
    this.updateMovement();

    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }

  private updateMovement(): void {
    let targetVx = 0;
    let targetVy = 0;
    let moveX = 0;
    let moveZ = 0;

    if (this.keys['w'] || this.keys['arrowup']) {
      targetVy += this.speed;
      this.direction = 0;
      moveZ = 1;
    }
    if (this.keys['s'] || this.keys['arrowdown']) {
      targetVy -= this.speed;
      this.direction = 180;
      moveZ = -1;
    }
    if (this.keys['a'] || this.keys['arrowleft']) {
      targetVx -= this.speed;
      this.direction = 90;
      moveX = -1;
    }
    if (this.keys['d'] || this.keys['arrowright']) {
      targetVx += this.speed;
      this.direction = -90;
      moveX = 1;
    }

    const acceleration = 0.2;
    this.velocity.x += (targetVx - this.velocity.x) * acceleration;
    this.velocity.y += (targetVy - this.velocity.y) * acceleration;

    this.isMoving = Math.abs(this.velocity.x) > 0.000001 || Math.abs(this.velocity.y) > 0.000001;

    if (this.avatarModel) {
      if (this.isMoving) {
        this.position.lng += this.velocity.x;
        this.position.lat += this.velocity.y;

        if (this.useCharacterGLB) {
          const targetAngle = Math.atan2(moveX, moveZ);
          this.avatarModel.rotation.y = THREE.MathUtils.lerp(
            this.avatarModel.rotation.y,
            targetAngle,
            0.1
          );

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
  }

  public getPosition(): [number, number] {
    return [this.position.lng, this.position.lat];
  }

  public setPosition(lng: number, lat: number): void {
    this.position.lng = lng;
    this.position.lat = lat;
  }

  public getModel(): THREE.Group | null {
    return this.avatarModel;
  }

  public isCharacterMoving(): boolean {
    return this.isMoving;
  }

  public dispose(): void {
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
