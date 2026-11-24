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
  SceneHierarchyNode,
} from '@/src/types/mod';

export type CameraPreset = 'perspective' | 'front' | 'side' | 'top' | 'iso';
export type GizmoMode = 'select' | 'translate' | 'rotate' | 'scale';

export interface ModelInspectionResult {
  assetId: string;
  dimensions: ModelDimensions;
  triangleEstimate: number;
  materials: ExtractedMaterialInfo[];
  hierarchy: SceneHierarchyNode[];
}

export interface PreviewEngineCallbacks {
  onTransformChange?: (transform: AssetTransform) => void;
  onModelInspected?: (info: ModelInspectionResult) => void;
  onHierarchyNodeSelected?: (nodeId: string | null) => void;
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
  private activeGroup: THREE.Group | null = null;
  private activeModelInner: THREE.Object3D | null = null;
  private activeLoadedKey: string | null = null;
  private activeIsImported = false;
  private loadSequence = 0;
  private nodeById = new Map<string, THREE.Object3D>();
  private selectedNodeId: string | null = null;

  // Material Preview Modes (cached reusable overrides -> zero GC leaks)
  private materialMode: MaterialPreviewMode = 'pbr';
  private originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private unlitMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private clayMaterial: THREE.MeshStandardMaterial;
  private normalMaterial: THREE.MeshNormalMaterial;
  private wireMaterial: THREE.MeshBasicMaterial;

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

    // Collision visualizer container
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

    // Pivot visualizer marker
    this.pivotGroup = this.createPivotMarker();
    this.pivotGroup.visible = false;
    this.scene.add(this.pivotGroup);

    // Shared preview override materials
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
      this.orbit.enabled = !event.value;
      if (!event.value && this.activeGroup) {
        if (!this.selectedNodeId) {
          this.emitTransformUpdate();
        }
        this.refreshHelpers();
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

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.longPressFired = false;
    this.clearLongPressTimer();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null;
        if (this.transformControls.dragging || this.disposed) return;
        this.longPressFired = true;
        this.callbacks.onLongPress?.();
      }, 550);
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
    if (this.transformControls.dragging || !this.activeGroup) return;
    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y
    );
    if (dist > 6) return; // Was an orbit/drag, not a click/tap

    const rect = this.renderer.domElement.getBoundingClientRect();
    _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObject(this.activeGroup, true);
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      const nodeId = hitObj.userData.__hierarchyId as string | undefined;
      if (nodeId) {
        this.selectHierarchyNode(nodeId);
        this.callbacks.onHierarchyNodeSelected?.(nodeId);
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
    const helper = this.transformControls.getHelper();
    const target =
      (this.selectedNodeId ? this.nodeById.get(this.selectedNodeId) : null) ??
      this.activeGroup;

    if (mode === 'select' || !target) {
      this.transformControls.enabled = false;
      helper.visible = false;
      this.transformControls.detach();
    } else {
      this.transformControls.enabled = true;
      helper.visible = true;
      this.transformControls.setMode(mode);
      this.transformControls.attach(target);
    }
    this.requestRender();
  }

  public selectHierarchyNode(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    if (this.transformControls.enabled) {
      const target =
        (nodeId ? this.nodeById.get(nodeId) : null) ?? this.activeGroup;
      if (target) {
        this.transformControls.attach(target);
      }
    }
    this.refreshHelpers();
    this.requestRender();
  }

  public setNodeVisibility(nodeId: string, visible: boolean): void {
    const obj = this.nodeById.get(nodeId);
    if (!obj) return;
    obj.visible = visible;
    this.refreshHelpers();
    this.requestRender();
  }

  public focusOnNode(nodeId: string | null): void {
    const target =
      (nodeId ? this.nodeById.get(nodeId) : null) ?? this.activeGroup;
    if (!target) return;

    target.updateMatrixWorld(true);
    _tempBox.setFromObject(target);
    if (_tempBox.isEmpty()) return;

    _tempBox.getSize(_tempSize);
    _tempBox.getCenter(_tempCenter);
    const radius = Math.max(_tempSize.length() * 0.5, 0.45);
    const dist = THREE.MathUtils.clamp(radius * 2.5, 1.5, 20);

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

    if (this.activeLoadedKey !== loadKey || !this.activeGroup) {
      this.clearActiveModel();

      if (asset.blobKey) {
        try {
          const rec = await getAssetBlobRecord(asset.blobKey);
          if (this.disposed || seq !== this.loadSequence) return;
          if (!rec) {
            throw new Error(t('core.previewMissingLocalCopy', { name: asset.name }));
          }
          const ext = getFileExtension(asset.path);
          const loaded = await this.parseImportedModel(rec.data, ext);
          if (this.disposed || seq !== this.loadSequence) {
            this.disposeGroup(loaded, true);
            return;
          }

          const stats = extractModelStats(loaded);
          this.activeModelInner = loaded;
          this.repositionInnerModelForPivot();

          const group = new THREE.Group();
          group.name = asset.name;
          group.add(loaded);
          this.activeGroup = group;
          this.activeIsImported = true;
          this.activeLoadedKey = loadKey;
          this.scene.add(group);

          const hierarchy = this.indexSceneHierarchy(loaded);
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
        this.activeModelInner = inner;
        this.repositionInnerModelForPivot();

        const group = new THREE.Group();
        group.name = asset.name;
        group.add(inner);
        this.activeGroup = group;
        this.activeIsImported = false;
        this.activeLoadedKey = loadKey;
        this.scene.add(group);

        const stats = extractModelStats(group);
        const hierarchy = this.indexSceneHierarchy(inner);
        this.updateFramingFromObject(group);
        this.callbacks.onModelInspected?.({
          assetId: asset.id,
          dimensions: stats.dimensions,
          triangleEstimate: asset.triangleEstimate || stats.triangleEstimate,
          materials: stats.materials,
          hierarchy,
        });
      }

      if (this.transformControls.enabled && this.activeGroup) {
        this.transformControls.attach(this.activeGroup);
      }
      if (this.materialMode !== 'pbr') {
        this.setMaterialPreviewMode(this.materialMode);
      }
      this.resetView();
    }

    this.applyTransform(asset.transform);
    if (!this.activeIsImported && this.materialMode === 'pbr') {
      this.applyMaterial(asset.material);
    } else if (this.activeIsImported && this.materialMode === 'pbr') {
      this.applyImportedWireframe(asset.material.wireframe);
    }
    this.refreshHelpers();
    this.requestRender();
  }

  private indexSceneHierarchy(root: THREE.Object3D): SceneHierarchyNode[] {
    this.nodeById.clear();
    this.selectedNodeId = null;
    let counter = 0;

    const build = (obj: THREE.Object3D, fallbackLabel: string): SceneHierarchyNode => {
      const id = `node_${++counter}`;
      obj.userData.__hierarchyId = id;
      this.nodeById.set(id, obj);

      let triCount = 0;
      if (obj instanceof THREE.Mesh) {
        const geo = obj.geometry as THREE.BufferGeometry | undefined;
        if (geo?.index) triCount = Math.round(geo.index.count / 3);
        else if (geo?.getAttribute('position')) {
          triCount = Math.round(geo.getAttribute('position').count / 3);
        }
      }

      const children = obj.children.map((child, idx) =>
        build(child, child instanceof THREE.Mesh ? `Part_${idx + 1}` : `Group_${idx + 1}`)
      );

      return {
        id,
        name: obj.name?.trim() || fallbackLabel,
        type: obj instanceof THREE.Mesh ? 'Mesh' : obj instanceof THREE.Group ? 'Group' : 'Object3D',
        visible: obj.visible,
        triangleCount: triCount,
        children,
      };
    };

    if (root.children.length > 0 && !root.name) {
      return root.children.map((c, idx) => build(c, `Part_${idx + 1}`));
    }
    return [build(root, 'Model')];
  }

  private clearActiveModel(): void {
    this.nodeById.clear();
    this.selectedNodeId = null;
    this.originalMaterials.clear();
    this.unlitMaterials.forEach((mats) => {
      const arr = Array.isArray(mats) ? mats : [mats];
      arr.forEach((m) => m.dispose());
    });
    this.unlitMaterials.clear();

    if (this.activeGroup) {
      this.transformControls.detach();
      this.scene.remove(this.activeGroup);
      this.disposeGroup(this.activeGroup, this.activeIsImported);
      this.activeGroup = null;
      this.activeModelInner = null;
      this.activeLoadedKey = null;
      this.activeIsImported = false;
    }
  }

  private async parseImportedModel(
    buffer: ArrayBuffer,
    ext: string
  ): Promise<THREE.Object3D> {
    let root: THREE.Object3D;
    if (ext === 'obj') {
      const text = new TextDecoder().decode(buffer);
      const loader = new OBJLoader();
      root = loader.parse(text);
    } else {
      const loader = new GLTFLoader();
      const input: ArrayBuffer | string =
        ext === 'gltf' ? new TextDecoder().decode(buffer) : buffer.slice(0);
      root = await new Promise<THREE.Object3D>((resolve, reject) => {
        loader.parse(
          input,
          '',
          (gltf) => resolve(gltf.scene),
          (err) =>
            reject(err instanceof Error ? err : new Error('Invalid GLTF/GLB data'))
        );
      });
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

    return root;
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
    // 1. Bounding box helper
    if (this.boundingBoxHelper) {
      this.scene.remove(this.boundingBoxHelper);
      this.boundingBoxHelper.dispose();
      this.boundingBoxHelper = null;
    }

    const target =
      (this.selectedNodeId ? this.nodeById.get(this.selectedNodeId) : null) ??
      this.activeGroup;

    if (this.showBoundingBox && target) {
      target.updateMatrixWorld(true);
      _tempBox.setFromObject(target);
      if (!_tempBox.isEmpty()) {
        const color = this.selectedNodeId ? 0xf59e0b : 0x38bdf8;
        this.boundingBoxHelper = new THREE.Box3Helper(_tempBox.clone(), color);
        this.scene.add(this.boundingBoxHelper);
      }
    }

    // 2. Pivot helper
    if (this.showPivot && this.activeGroup) {
      this.pivotGroup.visible = true;
      this.pivotGroup.position.copy(this.activeGroup.position);
      this.pivotGroup.rotation.copy(this.activeGroup.rotation);
    } else {
      this.pivotGroup.visible = false;
    }

    // 3. Collision volume proxy
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

  public applyTransform(t: AssetTransform): void {
    if (!this.activeGroup) return;
    this.activeGroup.position.set(t.position.x, t.position.y, t.position.z);
    this.activeGroup.rotation.set(
      THREE.MathUtils.degToRad(t.rotation.x),
      THREE.MathUtils.degToRad(t.rotation.y),
      THREE.MathUtils.degToRad(t.rotation.z)
    );
    this.activeGroup.scale.set(
      Math.max(0.05, t.scale.x),
      Math.max(0.05, t.scale.y),
      Math.max(0.05, t.scale.z)
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
