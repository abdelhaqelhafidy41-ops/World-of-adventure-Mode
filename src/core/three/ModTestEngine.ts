import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { getFileExtension } from '@/src/core/assets/assetPipeline';
import { getAssetBlobRecord } from '@/src/core/storage/modRepository';
import { t } from '@/src/i18n';
import {
  AssetPresetKind,
  BuildingDefinition,
  ItemDefinition,
  ItemRarity,
  ModAsset,
  MonsterDefinition,
  NpcDefinition,
  WeaponDefinition,
} from '@/src/types/mod';
import {
  SandboxAnimationClip,
  SandboxEntitySummary,
  SandboxInteractionPrompt,
  SandboxPreviewMode,
  SandboxRunState,
  SandboxSnapshot,
} from '@/src/types/sandbox';

export interface SandboxInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
}

export interface ModTestEngineCallbacks {
  onRuntimeError?: (message: string) => void;
  onRuntimeLog?: (
    level: 'info' | 'warn' | 'error' | 'success',
    message: string
  ) => void;
  onCollisionStateChange?: (collidingWith: string | null) => void;
  onNearbyPromptChange?: (prompt: SandboxInteractionPrompt | null) => void;
  onEntitiesChanged?: (entities: SandboxEntitySummary[]) => void;
  onEntityClicked?: (instanceId: string) => void;
  onTriggerSound?: (soundRef: string) => void;
  onNpcInteracted?: (npc: NpcDefinition) => void;
  onItemCollected?: (item: ItemDefinition) => void;
  onBuildingDoorToggled?: (building: BuildingDefinition, doorId: string, open: boolean) => void;
  onBuildingObjectActivated?: (building: BuildingDefinition, objectId: string) => void;
  onCreatureHit?: (
    creature: MonsterDefinition,
    damage: number,
    isCrit: boolean,
    remainingHp: number
  ) => void;
  onCreatureDefeated?: (creature: MonsterDefinition) => void;
  onPlayerDamaged?: (damage: number, sourceName: string, playerHp: number) => void;
  onGltfClipsDetected?: (clipNames: string[]) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

interface CollisionShapeDesc {
  kind: 'box' | 'cylinder';
  halfX: number;
  halfY: number;
  halfZ: number;
  radius: number;
  offsetY: number;
}

interface DoorRuntimeNode {
  id: string;
  name: string;
  locked: boolean;
  keyItemId: string;
  hingeGroup: THREE.Group;
  isOpen: boolean;
  currentAngle: number;
  targetAngle: number;
  worldPos: THREE.Vector3;
}

interface InteractiveNode {
  id: string;
  name: string;
  objectType: string;
  targetId: string;
  promptText: string;
  mesh: THREE.Group;
  activated: boolean;
  worldPos: THREE.Vector3;
}

interface SandboxActor {
  instanceId: string;
  kind: 'model' | 'weapon' | 'npc' | 'creature' | 'item' | 'building';
  sourceId: string;
  name: string;
  root: THREE.Group;
  visualGroup: THREE.Group;
  collisionGroup: THREE.Group;
  collisionWireMat: THREE.MeshBasicMaterial;
  collisionFillMat: THREE.MeshBasicMaterial;
  collider: CollisionShapeDesc;
  solid: boolean;
  homePos: THREE.Vector3;
  velocity: THREE.Vector3;
  // Optional gameplay state
  npcData?: NpcDefinition;
  monsterData?: MonsterDefinition;
  itemData?: ItemDefinition;
  buildingData?: BuildingDefinition;
  weaponData?: WeaponDefinition;
  hp: number;
  maxHp: number;
  attackCooldown: number;
  hitFlashTimer: number;
  collected: boolean;
  patrolPhase: number;
  doors: DoorRuntimeNode[];
  interactives: InteractiveNode[];
  mixer?: THREE.AnimationMixer;
  gltfActions?: THREE.AnimationAction[];
  activeGltfAction?: THREE.AnimationAction;
}

interface ProjectileRuntime {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  gravity: number;
  damage: number;
  critChance: number;
  pierceLeft: number;
  hitIds: Set<string>;
  life: number;
}

interface CharacterRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  handSocket: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  collisionGroup: THREE.Group;
  collisionWireMat: THREE.MeshBasicMaterial;
  radius: number;
}

const RARITY_HEX: Record<ItemRarity, number> = {
  common: 0x94a3b8,
  uncommon: 0x10b981,
  rare: 0x3b82f6,
  epic: 0xa855f7,
  legendary: 0xf59e0b,
  relic: 0xf43f5e,
};

const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _tempBox = new THREE.Box3();
const _tempSize = new THREE.Vector3();
const _tempCenter = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();
const _deltaVec = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class ModTestEngine {
  private container: HTMLElement;
  private callbacks: ModTestEngineCallbacks;
  private isSoftwareGl: boolean;
  private lowPowerMode = false;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbit: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private envRT: THREE.WebGLRenderTarget | null = null;

  private arenaFloor: THREE.Mesh;
  private gridHelper: THREE.GridHelper;
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;

  private worldGroup = new THREE.Group();
  private projectileGroup = new THREE.Group();

  private playerRig: CharacterRig;
  private playerEquippedWeaponGroup: THREE.Group | null = null;
  private playerPos = new THREE.Vector3(0, 0, 3.2);
  private playerYaw = Math.PI;
  private playerVelY = 0;
  private playerGrounded = true;
  private playerHp = 100;
  private playerMaxHp = 100;
  private playerAttackTimer = 0;
  private playerInteractTimer = 0;
  private playerWalkPhase = 0;
  private playerIsMoving = false;

  private actors: SandboxActor[] = [];
  private projectiles: ProjectileRuntime[] = [];

  private inputState: SandboxInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
  };

  private runState: SandboxRunState = 'stopped';
  private showCollision = true;
  private followPlayerCamera = true;
  private animClip: SandboxAnimationClip = 'auto';
  private animSpeed = 1;
  private gltfClipIndex = 0;

  private snapshot: SandboxSnapshot | null = null;
  private previewMode: SandboxPreviewMode = 'arena';
  private selectedEntityId: string | null = null;
  private equippedWeaponId: string | null = null;
  private heldKeysSet = new Set<string>();
  private lastCollidingName: string | null = null;
  private lastPromptKey = '';

  private resizeObserver: ResizeObserver;
  private frameId = 0;
  private loopActive = false;
  private renderBusy = false;
  private renderDirty = false;
  private disposed = false;
  private loadSeq = 0;
  private lastTickTime = performance.now();
  private elapsedTime = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private camAnimating = false;
  private currentTheme: 'dark' | 'light' = 'dark';

  constructor(container: HTMLElement, callbacks: ModTestEngineCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0C1320');
    this.scene.fog = new THREE.FogExp2('#0C1320', 0.016);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.05, 180);
    this.camera.position.set(0, 4.6, 9.2);

    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.78);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff4e0, 2.25);
    this.keyLight.position.set(7, 12, 6);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 36;
    const d = 13;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 1.0);
    this.rimLight.position.set(-7, 5, -7);
    this.scene.add(this.rimLight);

    // Grounded terrain disc + frontier boundary markers
    const floorTex = this.createArenaGroundTexture();
    floorTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floorGeo = new THREE.CircleGeometry(28, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.86,
      metalness: 0.08,
    });
    this.arenaFloor = new THREE.Mesh(floorGeo, floorMat);
    this.arenaFloor.rotation.x = -Math.PI / 2;
    this.arenaFloor.receiveShadow = true;
    this.scene.add(this.arenaFloor);

    this.gridHelper = new THREE.GridHelper(24, 24, 0x3b82f6, 0x1e293b);
    this.gridHelper.position.y = 0.01;
    (this.gridHelper.material as THREE.Material).transparent = true;
    (this.gridHelper.material as THREE.Material).opacity = 0.42;
    this.scene.add(this.gridHelper);

    this.buildArenaPerimeterPillars();

    this.scene.add(this.worldGroup);
    this.scene.add(this.projectileGroup);

    this.playerRig = this.createCharacterRig();
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.scene.add(this.playerRig.root);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = !this.isSoftwareGl;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 1.6;
    this.orbit.maxDistance = 32;
    this.orbit.maxPolarAngle = Math.PI * 0.48;
    this.orbit.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.orbit.target.set(0, 1.0, 0);

    this.orbit.addEventListener('start', () => {
      this.camAnimating = false;
    });
    this.orbit.addEventListener('change', () => {
      if (!this.loopActive) this.requestRender();
    });

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored
    );

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.requestRender();
  }

  private createArenaGroundTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#141c2b';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 512; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
      for (let i = 0; i < 120; i++) {
        const x = (i * 73) % 512;
        const y = (i * 137) % 512;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.14)';
        ctx.fillRect(x, y, 6, 6);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    return tex;
  }

  private buildArenaPerimeterPillars(): void {
    const postCount = 16;
    const postGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.15, 6);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.72,
      metalness: 0.25,
    });
    const inst = new THREE.InstancedMesh(postGeo, postMat, postCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < postCount; i++) {
      const a = (i / postCount) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 12.2, 0.57, Math.sin(a) * 12.2);
      dummy.rotation.y = a;
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.scene.add(inst);
  }

  private createCharacterRig(): CharacterRig {
    const root = new THREE.Group();
    root.name = 'Sandbox_Player';

    const bodyPivot = new THREE.Group();
    root.add(bodyPivot);

    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.34,
      metalness: 0.52,
    });
    const clothMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.76,
      metalness: 0.1,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.28,
      metalness: 0.8,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.3,
    });

    // Legs (grounded pivots at hip y=0.68)
    const makeLeg = (x: number) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(x, 0.68, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.22), clothMat);
      thigh.position.y = -0.22;
      thigh.castShadow = true;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.28), armorMat);
      boot.position.set(0, -0.56, 0.03);
      boot.castShadow = true;
      legGroup.add(thigh, boot);
      return legGroup;
    };
    const leftLeg = makeLeg(-0.15);
    const rightLeg = makeLeg(0.15);
    bodyPivot.add(leftLeg, rightLeg);

    // Torso & Belt
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.32), armorMat);
    torso.position.y = 1.02;
    torso.castShadow = true;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.34), trimMat);
    belt.position.y = 0.74;
    const chestCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), visorMat);
    chestCore.position.set(0, 1.06, 0.17);
    bodyPivot.add(torso, belt, chestCore);

    // Head
    const head = new THREE.Group();
    head.position.set(0, 1.48, 0);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), armorMat);
    helm.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.08), visorMat);
    visor.position.set(0, 0.02, 0.17);
    head.add(helm, visor);
    bodyPivot.add(head);

    // Arms + Right-Hand Weapon Socket
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.39, 1.24, 0);
    const lPauldron = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), trimMat);
    const lForearm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), clothMat);
    lForearm.position.y = -0.26;
    lForearm.castShadow = true;
    leftArm.add(lPauldron, lForearm);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.39, 1.24, 0);
    const rPauldron = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), trimMat);
    const rForearm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), clothMat);
    rForearm.position.y = -0.26;
    rForearm.castShadow = true;
    const handSocket = new THREE.Group();
    handSocket.position.set(0, -0.48, 0.1);
    rightArm.add(rPauldron, rForearm, handSocket);

    bodyPivot.add(leftArm, rightArm);

    // Player collision cylinder proxy
    const collisionGroup = new THREE.Group();
    const collisionWireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const colGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.72, 12);
    const colMesh = new THREE.Mesh(colGeo, collisionWireMat);
    colMesh.position.y = 0.86;
    collisionGroup.add(colMesh);
    root.add(collisionGroup);

    return {
      root,
      bodyPivot,
      head,
      leftArm,
      rightArm,
      handSocket,
      leftLeg,
      rightLeg,
      collisionGroup,
      collisionWireMat,
      radius: 0.45,
    };
  }

  public setTheme(theme: 'dark' | 'light'): void {
    this.currentTheme = theme;
    const bg = theme === 'dark' ? '#0C1320' : '#DCE5F2';
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.FogExp2(bg, 0.015);
    if (!this.loopActive) this.requestRender();
  }

  public setLowPowerMode(enabled: boolean): void {
    this.lowPowerMode = enabled;
    const fast = this.isSoftwareGl || enabled;
    this.renderer.setPixelRatio(fast ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.orbit.enableDamping = !fast;
    this.renderer.shadowMap.enabled = !fast;
    this.keyLight.castShadow = !fast;
    if (!this.loopActive) this.requestRender();
  }

  public setShowCollision(enabled: boolean): void {
    this.showCollision = enabled;
    this.playerRig.collisionGroup.visible = enabled;
    for (const actor of this.actors) {
      actor.collisionGroup.visible = enabled && !actor.collected;
    }
    if (!this.loopActive) this.requestRender();
  }

  public setFollowCamera(enabled: boolean): void {
    this.followPlayerCamera = enabled;
  }

  public setAnimationState(clip: SandboxAnimationClip, speed = 1): void {
    this.animClip = clip;
    this.animSpeed = Math.max(0.25, Math.min(2.5, speed));
    if (clip === 'attack') {
      this.playerAttackTimer = 0.48;
    } else if (clip === 'interact') {
      this.playerInteractTimer = 0.65;
    }
    if (clip !== 'auto' && clip !== 'idle') {
      this.ensureActiveLoop();
    } else if (!this.loopActive) {
      this.requestRender();
    }
  }

  public setGltfClipIndex(index: number): void {
    this.gltfClipIndex = index;
    for (const actor of this.actors) {
      if (actor.mixer && actor.gltfActions && actor.gltfActions.length > 0) {
        actor.activeGltfAction?.stop();
        const nextAction = actor.gltfActions[index % actor.gltfActions.length];
        nextAction.reset().play();
        actor.activeGltfAction = nextAction;
      }
    }
    this.ensureActiveLoop();
  }

  public setInputState(patch: Partial<SandboxInputState>): void {
    this.inputState = { ...this.inputState, ...patch };
    if (patch.jump && this.runState === 'playing' && this.playerGrounded) {
      this.playerVelY = 5.4;
      this.playerGrounded = false;
    }
  }

  public setHeldKeys(itemIds: string[]): void {
    this.heldKeysSet = new Set(itemIds);
  }

  public setRunState(state: SandboxRunState): void {
    this.runState = state;
    if (state === 'playing') {
      this.lastTickTime = performance.now();
      this.ensureActiveLoop();
    } else {
      this.inputState = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false,
      };
      this.loopActive = false;
      this.requestRender();
    }
  }

  public async loadSandboxScene(
    snapshot: SandboxSnapshot,
    mode: SandboxPreviewMode,
    selectedEntityId: string | null,
    equippedWeaponId: string | null
  ): Promise<void> {
    const seq = ++this.loadSeq;
    this.snapshot = snapshot;
    this.previewMode = mode;
    this.selectedEntityId = selectedEntityId;
    this.equippedWeaponId = equippedWeaponId;

    this.clearWorldEntities();
    this.playerPos.set(0, 0, mode === 'arena' ? 3.8 : 2.6);
    this.playerYaw = Math.PI;
    this.playerVelY = 0;
    this.playerGrounded = true;
    this.playerHp = this.playerMaxHp;
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.playerRig.collisionGroup.visible = this.showCollision;

    await this.equipWeaponOnPlayer(equippedWeaponId);
    if (this.disposed || seq !== this.loadSeq) return;

    if (mode === 'arena') {
      await this.populateArenaMode(snapshot, seq);
    } else if (mode === 'model') {
      const target =
        snapshot.assets.find((a) => a.id === selectedEntityId && a.type === '3d-model') ??
        snapshot.assets.find((a) => a.type === '3d-model');
      if (target) {
        await this.spawnAssetModelActor(target, new THREE.Vector3(0, 0, 0), seq);
      }
      this.playerRig.root.visible = false;
    } else if (mode === 'character') {
      this.playerRig.root.visible = true;
      this.playerPos.set(0, 0, 0);
      this.playerRig.root.position.copy(this.playerPos);
      const dummyNpc = snapshot.npcs[0];
      if (dummyNpc) {
        await this.spawnNpcActor(dummyNpc, new THREE.Vector3(-2.6, 0, -1.8), seq);
      }
    } else if (mode === 'weapon') {
      this.playerRig.root.visible = true;
      this.playerPos.set(-1.2, 0, 0.4);
      this.playerRig.root.position.copy(this.playerPos);
      this.playerRig.root.rotation.y = Math.PI * 0.5;
      const weapon =
        snapshot.weapons.find((w) => w.uid === selectedEntityId || w.id === selectedEntityId) ??
        snapshot.weapons[0];
      if (weapon) {
        await this.equipWeaponOnPlayer(weapon.id);
        await this.spawnWeaponStandActor(weapon, new THREE.Vector3(0, 0, -2.0), seq);
      }
      // Target creature dummy for live swing & projectile test
      const dummyTarget: MonsterDefinition = snapshot.monsters[0] ?? {
        uid: 'sandbox_target_dummy',
        id: `${snapshot.manifest.modId}:target_sentinel`,
        name: 'Combat Test Dummy',
        description: 'Sandbox combat target for testing melee, crits, and projectiles.',
        model: 'woa:sentinel_frame',
        health: 150,
        damage: 0,
        speed: 0,
        detectionRange: 4,
        attackBehavior: 'melee',
        loot: [],
        spawnRules: {
          biomes: ['arena'],
          timeOfDay: 'any',
          minGroupSize: 1,
          maxGroupSize: 1,
          spawnWeight: 1,
          minAltitude: 0,
        },
        updatedAt: snapshot.capturedAt,
      };
      await this.spawnMonsterActor(dummyTarget, new THREE.Vector3(2.2, 0, 0.4), seq);
    } else if (mode === 'npc') {
      this.playerRig.root.visible = true;
      const npc =
        snapshot.npcs.find((n) => n.uid === selectedEntityId || n.id === selectedEntityId) ??
        snapshot.npcs[0];
      if (npc) {
        await this.spawnNpcActor(npc, new THREE.Vector3(0, 0, -0.5), seq);
      }
    } else if (mode === 'creature') {
      this.playerRig.root.visible = true;
      const monster =
        snapshot.monsters.find((m) => m.uid === selectedEntityId || m.id === selectedEntityId) ??
        snapshot.monsters[0];
      if (monster) {
        await this.spawnMonsterActor(monster, new THREE.Vector3(0, 0, -1.2), seq);
      }
    } else if (mode === 'item') {
      this.playerRig.root.visible = true;
      const item =
        snapshot.items.find((i) => i.uid === selectedEntityId || i.id === selectedEntityId) ??
        snapshot.items[0];
      if (item) {
        this.spawnItemActor(item, new THREE.Vector3(0, 0, -0.4));
      }
    } else if (mode === 'building') {
      this.playerRig.root.visible = true;
      this.playerPos.set(0, 0, 5.2);
      this.playerRig.root.position.copy(this.playerPos);
      const building =
        snapshot.buildings.find((b) => b.uid === selectedEntityId || b.id === selectedEntityId) ??
        snapshot.buildings[0];
      if (building) {
        await this.spawnBuildingActor(building, new THREE.Vector3(0, 0, -1.5), seq);
      }
    }

    if (this.disposed || seq !== this.loadSeq) return;

    this.setShowCollision(this.showCollision);
    this.emitEntitiesSummary();
    this.frameCameraForMode(mode);
    this.requestRender();
  }

  private async populateArenaMode(
    snapshot: SandboxSnapshot,
    seq: number
  ): Promise<void> {
    this.playerRig.root.visible = true;

    // Place up to 2 buildings on the back arc
    for (let i = 0; i < Math.min(snapshot.buildings.length, 2); i++) {
      const b = snapshot.buildings[i];
      const x = i === 0 ? -4.8 : 4.8;
      await this.spawnBuildingActor(b, new THREE.Vector3(x, 0, -5.2), seq);
    }

    // Place NPCs on left-center
    for (let i = 0; i < Math.min(snapshot.npcs.length, 3); i++) {
      await this.spawnNpcActor(
        snapshot.npcs[i],
        new THREE.Vector3(-4.2 + i * 2.1, 0, -0.4),
        seq
      );
    }

    // Place Creatures on right-center
    for (let i = 0; i < Math.min(snapshot.monsters.length, 3); i++) {
      await this.spawnMonsterActor(
        snapshot.monsters[i],
        new THREE.Vector3(3.4 + i * 2.2, 0, -0.8),
        seq
      );
    }

    // Place Items in center-front display arc
    for (let i = 0; i < Math.min(snapshot.items.length, 4); i++) {
      this.spawnItemActor(
        snapshot.items[i],
        new THREE.Vector3(-2.4 + i * 1.6, 0, 1.8)
      );
    }

    // If no content entities exist yet, showcase the project's 3D assets
    if (
      snapshot.buildings.length === 0 &&
      snapshot.npcs.length === 0 &&
      snapshot.monsters.length === 0 &&
      snapshot.items.length === 0
    ) {
      const models = snapshot.assets.filter((a) => a.type === '3d-model');
      for (let i = 0; i < Math.min(models.length, 4); i++) {
        await this.spawnAssetModelActor(
          models[i],
          new THREE.Vector3(-3 + i * 2.5, 0, -1.5),
          seq
        );
      }
    }
  }

  private frameCameraForMode(mode: SandboxPreviewMode): void {
    if (mode === 'building') {
      _camTargetLook.set(0, 1.5, -1);
      _camTargetPos.set(5.5, 5.2, 8.8);
    } else if (mode === 'model' || mode === 'item') {
      _camTargetLook.set(0, 0.9, 0);
      _camTargetPos.set(2.8, 2.2, 3.6);
    } else if (mode === 'arena') {
      _camTargetLook.set(0, 1.0, 0);
      _camTargetPos.set(0, 5.8, 10.6);
    } else {
      _camTargetLook.set(0, 1.0, 0);
      _camTargetPos.set(3.4, 2.7, 5.4);
    }
    this.camera.position.copy(_camTargetPos);
    this.orbit.target.copy(_camTargetLook);
    this.orbit.update();
  }

  private async resolveModelVisual(
    modelRef: string | undefined,
    fallbackPreset: AssetPresetKind,
    primaryHex: string,
    accentHex: string,
    seq: number,
    entityLabel: string
  ): Promise<{
    group: THREE.Group;
    mixer?: THREE.AnimationMixer;
    actions?: THREE.AnimationAction[];
  }> {
    const assets = this.snapshot?.assets ?? [];
    const trimmed = (modelRef ?? '').trim();

    if (trimmed && !trimmed.startsWith('woa:')) {
      const asset = assets.find(
        (a) => a.path === trimmed || a.id === trimmed
      );
      if (!asset) {
        this.callbacks.onRuntimeError?.(
          t('core.sandboxMissingAsset', { entity: entityLabel, model: trimmed })
        );
      } else if (asset.blobKey) {
        try {
          const rec = await getAssetBlobRecord(asset.blobKey);
          if (!rec) {
            throw new Error(t('core.sandboxMissingBinary', { path: asset.path }));
          }
          const ext = getFileExtension(asset.path);
          const { scene: loaded, animations } = await this.parseModelBuffer(
            rec.data,
            ext
          );
          if (this.disposed || seq !== this.loadSeq) {
            return { group: new THREE.Group() };
          }
          this.normalizeToGround(loaded, 1.8);
          const wrapper = new THREE.Group();
          wrapper.add(loaded);

          let mixer: THREE.AnimationMixer | undefined;
          let actions: THREE.AnimationAction[] | undefined;
          if (animations.length > 0) {
            mixer = new THREE.AnimationMixer(loaded);
            actions = animations.map((clip) => mixer!.clipAction(clip));
            actions[0].play();
            this.callbacks.onGltfClipsDetected?.(animations.map((c) => c.name || 'Clip'));
          }
          return { group: wrapper, mixer, actions };
        } catch (err) {
          this.callbacks.onRuntimeError?.(
            t('core.sandboxLoad3DError', {
              entity: entityLabel,
              error:
                err instanceof Error
                  ? err.message
                  : t('core.sandboxParseBufferFailed'),
            })
          );
        }
      } else if (asset.preset) {
        return {
          group: this.buildCompositePreset(
            asset.preset,
            asset.material.color,
            asset.material.accentColor
          ),
        };
      }
    }

    return {
      group: this.buildCompositePreset(fallbackPreset, primaryHex, accentHex),
    };
  }

  private async parseModelBuffer(
    buffer: ArrayBuffer,
    ext: string
  ): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
    if (ext === 'obj') {
      const text = new TextDecoder().decode(buffer);
      const obj = new OBJLoader().parse(text);
      return { scene: obj, animations: [] };
    }
    const loader = new GLTFLoader();
    const input: ArrayBuffer | string =
      ext === 'gltf' ? new TextDecoder().decode(buffer) : buffer.slice(0);
    return await new Promise((resolve, reject) => {
      loader.parse(
        input,
        '',
        (gltf) => {
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          resolve({ scene: gltf.scene, animations: gltf.animations ?? [] });
        },
        (err) => reject(err instanceof Error ? err : new Error('Invalid GLTF/GLB'))
      );
    });
  }

  private normalizeToGround(obj: THREE.Object3D, maxDimTarget: number): void {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    if (maxDim > maxDimTarget * 1.8 || maxDim < 0.3) {
      obj.scale.setScalar(maxDimTarget / maxDim);
      obj.updateMatrixWorld(true);
      box.setFromObject(obj);
    }
    const center = box.getCenter(new THREE.Vector3());
    obj.position.x -= center.x;
    obj.position.z -= center.z;
    obj.position.y -= box.min.y;
  }

  private buildCompositePreset(
    preset: AssetPresetKind,
    primaryColor: string,
    accentColor: string
  ): THREE.Group {
    const group = new THREE.Group();
    const pMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.36,
      metalness: 0.62,
    });
    const aMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.35,
      roughness: 0.22,
      metalness: 0.4,
    });
    const tMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.68,
      metalness: 0.24,
    });

    const add = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      pos: [number, number, number],
      rot: [number, number, number] = [0, 0, 0]
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.rotation.set(...rot);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    };

    if (preset === 'relic-sword') {
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.38, 8), tMat, [0, 0.2, 0]);
      add(new THREE.BoxGeometry(0.62, 0.08, 0.14), pMat, [0, 0.42, 0]);
      add(new THREE.OctahedronGeometry(0.08, 0), aMat, [0, 0.42, 0.08]);
      add(new THREE.BoxGeometry(0.14, 1.05, 0.04), pMat, [0, 0.98, 0]);
      add(new THREE.ConeGeometry(0.09, 0.24, 4), pMat, [0, 1.62, 0], [0, Math.PI / 4, 0]);
      add(new THREE.BoxGeometry(0.03, 0.85, 0.06), aMat, [0, 0.98, 0]);
    } else if (preset === 'crystal-obelisk') {
      add(new THREE.CylinderGeometry(0.62, 0.72, 0.18, 6), tMat, [0, 0.09, 0]);
      add(new THREE.CylinderGeometry(0.18, 0.34, 1.25, 6), aMat, [0, 0.8, 0]);
      add(new THREE.ConeGeometry(0.18, 0.38, 6), aMat, [0, 1.61, 0]);
      add(new THREE.TorusGeometry(0.42, 0.035, 8, 24), pMat, [0, 0.96, 0], [1.2, 0.2, 0]);
    } else if (preset === 'frontier-crate') {
      add(new THREE.BoxGeometry(1.05, 1.05, 1.05), pMat, [0, 0.525, 0]);
      add(new THREE.BoxGeometry(1.14, 0.12, 1.14), tMat, [0, 0.06, 0]);
      add(new THREE.BoxGeometry(1.14, 0.12, 1.14), tMat, [0, 1.02, 0]);
      add(new THREE.BoxGeometry(0.24, 0.28, 0.08), aMat, [0, 0.58, 0.54]);
    } else if (preset === 'clockwork-sentinel') {
      add(new THREE.CylinderGeometry(0.42, 0.52, 0.16, 10), tMat, [0, 0.08, 0]);
      add(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 10), tMat, [0, 0.41, 0]);
      add(new THREE.CylinderGeometry(0.38, 0.32, 0.62, 12), pMat, [0, 0.96, 0]);
      add(new THREE.BoxGeometry(0.38, 0.32, 0.36), pMat, [0, 1.44, 0]);
      add(new THREE.BoxGeometry(0.28, 0.09, 0.08), aMat, [0, 1.46, 0.18]);
      add(new THREE.OctahedronGeometry(0.13, 0), aMat, [0, 0.98, 0.34]);
    } else {
      add(new THREE.CylinderGeometry(0.66, 0.78, 0.18, 8), tMat, [0, 0.09, 0]);
      add(new THREE.CylinderGeometry(0.24, 0.32, 0.85, 8), pMat, [0, 0.6, 0]);
      add(new THREE.OctahedronGeometry(0.24, 0), aMat, [0, 1.32, 0]);
      add(new THREE.TorusGeometry(0.36, 0.03, 8, 24), aMat, [0, 1.32, 0], [Math.PI / 2, 0, 0]);
    }

    return group;
  }

  private async equipWeaponOnPlayer(weaponId: string | null): Promise<void> {
    if (this.playerEquippedWeaponGroup) {
      this.playerRig.handSocket.remove(this.playerEquippedWeaponGroup);
      this.disposeObject(this.playerEquippedWeaponGroup);
      this.playerEquippedWeaponGroup = null;
    }

    const weapon =
      this.snapshot?.weapons.find(
        (w) => w.id === weaponId || w.uid === weaponId
      ) ?? this.snapshot?.weapons[0];

    const weaponVisual = new THREE.Group();
    if (weapon) {
      const { group } = await this.resolveModelVisual(
        weapon.model,
        'relic-sword',
        '#94a3b8',
        '#38bdf8',
        this.loadSeq,
        weapon.name
      );
      group.scale.setScalar(0.65);
      group.rotation.x = Math.PI * 0.45;
      weaponVisual.add(group);
    } else {
      const fallback = this.buildCompositePreset('relic-sword', '#64748b', '#3b82f6');
      fallback.scale.setScalar(0.6);
      fallback.rotation.x = Math.PI * 0.45;
      weaponVisual.add(fallback);
    }

    this.playerEquippedWeaponGroup = weaponVisual;
    this.playerRig.handSocket.add(weaponVisual);
  }

  private createCollisionHelper(
    visualGroup: THREE.Group,
    override?: { width: number; height: number; depth: number; offsetY?: number }
  ): {
    group: THREE.Group;
    wireMat: THREE.MeshBasicMaterial;
    fillMat: THREE.MeshBasicMaterial;
    desc: CollisionShapeDesc;
  } {
    visualGroup.updateMatrixWorld(true);
    _tempBox.setFromObject(visualGroup);
    if (_tempBox.isEmpty()) {
      _tempSize.set(1, 1.2, 1);
      _tempCenter.set(0, 0.6, 0);
    } else {
      _tempBox.getSize(_tempSize);
      _tempBox.getCenter(_tempCenter);
    }

    const w = Math.max(override?.width ?? _tempSize.x, 0.5);
    const h = Math.max(override?.height ?? _tempSize.y, 0.6);
    const d = Math.max(override?.depth ?? _tempSize.z, 0.5);
    const offY = override?.offsetY ?? _tempCenter.y;

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      wireframe: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const geo = new THREE.BoxGeometry(w, h, d);
    const wire = new THREE.Mesh(geo, wireMat);
    const fill = new THREE.Mesh(geo.clone(), fillMat);
    const group = new THREE.Group();
    group.position.set(0, offY, 0);
    group.add(fill, wire);

    return {
      group,
      wireMat,
      fillMat,
      desc: {
        kind: 'box',
        halfX: w * 0.5,
        halfY: h * 0.5,
        halfZ: d * 0.5,
        radius: Math.max(w, d) * 0.5,
        offsetY: offY,
      },
    };
  }

  private tagPickable(root: THREE.Object3D, instanceId: string): void {
    root.traverse((child) => {
      child.userData.__sandboxInstanceId = instanceId;
    });
  }

  private async spawnAssetModelActor(
    asset: ModAsset,
    pos: THREE.Vector3,
    seq: number
  ): Promise<void> {
    const instanceId = `model_${asset.id}`;
    const { group, mixer, actions } = await this.resolveModelVisual(
      asset.path,
      asset.preset ?? 'beacon-pedestal',
      asset.material.color,
      asset.material.accentColor,
      seq,
      asset.name
    );
    if (this.disposed || seq !== this.loadSeq) return;

    const col = this.createCollisionHelper(group);
    const root = new THREE.Group();
    root.position.copy(pos);
    root.add(group, col.group);
    this.tagPickable(root, instanceId);
    this.worldGroup.add(root);

    this.actors.push({
      instanceId,
      kind: 'model',
      sourceId: asset.id,
      name: asset.name,
      root,
      visualGroup: group,
      collisionGroup: col.group,
      collisionWireMat: col.wireMat,
      collisionFillMat: col.fillMat,
      collider: col.desc,
      solid: true,
      homePos: pos.clone(),
      velocity: new THREE.Vector3(),
      hp: 100,
      maxHp: 100,
      attackCooldown: 0,
      hitFlashTimer: 0,
      collected: false,
      patrolPhase: 0,
      doors: [],
      interactives: [],
      mixer,
      gltfActions: actions,
      activeGltfAction: actions?.[0],
    });
  }

  private async spawnWeaponStandActor(
    weapon: WeaponDefinition,
    pos: THREE.Vector3,
    seq: number
  ): Promise<void> {
    const instanceId = `weapon_${weapon.uid}`;
    const stand = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.72, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.3 })
    );
    base.position.y = 0.09;
    base.castShadow = true;
    stand.add(base);

    const { group, mixer, actions } = await this.resolveModelVisual(
      weapon.model,
      'relic-sword',
      '#64748b',
      '#f59e0b',
      seq,
      weapon.name
    );
    if (this.disposed || seq !== this.loadSeq) return;
    group.position.y = 0.25;
    stand.add(group);

    const col = this.createCollisionHelper(stand);
    const root = new THREE.Group();
    root.position.copy(pos);
    root.add(stand, col.group);
    this.tagPickable(root, instanceId);
    this.worldGroup.add(root);

    this.actors.push({
      instanceId,
      kind: 'weapon',
      sourceId: weapon.id,
      name: weapon.name,
      root,
      visualGroup: stand,
      collisionGroup: col.group,
      collisionWireMat: col.wireMat,
      collisionFillMat: col.fillMat,
      collider: col.desc,
      solid: false,
      homePos: pos.clone(),
      velocity: new THREE.Vector3(),
      weaponData: weapon,
      hp: 1,
      maxHp: 1,
      attackCooldown: 0,
      hitFlashTimer: 0,
      collected: false,
      patrolPhase: 0,
      doors: [],
      interactives: [],
      mixer,
      gltfActions: actions,
    });
  }

  private async spawnNpcActor(
    npc: NpcDefinition,
    pos: THREE.Vector3,
    seq: number
  ): Promise<void> {
    const instanceId = `npc_${npc.uid}`;
    const { group, mixer, actions } = await this.resolveModelVisual(
      npc.model,
      'beacon-pedestal',
      '#0f766e',
      '#38bdf8',
      seq,
      npc.name
    );
    if (this.disposed || seq !== this.loadSeq) return;

    // Add interaction proximity ring around NPC
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.05, 28),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    const col = this.createCollisionHelper(group, {
      width: 0.9,
      height: 1.8,
      depth: 0.9,
      offsetY: 0.9,
    });
    const root = new THREE.Group();
    root.position.copy(pos);
    root.add(group, col.group);
    this.tagPickable(root, instanceId);
    this.worldGroup.add(root);

    if (npc.health <= 0) {
      this.callbacks.onRuntimeError?.(
        t('core.sandboxNpcHealthError', { name: npc.name, health: npc.health })
      );
    }

    this.actors.push({
      instanceId,
      kind: 'npc',
      sourceId: npc.id,
      name: npc.name,
      root,
      visualGroup: group,
      collisionGroup: col.group,
      collisionWireMat: col.wireMat,
      collisionFillMat: col.fillMat,
      collider: col.desc,
      solid: true,
      homePos: pos.clone(),
      velocity: new THREE.Vector3(),
      npcData: npc,
      hp: Math.max(1, npc.health),
      maxHp: Math.max(1, npc.health),
      attackCooldown: 0,
      hitFlashTimer: 0,
      collected: false,
      patrolPhase: Math.random() * Math.PI * 2,
      doors: [],
      interactives: [],
      mixer,
      gltfActions: actions,
    });
  }

  private async spawnMonsterActor(
    monster: MonsterDefinition,
    pos: THREE.Vector3,
    seq: number
  ): Promise<void> {
    const instanceId = `creature_${monster.uid}`;
    const { group, mixer, actions } = await this.resolveModelVisual(
      monster.model,
      'clockwork-sentinel',
      '#7f1d1d',
      '#f97316',
      seq,
      monster.name
    );
    if (this.disposed || seq !== this.loadSeq) return;

    // Detection range ring
    const detectR = THREE.MathUtils.clamp(monster.detectionRange || 5, 1.5, 10);
    const rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(detectR - 0.06, detectR, 36),
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.28,
      })
    );
    rangeRing.rotation.x = -Math.PI / 2;
    rangeRing.position.y = 0.025;

    const col = this.createCollisionHelper(group, {
      width: 1.05,
      height: 1.85,
      depth: 1.05,
      offsetY: 0.92,
    });
    col.group.add(rangeRing);

    const root = new THREE.Group();
    root.position.copy(pos);
    root.add(group, col.group);
    this.tagPickable(root, instanceId);
    this.worldGroup.add(root);

    if (monster.health <= 0) {
      this.callbacks.onRuntimeError?.(
        t('core.sandboxCreatureHealthError', { name: monster.name })
      );
    }

    this.actors.push({
      instanceId,
      kind: 'creature',
      sourceId: monster.id,
      name: monster.name,
      root,
      visualGroup: group,
      collisionGroup: col.group,
      collisionWireMat: col.wireMat,
      collisionFillMat: col.fillMat,
      collider: col.desc,
      solid: true,
      homePos: pos.clone(),
      velocity: new THREE.Vector3(),
      monsterData: monster,
      hp: Math.max(1, monster.health),
      maxHp: Math.max(1, monster.health),
      attackCooldown: 0,
      hitFlashTimer: 0,
      collected: false,
      patrolPhase: Math.random() * Math.PI * 2,
      doors: [],
      interactives: [],
      mixer,
      gltfActions: actions,
    });
  }

  private spawnItemActor(item: ItemDefinition, pos: THREE.Vector3): void {
    const instanceId = `item_${item.uid}`;
    const group = new THREE.Group();
    const color = RARITY_HEX[item.rarity] ?? 0x3b82f6;

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.5, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.3 })
    );
    plinth.position.y = 0.07;
    plinth.castShadow = true;

    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.45,
        roughness: 0.2,
        metalness: 0.5,
      })
    );
    gem.position.y = 0.68;
    gem.castShadow = true;

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.62, 24),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.025;

    group.add(plinth, gem, halo);

    const col = this.createCollisionHelper(group, {
      width: 0.9,
      height: 1.1,
      depth: 0.9,
      offsetY: 0.55,
    });

    const root = new THREE.Group();
    root.position.copy(pos);
    root.add(group, col.group);
    this.tagPickable(root, instanceId);
    this.worldGroup.add(root);

    this.actors.push({
      instanceId,
      kind: 'item',
      sourceId: item.id,
      name: item.name,
      root,
      visualGroup: group,
      collisionGroup: col.group,
      collisionWireMat: col.wireMat,
      collisionFillMat: col.fillMat,
      collider: col.desc,
      solid: false,
      homePos: pos.clone(),
      velocity: new THREE.Vector3(),
      itemData: item,
      hp: 1,
      maxHp: 1,
      attackCooldown: 0,
      hitFlashTimer: 0,
      collected: false,
      patrolPhase: 0,
      doors: [],
      interactives: [],
    });
  }

  private async spawnBuildingActor(
    building: BuildingDefinition,
    pos: THREE.Vector3,
    seq: number
  ): Promise<void> {
    const instanceId = `building_${building.uid}`;
    const group = new THREE.Group();

    const fw = Math.max(building.footprint.width || 4, 2.2);
    const fh = Math.max(building.footprint.height || 3.2, 2.0);
    const fd = Math.max(building.footprint.depth || 4, 2.2);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.72,
      metalness: 0.22,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.45,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.48,
      metalness: 0.35,
    });

    // Foundation slab
    const base = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.24, fd), trimMat);
    base.position.y = 0.12;
    base.receiveShadow = true;
    base.castShadow = true;
    group.add(base);

    // Corner pillars + back & side walls leaving front doorway clear
    const wallH = fh * 0.72;
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.2, wallH, 0.26), wallMat);
    backWall.position.set(0, 0.24 + wallH * 0.5, -fd * 0.5 + 0.15);
    backWall.castShadow = true;
    backWall.receiveShadow = true;

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.26, wallH, fd - 0.2), wallMat);
    leftWall.position.set(-fw * 0.5 + 0.15, 0.24 + wallH * 0.5, 0);
    leftWall.castShadow = true;

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.26, wallH, fd - 0.2), wallMat);
    rightWall.position.set(fw * 0.5 - 0.15, 0.24 + wallH * 0.5, 0);
    rightWall.castShadow = true;

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(fw, fd) * 0.74, fh * 0.42, 4),
      roofMat
    );
    roof.position.y = 0.24 + wallH + fh * 0.21;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(backWall, leftWall, rightWall, roof);

    // Doors
    const doors: DoorRuntimeNode[] = [];
    const doorEntries =
      building.doors.length > 0
        ? building.doors
        : [
            {
              id: 'default_door',
              name: 'Main Entrance',
              model: '',
              position: { x: 0, y: 0.24, z: fd * 0.5 - 0.12 },
              rotationYDeg: 0,
              locked: false,
              keyItemId: '',
            },
          ];

    for (const d of doorEntries) {
      const hingeGroup = new THREE.Group();
      const dz = Math.min(fd * 0.5 - 0.1, Math.max(-fd * 0.5, d.position.z || fd * 0.5 - 0.1));
      const dx = THREE.MathUtils.clamp(d.position.x, -fw * 0.35, fw * 0.35);
      hingeGroup.position.set(dx - 0.48, 0.24, dz);

      const doorPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, Math.min(1.9, wallH * 0.85), 0.1),
        new THREE.MeshStandardMaterial({
          color: d.locked ? 0xb45309 : 0x78563a,
          roughness: 0.62,
          metalness: 0.28,
        })
      );
      doorPanel.position.set(0.48, Math.min(1.9, wallH * 0.85) * 0.5, 0);
      doorPanel.castShadow = true;
      hingeGroup.add(doorPanel);
      group.add(hingeGroup);

      doors.push({
        id: d.id,
        name: d.name,
        locked: d.locked,
        keyItemId: d.keyItemId,
        hingeGroup,
        isOpen: false,
        currentAngle: 0,
        targetAngle: 0,
        worldPos: pos.clone().add(new THREE.Vector3(dx, 0.5, dz)),
      });
    }

    // Windows
    for (const win of building.windows) {
      const wMesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(win.width || 0.9, 1.4), Math.min(win.height || 0.9, 1.2), 0.12),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.3,
          roughness: 0.15,
          metalness: 0.1,
        })
      );
      wMesh.position.set(
        THREE.MathUtils.clamp(win.position.x, -fw * 0.42, fw * 0.42),
        THREE.MathUtils.clamp(win.position.y || 1.4, 0.8, wallH),
        THREE.MathUtils.clamp(win.position.z, -fd * 0.48, fd * 0.48)
      );
      group.add(wMesh);
    }

    // Interactive Objects (Chest / Beacon / Crafting Station)
    const interactives: InteractiveNode[] = [];
    for (const io of building.interactiveObjects) {
      const ioGroup = new THREE.Group();
      const ix = THREE.MathUtils.clamp(io.position.x, -fw * 0.35, fw * 0.35);
      const iz = THREE.MathUtils.clamp(io.position.z, -fd * 0.35, fd * 0.35);
      ioGroup.position.set(ix, 0.24, iz);

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.65,
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.52, 0.45), trimMat);
      box.position.y = 0.26;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), coreMat);
      orb.position.y = 0.72;
      ioGroup.add(box, orb);
      group.add(ioGroup);

      interactives.push({
        id: io.id,
        name: io.name,
        objectType: io.objectType,
        targetId: io.targetId,
        promptText: io.interactionPrompt || `Use ${io.name}`,
        mesh: ioGroup,
        activated: false,
        worldPos: pos.clone().add(new THREE.Vector3(ix, 0.5, iz)),
      });
    }

    // Optional model asset verification check
    if (building.model && !building.model.startsWith('woa:')) {
      await this.resolveModelVisual(
        building.model,
        'beacon-pedestal',
        '#475569',
        '#38bdf8',
        seq,
        building.name
      );
    }

    const colW = building.collision.enabled ? Math.max(building.collision.width || fw, 1) : fw;
    const colH = building.collision.enabled ? Math.max(building.collision.height || fh, 1) : fh;
    const colD = building.collision.enabled ? Math.max(building.collision.depth || fd, 1) : fd;

    const col = this.createCollisionHelper(group, {
      width: colW,
      height: colH,
      depth: colD,
      offsetY: colH * 0.5,
    });

    const root = new THREE.Group();
    root.position.copy(pos);
    root.add(group, col.group);
    this.tagPickable(root, instanceId);
    this.worldGroup.add(root);

    this.actors.push({
      instanceId,
      kind: 'building',
      sourceId: building.id,
      name: building.name,
      root,
      visualGroup: group,
      collisionGroup: col.group,
      collisionWireMat: col.wireMat,
      collisionFillMat: col.fillMat,
      collider: col.desc,
      solid: building.collision.enabled,
      homePos: pos.clone(),
      velocity: new THREE.Vector3(),
      buildingData: building,
      hp: 100,
      maxHp: 100,
      attackCooldown: 0,
      hitFlashTimer: 0,
      collected: false,
      patrolPhase: 0,
      doors,
      interactives,
    });
  }

  public triggerAttack(): void {
    if (!this.snapshot) return;
    const weapon =
      this.snapshot.weapons.find(
        (w) => w.id === this.equippedWeaponId || w.uid === this.equippedWeaponId
      ) ?? this.snapshot.weapons[0];

    this.playerAttackTimer = 0.45;
    this.ensureActiveLoop();

    if (weapon) {
      if (weapon.sound) {
        this.callbacks.onTriggerSound?.(weapon.sound);
      } else {
        this.callbacks.onTriggerSound?.('woa:sfx_swing');
      }

      if (weapon.projectile.enabled) {
        if (weapon.projectile.speed <= 0) {
          this.callbacks.onRuntimeError?.(
            t('core.sandboxWeaponProjError', { name: weapon.name })
          );
        } else {
          this.spawnProjectile(weapon);
        }
      }

      // Melee hit detection in front arc
      const range = Math.max(1.8, weapon.range || 2.4);
      const forwardX = Math.sin(this.playerYaw);
      const forwardZ = Math.cos(this.playerYaw);
      for (const actor of this.actors) {
        if (actor.kind !== 'creature' || actor.hp <= 0 || !actor.monsterData) continue;
        _deltaVec.subVectors(actor.root.position, this.playerPos);
        const dist = _deltaVec.length();
        if (dist <= range + actor.collider.radius) {
          _deltaVec.normalize();
          const dot = _deltaVec.x * forwardX + _deltaVec.z * forwardZ;
          if (dot > -0.2 || dist < 1.35) {
            this.applyDamageToCreature(actor, weapon.damage, weapon.criticalChance);
          }
        }
      }
    } else {
      this.callbacks.onTriggerSound?.('woa:sfx_swing');
    }
  }

  private spawnProjectile(weapon: WeaponDefinition): void {
    const dir = new THREE.Vector3(Math.sin(this.playerYaw), 0, Math.cos(this.playerYaw));
    if (weapon.projectile.spreadDegrees > 0) {
      const spread = THREE.MathUtils.degToRad(
        (Math.random() - 0.5) * weapon.projectile.spreadDegrees
      );
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    }

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.9,
      })
    );
    const startPos = this.playerPos.clone().add(new THREE.Vector3(dir.x * 0.6, 1.1, dir.z * 0.6));
    mesh.position.copy(startPos);
    this.projectileGroup.add(mesh);

    this.projectiles.push({
      mesh,
      position: startPos,
      velocity: dir.multiplyScalar(Math.max(4, weapon.projectile.speed)),
      gravity: weapon.projectile.gravity || 0,
      damage: Math.max(1, weapon.damage),
      critChance: weapon.criticalChance,
      pierceLeft: Math.max(1, weapon.projectile.pierceCount || 1),
      hitIds: new Set(),
      life: 2.8,
    });
  }

  private applyDamageToCreature(
    actor: SandboxActor,
    baseDamage: number,
    critChance: number
  ): void {
    if (!actor.monsterData || actor.hp <= 0) return;
    const isCrit = Math.random() * 100 < critChance;
    const dmg = Math.max(1, Math.round(baseDamage * (isCrit ? 1.65 : 1)));
    actor.hp = Math.max(0, actor.hp - dmg);
    actor.hitFlashTimer = 0.25;
    this.callbacks.onTriggerSound?.('woa:sfx_impact');
    this.callbacks.onCreatureHit?.(actor.monsterData, dmg, isCrit, actor.hp);

    if (actor.hp <= 0) {
      actor.visualGroup.rotation.z = Math.PI * 0.45;
      actor.visualGroup.position.y = 0.25;
      actor.solid = false;
      this.callbacks.onCreatureDefeated?.(actor.monsterData);
    }
    this.emitEntitiesSummary();
  }

  public triggerInteract(): void {
    const prompt = this.computeNearestPrompt();
    if (!prompt) {
      this.playerInteractTimer = 0.45;
      this.ensureActiveLoop();
      return;
    }
    this.playerInteractTimer = 0.55;
    this.ensureActiveLoop();

    const actor = this.actors.find((a) => a.instanceId === prompt.instanceId);
    if (!actor) return;

    if (prompt.kind === 'npc' && actor.npcData) {
      this.callbacks.onTriggerSound?.('woa:sfx_dialogue');
      if (actor.npcData.dialogue.length === 0) {
        this.callbacks.onRuntimeError?.(
          t('core.sandboxNpcEmptyDialogue', { name: actor.npcData.name })
        );
      }
      this.callbacks.onNpcInteracted?.(actor.npcData);
    } else if (prompt.kind === 'item' && actor.itemData) {
      actor.collected = true;
      actor.root.visible = false;
      actor.collisionGroup.visible = false;
      this.callbacks.onTriggerSound?.('woa:sfx_pickup');
      this.callbacks.onItemCollected?.(actor.itemData);
      this.emitEntitiesSummary();
      this.evaluatePrompts();
    } else if (prompt.kind === 'door' && actor.buildingData && prompt.subId) {
      const door = actor.doors.find((d) => d.id === prompt.subId);
      if (door) {
        if (door.locked && door.keyItemId && !this.heldKeysSet.has(door.keyItemId)) {
          this.callbacks.onTriggerSound?.('woa:sfx_error');
          this.callbacks.onRuntimeLog?.(
            'warn',
            t('core.sandboxDoorLocked', {
              door: door.name,
              key: door.keyItemId,
            })
          );
          return;
        }
        door.isOpen = !door.isOpen;
        door.targetAngle = door.isOpen ? Math.PI * 0.48 : 0;
        this.callbacks.onTriggerSound?.('woa:sfx_door');
        this.callbacks.onBuildingDoorToggled?.(actor.buildingData, door.id, door.isOpen);
        this.evaluatePrompts();
      }
    } else if (prompt.kind === 'interactive' && actor.buildingData && prompt.subId) {
      const io = actor.interactives.find((i) => i.id === prompt.subId);
      if (io) {
        io.activated = !io.activated;
        io.mesh.scale.setScalar(io.activated ? 1.15 : 1);
        this.callbacks.onTriggerSound?.('woa:sfx_pickup');
        this.callbacks.onBuildingObjectActivated?.(actor.buildingData, io.id);
      }
    } else if (prompt.kind === 'creature') {
      this.triggerAttack();
    }
  }

  private computeNearestPrompt(): SandboxInteractionPrompt | null {
    let best: SandboxInteractionPrompt | null = null;
    let bestDist = 3.1;

    for (const actor of this.actors) {
      if (actor.collected) continue;

      if (actor.kind === 'building' && actor.buildingData) {
        for (const door of actor.doors) {
          const d = this.playerPos.distanceTo(door.worldPos);
          if (d < bestDist) {
            bestDist = d;
            best = {
              instanceId: actor.instanceId,
              kind: 'door',
              subId: door.id,
              title: `${actor.name} · ${door.name}`,
              actionLabel: door.isOpen
                ? t('sandbox.actionDoorClose')
                : door.locked
                  ? t('sandbox.actionDoorUnlock')
                  : t('sandbox.actionDoorOpen'),
              detail: door.locked
                ? t('sandbox.doorLockedDetail', {
                    key: door.keyItemId || t('common.none'),
                  })
                : t('sandbox.doorwayDetail'),
            };
          }
        }
        for (const io of actor.interactives) {
          const d = this.playerPos.distanceTo(io.worldPos);
          if (d < bestDist) {
            bestDist = d;
            best = {
              instanceId: actor.instanceId,
              kind: 'interactive',
              subId: io.id,
              title: io.name,
              actionLabel: io.promptText,
              detail: io.objectType,
            };
          }
        }
        continue;
      }

      const dist = this.playerPos.distanceTo(actor.root.position);
      if (dist > bestDist) continue;

      if (actor.kind === 'npc' && actor.npcData) {
        bestDist = dist;
        best = {
          instanceId: actor.instanceId,
          kind: 'npc',
          title: actor.npcData.name,
          actionLabel: t('sandbox.actionTalk'),
          detail: `${actor.npcData.behaviorType} · ${actor.npcData.faction}`,
        };
      } else if (actor.kind === 'item' && actor.itemData) {
        bestDist = dist;
        best = {
          instanceId: actor.instanceId,
          kind: 'item',
          title: actor.itemData.name,
          actionLabel: t('sandbox.actionPickUp'),
          detail: `${actor.itemData.rarity} ${actor.itemData.category}`,
        };
      } else if (actor.kind === 'creature' && actor.monsterData && actor.hp > 0) {
        bestDist = dist;
        best = {
          instanceId: actor.instanceId,
          kind: 'creature',
          title: actor.monsterData.name,
          actionLabel: t('sandbox.actionAttack'),
          detail: `HP ${actor.hp}/${actor.maxHp} · ${actor.monsterData.attackBehavior}`,
        };
      }
    }

    return best;
  }

  private evaluatePrompts(): void {
    const prompt = this.computeNearestPrompt();
    const key = prompt
      ? `${prompt.instanceId}:${prompt.subId ?? ''}:${prompt.actionLabel}:${prompt.detail}`
      : '';
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      this.callbacks.onNearbyPromptChange?.(prompt);
    }
  }

  private emitEntitiesSummary(): void {
    const list: SandboxEntitySummary[] = [
      {
        instanceId: 'player',
        kind: 'player',
        sourceId: 'player',
        name: t('sandbox.testCharacterName'),
        hp: this.playerHp,
        maxHp: this.playerMaxHp,
        position: {
          x: Number(this.playerPos.x.toFixed(1)),
          y: Number(this.playerPos.y.toFixed(1)),
          z: Number(this.playerPos.z.toFixed(1)),
        },
      },
      ...this.actors.map((a) => ({
        instanceId: a.instanceId,
        kind: a.kind,
        sourceId: a.sourceId,
        name: a.name,
        hp: a.hp,
        maxHp: a.maxHp,
        collected: a.collected,
        doorOpen: a.doors[0]?.isOpen,
        position: {
          x: Number(a.root.position.x.toFixed(1)),
          y: Number(a.root.position.y.toFixed(1)),
          z: Number(a.root.position.z.toFixed(1)),
        },
      })),
    ];
    this.callbacks.onEntitiesChanged?.(list);
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private handlePointerUp = (e: PointerEvent) => {
    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y
    );
    if (dist > 8) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObject(this.worldGroup, true);
    if (hits.length > 0) {
      const id = hits[0].object.userData.__sandboxInstanceId as string | undefined;
      if (id) {
        this.callbacks.onEntityClicked?.(id);
        const actor = this.actors.find((a) => a.instanceId === id);
        if (actor && this.playerPos.distanceTo(actor.root.position) <= 3.4) {
          this.triggerInteract();
        }
      }
    }
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost?.();
  };

  private handleContextRestored = () => {
    this.callbacks.onContextRestored?.();
    this.requestRender();
  };

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (!this.loopActive) this.requestRender();
  }

  private ensureActiveLoop(): void {
    if (this.disposed || this.loopActive) return;
    this.loopActive = true;
    this.lastTickTime = performance.now();
    this.tick();
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.08);
    this.lastTickTime = now;
    this.elapsedTime += dt;

    try {
      this.stepSimulation(dt);
    } catch (err) {
      this.callbacks.onRuntimeError?.(
        t('sandbox.simException', {
          error: err instanceof Error ? err.message : String(err),
        })
      );
      this.setRunState('stopped');
      return;
    }

    this.orbit.update();
    this.renderer.render(this.scene, this.camera);

    const hasOngoingOneShot =
      this.playerAttackTimer > 0 ||
      this.playerInteractTimer > 0 ||
      this.projectiles.length > 0 ||
      this.actors.some((a) =>
        a.doors.some((d) => Math.abs(d.currentAngle - d.targetAngle) > 0.01)
      );

    if (
      this.runState === 'playing' ||
      this.animClip !== 'auto' && this.animClip !== 'idle' ||
      hasOngoingOneShot
    ) {
      if (this.isSoftwareGl) {
        this.afterDraw(this.tick);
      } else {
        this.frameId = requestAnimationFrame(this.tick);
      }
    } else {
      this.loopActive = false;
    }
  };

  private stepSimulation(dt: number): void {
    const animDt = dt * this.animSpeed;

    // 1. Player locomotion & arena bounds + collision checks
    let moveX = 0;
    let moveZ = 0;
    if (this.runState === 'playing' && this.playerRig.root.visible) {
      if (this.inputState.forward) moveZ -= 1;
      if (this.inputState.backward) moveZ += 1;
      if (this.inputState.left) moveX -= 1;
      if (this.inputState.right) moveX += 1;
    }

    this.playerIsMoving = moveX !== 0 || moveZ !== 0;

    if (this.playerIsMoving) {
      this.camera.getWorldDirection(_camForward);
      _camForward.y = 0;
      if (_camForward.lengthSq() > 0.0001) _camForward.normalize();
      _camRight.set(-_camForward.z, 0, _camForward.x);

      _moveVec
        .set(0, 0, 0)
        .addScaledVector(_camForward, -moveZ)
        .addScaledVector(_camRight, moveX)
        .normalize();

      const speed = 4.8;
      const candidateX = this.playerPos.x + _moveVec.x * speed * dt;
      const candidateZ = this.playerPos.z + _moveVec.z * speed * dt;

      const resolved = this.resolveCollisions(candidateX, candidateZ);
      const dx = resolved.x - this.playerPos.x;
      const dz = resolved.z - this.playerPos.z;
      this.playerPos.x = THREE.MathUtils.clamp(resolved.x, -11.4, 11.4);
      this.playerPos.z = THREE.MathUtils.clamp(resolved.z, -11.4, 11.4);

      if (this.followPlayerCamera && (dx !== 0 || dz !== 0)) {
        this.camera.position.x += dx;
        this.camera.position.z += dz;
        this.orbit.target.x += dx;
        this.orbit.target.z += dz;
      }

      const targetYaw = Math.atan2(_moveVec.x, _moveVec.z);
      let diff = targetYaw - this.playerYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerYaw += diff * Math.min(1, dt * 12);
    } else if (this.runState === 'playing') {
      const resolved = this.resolveCollisions(this.playerPos.x, this.playerPos.z);
      this.playerPos.x = resolved.x;
      this.playerPos.z = resolved.z;
    }

    // Gravity / jump
    if (!this.playerGrounded) {
      this.playerVelY -= 15 * dt;
      this.playerPos.y += this.playerVelY * dt;
      if (this.playerPos.y <= 0) {
        this.playerPos.y = 0;
        this.playerVelY = 0;
        this.playerGrounded = true;
      }
    }

    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;

    // 2. Character procedural animation
    if (this.playerAttackTimer > 0) this.playerAttackTimer = Math.max(0, this.playerAttackTimer - dt);
    if (this.playerInteractTimer > 0) this.playerInteractTimer = Math.max(0, this.playerInteractTimer - dt);

    const activeClip: SandboxAnimationClip =
      this.animClip !== 'auto'
        ? this.animClip
        : this.playerAttackTimer > 0
          ? 'attack'
          : this.playerInteractTimer > 0
            ? 'interact'
            : this.playerIsMoving
              ? 'walk'
              : 'idle';

    if (activeClip === 'walk') {
      this.playerWalkPhase += animDt * 9;
      const swing = Math.sin(this.playerWalkPhase) * 0.55;
      this.playerRig.leftLeg.rotation.x = swing;
      this.playerRig.rightLeg.rotation.x = -swing;
      this.playerRig.leftArm.rotation.x = -swing * 0.7;
      this.playerRig.rightArm.rotation.x = swing * 0.7;
      this.playerRig.bodyPivot.position.y = Math.abs(Math.sin(this.playerWalkPhase)) * 0.05;
    } else if (activeClip === 'attack') {
      const p =
        this.playerAttackTimer > 0
          ? 1 - this.playerAttackTimer / 0.45
          : (this.elapsedTime * this.animSpeed * 2.2) % 1;
      const arc = Math.sin(p * Math.PI);
      this.playerRig.rightArm.rotation.x = -Math.PI * 0.75 * arc;
      this.playerRig.rightArm.rotation.z = -0.35 * arc;
      this.playerRig.leftLeg.rotation.x = 0.2 * arc;
      this.playerRig.rightLeg.rotation.x = -0.2 * arc;
      this.playerRig.bodyPivot.position.y = 0;
    } else if (activeClip === 'interact') {
      const wave = Math.sin(this.elapsedTime * 7 * this.animSpeed) * 0.35;
      this.playerRig.rightArm.rotation.x = -0.9 + wave;
      this.playerRig.leftArm.rotation.x = 0;
      this.playerRig.leftLeg.rotation.x = 0;
      this.playerRig.rightLeg.rotation.x = 0;
    } else {
      const breathe = Math.sin(this.elapsedTime * 2.2 * this.animSpeed);
      this.playerRig.leftLeg.rotation.x = THREE.MathUtils.damp(this.playerRig.leftLeg.rotation.x, 0, 10, dt);
      this.playerRig.rightLeg.rotation.x = THREE.MathUtils.damp(this.playerRig.rightLeg.rotation.x, 0, 10, dt);
      this.playerRig.leftArm.rotation.x = breathe * 0.05;
      this.playerRig.rightArm.rotation.x = -breathe * 0.05;
      this.playerRig.rightArm.rotation.z = 0;
      this.playerRig.bodyPivot.position.y = breathe * 0.02;
    }

    // 3. Update Sandbox Actors (GLTF mixers, NPCs, Creatures, Items, Doors)
    for (const actor of this.actors) {
      if (actor.mixer) {
        actor.mixer.update(animDt);
      }

      if (actor.kind === 'item' && !actor.collected) {
        actor.visualGroup.children[1].rotation.y += animDt * 1.4;
        actor.visualGroup.children[1].position.y =
          0.68 + Math.sin(this.elapsedTime * 2.5) * 0.08;
      }

      for (const door of actor.doors) {
        door.currentAngle = THREE.MathUtils.damp(
          door.currentAngle,
          door.targetAngle,
          9,
          dt
        );
        door.hingeGroup.rotation.y = door.currentAngle;
      }

      if (actor.hitFlashTimer > 0) {
        actor.hitFlashTimer = Math.max(0, actor.hitFlashTimer - dt);
        const s = 1 + Math.sin(actor.hitFlashTimer * 25) * 0.06;
        actor.visualGroup.scale.setScalar(s);
      } else {
        actor.visualGroup.scale.setScalar(1);
      }

      // NPC mild idle patrol when playing
      if (this.runState === 'playing' && actor.kind === 'npc' && actor.npcData) {
        const spd = Math.max(0, Math.min(actor.npcData.movementSpeed, 5));
        if (spd > 0 && actor.npcData.behaviorType !== 'guard') {
          actor.patrolPhase += dt * (spd * 0.35);
          const targetX = actor.homePos.x + Math.sin(actor.patrolPhase) * 0.9;
          actor.root.position.x = THREE.MathUtils.damp(actor.root.position.x, targetX, 4, dt);
        }
      }

      // Creature patrol & aggro behavior when playing
      if (
        this.runState === 'playing' &&
        actor.kind === 'creature' &&
        actor.monsterData &&
        actor.hp > 0
      ) {
        const distToPlayer = actor.root.position.distanceTo(this.playerPos);
        const detect = Math.max(1.5, actor.monsterData.detectionRange || 5);
        const mSpd = THREE.MathUtils.clamp(actor.monsterData.speed || 2, 0, 6);

        if (mSpd > 0 && distToPlayer <= detect && distToPlayer > 1.35) {
          _deltaVec.subVectors(this.playerPos, actor.root.position);
          _deltaVec.y = 0;
          if (_deltaVec.lengthSq() > 0.001) {
            _deltaVec.normalize();
            actor.root.position.x += _deltaVec.x * mSpd * 0.65 * dt;
            actor.root.position.z += _deltaVec.z * mSpd * 0.65 * dt;
            actor.root.rotation.y = Math.atan2(_deltaVec.x, _deltaVec.z);
          }
        } else if (mSpd > 0) {
          actor.patrolPhase += dt * 0.9;
          const targetX = actor.homePos.x + Math.cos(actor.patrolPhase) * 1.1;
          actor.root.position.x = THREE.MathUtils.damp(actor.root.position.x, targetX, 3, dt);
        }

        if (actor.attackCooldown > 0) {
          actor.attackCooldown = Math.max(0, actor.attackCooldown - dt);
        } else if (distToPlayer <= 1.55 && actor.monsterData.damage > 0) {
          actor.attackCooldown = 1.6;
          this.playerHp = Math.max(0, this.playerHp - actor.monsterData.damage);
          this.callbacks.onTriggerSound?.('woa:sfx_impact');
          this.callbacks.onPlayerDamaged?.(
            actor.monsterData.damage,
            actor.monsterData.name,
            this.playerHp
          );
          if (this.playerHp <= 0) {
            this.playerHp = this.playerMaxHp;
            this.callbacks.onRuntimeLog?.('warn', t('sandbox.playerRevived'));
          }
          this.emitEntitiesSummary();
        }
      }
    }

    // 4. Step active projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.velocity.y -= p.gravity * 9.8 * dt;
      p.position.addScaledVector(p.velocity, dt);
      p.mesh.position.copy(p.position);

      let removeProj = p.life <= 0 || p.position.y < 0;

      if (!removeProj) {
        for (const actor of this.actors) {
          if (
            actor.kind !== 'creature' ||
            actor.hp <= 0 ||
            p.hitIds.has(actor.instanceId)
          ) {
            continue;
          }
          const d = Math.hypot(
            p.position.x - actor.root.position.x,
            p.position.z - actor.root.position.z
          );
          if (d <= actor.collider.radius + 0.25) {
            p.hitIds.add(actor.instanceId);
            this.applyDamageToCreature(actor, p.damage, p.critChance);
            p.pierceLeft--;
            if (p.pierceLeft <= 0) {
              removeProj = true;
              break;
            }
          }
        }
      }

      if (removeProj) {
        this.projectileGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
      }
    }

    if (this.runState === 'playing') {
      this.evaluatePrompts();
    }
  }

  private resolveCollisions(candX: number, candZ: number): { x: number; z: number } {
    let x = candX;
    let z = candZ;
    let collidingWith: string | null = null;
    const pr = this.playerRig.radius;

    for (const actor of this.actors) {
      const isCollidingColor = { hit: false };
      if (actor.solid && !actor.collected) {
        const ax = actor.root.position.x;
        const az = actor.root.position.z;
        const hx = actor.collider.halfX + pr;
        const hz = actor.collider.halfZ + pr;
        const dx = x - ax;
        const dz = z - az;

        if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
          // If it's a building with an open door and player is centered at doorway, allow entry
          const openDoorPass =
            actor.kind === 'building' &&
            actor.doors.some((d) => d.isOpen && Math.abs(x - d.worldPos.x) < 0.75);

          if (!openDoorPass) {
            isCollidingColor.hit = true;
            collidingWith = actor.name;
            const penX = hx - Math.abs(dx);
            const penZ = hz - Math.abs(dz);
            if (penX < penZ) {
              x += dx >= 0 ? penX : -penX;
            } else {
              z += dz >= 0 ? penZ : -penZ;
            }
          }
        }
      }

      actor.collisionWireMat.color.setHex(isCollidingColor.hit ? 0xef4444 : 0x10b981);
      actor.collisionFillMat.color.setHex(isCollidingColor.hit ? 0xef4444 : 0x10b981);
    }

    this.playerRig.collisionWireMat.color.setHex(collidingWith ? 0xef4444 : 0x38bdf8);
    if (collidingWith !== this.lastCollidingName) {
      this.lastCollidingName = collidingWith;
      this.callbacks.onCollisionStateChange?.(collidingWith);
    }

    return { x, z };
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed || !this.loopActive) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  public requestRender = (): void => {
    if (this.disposed || this.loopActive) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;
      this.orbit.update();
      this.renderer.render(this.scene, this.camera);
      this.renderBusy = false;
      if (this.renderDirty) this.requestRender();
    });
  };

  private clearWorldEntities(): void {
    for (const actor of this.actors) {
      actor.mixer?.stopAllAction();
      this.worldGroup.remove(actor.root);
      this.disposeObject(actor.root);
    }
    this.actors = [];

    for (const p of this.projectiles) {
      this.projectileGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.projectiles = [];
    this.lastCollidingName = null;
    this.lastPromptKey = '';
    this.callbacks.onCollisionStateChange?.(null);
    this.callbacks.onNearbyPromptChange?.(null);
    this.callbacks.onGltfClipsDetected?.([]);
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => m?.dispose());
      }
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.loopActive = false;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.clearWorldEntities();
    this.disposeObject(this.playerRig.root);
    this.arenaFloor.geometry.dispose();
    (this.arenaFloor.material as THREE.MeshStandardMaterial).map?.dispose();
    (this.arenaFloor.material as THREE.MeshStandardMaterial).dispose();
    this.gridHelper.dispose();
    this.envRT?.dispose();
    this.orbit.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
