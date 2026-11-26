import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { extractModelStats, getFileExtension } from '@/src/core/assets/assetPipeline';
import { getAssetBlobRecord } from '@/src/core/storage/modRepository';
import { t } from '@/src/i18n';
import {
  AssetCollisionConfig,
  AssetMaterialConfig,
  AssetPresetKind,
  AssetTransform,
  ExtractedMaterialInfo,
  LightingPreset,
  MaterialPreviewMode,
  ModAsset,
  ModelDimensions,
  PivotMode,
  SceneEditorState,
  SceneHierarchyNode,
  SceneNodeSnapshot,
  SceneStructureOp,
  Vec3Tuple,
} from '@/src/types/mod';

export type CameraPreset = 'perspective' | 'front' | 'side' | 'top' | 'iso';
export type GizmoMode = 'select' | 'translate' | 'rotate' | 'scale';
export type AxisConstraint = 'x' | 'y' | 'z' | null;

export interface ModelInspectionResult {
  assetId: string;
  dimensions: ModelDimensions;
  triangleEstimate: number;
  materials: ExtractedMaterialInfo[];
  hierarchy: SceneHierarchyNode[];
}

export interface NodeInspectionDetails {
  id: string | null;
  name: string;
  type: 'Root' | 'Group' | 'Mesh' | 'Object3D';
  visible: boolean;
  locked: boolean;
  collection?: string;
  triangleCount: number;
  meshCount: number;
  dimensions: ModelDimensions;
  worldPosition: Vec3Tuple;
  localTransform: AssetTransform;
  materialName?: string;
  materialColor?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  wireframe?: boolean;
  hasTexture: boolean;
  textureName?: string;
  textureAssetId?: string | null;
  isGroupWithChildren: boolean;
  isCustomGroup: boolean;
  isSharedGeometry: boolean;
  isSharedMaterial: boolean;
  siblingIndex: number;
  siblingCount: number;
  canEditMaterial: boolean;
}

export interface ClipboardNodeEntry {
  sourceAssetId: string;
  sourceHierarchyId: string;
  name: string;
  type: 'Group' | 'Mesh' | 'Object3D';
  transform: AssetTransform;
  visible: boolean;
  locked: boolean;
  collection?: string;
  materialOverride?: SceneNodeSnapshot['materialOverride'];
  detachedClone: THREE.Object3D;
}

export interface ContextMenuRequestPayload {
  clientX: number;
  clientY: number;
  hitNodeId: string | null;
  isTouch: boolean;
}

export interface PreviewEngineCallbacks {
  onTransformChange?: (transform: AssetTransform) => void;
  onModelInspected?: (info: ModelInspectionResult) => void;
  onHierarchyNodeSelected?: (
    nodeId: string | null,
    selectedIds: string[],
    selectionCleared: boolean
  ) => void;
  onHierarchyChanged?: (
    hierarchy: SceneHierarchyNode[],
    sceneState: SceneEditorState,
    stats: {
      dimensions: ModelDimensions;
      triangleEstimate: number;
      materials: ExtractedMaterialInfo[];
    }
  ) => void;
  onContextMenuRequest?: (req: ContextMenuRequestPayload) => void;
  onAnimationsDetected?: (clips: string[]) => void;
  onLongPress?: () => void;
  onLoadError?: (message: string) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _zoomVec = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();
const _tempBox = new THREE.Box3();
const _tempSize = new THREE.Vector3();
const _tempCenter = new THREE.Vector3();
const _tempVec = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();
const _gizmoDeltaPos = new THREE.Vector3();
const _gizmoDeltaQuat = new THREE.Quaternion();
const _gizmoInvQuat = new THREE.Quaternion();

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

function roundNum(val: number, digits = 3): number {
  const f = Math.pow(10, digits);
  return Math.round(val * f) / f;
}

function readObjectTransform(obj: THREE.Object3D): AssetTransform {
  return {
    position: {
      x: roundNum(obj.position.x, 3),
      y: roundNum(obj.position.y, 3),
      z: roundNum(obj.position.z, 3),
    },
    rotation: {
      x: roundNum(THREE.MathUtils.radToDeg(obj.rotation.x), 2),
      y: roundNum(THREE.MathUtils.radToDeg(obj.rotation.y), 2),
      z: roundNum(THREE.MathUtils.radToDeg(obj.rotation.z), 2),
    },
    scale: {
      x: roundNum(obj.scale.x, 3),
      y: roundNum(obj.scale.y, 3),
      z: roundNum(obj.scale.z, 3),
    },
  };
}

function writeObjectTransform(obj: THREE.Object3D, tr: AssetTransform): void {
  obj.position.set(tr.position.x, tr.position.y, tr.position.z);
  obj.rotation.set(
    THREE.MathUtils.degToRad(tr.rotation.x),
    THREE.MathUtils.degToRad(tr.rotation.y),
    THREE.MathUtils.degToRad(tr.rotation.z)
  );
  obj.scale.set(
    tr.scale.x === 0 ? 0.01 : tr.scale.x,
    tr.scale.y === 0 ? 0.01 : tr.scale.y,
    tr.scale.z === 0 ? 0.01 : tr.scale.z
  );
}

function isObjectChainVisible(
  obj: THREE.Object3D,
  stopAt: THREE.Object3D | null
): boolean {
  let curr: THREE.Object3D | null = obj;
  while (curr) {
    if (!curr.visible) return false;
    if (curr === stopAt) break;
    curr = curr.parent;
  }
  return true;
}

function makeUniqueSiblingName(
  desired: string,
  siblings: THREE.Object3D[],
  ignoreObj?: THREE.Object3D
): string {
  const clean = desired.trim() || 'Object';
  const existing = new Set(
    siblings
      .filter((s) => s !== ignoreObj)
      .map((s) => s.name?.trim())
      .filter(Boolean)
  );
  if (!existing.has(clean)) return clean;
  const base = clean.replace(/\s*\(\d+\)$/, '').replace(/_\d+$/, '');
  let idx = 2;
  while (existing.has(`${base}_${idx}`)) {
    idx++;
  }
  return `${base}_${idx}`;
}

export function disposeClipboardNodeEntry(entry: ClipboardNodeEntry | null): void {
  if (!entry) return;
  entry.detachedClone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m?.dispose());
    }
  });
}

export class ModPreviewEngine {
  private container: HTMLElement;
  private callbacks: PreviewEngineCallbacks;
  private isSoftwareGl: boolean;
  private lowPowerMode = false;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbit: OrbitControls;
  private transformControls: TransformControls;
  private raycaster = new THREE.Raycaster();
  private envRT: THREE.WebGLRenderTarget | null = null;

  private gridHelper: THREE.GridHelper;
  private axesHelper: THREE.AxesHelper;
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private contactShadow: THREE.Mesh;

  // Helpers / Visualizations
  private boundingBoxHelper: THREE.Box3Helper | null = null;
  private secondaryBoundingHelpers: THREE.Box3Helper[] = [];
  private showBoundingBox = false;
  private collisionGroup: THREE.Group;
  private collisionWireMat: THREE.MeshBasicMaterial;
  private collisionFillMat: THREE.MeshBasicMaterial;
  private collisionConfig: AssetCollisionConfig = { shape: 'box', scale: 1, offsetY: 0 };
  private showCollision = false;

  private pivotGroup: THREE.Group;
  private showPivot = false;
  private pivotMode: PivotMode = 'bottom-center';

  // Loaded model & hierarchy state
  private activeAssetId: string | null = null;
  private activeGroup: THREE.Group | null = null;
  private activeModelInner: THREE.Object3D | null = null;
  private activeLoadedKey: string | null = null;
  private activeIsImported = false;
  private activeRootLocked = false;
  private loadSequence = 0;

  private nodeById = new Map<string, THREE.Object3D>();
  private baseNodeArchive = new Map<string, THREE.Object3D>();
  private selectedNodeId: string | null = null;
  private selectedNodeIds: string[] = [];
  private selectionCleared = false;

  // Undoable scene state tracking
  private sceneRevision = 0;
  private appliedSceneRevision = 0;
  private deletedNodeIds: string[] = [];
  private structureOps: SceneStructureOp[] = [];
  private rootMirror = { x: false, y: false, z: false };
  private customIdCounter = 0;
  private gizmoMode: GizmoMode = 'select';
  private axisConstraint: AxisConstraint = null;
  private dragSnapshots: Array<{
    obj: THREE.Object3D;
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    scale: THREE.Vector3;
  }> = [];
  private dragCanceled = false;

  // Animation playback
  private mixer: THREE.AnimationMixer | null = null;
  private animations: THREE.AnimationClip[] = [];
  private activeAction: THREE.AnimationAction | null = null;
  private activeAnimationName: string | null = null;

  // Material Preview Modes (cached reusable overrides -> zero GC leaks)
  private materialMode: MaterialPreviewMode = 'pbr';
  private originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private unlitMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private clayMaterial: THREE.MeshStandardMaterial;
  private normalMaterial: THREE.MeshNormalMaterial;
  private wireMaterial: THREE.MeshBasicMaterial;
  private ownedCustomTextures = new Set<THREE.Texture>();
  private ownedCustomMaterials = new Set<THREE.Material>();

  // Procedural starter materials
  private primaryMat: THREE.MeshStandardMaterial;
  private accentMat: THREE.MeshStandardMaterial;
  private trimMat: THREE.MeshStandardMaterial;

  private resizeObserver: ResizeObserver;
  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  private disposed = false;

  private camAnimating = false;
  private autoRotate = false;
  private fitDistance = 4.6;
  private fitTargetY = 0.9;
  private lastStepTime = performance.now();
  private currentTheme: 'dark' | 'light' = 'dark';
  private currentLighting: LightingPreset = 'studio';
  private pointerDownPos = { x: 0, y: 0 };
  private pointerDownButton = 0;
  private longPressTimer: number | null = null;
  private longPressFired = false;

  constructor(container: HTMLElement, callbacks: PreviewEngineCallbacks = {}) {
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
    this.scene.background = new THREE.Color('#0E131D');
    this.scene.fog = new THREE.FogExp2('#0E131D', 0.02);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 250);
    this.camera.position.set(3.2, 2.3, 3.8);

    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.7);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.keyLight.position.set(4.5, 7.0, 4.0);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 30;
    const d = 5.5;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 1.15);
    this.rimLight.position.set(-4.0, 3.5, -4.5);
    this.scene.add(this.rimLight);

    this.gridHelper = new THREE.GridHelper(16, 32, 0x334155, 0x1e293b);
    this.gridHelper.position.y = 0.002;
    this.scene.add(this.gridHelper);

    this.axesHelper = new THREE.AxesHelper(1.4);
    this.axesHelper.position.y = 0.005;
    this.scene.add(this.axesHelper);

    const shadowGeo = new THREE.PlaneGeometry(3.8, 3.8);
    const shadowTex = this.createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
    });
    this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.001;
    this.scene.add(this.contactShadow);

    this.collisionGroup = new THREE.Group();
    this.collisionGroup.visible = false;
    this.scene.add(this.collisionGroup);
    this.collisionWireMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.collisionFillMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.pivotGroup = this.createPivotMarker();
    this.pivotGroup.visible = false;
    this.scene.add(this.pivotGroup);

    this.clayMaterial = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.8,
      metalness: 0.05,
    });
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      wireframe: true,
    });

    this.primaryMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.35,
      metalness: 0.65,
    });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: '#3B82F6',
      emissive: '#3B82F6',
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.4,
    });
    this.trimMat = new THREE.MeshStandardMaterial({
      color: '#1E293B',
      roughness: 0.62,
      metalness: 0.28,
    });

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = !this.isSoftwareGl;
    this.orbit.dampingFactor = 0.07;
    this.orbit.enableZoom = true;
    this.orbit.enableRotate = true;
    this.orbit.enablePan = true;
    this.orbit.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.orbit.target.set(0, 0.9, 0);
    this.orbit.minDistance = 0.5;
    this.orbit.maxDistance = 60;
    this.orbit.maxPolarAngle = Math.PI * 0.495;

    this.orbit.addEventListener('start', () => {
      this.camAnimating = false;
    });
    this.orbit.addEventListener('change', () => {
      this.requestRender();
    });

    this.transformControls = new TransformControls(
      this.camera,
      this.renderer.domElement
    );
    this.transformControls.setSize(0.8);
    const gizmoHelper = this.transformControls.getHelper();
    gizmoHelper.visible = false;
    this.scene.add(gizmoHelper);
    this.transformControls.enabled = false;

    this.transformControls.addEventListener('dragging-changed', (event) => {
      const isDragging = Boolean(event.value);
      this.orbit.enabled = !isDragging;
      if (isDragging) {
        this.dragCanceled = false;
        this.dragSnapshots = [];
        if (this.selectedNodeIds.length > 0 && this.selectedNodeId) {
          const ordered = [
            this.selectedNodeId,
            ...this.selectedNodeIds.filter((id) => id !== this.selectedNodeId),
          ];
          for (const id of ordered) {
            const obj = this.nodeById.get(id);
            if (obj && !obj.userData.__locked) {
              this.dragSnapshots.push({
                obj,
                pos: obj.position.clone(),
                quat: obj.quaternion.clone(),
                scale: obj.scale.clone(),
              });
            }
          }
        } else if (this.activeGroup && !this.activeRootLocked) {
          this.dragSnapshots.push({
            obj: this.activeGroup,
            pos: this.activeGroup.position.clone(),
            quat: this.activeGroup.quaternion.clone(),
            scale: this.activeGroup.scale.clone(),
          });
        }
      } else {
        const wasCanceled = this.dragCanceled;
        this.dragCanceled = false;
        this.dragSnapshots = [];
        if (!wasCanceled && this.activeGroup) {
          if (!this.selectedNodeId) {
            this.emitTransformUpdate();
          } else {
            this.emitHierarchyChanged();
          }
          this.refreshHelpers();
        }
      }
    });
    this.transformControls.addEventListener('objectChange', () => {
      if (
        this.transformControls.dragging &&
        !this.dragCanceled &&
        this.dragSnapshots.length > 1
      ) {
        const primary = this.dragSnapshots[0];
        _gizmoDeltaPos.copy(primary.obj.position).sub(primary.pos);
        _gizmoInvQuat.copy(primary.quat).invert();
        _gizmoDeltaQuat.copy(primary.obj.quaternion).multiply(_gizmoInvQuat);
        const rx =
          Math.abs(primary.scale.x) > 1e-6
            ? primary.obj.scale.x / primary.scale.x
            : 1;
        const ry =
          Math.abs(primary.scale.y) > 1e-6
            ? primary.obj.scale.y / primary.scale.y
            : 1;
        const rz =
          Math.abs(primary.scale.z) > 1e-6
            ? primary.obj.scale.z / primary.scale.z
            : 1;

        for (let i = 1; i < this.dragSnapshots.length; i++) {
          const snap = this.dragSnapshots[i];
          snap.obj.position.copy(snap.pos).add(_gizmoDeltaPos);
          snap.obj.quaternion.copy(_gizmoDeltaQuat).multiply(snap.quat);
          snap.obj.scale.set(
            snap.scale.x * rx,
            snap.scale.y * ry,
            snap.scale.z * rz
          );
        }
      }
    });
    this.transformControls.addEventListener('change', () => {
      this.refreshHelpers();
      this.requestRender();
    });

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerCancel);
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);
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

  private createPivotMarker(): THREE.Group {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false })
    );
    core.renderOrder = 999;
    g.add(core);

    const axes = new THREE.AxesHelper(0.55);
    axes.renderOrder = 998;
    const mat = axes.material as THREE.Material;
    mat.depthTest = false;
    g.add(axes);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.17, 24),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        depthTest: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 998;
    g.add(ring);
    return g;
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private raycastVisibleNodeAt(clientX: number, clientY: number): string | null {
    if (!this.activeGroup) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _rayMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObject(this.activeGroup, true);
    for (const hit of hits) {
      if (!isObjectChainVisible(hit.object, this.activeGroup)) continue;
      let curr: THREE.Object3D | null = hit.object;
      while (curr && curr !== this.activeGroup) {
        const nodeId = curr.userData.__hierarchyId as string | undefined;
        if (nodeId && this.nodeById.has(nodeId)) {
          return nodeId;
        }
        curr = curr.parent;
      }
    }
    return null;
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.pointerDownButton = e.button;
    this.longPressFired = false;
    this.clearLongPressTimer();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      const startX = e.clientX;
      const startY = e.clientY;
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null;
        if (this.transformControls.dragging || this.disposed) return;
        this.longPressFired = true;
        const hitNodeId = this.raycastVisibleNodeAt(startX, startY);
        if (hitNodeId && !this.selectedNodeIds.includes(hitNodeId)) {
          this.selectNodes([hitNodeId], hitNodeId, false);
          this.callbacks.onHierarchyNodeSelected?.(hitNodeId, [hitNodeId], false);
        }
        if (this.callbacks.onContextMenuRequest) {
          this.callbacks.onContextMenuRequest({
            clientX: startX,
            clientY: startY,
            hitNodeId,
            isTouch: true,
          });
        } else {
          this.callbacks.onLongPress?.();
        }
      }, 520);
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.longPressTimer === null) return;
    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y
    );
    if (dist > 8) {
      this.clearLongPressTimer();
    }
  };

  private handlePointerCancel = () => {
    this.clearLongPressTimer();
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.clearLongPressTimer();
    if (this.longPressFired) {
      this.longPressFired = false;
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0 && this.pointerDownButton !== 0) {
      return;
    }
    if (this.transformControls.dragging || !this.activeGroup) return;
    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y
    );
    if (dist > 6) return;

    const hitNodeId = this.raycastVisibleNodeAt(e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;

    if (hitNodeId) {
      if (additive) {
        const exists = this.selectedNodeIds.includes(hitNodeId);
        const nextIds = exists
          ? this.selectedNodeIds.filter((id) => id !== hitNodeId)
          : [...this.selectedNodeIds, hitNodeId];
        const primary = nextIds[nextIds.length - 1] ?? null;
        this.selectNodes(nextIds, primary, nextIds.length === 0);
        this.callbacks.onHierarchyNodeSelected?.(primary, nextIds, nextIds.length === 0);
      } else {
        this.selectNodes([hitNodeId], hitNodeId, false);
        this.callbacks.onHierarchyNodeSelected?.(hitNodeId, [hitNodeId], false);
      }
    } else if (!additive) {
      this.selectNodes([], null, true);
      this.callbacks.onHierarchyNodeSelected?.(null, [], true);
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (this.transformControls.dragging || this.disposed || !this.activeGroup) return;
    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y
    );
    if (dist > 6) return; // Was a right-click orbit pan drag

    const hitNodeId = this.raycastVisibleNodeAt(e.clientX, e.clientY);
    if (hitNodeId && !this.selectedNodeIds.includes(hitNodeId)) {
      this.selectNodes([hitNodeId], hitNodeId, false);
      this.callbacks.onHierarchyNodeSelected?.(hitNodeId, [hitNodeId], false);
    } else if (!hitNodeId && this.selectionCleared) {
      // Keep selection cleared or allow root context actions on empty click
    }

    this.callbacks.onContextMenuRequest?.({
      clientX: e.clientX,
      clientY: e.clientY,
      hitNodeId,
      isTouch: false,
    });
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost?.();
  };

  private handleContextRestored = () => {
    this.callbacks.onContextRestored?.();
    this.requestRender();
  };

  private createContactShadowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
      grad.addColorStop(0, 'rgba(0,0,0,0.85)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.32)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  public setLowPowerMode(enabled: boolean): void {
    this.lowPowerMode = enabled;
    const useFast = this.isSoftwareGl || enabled;
    this.renderer.setPixelRatio(
      useFast ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.orbit.enableDamping = !useFast;
    this.renderer.shadowMap.enabled = !useFast;
    this.keyLight.castShadow = !useFast;
    this.requestRender();
  }

  public setTheme(theme: 'dark' | 'light'): void {
    this.currentTheme = theme;
    this.applySceneBackdrop();
    this.scene.remove(this.gridHelper);
    this.gridHelper.dispose();
    this.gridHelper = new THREE.GridHelper(
      16,
      32,
      theme === 'dark' ? 0x334155 : 0x94a3b8,
      theme === 'dark' ? 0x1e293b : 0xcbd5e1
    );
    this.gridHelper.position.y = 0.002;
    this.scene.add(this.gridHelper);
    this.requestRender();
  }

  private applySceneBackdrop(): void {
    let bg = this.currentTheme === 'dark' ? '#0E131D' : '#E2E8F0';
    if (this.currentLighting === 'night') bg = '#080C16';
    else if (this.currentLighting === 'forge') bg = '#15100D';
    else if (this.currentLighting === 'daylight' && this.currentTheme === 'light') {
      bg = '#DBEAFE';
    }
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.FogExp2(bg, 0.018);
  }

  public setLightingPreset(preset: LightingPreset, intensityScale = 1): void {
    this.currentLighting = preset;
    this.applySceneBackdrop();

    switch (preset) {
      case 'daylight':
        this.hemiLight.color.setHex(0x93c5fd);
        this.hemiLight.groundColor.setHex(0x3f3f46);
        this.hemiLight.intensity = 0.9 * intensityScale;
        this.keyLight.color.setHex(0xfff9e6);
        this.keyLight.intensity = 2.6 * intensityScale;
        this.keyLight.position.set(6, 9, 5);
        this.rimLight.color.setHex(0xe0f2fe);
        this.rimLight.intensity = 0.85 * intensityScale;
        break;
      case 'forge':
        this.hemiLight.color.setHex(0x475569);
        this.hemiLight.groundColor.setHex(0x29180d);
        this.hemiLight.intensity = 0.55 * intensityScale;
        this.keyLight.color.setHex(0xffb347);
        this.keyLight.intensity = 2.6 * intensityScale;
        this.keyLight.position.set(3.5, 4.5, 4.5);
        this.rimLight.color.setHex(0xfb7185);
        this.rimLight.intensity = 1.25 * intensityScale;
        break;
      case 'night':
        this.hemiLight.color.setHex(0x312e81);
        this.hemiLight.groundColor.setHex(0x090d16);
        this.hemiLight.intensity = 0.55 * intensityScale;
        this.keyLight.color.setHex(0x93c5fd);
        this.keyLight.intensity = 1.55 * intensityScale;
        this.keyLight.position.set(-4, 7, 3);
        this.rimLight.color.setHex(0x38bdf8);
        this.rimLight.intensity = 1.3 * intensityScale;
        break;
      case 'studio':
      default:
        this.hemiLight.color.setHex(0xdbeafe);
        this.hemiLight.groundColor.setHex(0x1e293b);
        this.hemiLight.intensity = 0.7 * intensityScale;
        this.keyLight.color.setHex(0xfff4e0);
        this.keyLight.intensity = 2.2 * intensityScale;
        this.keyLight.position.set(4.5, 7.0, 4.0);
        this.rimLight.color.setHex(0x93c5fd);
        this.rimLight.intensity = 1.15 * intensityScale;
        break;
    }
    this.requestRender();
  }

  public setMaterialPreviewMode(mode: MaterialPreviewMode): void {
    this.materialMode = mode;
    if (!this.activeGroup) return;

    this.activeGroup.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      if (!this.originalMaterials.has(child)) {
        this.originalMaterials.set(child, child.material);
      }
      const orig = this.originalMaterials.get(child)!;

      if (mode === 'pbr') {
        child.material = orig;
      } else if (mode === 'clay') {
        child.material = this.clayMaterial;
      } else if (mode === 'normals') {
        child.material = this.normalMaterial;
      } else if (mode === 'wireframe') {
        child.material = this.wireMaterial;
      } else if (mode === 'unlit') {
        if (!this.unlitMaterials.has(child)) {
          const toBasic = (m: THREE.Material) => {
            const std = m as THREE.MeshStandardMaterial;
            return new THREE.MeshBasicMaterial({
              color: std.color ? std.color.clone() : new THREE.Color(0x94a3b8),
              map: std.map ?? null,
            });
          };
          const mapped = Array.isArray(orig) ? orig.map(toBasic) : toBasic(orig);
          this.unlitMaterials.set(child, mapped);
        }
        child.material = this.unlitMaterials.get(child)!;
      }
    });

    this.requestRender();
  }

  public setDisplayOptions(opts: {
    grid: boolean;
    axes: boolean;
    shadows: boolean;
  }): void {
    this.gridHelper.visible = opts.grid;
    this.axesHelper.visible = opts.axes;
    this.contactShadow.visible = opts.shadows && !this.lowPowerMode;
    if (!this.isSoftwareGl && !this.lowPowerMode) {
      this.renderer.shadowMap.enabled = opts.shadows;
      this.keyLight.castShadow = opts.shadows;
    } else {
      this.renderer.shadowMap.enabled = false;
      this.keyLight.castShadow = false;
    }
    this.requestRender();
  }

  public setSnapSettings(enabled: boolean, step = 0.25): void {
    this.transformControls.setTranslationSnap(enabled ? step : null);
    this.transformControls.setRotationSnap(
      enabled ? THREE.MathUtils.degToRad(15) : null
    );
    this.transformControls.setScaleSnap(enabled ? 0.1 : null);
  }

  public setVisualizationFlags(opts: {
    boundingBox: boolean;
    pivot: boolean;
    pivotMode: PivotMode;
    collision: boolean;
    collisionConfig: AssetCollisionConfig;
  }): void {
    this.showBoundingBox = opts.boundingBox;
    this.showPivot = opts.pivot;
    const pivotChanged = this.pivotMode !== opts.pivotMode;
    this.pivotMode = opts.pivotMode;
    this.showCollision = opts.collision;
    this.collisionConfig = opts.collisionConfig;

    if (pivotChanged && this.activeModelInner) {
      this.repositionInnerModelForPivot();
    }
    this.refreshHelpers();
    this.requestRender();
  }

  public setGizmoMode(mode: GizmoMode): void {
    this.gizmoMode = mode;
    this.syncTransformControlsAttachment();
    this.requestRender();
  }

  public setAxisConstraint(axis: AxisConstraint): void {
    this.axisConstraint = axis;
    this.transformControls.showX = axis === null || axis === 'x';
    this.transformControls.showY = axis === null || axis === 'y';
    this.transformControls.showZ = axis === null || axis === 'z';
    this.requestRender();
  }

  public cancelActiveTransform(): boolean {
    if (!this.transformControls.dragging || this.dragSnapshots.length === 0) {
      return false;
    }
    this.dragCanceled = true;
    for (const snap of this.dragSnapshots) {
      snap.obj.position.copy(snap.pos);
      snap.obj.quaternion.copy(snap.quat);
      snap.obj.scale.copy(snap.scale);
    }
    const attached = this.transformControls.object;
    this.transformControls.detach();
    if (attached && this.gizmoMode !== 'select' && !this.isTargetLocked()) {
      this.transformControls.attach(attached);
    }
    this.orbit.enabled = true;
    this.refreshHelpers();
    this.requestRender();
    return true;
  }

  private isTargetLocked(): boolean {
    if (this.selectedNodeIds.length > 0) {
      return this.selectedNodeIds.some((id) => {
        const obj = this.nodeById.get(id);
        return Boolean(obj?.userData.__locked);
      });
    }
    return this.activeRootLocked;
  }

  private syncTransformControlsAttachment(): void {
    const helper = this.transformControls.getHelper();
    const target = this.selectionCleared
      ? null
      : (this.selectedNodeId ? this.nodeById.get(this.selectedNodeId) : null) ??
        this.activeGroup;

    if (this.gizmoMode === 'select' || !target || this.isTargetLocked()) {
      this.transformControls.enabled = false;
      helper.visible = false;
      this.transformControls.detach();
    } else {
      this.transformControls.enabled = true;
      helper.visible = true;
      this.transformControls.setMode(this.gizmoMode);
      this.transformControls.showX =
        this.axisConstraint === null || this.axisConstraint === 'x';
      this.transformControls.showY =
        this.axisConstraint === null || this.axisConstraint === 'y';
      this.transformControls.showZ =
        this.axisConstraint === null || this.axisConstraint === 'z';
      this.transformControls.attach(target);
    }
  }

  public selectHierarchyNode(nodeId: string | null, cleared = false): void {
    if (cleared) {
      this.selectNodes([], null, true);
    } else if (nodeId) {
      this.selectNodes([nodeId], nodeId, false);
    } else {
      this.selectNodes([], null, false);
    }
  }

  public selectNodes(
    nodeIds: string[],
    primaryId: string | null = nodeIds[nodeIds.length - 1] ?? null,
    cleared = false
  ): void {
    const validIds = nodeIds.filter((id) => this.nodeById.has(id));
    this.selectionCleared = cleared && validIds.length === 0;
    this.selectedNodeIds = validIds;
    this.selectedNodeId =
      primaryId && validIds.includes(primaryId)
        ? primaryId
        : validIds[validIds.length - 1] ?? null;

    this.syncTransformControlsAttachment();
    this.refreshHelpers();
    this.requestRender();
  }

  public selectAllNodes(): string[] {
    if (!this.activeModelInner) return [];
    const topIds: string[] = [];
    const collect = (parent: THREE.Object3D) => {
      for (const child of parent.children) {
        const id = child.userData.__hierarchyId as string | undefined;
        if (id && this.nodeById.has(id)) {
          topIds.push(id);
        } else {
          collect(child);
        }
      }
    };
    if (this.activeModelInner.name && this.activeModelInner.userData.__hierarchyId) {
      const rootInnerId = this.activeModelInner.userData.__hierarchyId as string;
      if (this.activeModelInner.children.length > 0) {
        collect(this.activeModelInner);
      } else {
        topIds.push(rootInnerId);
      }
    } else {
      collect(this.activeModelInner);
    }
    const primary = topIds[0] ?? null;
    this.selectNodes(topIds, primary, topIds.length === 0);
    return topIds;
  }

  public setNodeVisibility(nodeId: string, visible: boolean): void {
    const obj = this.nodeById.get(nodeId);
    if (!obj) return;
    obj.visible = visible;
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
  }

  public setNodesVisibility(nodeIds: string[], visible: boolean): void {
    let changed = false;
    for (const id of nodeIds) {
      const obj = this.nodeById.get(id);
      if (obj) {
        obj.visible = visible;
        changed = true;
      }
    }
    if (!changed) return;
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
  }

  public showAllNodes(): void {
    this.nodeById.forEach((obj) => {
      obj.visible = true;
    });
    if (this.activeGroup) {
      this.activeGroup.visible = true;
    }
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
  }

  public setNodesLocked(nodeIds: string[], locked: boolean): void {
    let changed = false;
    for (const id of nodeIds) {
      const obj = this.nodeById.get(id);
      if (obj) {
        obj.userData.__locked = locked;
        changed = true;
      }
    }
    if (!changed) return;
    this.syncTransformControlsAttachment();
    this.emitHierarchyChanged();
    this.requestRender();
  }

  public setNodesCollection(nodeIds: string[], collection: string | undefined): void {
    let changed = false;
    for (const id of nodeIds) {
      const obj = this.nodeById.get(id);
      if (obj) {
        obj.userData.__collection = collection || undefined;
        changed = true;
      }
    }
    if (!changed) return;
    this.emitHierarchyChanged();
  }

  public renameNode(nodeId: string, desiredName: string): string | null {
    const obj = this.nodeById.get(nodeId);
    if (!obj || !obj.parent) return null;
    const uniqueName = makeUniqueSiblingName(desiredName, obj.parent.children, obj);
    obj.name = uniqueName;
    this.emitHierarchyChanged();
    return uniqueName;
  }

  public duplicateNodes(nodeIds: string[], makeInstance = false): string[] {
    if (!this.activeModelInner || nodeIds.length === 0) return [];
    const createdIds: string[] = [];

    for (const id of nodeIds) {
      const src = this.nodeById.get(id);
      if (!src || !src.parent) continue;
      const newId = this.allocateCustomId(makeInstance ? 'inst' : 'dup');
      const clone = this.cloneObjectNode(src, makeInstance, newId);
      const uniqueName = makeUniqueSiblingName(
        `${src.name || 'Object'}_Copy`,
        src.parent.children
      );
      clone.name = uniqueName;
      clone.position.x += 0.28;
      clone.position.z += 0.14;
      src.parent.add(clone);
      this.baseNodeArchive.set(newId, clone);
      this.structureOps.push({
        kind: 'duplicate',
        newId,
        sourceId: id,
        name: uniqueName,
        isInstance: makeInstance,
      });
      createdIds.push(newId);
    }

    if (createdIds.length > 0) {
      this.rebuildHierarchyIndexPreserveIds();
      this.selectNodes(createdIds, createdIds[createdIds.length - 1], false);
      this.emitHierarchyChanged();
      this.refreshHelpers();
      this.requestRender();
    }
    return createdIds;
  }

  public copyNodesToClipboard(nodeIds: string[]): ClipboardNodeEntry[] {
    if (!this.activeAssetId) return [];
    const entries: ClipboardNodeEntry[] = [];
    for (const id of nodeIds) {
      const obj = this.nodeById.get(id);
      if (!obj) continue;
      const detachedClone = this.cloneObjectDetached(obj);
      entries.push({
        sourceAssetId: this.activeAssetId,
        sourceHierarchyId: id,
        name: obj.name || 'Object',
        type:
          obj instanceof THREE.Mesh
            ? 'Mesh'
            : obj instanceof THREE.Group
              ? 'Group'
              : 'Object3D',
        transform: readObjectTransform(obj),
        visible: obj.visible,
        locked: Boolean(obj.userData.__locked),
        collection: obj.userData.__collection as string | undefined,
        materialOverride: this.extractNodeMaterialOverride(obj),
        detachedClone,
      });
    }
    return entries;
  }

  public pasteClipboardNodes(entries: ClipboardNodeEntry[]): string[] {
    if (!this.activeModelInner || entries.length === 0) return [];
    const targetParent = this.activeModelInner;
    const createdIds: string[] = [];

    for (const entry of entries) {
      const newId = this.allocateCustomId('paste');
      const instance = this.cloneObjectDetached(entry.detachedClone);
      const uniqueName = makeUniqueSiblingName(
        `${entry.name}_Paste`,
        targetParent.children
      );
      instance.name = uniqueName;
      writeObjectTransform(instance, entry.transform);
      instance.position.x += 0.25;
      instance.position.z += 0.25;
      instance.visible = entry.visible;
      instance.userData.__hierarchyId = newId;
      instance.userData.__locked = entry.locked;
      instance.userData.__collection = entry.collection;
      instance.userData.__initialTransform = readObjectTransform(instance);

      // Assign unique IDs to any descendant meshes inside pasted subtree
      let subIdx = 0;
      instance.traverse((desc) => {
        if (desc === instance) return;
        desc.userData.__hierarchyId = `${newId}_sub_${++subIdx}`;
        desc.userData.__initialTransform = readObjectTransform(desc);
        if (desc instanceof THREE.Mesh) {
          desc.castShadow = true;
          desc.receiveShadow = true;
        }
      });

      targetParent.add(instance);
      this.baseNodeArchive.set(newId, instance);

      if (
        entry.sourceAssetId === this.activeAssetId &&
        this.baseNodeArchive.has(entry.sourceHierarchyId)
      ) {
        this.structureOps.push({
          kind: 'duplicate',
          newId,
          sourceId: entry.sourceHierarchyId,
          name: uniqueName,
        });
      } else {
        this.structureOps.push({
          kind: 'pasteJson',
          newId,
          objectJson: instance.toJSON() as unknown as Record<string, unknown>,
        });
      }
      createdIds.push(newId);
    }

    if (createdIds.length > 0) {
      if (this.materialMode !== 'pbr') {
        this.setMaterialPreviewMode(this.materialMode);
      }
      this.rebuildHierarchyIndexPreserveIds();
      this.selectNodes(createdIds, createdIds[createdIds.length - 1], false);
      this.emitHierarchyChanged();
      this.refreshHelpers();
      this.requestRender();
    }
    return createdIds;
  }

  public deleteNodes(nodeIds: string[]): boolean {
    if (!this.activeModelInner || nodeIds.length === 0) return false;
    let removedCount = 0;
    for (const id of nodeIds) {
      const obj = this.nodeById.get(id);
      if (!obj || !obj.parent || obj === this.activeGroup) continue;
      // Archive clone before removal so same-session Cut -> Paste works cleanly
      if (!this.baseNodeArchive.has(id)) {
        this.baseNodeArchive.set(id, this.cloneObjectDetached(obj));
      }
      obj.parent.remove(obj);
      this.disposeObjectSafely(obj, this.activeGroup);
      if (!this.deletedNodeIds.includes(id)) {
        this.deletedNodeIds.push(id);
      }
      this.structureOps.push({ kind: 'delete', nodeId: id });
      removedCount++;
    }
    if (removedCount === 0) return false;

    this.rebuildHierarchyIndexPreserveIds();
    this.selectNodes([], null, true);
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
    return true;
  }

  public groupNodes(nodeIds: string[], groupName = 'Group'): string | null {
    if (!this.activeModelInner || nodeIds.length === 0) return null;
    const objects = nodeIds
      .map((id) => this.nodeById.get(id))
      .filter((o): o is THREE.Object3D => Boolean(o && o.parent && o !== this.activeGroup));
    if (objects.length === 0) return null;

    const firstParent = objects[0].parent!;
    const groupId = this.allocateCustomId('grp');
    const group = new THREE.Group();
    group.name = makeUniqueSiblingName(groupName, firstParent.children);
    group.userData.__hierarchyId = groupId;
    group.userData.__isCustomGroup = true;

    // Position group at bounding center of selected objects in parent local space
    _tempBox.makeEmpty();
    for (const o of objects) {
      o.updateMatrixWorld(true);
      _tempBox.expandByObject(o);
    }
    if (!_tempBox.isEmpty()) {
      _tempBox.getCenter(_tempCenter);
      firstParent.worldToLocal(_tempCenter);
      group.position.copy(_tempCenter);
    }
    firstParent.add(group);
    firstParent.updateMatrixWorld(true);
    group.updateMatrixWorld(true);

    for (const o of objects) {
      group.attach(o);
    }
    group.userData.__initialTransform = readObjectTransform(group);

    this.baseNodeArchive.set(groupId, group);
    this.structureOps.push({
      kind: 'group',
      newId: groupId,
      name: group.name,
      childIds: [...nodeIds],
    });

    this.rebuildHierarchyIndexPreserveIds();
    this.selectNodes([groupId], groupId, false);
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
    return groupId;
  }

  public ungroupNode(groupId: string): string[] {
    const group = this.nodeById.get(groupId);
    if (!group || !group.parent || group.children.length === 0) return [];
    const parent = group.parent;
    const movedIds: string[] = [];
    const children = [...group.children];

    parent.updateMatrixWorld(true);
    group.updateMatrixWorld(true);

    for (const child of children) {
      parent.attach(child);
      const cid = child.userData.__hierarchyId as string | undefined;
      if (cid) movedIds.push(cid);
    }
    parent.remove(group);
    this.structureOps.push({ kind: 'ungroup', groupId });

    this.rebuildHierarchyIndexPreserveIds();
    this.selectNodes(movedIds, movedIds[0] ?? null, movedIds.length === 0);
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
    return movedIds;
  }

  public reorderNode(
    nodeId: string,
    direction: 'up' | 'down' | 'front' | 'back'
  ): boolean {
    const obj = this.nodeById.get(nodeId);
    if (!obj || !obj.parent) return false;
    const arr = obj.parent.children;
    const idx = arr.indexOf(obj);
    if (idx === -1) return false;

    let targetIdx = idx;
    if (direction === 'up') targetIdx = Math.max(0, idx - 1);
    else if (direction === 'down') targetIdx = Math.min(arr.length - 1, idx + 1);
    else if (direction === 'front') targetIdx = 0;
    else if (direction === 'back') targetIdx = arr.length - 1;

    if (targetIdx === idx) return false;
    arr.splice(idx, 1);
    arr.splice(targetIdx, 0, obj);

    this.rebuildHierarchyIndexPreserveIds();
    this.emitHierarchyChanged();
    return true;
  }

  public resetNodesTransform(
    nodeIds: string[],
    part: 'all' | 'position' | 'rotation' | 'scale'
  ): boolean {
    let changed = false;
    for (const id of nodeIds) {
      const obj = this.nodeById.get(id);
      if (!obj) continue;
      const init = (obj.userData.__initialTransform as AssetTransform | undefined) ?? {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };
      if (part === 'all' || part === 'position') {
        obj.position.set(init.position.x, init.position.y, init.position.z);
      }
      if (part === 'all' || part === 'rotation') {
        obj.rotation.set(
          THREE.MathUtils.degToRad(init.rotation.x),
          THREE.MathUtils.degToRad(init.rotation.y),
          THREE.MathUtils.degToRad(init.rotation.z)
        );
      }
      if (part === 'all' || part === 'scale') {
        obj.scale.set(init.scale.x, init.scale.y, init.scale.z);
      }
      changed = true;
    }
    if (!changed) return false;
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
    return true;
  }

  public mirrorNodes(nodeIds: string[], axis: 'x' | 'y' | 'z'): boolean {
    if (nodeIds.length === 0) {
      if (!this.activeModelInner) return false;
      this.rootMirror[axis] = !this.rootMirror[axis];
      this.activeModelInner.scale[axis] *= -1;
      this.emitHierarchyChanged();
      this.refreshHelpers();
      this.requestRender();
      return true;
    }

    let changed = false;
    for (const id of nodeIds) {
      const obj = this.nodeById.get(id);
      if (!obj) continue;
      obj.scale[axis] *= -1;
      changed = true;
    }
    if (!changed) return false;
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
    return true;
  }

  public applyTransformToNodes(
    nodeIds: string[],
    target: 'all' | 'position' | 'rotation' | 'scale'
  ): boolean {
    if (nodeIds.length === 0) return false;
    let changed = false;

    for (const id of nodeIds) {
      const obj = this.nodeById.get(id);
      if (!obj) continue;
      this.bakeTransformIntoObject(obj, target);
      this.structureOps.push({ kind: 'applyTransform', nodeId: id, target });
      changed = true;
    }
    if (!changed) return false;
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
    return true;
  }

  private bakeTransformIntoObject(
    obj: THREE.Object3D,
    target: 'all' | 'position' | 'rotation' | 'scale'
  ): void {
    const pos =
      target === 'all' || target === 'position'
        ? obj.position.clone()
        : new THREE.Vector3(0, 0, 0);
    const quat =
      target === 'all' || target === 'rotation'
        ? obj.quaternion.clone()
        : new THREE.Quaternion();
    const scl =
      target === 'all' || target === 'scale'
        ? obj.scale.clone()
        : new THREE.Vector3(1, 1, 1);

    _tempMatrix.compose(pos, quat, scl);

    if (obj instanceof THREE.Mesh && obj.geometry) {
      // Ensure geometry isn't shared before mutating vertices
      if (this.isGeometryShared(obj)) {
        obj.geometry = obj.geometry.clone();
      }
      obj.geometry.applyMatrix4(_tempMatrix);
      obj.geometry.computeBoundingBox();
      obj.geometry.computeBoundingSphere();
    } else if (obj.children.length > 0) {
      for (const child of obj.children) {
        child.applyMatrix4(_tempMatrix);
      }
    }

    if (target === 'all' || target === 'position') obj.position.set(0, 0, 0);
    if (target === 'all' || target === 'rotation') obj.rotation.set(0, 0, 0);
    if (target === 'all' || target === 'scale') obj.scale.set(1, 1, 1);
    obj.userData.__initialTransform = readObjectTransform(obj);
  }

  public centerNodePivot(nodeId: string, mode: 'center' | 'bottom' = 'center'): boolean {
    const obj = this.nodeById.get(nodeId);
    if (!obj) return false;
    this.recenterObjectPivot(obj, mode);
    this.structureOps.push({
      kind: mode === 'center' ? 'centerPivot' : 'resetPivot',
      nodeId,
    });
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
    return true;
  }

  private recenterObjectPivot(
    obj: THREE.Object3D,
    mode: 'center' | 'bottom'
  ): void {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      if (this.isGeometryShared(obj)) {
        obj.geometry = obj.geometry.clone();
      }
      obj.geometry.computeBoundingBox();
      const box = obj.geometry.boundingBox;
      if (!box || box.isEmpty()) return;
      box.getCenter(_tempCenter);
      const pivotLocal = new THREE.Vector3(
        _tempCenter.x,
        mode === 'center' ? _tempCenter.y : box.min.y,
        _tempCenter.z
      );
      obj.geometry.translate(-pivotLocal.x, -pivotLocal.y, -pivotLocal.z);
      obj.geometry.computeBoundingBox();
      obj.geometry.computeBoundingSphere();

      pivotLocal.multiply(obj.scale).applyQuaternion(obj.quaternion);
      obj.position.add(pivotLocal);
      obj.userData.__initialTransform = readObjectTransform(obj);
      return;
    }

    if (obj.children.length > 0) {
      _tempBox.makeEmpty();
      for (const c of obj.children) {
        c.updateMatrix();
        const childBox = new THREE.Box3().setFromObject(c);
        // Convert world box into obj local coords carefully via child local pos
        if (!childBox.isEmpty()) {
          _tempBox.expandByPoint(c.position);
        }
      }
      if (_tempBox.isEmpty()) return;
      _tempBox.getCenter(_tempCenter);
      const pivotLocal = new THREE.Vector3(
        _tempCenter.x,
        mode === 'center' ? _tempCenter.y : _tempBox.min.y,
        _tempCenter.z
      );
      for (const c of obj.children) {
        c.position.sub(pivotLocal);
      }
      pivotLocal.multiply(obj.scale).applyQuaternion(obj.quaternion);
      obj.position.add(pivotLocal);
      obj.userData.__initialTransform = readObjectTransform(obj);
    }
  }

  public makeNodesUnique(nodeIds: string[]): boolean {
    let changed = false;
    for (const id of nodeIds) {
      const obj = this.nodeById.get(id);
      if (!obj) continue;
      this.makeObjectSubtreeUnique(obj);
      this.structureOps.push({ kind: 'makeUnique', nodeId: id });
      changed = true;
    }
    if (!changed) return false;
    this.emitHierarchyChanged();
    this.requestRender();
    return true;
  }

  private makeObjectSubtreeUnique(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (this.isGeometryShared(child)) {
        child.geometry = child.geometry.clone();
      }
      const orig = this.originalMaterials.get(child) ?? child.material;
      if (orig) {
        const cloneMat = (m: THREE.Material) => {
          const cloned = m.clone();
          this.ownedCustomMaterials.add(cloned);
          return cloned;
        };
        const nextMat = Array.isArray(orig) ? orig.map(cloneMat) : cloneMat(orig);
        this.originalMaterials.set(child, nextMat);
        if (this.materialMode === 'pbr') {
          child.material = nextMat;
        }
        this.unlitMaterials.delete(child);
      }
    });
  }

  public alignNodes(nodeIds: string[], axis: 'x' | 'y' | 'z'): boolean {
    if (nodeIds.length < 2) return false;
    const objs = nodeIds
      .map((id) => this.nodeById.get(id))
      .filter((o): o is THREE.Object3D => Boolean(o));
    if (objs.length < 2) return false;

    const avg = objs.reduce((sum, o) => sum + o.position[axis], 0) / objs.length;
    for (const o of objs) {
      o.position[axis] = avg;
    }
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
    return true;
  }

  public distributeNodes(nodeIds: string[], axis: 'x' | 'y' | 'z'): boolean {
    if (nodeIds.length < 3) return false;
    const objs = nodeIds
      .map((id) => this.nodeById.get(id))
      .filter((o): o is THREE.Object3D => Boolean(o))
      .sort((a, b) => a.position[axis] - b.position[axis]);
    if (objs.length < 3) return false;

    const minVal = objs[0].position[axis];
    const maxVal = objs[objs.length - 1].position[axis];
    const span = maxVal - minVal;
    const step = span === 0 ? 0.5 : span / (objs.length - 1);
    objs.forEach((o, i) => {
      o.position[axis] = minVal + step * i;
    });
    this.emitHierarchyChanged();
    this.refreshHelpers();
    this.requestRender();
    return true;
  }

  // ---- Material / Texture / Animation Controls ----

  public updateNodeMaterial(
    nodeId: string | null,
    patch: {
      name?: string;
      color?: string;
      roughness?: number;
      metalness?: number;
      emissive?: string;
      emissiveIntensity?: number;
      wireframe?: boolean;
    }
  ): boolean {
    const target =
      (nodeId ? this.nodeById.get(nodeId) : null) ?? this.activeModelInner;
    if (!target) return false;
    let updated = false;

    target.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      let mat = (this.originalMaterials.get(child) ?? child.material) as
        | THREE.Material
        | THREE.Material[];
      if (Array.isArray(mat)) mat = mat[0];
      if (!mat) return;

      if (
        this.isMaterialShared(child) ||
        mat === this.primaryMat ||
        mat === this.accentMat ||
        mat === this.trimMat
      ) {
        const cloned = mat.clone();
        this.ownedCustomMaterials.add(cloned);
        this.originalMaterials.set(child, cloned);
        if (this.materialMode === 'pbr') {
          child.material = cloned;
        }
        mat = cloned;
      }

      const std = mat as THREE.MeshStandardMaterial;
      if (patch.name !== undefined) std.name = patch.name;
      if (patch.color !== undefined && std.color) std.color.set(patch.color);
      if (patch.roughness !== undefined && 'roughness' in std) {
        std.roughness = THREE.MathUtils.clamp(patch.roughness, 0.04, 1);
      }
      if (patch.metalness !== undefined && 'metalness' in std) {
        std.metalness = THREE.MathUtils.clamp(patch.metalness, 0, 1);
      }
      if (patch.emissive !== undefined && std.emissive) {
        std.emissive.set(patch.emissive);
      }
      if (patch.emissiveIntensity !== undefined && 'emissiveIntensity' in std) {
        std.emissiveIntensity = patch.emissiveIntensity;
      }
      if (patch.wireframe !== undefined && 'wireframe' in std) {
        std.wireframe = patch.wireframe;
      }
      std.needsUpdate = true;
      this.unlitMaterials.delete(child);
      updated = true;
    });

    if (updated) {
      if (this.materialMode === 'unlit') {
        this.setMaterialPreviewMode('unlit');
      }
      this.emitHierarchyChanged();
      this.requestRender();
    }
    return updated;
  }

  public duplicateNodeMaterial(nodeId: string): boolean {
    const target = this.nodeById.get(nodeId);
    if (!target) return false;
    let changed = false;
    target.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const orig = this.originalMaterials.get(child) ?? child.material;
      if (!orig) return;
      const cloneOne = (m: THREE.Material) => {
        const cloned = m.clone();
        cloned.name = `${m.name || 'Material'}_Copy`;
        this.ownedCustomMaterials.add(cloned);
        return cloned;
      };
      const next = Array.isArray(orig) ? orig.map(cloneOne) : cloneOne(orig);
      this.originalMaterials.set(child, next);
      if (this.materialMode === 'pbr') child.material = next;
      this.unlitMaterials.delete(child);
      changed = true;
    });
    if (changed) {
      this.emitHierarchyChanged();
      this.requestRender();
    }
    return changed;
  }

  public removeNodeMaterial(nodeId: string): boolean {
    const target = this.nodeById.get(nodeId);
    if (!target) return false;
    let changed = false;
    target.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const fallback = new THREE.MeshStandardMaterial({
        name: 'DefaultMaterial',
        color: 0x94a3b8,
        roughness: 0.55,
        metalness: 0.1,
      });
      this.ownedCustomMaterials.add(fallback);
      this.originalMaterials.set(child, fallback);
      if (this.materialMode === 'pbr') child.material = fallback;
      child.userData.__textureAssetId = null;
      child.userData.__textureName = null;
      this.unlitMaterials.delete(child);
      changed = true;
    });
    if (changed) {
      this.emitHierarchyChanged();
      this.requestRender();
    }
    return changed;
  }

  public async applyTextureToNode(
    nodeId: string | null,
    blob: Blob,
    textureAssetId: string,
    textureName: string
  ): Promise<boolean> {
    const target =
      (nodeId ? this.nodeById.get(nodeId) : null) ?? this.activeModelInner;
    if (!target) return false;

    const url = URL.createObjectURL(blob);
    try {
      const tex = await new Promise<THREE.Texture>((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
          url,
          (loaded) => {
            loaded.colorSpace = THREE.SRGBColorSpace;
            loaded.wrapS = THREE.RepeatWrapping;
            loaded.wrapT = THREE.RepeatWrapping;
            loaded.needsUpdate = true;
            resolve(loaded);
          },
          undefined,
          (err) => reject(err)
        );
      });
      if (this.disposed) {
        tex.dispose();
        return false;
      }
      this.ownedCustomTextures.add(tex);

      let applied = false;
      target.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        let mat = (this.originalMaterials.get(child) ?? child.material) as
          | THREE.Material
          | THREE.Material[];
        if (Array.isArray(mat)) mat = mat[0];
        if (!mat) return;

        if (
          this.isMaterialShared(child) ||
          mat === this.primaryMat ||
          mat === this.accentMat ||
          mat === this.trimMat
        ) {
          const cloned = mat.clone();
          this.ownedCustomMaterials.add(cloned);
          this.originalMaterials.set(child, cloned);
          if (this.materialMode === 'pbr') child.material = cloned;
          mat = cloned;
        }
        const std = mat as THREE.MeshStandardMaterial;
        std.map = tex;
        std.color?.setHex(0xffffff);
        std.needsUpdate = true;
        child.userData.__textureAssetId = textureAssetId;
        child.userData.__textureName = textureName;
        this.unlitMaterials.delete(child);
        applied = true;
      });

      if (applied) {
        if (this.materialMode === 'unlit') {
          this.setMaterialPreviewMode('unlit');
        }
        this.emitHierarchyChanged();
        this.requestRender();
      }
      return applied;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  public removeTextureFromNode(nodeId: string | null): boolean {
    const target =
      (nodeId ? this.nodeById.get(nodeId) : null) ?? this.activeModelInner;
    if (!target) return false;
    let changed = false;

    target.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      let mat = (this.originalMaterials.get(child) ?? child.material) as
        | THREE.Material
        | THREE.Material[];
      if (Array.isArray(mat)) mat = mat[0];
      if (!mat) return;

      if (
        this.isMaterialShared(child) ||
        mat === this.primaryMat ||
        mat === this.accentMat ||
        mat === this.trimMat
      ) {
        const cloned = mat.clone();
        this.ownedCustomMaterials.add(cloned);
        this.originalMaterials.set(child, cloned);
        if (this.materialMode === 'pbr') child.material = cloned;
        mat = cloned;
      }

      const std = mat as THREE.MeshStandardMaterial;
      if (std.map) {
        std.map = null;
        std.needsUpdate = true;
        changed = true;
      }
      child.userData.__textureAssetId = null;
      child.userData.__textureName = null;
      this.unlitMaterials.delete(child);
    });

    if (changed) {
      this.emitHierarchyChanged();
      this.requestRender();
    }
    return changed;
  }

  public getAnimations(): string[] {
    return this.animations.map((c, idx) => c.name || `Animation_${idx + 1}`);
  }

  public getActiveAnimation(): string | null {
    return this.activeAnimationName;
  }

  public playAnimation(name?: string): boolean {
    if (!this.mixer || this.animations.length === 0) return false;
    const clip = name
      ? this.animations.find(
          (c, i) => (c.name || `Animation_${i + 1}`) === name
        ) ?? this.animations[0]
      : this.animations[0];
    if (!clip) return false;

    if (this.activeAction) {
      this.activeAction.stop();
    }
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    this.activeAction = action;
    this.activeAnimationName =
      clip.name || `Animation_${this.animations.indexOf(clip) + 1}`;
    this.lastStepTime = performance.now();
    this.requestRender();
    return true;
  }

  public stopAnimation(): void {
    if (this.activeAction) {
      this.activeAction.stop();
      this.activeAction = null;
    }
    if (this.mixer) {
      this.mixer.setTime(0);
    }
    this.activeAnimationName = null;
    this.requestRender();
  }

  public getNodeInspection(nodeId: string | null): NodeInspectionDetails | null {
    const target =
      (nodeId ? this.nodeById.get(nodeId) : null) ?? this.activeGroup;
    if (!target || !this.activeGroup) return null;

    target.updateMatrixWorld(true);
    _tempBox.setFromObject(target);
    if (_tempBox.isEmpty()) {
      _tempSize.set(0, 0, 0);
    } else {
      _tempBox.getSize(_tempSize);
    }
    target.getWorldPosition(_tempVec);

    let meshCount = 0;
    let triangleCount = 0;
    const picked: {
      mat: THREE.MeshStandardMaterial | null;
      mesh: THREE.Mesh | null;
    } = { mat: null, mesh: null };

    target.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
        if (!picked.mesh) picked.mesh = child;
        const geo = child.geometry as THREE.BufferGeometry | undefined;
        if (geo?.index) triangleCount += Math.round(geo.index.count / 3);
        else if (geo?.getAttribute('position')) {
          triangleCount += Math.round(geo.getAttribute('position').count / 3);
        }
        if (!picked.mat) {
          const raw = this.originalMaterials.get(child) ?? child.material;
          const m = Array.isArray(raw) ? raw[0] : raw;
          if (m) picked.mat = m as THREE.MeshStandardMaterial;
        }
      }
    });

    const firstMat = picked.mat;
    const firstMesh = picked.mesh;

    const isRoot = !nodeId || target === this.activeGroup;
    const parentChildren = target.parent?.children ?? [];
    const siblingIndex = parentChildren.indexOf(target);

    return {
      id: isRoot ? null : nodeId,
      name: target.name || (isRoot ? 'Root' : 'Object'),
      type: isRoot
        ? 'Root'
        : target instanceof THREE.Mesh
          ? 'Mesh'
          : target instanceof THREE.Group
            ? 'Group'
            : 'Object3D',
      visible: target.visible,
      locked: isRoot ? this.activeRootLocked : Boolean(target.userData.__locked),
      collection: target.userData.__collection as string | undefined,
      triangleCount,
      meshCount,
      dimensions: {
        width: roundNum(_tempSize.x, 2),
        height: roundNum(_tempSize.y, 2),
        depth: roundNum(_tempSize.z, 2),
      },
      worldPosition: {
        x: roundNum(_tempVec.x, 3),
        y: roundNum(_tempVec.y, 3),
        z: roundNum(_tempVec.z, 3),
      },
      localTransform: readObjectTransform(target),
      materialName: firstMat?.name || undefined,
      materialColor: firstMat?.color ? `#${firstMat.color.getHexString()}` : undefined,
      roughness: typeof firstMat?.roughness === 'number' ? roundNum(firstMat.roughness, 2) : undefined,
      metalness: typeof firstMat?.metalness === 'number' ? roundNum(firstMat.metalness, 2) : undefined,
      emissive: firstMat?.emissive ? `#${firstMat.emissive.getHexString()}` : undefined,
      emissiveIntensity:
        typeof firstMat?.emissiveIntensity === 'number'
          ? roundNum(firstMat.emissiveIntensity, 2)
          : undefined,
      wireframe: typeof firstMat?.wireframe === 'boolean' ? firstMat.wireframe : undefined,
      hasTexture: Boolean(firstMat?.map),
      textureName: (firstMesh?.userData.__textureName as string | undefined) || undefined,
      textureAssetId: (firstMesh?.userData.__textureAssetId as string | undefined) ?? null,
      isGroupWithChildren: !isRoot && target.children.length > 0 && !(target instanceof THREE.Mesh),
      isCustomGroup: Boolean(target.userData.__isCustomGroup),
      isSharedGeometry: firstMesh ? this.isGeometryShared(firstMesh) : false,
      isSharedMaterial: firstMesh ? this.isMaterialShared(firstMesh) : false,
      siblingIndex,
      siblingCount: parentChildren.length,
      canEditMaterial: meshCount > 0,
    };
  }

  public focusOnNode(nodeId: string | null): void {
    this.focusOnNodes(nodeId ? [nodeId] : []);
  }

  public focusOnNodes(nodeIds: string[]): void {
    if (!this.activeGroup) return;
    _tempBox.makeEmpty();
    const validTargets = nodeIds
      .map((id) => this.nodeById.get(id))
      .filter((o): o is THREE.Object3D => Boolean(o));

    if (validTargets.length > 0) {
      for (const target of validTargets) {
        target.updateMatrixWorld(true);
        _tempBox.expandByObject(target);
      }
    } else {
      this.activeGroup.updateMatrixWorld(true);
      _tempBox.setFromObject(this.activeGroup);
    }

    if (_tempBox.isEmpty()) return;
    _tempBox.getSize(_tempSize);
    _tempBox.getCenter(_tempCenter);
    const radius = Math.max(_tempSize.length() * 0.5, 0.45);
    const dist = THREE.MathUtils.clamp(radius * 2.5, 1.5, 22);

    _camTargetLook.copy(_tempCenter);
    _camTargetPos.set(
      _tempCenter.x + dist * 0.68,
      _tempCenter.y + dist * 0.4,
      _tempCenter.z + dist * 0.78
    );
    this.camAnimating = true;
    this.lastStepTime = performance.now();
    this.requestRender();
  }

  public setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
    this.orbit.autoRotate = !this.isSoftwareGl && !this.lowPowerMode && enabled;
    this.orbit.autoRotateSpeed = 2.2;
    this.lastStepTime = performance.now();
    this.requestRender();
  }

  public zoomIn(): void {
    _zoomVec.subVectors(this.camera.position, this.orbit.target);
    const dist = _zoomVec.length();
    const nextDist = Math.max(this.orbit.minDistance, dist * 0.78);
    _zoomVec.setLength(nextDist);
    _camTargetPos.copy(this.orbit.target).add(_zoomVec);
    _camTargetLook.copy(this.orbit.target);
    this.camAnimating = true;
    this.lastStepTime = performance.now();
    this.requestRender();
  }

  public zoomOut(): void {
    _zoomVec.subVectors(this.camera.position, this.orbit.target);
    const dist = _zoomVec.length();
    const nextDist = Math.min(this.orbit.maxDistance, dist * 1.28);
    _zoomVec.setLength(nextDist);
    _camTargetPos.copy(this.orbit.target).add(_zoomVec);
    _camTargetLook.copy(this.orbit.target);
    this.camAnimating = true;
    this.lastStepTime = performance.now();
    this.requestRender();
  }

  public resetView(): void {
    this.setCameraPreset('perspective');
  }

  public setCameraPreset(preset: CameraPreset): void {
    const d = this.fitDistance;
    _camTargetLook.set(0, this.fitTargetY, 0);
    switch (preset) {
      case 'front':
        _camTargetPos.set(0, this.fitTargetY + d * 0.08, d * 1.05);
        break;
      case 'side':
        _camTargetPos.set(d * 1.05, this.fitTargetY + d * 0.08, 0);
        break;
      case 'top':
        _camTargetPos.set(0, this.fitTargetY + d * 1.25, 0.01);
        break;
      case 'iso':
        _camTargetPos.set(d * 0.78, this.fitTargetY + d * 0.65, d * 0.78);
        break;
      case 'perspective':
      default:
        _camTargetPos.set(d * 0.68, this.fitTargetY + d * 0.36, d * 0.8);
        break;
    }
    this.camAnimating = true;
    this.lastStepTime = performance.now();
    this.requestRender();
  }

  public async loadAsset(asset: ModAsset | null): Promise<void> {
    const seq = ++this.loadSequence;

    if (!asset || asset.type !== '3d-model') {
      this.clearActiveModel();
      this.refreshHelpers();
      this.requestRender();
      return;
    }

    const loadKey = `${asset.id}:${asset.updatedAt ?? ''}:${asset.preset ?? ''}:${asset.blobKey ?? ''}`;
    const targetRev = asset.sceneState?.revision ?? 0;
    const needsSceneStateRebuild =
      this.activeLoadedKey === loadKey &&
      this.activeGroup !== null &&
      targetRev !== this.appliedSceneRevision;

    if (this.activeLoadedKey !== loadKey || !this.activeGroup || needsSceneStateRebuild) {
      const wasSameAssetReload = needsSceneStateRebuild;
      const prevSelectedIds = wasSameAssetReload ? [...this.selectedNodeIds] : [];
      const prevPrimaryId = wasSameAssetReload ? this.selectedNodeId : null;
      const prevCleared = wasSameAssetReload ? this.selectionCleared : false;
      this.clearActiveModel();

      if (asset.blobKey) {
        try {
          const rec = await getAssetBlobRecord(asset.blobKey);
          if (this.disposed || seq !== this.loadSequence) return;
          if (!rec) {
            throw new Error(t('core.previewMissingLocalCopy', { name: asset.name }));
          }
          const ext = getFileExtension(asset.path);
          const { root: loaded, animations } = await this.parseImportedModel(rec.data, ext);
          if (this.disposed || seq !== this.loadSequence) {
            this.disposeGroup(loaded, true);
            return;
          }

          this.activeAssetId = asset.id;
          this.activeModelInner = loaded;
          this.repositionInnerModelForPivot();

          const group = new THREE.Group();
          group.name = asset.name;
          group.add(loaded);
          this.activeGroup = group;
          this.activeIsImported = true;
          this.activeLoadedKey = loadKey;
          this.scene.add(group);

          this.animations = animations;
          this.mixer = animations.length > 0 ? new THREE.AnimationMixer(loaded) : null;
          this.callbacks.onAnimationsDetected?.(this.getAnimations());

          this.indexSceneHierarchy(loaded);
          if (asset.sceneState) {
            await this.replaySceneState(asset.sceneState);
          }

          const stats = extractModelStats(group);
          const hierarchy = this.buildHierarchyTree(loaded);
          this.updateFramingFromObject(group);

          this.callbacks.onModelInspected?.({
            assetId: asset.id,
            dimensions: stats.dimensions,
            triangleEstimate: stats.triangleEstimate,
            materials: stats.materials,
            hierarchy,
          });
        } catch (err) {
          this.callbacks.onLoadError?.(
            err instanceof Error ? err.message : t('core.previewUnable3D')
          );
          return;
        }
      } else {
        const preset = asset.preset ?? 'beacon-pedestal';
        const inner = this.buildCompositeAsset(preset);
        inner.name = asset.name;
        this.activeAssetId = asset.id;
        this.activeModelInner = inner;
        this.repositionInnerModelForPivot();

        const group = new THREE.Group();
        group.name = asset.name;
        group.add(inner);
        this.activeGroup = group;
        this.activeIsImported = false;
        this.activeLoadedKey = loadKey;
        this.scene.add(group);

        this.animations = [];
        this.mixer = null;
        this.callbacks.onAnimationsDetected?.([]);

        this.indexSceneHierarchy(inner);
        if (asset.sceneState) {
          await this.replaySceneState(asset.sceneState);
        }

        const stats = extractModelStats(group);
        const hierarchy = this.buildHierarchyTree(inner);
        this.updateFramingFromObject(group);
        this.callbacks.onModelInspected?.({
          assetId: asset.id,
          dimensions: stats.dimensions,
          triangleEstimate:
            asset.sceneState && asset.sceneState.revision > 0
              ? stats.triangleEstimate
              : asset.triangleEstimate || stats.triangleEstimate,
          materials: stats.materials,
          hierarchy,
        });
      }

      if (wasSameAssetReload) {
        const validIds = prevSelectedIds.filter((id) => this.nodeById.has(id));
        this.selectionCleared = prevCleared && validIds.length === 0;
        this.selectedNodeIds = validIds;
        this.selectedNodeId =
          prevPrimaryId && validIds.includes(prevPrimaryId)
            ? prevPrimaryId
            : validIds[validIds.length - 1] ?? null;
      }

      if (this.materialMode !== 'pbr') {
        this.setMaterialPreviewMode(this.materialMode);
      }
      if (!wasSameAssetReload) {
        this.resetView();
      }
    }

    this.activeRootLocked = Boolean(asset.locked);
    if (this.activeGroup) {
      this.activeGroup.visible = !asset.hidden;
    }

    this.applyTransform(asset.transform);
    if (!this.activeIsImported && this.materialMode === 'pbr') {
      this.applyMaterial(asset.material);
    } else if (this.activeIsImported && this.materialMode === 'pbr') {
      this.applyImportedWireframe(asset.material.wireframe);
    }
    this.syncTransformControlsAttachment();
    this.refreshHelpers();
    this.requestRender();
  }

  private allocateCustomId(prefix: string): string {
    return `${prefix}_${++this.customIdCounter}_${Date.now().toString(36)}`;
  }

  private indexSceneHierarchy(root: THREE.Object3D): SceneHierarchyNode[] {
    this.nodeById.clear();
    this.baseNodeArchive.clear();
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.selectionCleared = false;
    this.sceneRevision = 0;
    this.appliedSceneRevision = 0;
    this.deletedNodeIds = [];
    this.structureOps = [];
    this.rootMirror = { x: false, y: false, z: false };

    let counter = 0;
    const assign = (obj: THREE.Object3D, fallbackLabel: string) => {
      const id = `node_${++counter}`;
      obj.userData.__hierarchyId = id;
      obj.userData.__isOriginalNode = true;
      obj.userData.__initialTransform = readObjectTransform(obj);
      if (!obj.name?.trim()) obj.name = fallbackLabel;
      this.nodeById.set(id, obj);
      this.baseNodeArchive.set(id, obj);
      obj.children.forEach((child, idx) =>
        assign(child, child instanceof THREE.Mesh ? `Part_${idx + 1}` : `Group_${idx + 1}`)
      );
    };

    if (root.children.length > 0 && !root.name) {
      root.children.forEach((c, idx) => assign(c, `Part_${idx + 1}`));
    } else {
      assign(root, 'Model');
    }
    return this.buildHierarchyTree(root);
  }

  private rebuildHierarchyIndexPreserveIds(): void {
    this.nodeById.clear();
    if (!this.activeModelInner) return;
    const walk = (obj: THREE.Object3D) => {
      const id = obj.userData.__hierarchyId as string | undefined;
      if (id) {
        this.nodeById.set(id, obj);
      }
      obj.children.forEach(walk);
    };
    if (this.activeModelInner.children.length > 0 && !this.activeModelInner.userData.__hierarchyId) {
      this.activeModelInner.children.forEach(walk);
    } else {
      walk(this.activeModelInner);
    }
  }

  private buildHierarchyTree(root: THREE.Object3D): SceneHierarchyNode[] {
    const build = (obj: THREE.Object3D, fallbackLabel: string): SceneHierarchyNode => {
      let id = obj.userData.__hierarchyId as string | undefined;
      if (!id) {
        id = this.allocateCustomId('node');
        obj.userData.__hierarchyId = id;
        this.nodeById.set(id, obj);
      }

      let triCount = 0;
      let hasTexture = false;
      let materialName: string | undefined;
      let isSharedGeo = false;
      let isSharedMat = false;

      if (obj instanceof THREE.Mesh) {
        const geo = obj.geometry as THREE.BufferGeometry | undefined;
        if (geo?.index) triCount = Math.round(geo.index.count / 3);
        else if (geo?.getAttribute('position')) {
          triCount = Math.round(geo.getAttribute('position').count / 3);
        }
        const rawMat = this.originalMaterials.get(obj) ?? obj.material;
        const firstMat = (Array.isArray(rawMat) ? rawMat[0] : rawMat) as
          | THREE.MeshStandardMaterial
          | undefined;
        if (firstMat) {
          hasTexture = Boolean(firstMat.map);
          materialName = firstMat.name || undefined;
        }
        isSharedGeo = this.isGeometryShared(obj);
        isSharedMat = this.isMaterialShared(obj);
      }

      const children = obj.children.map((child, idx) =>
        build(child, child instanceof THREE.Mesh ? `Part_${idx + 1}` : `Group_${idx + 1}`)
      );

      return {
        id,
        name: obj.name?.trim() || fallbackLabel,
        type:
          obj instanceof THREE.Mesh
            ? 'Mesh'
            : obj instanceof THREE.Group
              ? 'Group'
              : 'Object3D',
        visible: obj.visible,
        locked: Boolean(obj.userData.__locked),
        collection: (obj.userData.__collection as string | undefined) || undefined,
        hasTexture,
        materialName,
        isSharedGeometry: isSharedGeo,
        isSharedMaterial: isSharedMat,
        triangleCount: triCount,
        children,
      };
    };

    if (root.children.length > 0 && !root.userData.__hierarchyId) {
      return root.children.map((c, idx) => build(c, `Part_${idx + 1}`));
    }
    return [build(root, 'Model')];
  }

  private buildSceneEditorState(): SceneEditorState {
    const nodeSnapshots: Record<string, SceneNodeSnapshot> = {};

    this.nodeById.forEach((obj, id) => {
      const parentId =
        obj.parent && obj.parent !== this.activeModelInner && obj.parent !== this.activeGroup
          ? ((obj.parent.userData.__hierarchyId as string | undefined) ?? null)
          : null;
      const orderIndex = obj.parent ? obj.parent.children.indexOf(obj) : 0;
      nodeSnapshots[id] = {
        id,
        name: obj.name || 'Object',
        type:
          obj instanceof THREE.Mesh
            ? 'Mesh'
            : obj instanceof THREE.Group
              ? 'Group'
              : 'Object3D',
        parentId,
        orderIndex,
        visible: obj.visible,
        locked: Boolean(obj.userData.__locked),
        collection: (obj.userData.__collection as string | undefined) || undefined,
        transform: readObjectTransform(obj),
        materialOverride: this.extractNodeMaterialOverride(obj),
        clonedFromNodeId: obj.userData.__clonedFromNodeId as string | undefined,
        isCustomGroup: Boolean(obj.userData.__isCustomGroup),
      };
    });

    return {
      revision: this.sceneRevision,
      deletedNodeIds: [...this.deletedNodeIds],
      nodeSnapshots,
      customGroups: [],
      duplicatedNodes: [],
      structureOps: [...this.structureOps],
      rootMirror: { ...this.rootMirror },
    };
  }

  private emitHierarchyChanged(): void {
    if (!this.activeGroup || !this.activeModelInner) return;
    this.sceneRevision += 1;
    this.appliedSceneRevision = this.sceneRevision;
    const hierarchy = this.buildHierarchyTree(this.activeModelInner);
    const sceneState = this.buildSceneEditorState();
    const stats = extractModelStats(this.activeGroup);
    this.callbacks.onHierarchyChanged?.(hierarchy, sceneState, stats);
  }

  private async replaySceneState(state: SceneEditorState): Promise<void> {
    if (!this.activeModelInner || !this.activeGroup) return;
    this.sceneRevision = state.revision;
    this.appliedSceneRevision = state.revision;
    this.deletedNodeIds = [...(state.deletedNodeIds ?? [])];
    this.structureOps = [...(state.structureOps ?? [])];
    this.rootMirror = state.rootMirror
      ? { ...state.rootMirror }
      : { x: false, y: false, z: false };

    if (this.rootMirror.x) this.activeModelInner.scale.x *= -1;
    if (this.rootMirror.y) this.activeModelInner.scale.y *= -1;
    if (this.rootMirror.z) this.activeModelInner.scale.z *= -1;

    const loader = new THREE.ObjectLoader();
    const deletedSet = new Set<string>();

    for (const op of this.structureOps) {
      if (op.kind === 'duplicate') {
        const src = this.nodeById.get(op.sourceId) ?? this.baseNodeArchive.get(op.sourceId);
        if (src) {
          const clone = this.cloneObjectNode(src, Boolean(op.isInstance), op.newId);
          clone.name = op.name;
          const parent = src.parent && !deletedSet.has(src.parent.userData.__hierarchyId)
            ? src.parent
            : this.activeModelInner;
          parent.add(clone);
          this.nodeById.set(op.newId, clone);
          this.baseNodeArchive.set(op.newId, clone);
        }
      } else if (op.kind === 'pasteJson') {
        try {
          const parsed = loader.parse(op.objectJson);
          parsed.userData.__hierarchyId = op.newId;
          this.activeModelInner.add(parsed);
          this.nodeById.set(op.newId, parsed);
          this.baseNodeArchive.set(op.newId, parsed);
        } catch {
          // ignore corrupted paste snapshot
        }
      } else if (op.kind === 'group') {
        const objs = op.childIds
          .map((cid) => this.nodeById.get(cid))
          .filter((o): o is THREE.Object3D => Boolean(o && o.parent));
        if (objs.length > 0) {
          const parent = objs[0].parent!;
          const grp = new THREE.Group();
          grp.name = op.name;
          grp.userData.__hierarchyId = op.newId;
          grp.userData.__isCustomGroup = true;
          parent.add(grp);
          objs.forEach((o) => grp.attach(o));
          this.nodeById.set(op.newId, grp);
          this.baseNodeArchive.set(op.newId, grp);
        }
      } else if (op.kind === 'ungroup') {
        const grp = this.nodeById.get(op.groupId);
        if (grp && grp.parent) {
          const parent = grp.parent;
          [...grp.children].forEach((c) => parent.attach(c));
          parent.remove(grp);
          this.nodeById.delete(op.groupId);
        }
      } else if (op.kind === 'delete') {
        const target = this.nodeById.get(op.nodeId);
        if (target && target.parent) {
          if (!this.baseNodeArchive.has(op.nodeId)) {
            this.baseNodeArchive.set(op.nodeId, this.cloneObjectDetached(target));
          }
          target.parent.remove(target);
          this.nodeById.delete(op.nodeId);
          deletedSet.add(op.nodeId);
        }
      } else if (op.kind === 'applyTransform') {
        const target = this.nodeById.get(op.nodeId);
        if (target) this.bakeTransformIntoObject(target, op.target);
      } else if (op.kind === 'centerPivot') {
        const target = this.nodeById.get(op.nodeId);
        if (target) this.recenterObjectPivot(target, 'center');
      } else if (op.kind === 'resetPivot') {
        const target = this.nodeById.get(op.nodeId);
        if (target) this.recenterObjectPivot(target, 'bottom');
      } else if (op.kind === 'makeUnique') {
        const target = this.nodeById.get(op.nodeId);
        if (target) this.makeObjectSubtreeUnique(target);
      }
    }

    // Apply parent, transform, metadata, material overrides from nodeSnapshots
    const snapshots = Object.values(state.nodeSnapshots ?? {});
    for (const snap of snapshots) {
      const obj = this.nodeById.get(snap.id);
      if (!obj) continue;
      obj.name = snap.name;
      obj.visible = snap.visible;
      obj.userData.__locked = snap.locked;
      obj.userData.__collection = snap.collection;

      const desiredParent = snap.parentId
        ? this.nodeById.get(snap.parentId) ?? this.activeModelInner
        : this.activeModelInner;
      if (desiredParent && obj.parent !== desiredParent && obj !== this.activeModelInner) {
        desiredParent.add(obj);
      }
      writeObjectTransform(obj, snap.transform);
    }

    // Reorder siblings deterministically
    const orderById = new Map<string, number>();
    snapshots.forEach((s) => orderById.set(s.id, s.orderIndex));
    const sortChildren = (parent: THREE.Object3D) => {
      parent.children.sort((a, b) => {
        const oa = orderById.get(a.userData.__hierarchyId) ?? 9999;
        const ob = orderById.get(b.userData.__hierarchyId) ?? 9999;
        return oa - ob;
      });
      parent.children.forEach(sortChildren);
    };
    sortChildren(this.activeModelInner);

    // Re-apply material & texture overrides
    for (const snap of snapshots) {
      if (!snap.materialOverride) continue;
      const obj = this.nodeById.get(snap.id);
      if (!obj || !(obj instanceof THREE.Mesh)) continue;
      const ov = snap.materialOverride;
      const base = this.originalMaterials.get(obj) ?? obj.material;
      const baseOne = Array.isArray(base) ? base[0] : base;
      if (baseOne) {
        const mat = baseOne.clone() as THREE.MeshStandardMaterial;
        this.ownedCustomMaterials.add(mat);
        if (ov.name) mat.name = ov.name;
        if (ov.color && mat.color) mat.color.set(ov.color);
        if (typeof ov.roughness === 'number') mat.roughness = ov.roughness;
        if (typeof ov.metalness === 'number') mat.metalness = ov.metalness;
        if (ov.emissive && mat.emissive) mat.emissive.set(ov.emissive);
        if (typeof ov.emissiveIntensity === 'number') {
          mat.emissiveIntensity = ov.emissiveIntensity;
        }
        if (typeof ov.wireframe === 'boolean') mat.wireframe = ov.wireframe;
        if (ov.textureAssetId) {
          try {
            const texRec = await getAssetBlobRecord(ov.textureAssetId);
            if (texRec && !this.disposed) {
              const url = URL.createObjectURL(new Blob([texRec.data]));
              try {
                const tex = await new THREE.TextureLoader().loadAsync(url);
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                this.ownedCustomTextures.add(tex);
                mat.map = tex;
                obj.userData.__textureAssetId = ov.textureAssetId;
                obj.userData.__textureName = ov.textureName ?? null;
              } finally {
                URL.revokeObjectURL(url);
              }
            }
          } catch {
            // ignore missing optional texture
          }
        }
        mat.needsUpdate = true;
        this.originalMaterials.set(obj, mat);
        obj.material = mat;
      }
    }

    this.rebuildHierarchyIndexPreserveIds();
  }

  private extractNodeMaterialOverride(
    obj: THREE.Object3D
  ): SceneNodeSnapshot['materialOverride'] | undefined {
    if (!(obj instanceof THREE.Mesh)) return undefined;
    const raw = this.originalMaterials.get(obj) ?? obj.material;
    const m = (Array.isArray(raw) ? raw[0] : raw) as THREE.MeshStandardMaterial | undefined;
    if (!m) return undefined;
    return {
      name: m.name || undefined,
      color: m.color ? `#${m.color.getHexString()}` : undefined,
      roughness: typeof m.roughness === 'number' ? roundNum(m.roughness, 2) : undefined,
      metalness: typeof m.metalness === 'number' ? roundNum(m.metalness, 2) : undefined,
      emissive: m.emissive ? `#${m.emissive.getHexString()}` : undefined,
      emissiveIntensity:
        typeof m.emissiveIntensity === 'number'
          ? roundNum(m.emissiveIntensity, 2)
          : undefined,
      wireframe: typeof m.wireframe === 'boolean' ? m.wireframe : undefined,
      textureAssetId: (obj.userData.__textureAssetId as string | null | undefined) ?? null,
      textureName: (obj.userData.__textureName as string | null | undefined) ?? null,
    };
  }

  private cloneObjectNode(
    src: THREE.Object3D,
    shareResources: boolean,
    newRootId: string
  ): THREE.Object3D {
    const clone = src.clone(true);
    let subCounter = 0;

    const process = (clonedNode: THREE.Object3D, origNode: THREE.Object3D, isRoot: boolean) => {
      clonedNode.userData = { ...origNode.userData };
      clonedNode.userData.__hierarchyId = isRoot
        ? newRootId
        : `${newRootId}_sub_${++subCounter}`;
      clonedNode.userData.__clonedFromNodeId = origNode.userData.__hierarchyId;
      clonedNode.userData.__initialTransform = readObjectTransform(clonedNode);

      if (clonedNode instanceof THREE.Mesh && origNode instanceof THREE.Mesh) {
        clonedNode.castShadow = true;
        clonedNode.receiveShadow = true;
        if (!shareResources) {
          clonedNode.geometry = origNode.geometry.clone();
          const origMat = this.originalMaterials.get(origNode) ?? origNode.material;
          if (origMat) {
            const cloneMat = (m: THREE.Material) => {
              const cm = m.clone();
              this.ownedCustomMaterials.add(cm);
              return cm;
            };
            const nextMat = Array.isArray(origMat)
              ? origMat.map(cloneMat)
              : cloneMat(origMat);
            this.originalMaterials.set(clonedNode, nextMat);
            if (this.materialMode === 'pbr') clonedNode.material = nextMat;
          }
        } else {
          const origMat = this.originalMaterials.get(origNode) ?? origNode.material;
          if (origMat) {
            this.originalMaterials.set(clonedNode, origMat);
            if (this.materialMode === 'pbr') clonedNode.material = origMat;
          }
        }
      }

      for (let i = 0; i < clonedNode.children.length; i++) {
        if (origNode.children[i]) {
          process(clonedNode.children[i], origNode.children[i], false);
        }
      }
    };

    process(clone, src, true);
    return clone;
  }

  private cloneObjectDetached(src: THREE.Object3D): THREE.Object3D {
    const clone = src.clone(true);
    const process = (clonedNode: THREE.Object3D, origNode: THREE.Object3D) => {
      clonedNode.userData = { ...origNode.userData };
      if (clonedNode instanceof THREE.Mesh && origNode instanceof THREE.Mesh) {
        clonedNode.geometry = origNode.geometry.clone();
        const origMat = this.originalMaterials.get(origNode) ?? origNode.material;
        if (origMat) {
          const cloneMat = (m: THREE.Material) => m.clone();
          clonedNode.material = Array.isArray(origMat)
            ? origMat.map(cloneMat)
            : cloneMat(origMat);
        }
      }
      for (let i = 0; i < clonedNode.children.length; i++) {
        if (origNode.children[i]) {
          process(clonedNode.children[i], origNode.children[i]);
        }
      }
    };
    process(clone, src);
    return clone;
  }

  private isGeometryShared(mesh: THREE.Mesh): boolean {
    if (!this.activeGroup) return false;
    let count = 0;
    this.activeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry === mesh.geometry) {
        count++;
      }
    });
    return count > 1;
  }

  private isMaterialShared(mesh: THREE.Mesh): boolean {
    if (!this.activeGroup) return false;
    const targetMat = this.originalMaterials.get(mesh) ?? mesh.material;
    const first = Array.isArray(targetMat) ? targetMat[0] : targetMat;
    if (!first) return false;
    let count = 0;
    this.activeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const cm = this.originalMaterials.get(child) ?? child.material;
        const cFirst = Array.isArray(cm) ? cm[0] : cm;
        if (cFirst === first) count++;
      }
    });
    return count > 1;
  }

  private disposeObjectSafely(
    target: THREE.Object3D,
    remainingRoot: THREE.Object3D | null
  ): void {
    const keepGeos = new Set<THREE.BufferGeometry>();
    const keepMats = new Set<THREE.Material>();

    if (remainingRoot) {
      remainingRoot.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          if (c.geometry) keepGeos.add(c.geometry);
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach((m) => m && keepMats.add(m));
          const orig = this.originalMaterials.get(c);
          if (orig) {
            (Array.isArray(orig) ? orig : [orig]).forEach((m) => m && keepMats.add(m));
          }
        }
      });
    }

    target.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        if (c.geometry && !keepGeos.has(c.geometry)) {
          c.geometry.dispose();
        }
        const orig = this.originalMaterials.get(c) ?? c.material;
        this.originalMaterials.delete(c);
        const unlit = this.unlitMaterials.get(c);
        if (unlit) {
          (Array.isArray(unlit) ? unlit : [unlit]).forEach((m) => m.dispose());
          this.unlitMaterials.delete(c);
        }
        if (orig) {
          (Array.isArray(orig) ? orig : [orig]).forEach((m) => {
            if (
              m &&
              !keepMats.has(m) &&
              m !== this.primaryMat &&
              m !== this.accentMat &&
              m !== this.trimMat
            ) {
              m.dispose();
            }
          });
        }
      }
    });
  }

  private clearActiveModel(): void {
    this.stopAnimation();
    this.mixer = null;
    this.animations = [];
    this.activeAnimationName = null;

    this.nodeById.clear();
    this.baseNodeArchive.clear();
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.selectionCleared = false;
    this.originalMaterials.clear();
    this.unlitMaterials.forEach((mats) => {
      const arr = Array.isArray(mats) ? mats : [mats];
      arr.forEach((m) => m.dispose());
    });
    this.unlitMaterials.clear();

    this.ownedCustomTextures.forEach((t) => t.dispose());
    this.ownedCustomTextures.clear();
    this.ownedCustomMaterials.forEach((m) => m.dispose());
    this.ownedCustomMaterials.clear();

    if (this.activeGroup) {
      this.transformControls.detach();
      this.scene.remove(this.activeGroup);
      this.disposeGroup(this.activeGroup, this.activeIsImported);
      this.activeGroup = null;
      this.activeModelInner = null;
      this.activeLoadedKey = null;
      this.activeIsImported = false;
      this.activeAssetId = null;
    }
  }

  private async parseImportedModel(
    buffer: ArrayBuffer,
    ext: string
  ): Promise<{ root: THREE.Object3D; animations: THREE.AnimationClip[] }> {
    let root: THREE.Object3D;
    let animations: THREE.AnimationClip[] = [];

    if (ext === 'obj') {
      const text = new TextDecoder().decode(buffer);
      const loader = new OBJLoader();
      root = loader.parse(text);
    } else {
      const loader = new GLTFLoader();
      const input: ArrayBuffer | string =
        ext === 'gltf' ? new TextDecoder().decode(buffer) : buffer.slice(0);
      const gltf = await new Promise<{
        scene: THREE.Object3D;
        animations: THREE.AnimationClip[];
      }>((resolve, reject) => {
        loader.parse(
          input,
          '',
          (parsed) =>
            resolve({
              scene: parsed.scene,
              animations: parsed.animations ?? [],
            }),
          (err) =>
            reject(err instanceof Error ? err : new Error('Invalid GLTF/GLB data'))
        );
      });
      root = gltf.scene;
      animations = gltf.animations;
    }

    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (!child.material) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            roughness: 0.5,
            metalness: 0.2,
          });
        }
      }
    });

    return { root, animations };
  }

  private repositionInnerModelForPivot(): void {
    const obj = this.activeModelInner;
    if (!obj) return;

    obj.position.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    obj.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);

    if (maxDim > 8 || maxDim < 0.25) {
      const normScale = 2.2 / maxDim;
      obj.scale.setScalar(normScale);
      obj.updateMatrixWorld(true);
      box.setFromObject(obj);
    }

    const center = box.getCenter(new THREE.Vector3());
    obj.position.x -= center.x;
    obj.position.z -= center.z;
    if (this.pivotMode === 'center') {
      obj.position.y -= center.y;
    } else {
      obj.position.y -= box.min.y;
    }
  }

  private refreshHelpers(): void {
    if (this.boundingBoxHelper) {
      this.scene.remove(this.boundingBoxHelper);
      this.boundingBoxHelper.dispose();
      this.boundingBoxHelper = null;
    }
    while (this.secondaryBoundingHelpers.length > 0) {
      const helper = this.secondaryBoundingHelpers.pop()!;
      this.scene.remove(helper);
      helper.dispose();
    }

    if (this.showBoundingBox && !this.selectionCleared && this.activeGroup) {
      if (this.selectedNodeIds.length > 0) {
        this.selectedNodeIds.forEach((id) => {
          const obj = this.nodeById.get(id);
          if (!obj) return;
          obj.updateMatrixWorld(true);
          _tempBox.setFromObject(obj);
          if (_tempBox.isEmpty()) return;
          const isPrimary = id === this.selectedNodeId;
          const color = isPrimary ? 0xf59e0b : 0x60a5fa;
          const helper = new THREE.Box3Helper(_tempBox.clone(), color);
          if (isPrimary && !this.boundingBoxHelper) {
            this.boundingBoxHelper = helper;
          } else {
            this.secondaryBoundingHelpers.push(helper);
          }
          this.scene.add(helper);
        });
      } else {
        this.activeGroup.updateMatrixWorld(true);
        _tempBox.setFromObject(this.activeGroup);
        if (!_tempBox.isEmpty()) {
          this.boundingBoxHelper = new THREE.Box3Helper(_tempBox.clone(), 0x38bdf8);
          this.scene.add(this.boundingBoxHelper);
        }
      }
    }

    const pivotTarget =
      (this.selectedNodeId ? this.nodeById.get(this.selectedNodeId) : null) ??
      this.activeGroup;
    if (this.showPivot && pivotTarget && !this.selectionCleared) {
      pivotTarget.updateMatrixWorld(true);
      pivotTarget.getWorldPosition(_tempVec);
      pivotTarget.getWorldQuaternion(_tempQuat);
      this.pivotGroup.visible = true;
      this.pivotGroup.position.copy(_tempVec);
      this.pivotGroup.quaternion.copy(_tempQuat);
    } else {
      this.pivotGroup.visible = false;
    }

    while (this.collisionGroup.children.length > 0) {
      const child = this.collisionGroup.children[0];
      this.collisionGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }

    if (
      this.showCollision &&
      this.collisionConfig.shape !== 'none' &&
      this.activeGroup
    ) {
      this.activeGroup.updateMatrixWorld(true);
      _tempBox.setFromObject(this.activeGroup);
      if (!_tempBox.isEmpty()) {
        _tempBox.getSize(_tempSize);
        _tempBox.getCenter(_tempCenter);
        const s = Math.max(0.2, this.collisionConfig.scale);
        let geo: THREE.BufferGeometry;

        if (this.collisionConfig.shape === 'sphere') {
          const r = Math.max(_tempSize.x, _tempSize.y, _tempSize.z) * 0.5 * s;
          geo = new THREE.SphereGeometry(Math.max(r, 0.1), 16, 12);
        } else if (this.collisionConfig.shape === 'capsule') {
          const r = Math.max(_tempSize.x, _tempSize.z) * 0.5 * s;
          const totalH = Math.max(_tempSize.y * s, r * 2.1);
          const cylLen = Math.max(totalH - r * 2, 0.05);
          geo = new THREE.CapsuleGeometry(Math.max(r, 0.08), cylLen, 6, 14);
        } else {
          geo = new THREE.BoxGeometry(
            Math.max(_tempSize.x * s, 0.1),
            Math.max(_tempSize.y * s, 0.1),
            Math.max(_tempSize.z * s, 0.1)
          );
        }

        const fillMesh = new THREE.Mesh(geo, this.collisionFillMat);
        const wireMesh = new THREE.Mesh(geo.clone(), this.collisionWireMat);
        this.collisionGroup.add(fillMesh, wireMesh);
        this.collisionGroup.position.set(
          _tempCenter.x,
          _tempCenter.y + this.collisionConfig.offsetY,
          _tempCenter.z
        );
        this.collisionGroup.visible = true;
      } else {
        this.collisionGroup.visible = false;
      }
    } else {
      this.collisionGroup.visible = false;
    }
  }

  private updateFramingFromObject(obj: THREE.Object3D): void {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) {
      this.fitDistance = 4.6;
      this.fitTargetY = 0.9;
      return;
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.6);
    this.fitDistance = THREE.MathUtils.clamp(radius * 2.4, 2.2, 18);
    this.fitTargetY = center.y;
  }

  public applyTransform(tr: AssetTransform): void {
    if (!this.activeGroup) return;
    this.activeGroup.position.set(tr.position.x, tr.position.y, tr.position.z);
    this.activeGroup.rotation.set(
      THREE.MathUtils.degToRad(tr.rotation.x),
      THREE.MathUtils.degToRad(tr.rotation.y),
      THREE.MathUtils.degToRad(tr.rotation.z)
    );
    this.activeGroup.scale.set(
      Math.max(0.05, tr.scale.x),
      Math.max(0.05, tr.scale.y),
      Math.max(0.05, tr.scale.z)
    );
    this.refreshHelpers();
    this.requestRender();
  }

  public applyMaterial(m: AssetMaterialConfig): void {
    this.primaryMat.color.set(m.color);
    this.primaryMat.roughness = THREE.MathUtils.clamp(m.roughness, 0.04, 1);
    this.primaryMat.metalness = THREE.MathUtils.clamp(m.metalness, 0, 1);
    this.primaryMat.wireframe = m.wireframe;

    this.accentMat.color.set(m.accentColor);
    this.accentMat.emissive.set(m.accentColor);
    this.accentMat.emissiveIntensity = m.emissiveIntensity;
    this.accentMat.wireframe = m.wireframe;

    this.trimMat.wireframe = m.wireframe;
    this.requestRender();
  }

  private applyImportedWireframe(wireframe: boolean): void {
    if (!this.activeGroup) return;
    this.activeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if ('wireframe' in mat) {
            (mat as THREE.MeshStandardMaterial).wireframe = wireframe;
          }
        });
      }
    });
  }

  private emitTransformUpdate(): void {
    if (!this.activeGroup || !this.callbacks.onTransformChange) return;
    this.callbacks.onTransformChange({
      position: {
        x: Number(this.activeGroup.position.x.toFixed(2)),
        y: Number(this.activeGroup.position.y.toFixed(2)),
        z: Number(this.activeGroup.position.z.toFixed(2)),
      },
      rotation: {
        x: Number(THREE.MathUtils.radToDeg(this.activeGroup.rotation.x).toFixed(1)),
        y: Number(THREE.MathUtils.radToDeg(this.activeGroup.rotation.y).toFixed(1)),
        z: Number(THREE.MathUtils.radToDeg(this.activeGroup.rotation.z).toFixed(1)),
      },
      scale: {
        x: Number(this.activeGroup.scale.x.toFixed(2)),
        y: Number(this.activeGroup.scale.y.toFixed(2)),
        z: Number(this.activeGroup.scale.z.toFixed(2)),
      },
    });
  }

  private buildCompositeAsset(preset: AssetPresetKind): THREE.Group {
    const group = new THREE.Group();

    const addPart = (
      name: string,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      pos: [number, number, number],
      rot: [number, number, number] = [0, 0, 0]
    ) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.position.set(...pos);
      mesh.rotation.set(...rot);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    if (preset === 'relic-sword') {
      addPart('Stand_Base', new THREE.CylinderGeometry(0.55, 0.65, 0.12, 8), this.trimMat, [0, 0.06, 0]);
      addPart('Stand_Collar', new THREE.CylinderGeometry(0.14, 0.18, 0.2, 8), this.trimMat, [0, 0.22, 0]);
      addPart('Pommel_Gem', new THREE.OctahedronGeometry(0.11, 0), this.accentMat, [0, 0.42, 0]);
      addPart('Hilt_Grip', new THREE.CylinderGeometry(0.055, 0.06, 0.42, 10), this.trimMat, [0, 0.68, 0]);
      addPart('Crossguard', new THREE.BoxGeometry(0.76, 0.09, 0.16), this.primaryMat, [0, 0.92, 0]);
      addPart('Guard_Core', new THREE.OctahedronGeometry(0.08, 0), this.accentMat, [0, 0.92, 0.09]);
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(-0.1, 0);
      bladeShape.lineTo(0.1, 0);
      bladeShape.lineTo(0.085, 1.15);
      bladeShape.lineTo(0, 1.45);
      bladeShape.lineTo(-0.085, 1.15);
      bladeShape.closePath();
      const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
        depth: 0.035,
        bevelEnabled: true,
        bevelThickness: 0.018,
        bevelSize: 0.015,
        bevelSegments: 2,
      });
      bladeGeo.translate(0, 0, -0.0175);
      addPart('Blade_Body', bladeGeo, this.primaryMat, [0, 0.96, 0]);
      addPart('Fuller_Spine', new THREE.BoxGeometry(0.03, 1.0, 0.08), this.accentMat, [0, 1.5, 0]);
    } else if (preset === 'crystal-obelisk') {
      addPart('Plinth_Lower', new THREE.CylinderGeometry(0.85, 0.96, 0.18, 6), this.trimMat, [0, 0.09, 0]);
      addPart('Plinth_Upper', new THREE.CylinderGeometry(0.62, 0.72, 0.18, 6), this.primaryMat, [0, 0.27, 0]);
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        addPart(
          `Corner_Pylon_${i + 1}`,
          new THREE.BoxGeometry(0.14, 0.56, 0.14),
          this.trimMat,
          [Math.cos(angle) * 0.54, 0.52, Math.sin(angle) * 0.54],
          [0, angle, 0]
        );
      }
      addPart('Crystal_Shaft', new THREE.CylinderGeometry(0.18, 0.34, 1.35, 6), this.accentMat, [0, 1.12, 0]);
      addPart('Crystal_Apex', new THREE.ConeGeometry(0.18, 0.42, 6), this.accentMat, [0, 2.0, 0]);
      addPart(
        'Orbit_Ring',
        new THREE.TorusGeometry(0.46, 0.035, 10, 28),
        this.primaryMat,
        [0, 1.25, 0],
        [Math.PI / 2.3, 0.2, 0]
      );
    } else if (preset === 'frontier-crate') {
      addPart('Crate_Body', new THREE.BoxGeometry(1.16, 1.16, 1.16), this.primaryMat, [0, 0.58, 0]);
      const offsets: [number, number][] = [
        [-0.58, -0.58],
        [0.58, -0.58],
        [-0.58, 0.58],
        [0.58, 0.58],
      ];
      offsets.forEach(([ox, oz], idx) => {
        addPart(`Corner_Strut_${idx + 1}`, new THREE.BoxGeometry(0.12, 1.24, 0.12), this.trimMat, [ox, 0.62, oz]);
      });
      addPart('Base_Frame', new THREE.BoxGeometry(1.28, 0.12, 1.28), this.trimMat, [0, 0.06, 0]);
      addPart('Lid_Frame', new THREE.BoxGeometry(1.28, 0.12, 1.28), this.trimMat, [0, 1.18, 0]);
      addPart('Front_Latch', new THREE.BoxGeometry(0.26, 0.32, 0.08), this.accentMat, [0, 0.72, 0.6]);
      addPart(
        'Handle_Right',
        new THREE.TorusGeometry(0.14, 0.03, 8, 16),
        this.accentMat,
        [0.62, 0.65, 0],
        [0, Math.PI / 2, 0]
      );
      addPart(
        'Handle_Left',
        new THREE.TorusGeometry(0.14, 0.03, 8, 16),
        this.accentMat,
        [-0.62, 0.65, 0],
        [0, Math.PI / 2, 0]
      );
    } else if (preset === 'clockwork-sentinel') {
      addPart('Pedestal_Foot', new THREE.CylinderGeometry(0.5, 0.62, 0.18, 12), this.trimMat, [0, 0.09, 0]);
      addPart('Lower_Spine', new THREE.CylinderGeometry(0.2, 0.28, 0.52, 10), this.trimMat, [0, 0.44, 0]);
      addPart('Torso_Chassis', new THREE.CylinderGeometry(0.42, 0.36, 0.68, 12), this.primaryMat, [0, 1.04, 0]);
      addPart('Pauldron_Left', new THREE.SphereGeometry(0.24, 12, 10), this.primaryMat, [-0.52, 1.22, 0]);
      addPart('Pauldron_Right', new THREE.SphereGeometry(0.24, 12, 10), this.primaryMat, [0.52, 1.22, 0]);
      addPart('Head_Helm', new THREE.BoxGeometry(0.44, 0.34, 0.42), this.primaryMat, [0, 1.56, 0]);
      addPart('Visor_Optics', new THREE.BoxGeometry(0.32, 0.1, 0.08), this.accentMat, [0, 1.58, 0.21]);
      addPart('Reactor_Core', new THREE.OctahedronGeometry(0.14, 0), this.accentMat, [0, 1.06, 0.38]);
      addPart(
        'Sensor_Mast',
        new THREE.CylinderGeometry(0.02, 0.03, 0.42, 8),
        this.trimMat,
        [0.14, 1.92, -0.08]
      );
    } else {
      addPart('Octagonal_Base', new THREE.CylinderGeometry(0.75, 0.88, 0.18, 8), this.trimMat, [0, 0.09, 0]);
      addPart('Pillar_Shaft', new THREE.CylinderGeometry(0.26, 0.34, 0.92, 8), this.primaryMat, [0, 0.64, 0]);
      addPart('Cradle_Collar', new THREE.CylinderGeometry(0.48, 0.32, 0.18, 8), this.trimMat, [0, 1.18, 0]);
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3;
        addPart(
          `Cradle_Prong_${i + 1}`,
          new THREE.BoxGeometry(0.08, 0.45, 0.12),
          this.primaryMat,
          [Math.cos(angle) * 0.36, 1.44, Math.sin(angle) * 0.36],
          [0, -angle, 0.18]
        );
      }
      addPart('Focus_Prism', new THREE.OctahedronGeometry(0.26, 0), this.accentMat, [0, 1.66, 0]);
      addPart(
        'Halo_Ring',
        new THREE.TorusGeometry(0.42, 0.03, 10, 32),
        this.accentMat,
        [0, 1.66, 0],
        [Math.PI / 2, 0, 0]
      );
    }

    return group;
  }

  private disposeGroup(group: THREE.Group | THREE.Object3D, disposeMaterials: boolean): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (disposeMaterials && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            if (!m) return;
            const anyMat = m as unknown as Record<string, unknown>;
            for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
              const tex = anyMat[key];
              if (tex && typeof (tex as THREE.Texture).dispose === 'function') {
                (tex as THREE.Texture).dispose();
              }
            }
            m.dispose();
          });
        }
      }
    });
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.requestRender();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
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
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;

      const now = performance.now();
      const dt = Math.min((now - this.lastStepTime) / 1000, 0.1);
      this.lastStepTime = now;

      if (this.mixer && this.activeAction) {
        this.mixer.update(dt);
        this.renderDirty = true;
      }

      if (this.camAnimating) {
        const lambda = 9;
        this.camera.position.x = THREE.MathUtils.damp(
          this.camera.position.x,
          _camTargetPos.x,
          lambda,
          dt
        );
        this.camera.position.y = THREE.MathUtils.damp(
          this.camera.position.y,
          _camTargetPos.y,
          lambda,
          dt
        );
        this.camera.position.z = THREE.MathUtils.damp(
          this.camera.position.z,
          _camTargetPos.z,
          lambda,
          dt
        );
        this.orbit.target.x = THREE.MathUtils.damp(
          this.orbit.target.x,
          _camTargetLook.x,
          lambda,
          dt
        );
        this.orbit.target.y = THREE.MathUtils.damp(
          this.orbit.target.y,
          _camTargetLook.y,
          lambda,
          dt
        );
        this.orbit.target.z = THREE.MathUtils.damp(
          this.orbit.target.z,
          _camTargetLook.z,
          lambda,
          dt
        );

        if (
          this.camera.position.distanceTo(_camTargetPos) < 0.02 &&
          this.orbit.target.distanceTo(_camTargetLook) < 0.02
        ) {
          this.camera.position.copy(_camTargetPos);
          this.orbit.target.copy(_camTargetLook);
          this.camAnimating = false;
        } else {
          this.renderDirty = true;
        }
      }

      if (this.autoRotate && (this.isSoftwareGl || this.lowPowerMode) && this.activeGroup) {
        this.activeGroup.rotation.y += dt * 0.65;
        this.renderDirty = true;
      }

      const orbitMoved = this.orbit.update();
      if (
        (orbitMoved && this.orbit.enableDamping) ||
        (this.autoRotate && !this.isSoftwareGl && !this.lowPowerMode)
      ) {
        this.renderDirty = true;
      }

      this.renderer.render(this.scene, this.camera);

      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty && !this.disposed) {
          this.requestRender();
        }
      };

      if (this.isSoftwareGl) {
        this.afterDraw(done);
      } else {
        done();
      }
    });
  };

  public dispose(): void {
    this.disposed = true;
    this.clearLongPressTimer();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerCancel);
    this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.handleContextLost
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored
    );
    this.clearActiveModel();
    if (this.boundingBoxHelper) {
      this.boundingBoxHelper.dispose();
    }
    while (this.secondaryBoundingHelpers.length > 0) {
      this.secondaryBoundingHelpers.pop()!.dispose();
    }
    this.collisionWireMat.dispose();
    this.collisionFillMat.dispose();
    this.clayMaterial.dispose();
    this.normalMaterial.dispose();
    this.wireMaterial.dispose();
    this.primaryMat.dispose();
    this.accentMat.dispose();
    this.trimMat.dispose();
    this.gridHelper.dispose();
    this.axesHelper.dispose();
    this.contactShadow.geometry.dispose();
    (this.contactShadow.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.contactShadow.material as THREE.MeshBasicMaterial).dispose();
    this.envRT?.dispose();
    this.transformControls.dispose();
    this.orbit.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
