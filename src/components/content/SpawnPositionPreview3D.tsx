import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { Compass, Crosshair, Move, RotateCw, Maximize2 } from 'lucide-react';
import { getFileExtension, parseAndValidateWoa3dContent } from '@/src/core/assets/assetPipeline';
import { getAssetBlobRecord } from '@/src/core/storage/modRepository';
import { useI18n } from '@/src/i18n';
import {
  AssetPresetKind,
  ContentSpawnConfig,
  ModAsset,
  SpawnVec3,
  WorldSpawnContentKind,
} from '@/src/types/mod';

interface SpawnPositionPreview3DProps {
  kind: WorldSpawnContentKind;
  modelPath?: string;
  footprint?: { width: number; height: number; depth: number };
  assets: ModAsset[];
  spawnConfig: ContentSpawnConfig;
  activeLocationIndex: number;
  onSelectLocation: (index: number) => void;
  onChangeTransform: (
    index: number,
    patch: { position: SpawnVec3; rotation: SpawnVec3; scale: SpawnVec3 }
  ) => void;
}

type PreviewGizmoMode = 'translate' | 'rotate' | 'scale';

function roundPreviewVal(val: number, decimals = 3): number {
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(val * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function buildPresetPreviewMesh(
  preset: AssetPresetKind,
  kind: WorldSpawnContentKind,
  footprint?: { width: number; height: number; depth: number },
  tintHex?: string
): THREE.Group {
  const group = new THREE.Group();
  const baseColor = tintHex || (
    kind === 'npc'
      ? '#38bdf8'
      : kind === 'monster'
        ? '#f97316'
        : kind === 'weapon'
          ? '#a855f7'
          : kind === 'armor'
            ? '#64748b'
            : kind === 'building'
              ? '#eab308'
              : kind === 'world_object'
                ? '#14b8a6'
                : '#22c55e'
  );
  const primaryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor),
    roughness: 0.45,
    metalness: 0.25,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e2e8f0'),
    roughness: 0.35,
    metalness: 0.45,
  });

  if (preset === 'relic-sword' || kind === 'weapon') {
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.38, 8), accentMat);
    hilt.position.set(0, 0.19, 0);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.07, 0.12), accentMat);
    guard.position.set(0, 0.4, 0);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.05, 4), primaryMat);
    blade.position.set(0, 0.94, 0);
    group.add(hilt, guard, blade);
  } else if (kind === 'npc' || kind === 'monster' || preset === 'clockwork-sentinel') {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, kind === 'monster' ? 0.85 : 0.72, 6, 12),
      primaryMat
    );
    body.position.set(0, 0.75, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), accentMat);
    head.position.set(0, 1.56, 0);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), accentMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.56, 0.26);
    group.add(body, head, nose);
  } else if (kind === 'building') {
    const w = Math.max(1, Math.min(24, footprint?.width ?? 6));
    const h = Math.max(1, Math.min(18, footprint?.height ?? 4.5));
    const d = Math.max(1, Math.min(24, footprint?.depth ?? 6));
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.7, d), primaryMat);
    walls.position.set(0, h * 0.35, 0);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.45, 4),
      accentMat
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, h * 0.7 + h * 0.225, 0);
    group.add(walls, roof);
  } else if (preset === 'crystal-obelisk') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 1.3, 6), primaryMat);
    shaft.position.set(0, 0.65, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 6), accentMat);
    tip.position.set(0, 1.52, 0);
    group.add(shaft, tip);
  } else if (preset === 'frontier-crate') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), primaryMat);
    crate.position.set(0, 0.5, 0);
    group.add(crate);
  } else {
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.16, 8), accentMat);
    pedestal.position.set(0, 0.08, 0);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), primaryMat);
    gem.position.set(0, 0.58, 0);
    group.add(pedestal, gem);
  }

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return group;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m?.dispose());
    }
  });
}

export const SpawnPositionPreview3D: React.FC<SpawnPositionPreview3DProps> = ({
  kind,
  modelPath,
  footprint,
  assets,
  spawnConfig,
  activeLocationIndex,
  onSelectLocation,
  onChangeTransform,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [gizmoMode, setGizmoMode] = useState<PreviewGizmoMode>('translate');
  const [contextLost, setContextLost] = useState(false);

  const onSelectLocationRef = useRef(onSelectLocation);
  onSelectLocationRef.current = onSelectLocation;
  const onChangeTransformRef = useRef(onChangeTransform);
  onChangeTransformRef.current = onChangeTransform;
  const activeIdxRef = useRef(activeLocationIndex);
  activeIdxRef.current = activeLocationIndex;

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    orbit: OrbitControls;
    transformControls: TransformControls;
    activeRoot: THREE.Group;
    modelHolder: THREE.Group;
    markersGroup: THREE.Group;
    areaGroup: THREE.Group;
    offsetLine: THREE.Line;
    grid: THREE.GridHelper;
    dragging: boolean;
    focusOnSpawn: () => void;
    focusOnOrigin: () => void;
    setViewPreset: (preset: 'top' | 'iso') => void;
  } | null>(null);

  const matchedAsset = React.useMemo(() => {
    const clean = (modelPath ?? '').trim().toLowerCase();
    if (!clean) return null;
    return (
      assets.find(
        (a) =>
          a.type === '3d-model' &&
          (a.path.trim().toLowerCase() === clean ||
            a.name.trim().toLowerCase() === clean)
      ) ?? null
    );
  }, [assets, modelPath]);

  const activeLocation = spawnConfig.locations[activeLocationIndex] ?? spawnConfig.locations[0];

  // Initialize Three.js scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'default',
      });
    } catch {
      setContextLost(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(new THREE.Color('#0B101B'), 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#0B101B', 45, 220);

    const camera = new THREE.PerspectiveCamera(
      48,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      500
    );
    camera.position.set(10, 8, 12);

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.0);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(14, 24, 12);
    scene.add(key);

    const grid = new THREE.GridHelper(60, 60, 0x334155, 0x1e293b);
    scene.add(grid);

    // Origin (0,0,0) beacon + axes
    const axes = new THREE.AxesHelper(3.5);
    scene.add(axes);

    const originRingGeo = new THREE.RingGeometry(0.45, 0.58, 28);
    originRingGeo.rotateX(-Math.PI / 2);
    const originRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const originRing = new THREE.Mesh(originRingGeo, originRingMat);
    originRing.position.set(0, 0.015, 0);
    scene.add(originRing);

    const activeRoot = new THREE.Group();
    const modelHolder = new THREE.Group();
    activeRoot.add(modelHolder);
    scene.add(activeRoot);

    const markersGroup = new THREE.Group();
    scene.add(markersGroup);

    const areaGroup = new THREE.Group();
    scene.add(areaGroup);

    const offsetGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0, 0.05, 0),
    ]);
    const offsetMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.4,
      gapSize: 0.25,
      transparent: true,
      opacity: 0.85,
    });
    const offsetLine = new THREE.Line(offsetGeo, offsetMat);
    scene.add(offsetLine);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxDistance = 240;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode('translate');
    transformControls.setSize(0.8);
    transformControls.attach(activeRoot);
    scene.add(transformControls.getHelper());

    const state = {
      renderer,
      scene,
      camera,
      orbit,
      transformControls,
      activeRoot,
      modelHolder,
      markersGroup,
      areaGroup,
      offsetLine,
      grid,
      dragging: false,
      focusOnSpawn: () => {
        const target = activeRoot.position.clone();
        const span = new THREE.Box3().setFromObject(modelHolder);
        const size = span.isEmpty()
          ? new THREE.Vector3(2, 2, 2)
          : span.getSize(new THREE.Vector3());
        const dist = Math.max(5.5, size.length() * 2.2);
        orbit.target.copy(target);
        camera.position.set(target.x + dist * 0.75, target.y + dist * 0.55, target.z + dist * 0.75);
        orbit.update();
      },
      focusOnOrigin: () => {
        orbit.target.set(0, 0, 0);
        camera.position.set(10, 8, 12);
        orbit.update();
      },
      setViewPreset: (preset: 'top' | 'iso') => {
        const target = activeRoot.position.clone();
        orbit.target.copy(target);
        if (preset === 'top') {
          camera.position.set(target.x, target.y + 18, target.z + 0.01);
        } else {
          camera.position.set(target.x + 9, target.y + 7, target.z + 10);
        }
        orbit.update();
      },
    };
    sceneRef.current = state;

    const handleDragChange = (event: { value: unknown }) => {
      const isDragging = Boolean(event.value);
      state.dragging = isDragging;
      orbit.enabled = !isDragging;
      if (!isDragging) {
        onChangeTransformRef.current(activeIdxRef.current, {
          position: {
            x: roundPreviewVal(activeRoot.position.x, 3),
            y: roundPreviewVal(activeRoot.position.y, 3),
            z: roundPreviewVal(activeRoot.position.z, 3),
          },
          rotation: {
            x: roundPreviewVal(THREE.MathUtils.radToDeg(activeRoot.rotation.x), 2),
            y: roundPreviewVal(THREE.MathUtils.radToDeg(activeRoot.rotation.y), 2),
            z: roundPreviewVal(THREE.MathUtils.radToDeg(activeRoot.rotation.z), 2),
          },
          scale: {
            x: Math.max(0.01, roundPreviewVal(activeRoot.scale.x, 3)),
            y: Math.max(0.01, roundPreviewVal(activeRoot.scale.y, 3)),
            z: Math.max(0.01, roundPreviewVal(activeRoot.scale.z, 3)),
          },
        });
      }
    };

    const handleObjectChange = () => {
      if (!state.dragging) return;
      onChangeTransformRef.current(activeIdxRef.current, {
        position: {
          x: roundPreviewVal(activeRoot.position.x, 3),
          y: roundPreviewVal(activeRoot.position.y, 3),
          z: roundPreviewVal(activeRoot.position.z, 3),
        },
        rotation: {
          x: roundPreviewVal(THREE.MathUtils.radToDeg(activeRoot.rotation.x), 2),
          y: roundPreviewVal(THREE.MathUtils.radToDeg(activeRoot.rotation.y), 2),
          z: roundPreviewVal(THREE.MathUtils.radToDeg(activeRoot.rotation.z), 2),
        },
        scale: {
          x: Math.max(0.01, roundPreviewVal(activeRoot.scale.x, 3)),
          y: Math.max(0.01, roundPreviewVal(activeRoot.scale.y, 3)),
          z: Math.max(0.01, roundPreviewVal(activeRoot.scale.z, 3)),
        },
      });
    };

    transformControls.addEventListener('dragging-changed', handleDragChange);
    transformControls.addEventListener('objectChange', handleObjectChange);

    // Click inactive marker spheres to switch active spawn location
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (state.dragging) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markersGroup.children, true);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (typeof obj.userData?.locationIndex === 'number') {
            onSelectLocationRef.current(obj.userData.locationIndex);
            return;
          }
          obj = obj.parent;
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const observer = new ResizeObserver(() => {
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    observer.observe(container);

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      transformControls.removeEventListener('dragging-changed', handleDragChange);
      transformControls.removeEventListener('objectChange', handleObjectChange);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      transformControls.dispose();
      orbit.dispose();
      disposeObjectTree(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []);

  // Sync gizmo mode
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;
    sc.transformControls.setMode(gizmoMode);
  }, [gizmoMode]);

  // Load 3D entity model into modelHolder
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;
    let cancelled = false;

    const clearHolder = () => {
      while (sc.modelHolder.children.length > 0) {
        const child = sc.modelHolder.children[0];
        sc.modelHolder.remove(child);
        disposeObjectTree(child);
      }
    };

    const loadPreviewModel = async () => {
      clearHolder();
      let loadedRoot: THREE.Object3D | null = null;

      if (matchedAsset?.blobKey) {
        try {
          const rec = await getAssetBlobRecord(matchedAsset.blobKey);
          if (cancelled) return;
          if (rec) {
            const ext = getFileExtension(matchedAsset.path);
            if (ext === 'woa3d') {
              const text = new TextDecoder().decode(rec.data);
              const parsed = parseAndValidateWoa3dContent(text);
              loadedRoot = buildPresetPreviewMesh(
                parsed.preset ?? matchedAsset.preset ?? 'beacon-pedestal',
                kind,
                footprint,
                parsed.material?.color
              );
            } else if (ext === 'obj') {
              const text = new TextDecoder().decode(rec.data);
              loadedRoot = new OBJLoader().parse(text);
            } else if (ext === 'glb' || ext === 'gltf') {
              const loader = new GLTFLoader();
              const input: ArrayBuffer | string =
                ext === 'gltf' ? new TextDecoder().decode(rec.data) : rec.data.slice(0);
              const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
                loader.parse(
                  input,
                  '',
                  (res) => resolve({ scene: res.scene }),
                  (err) => reject(err)
                );
              });
              if (cancelled) return;
              loadedRoot = gltf.scene;
            }
          }
        } catch {
          loadedRoot = null;
        }
      }

      if (!loadedRoot) {
        loadedRoot = buildPresetPreviewMesh(
          matchedAsset?.preset ?? 'beacon-pedestal',
          kind,
          footprint
        );
      }

      if (cancelled) {
        disposeObjectTree(loadedRoot);
        return;
      }

      // Normalize pivot to bottom-center so Y corresponds cleanly to ground coordinate
      loadedRoot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(loadedRoot);
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        if (maxDim > 16 || maxDim < 0.35) {
          const norm = 2.0 / maxDim;
          loadedRoot.scale.multiplyScalar(norm);
          loadedRoot.updateMatrixWorld(true);
          box.setFromObject(loadedRoot);
        }
        const center = box.getCenter(new THREE.Vector3());
        loadedRoot.position.x -= center.x;
        loadedRoot.position.z -= center.z;
        loadedRoot.position.y -= box.min.y;
      }

      sc.modelHolder.add(loadedRoot);
    };

    void loadPreviewModel();
    return () => {
      cancelled = true;
    };
  }, [matchedAsset, kind, footprint?.width, footprint?.height, footprint?.depth]);

  // Sync active location transform, markers, origin line, and random-area bounds
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;

    if (activeLocation && !sc.dragging) {
      const px = Number.isFinite(activeLocation.position.x) ? activeLocation.position.x : 0;
      const py = Number.isFinite(activeLocation.position.y) ? activeLocation.position.y : 0;
      const pz = Number.isFinite(activeLocation.position.z) ? activeLocation.position.z : 0;
      const rx = Number.isFinite(activeLocation.rotation.x) ? activeLocation.rotation.x : 0;
      const ry = Number.isFinite(activeLocation.rotation.y) ? activeLocation.rotation.y : 0;
      const rz = Number.isFinite(activeLocation.rotation.z) ? activeLocation.rotation.z : 0;
      const sx = Number.isFinite(activeLocation.scale.x) && activeLocation.scale.x > 0 ? activeLocation.scale.x : 1;
      const sy = Number.isFinite(activeLocation.scale.y) && activeLocation.scale.y > 0 ? activeLocation.scale.y : 1;
      const sz = Number.isFinite(activeLocation.scale.z) && activeLocation.scale.z > 0 ? activeLocation.scale.z : 1;

      sc.activeRoot.position.set(px, py, pz);
      sc.activeRoot.rotation.set(
        THREE.MathUtils.degToRad(rx),
        THREE.MathUtils.degToRad(ry),
        THREE.MathUtils.degToRad(rz)
      );
      sc.activeRoot.scale.set(sx, sy, sz);
      sc.activeRoot.visible = spawnConfig.enabled && activeLocation.enabled;
      sc.transformControls.enabled = spawnConfig.enabled && activeLocation.enabled;
      sc.transformControls.getHelper().visible = spawnConfig.enabled && activeLocation.enabled;

      // Update offset dashed line from (0,0,0) to active spawn location
      const posAttr = sc.offsetLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.setXYZ(0, 0, 0.04, 0);
      posAttr.setXYZ(1, px, py + 0.04, pz);
      posAttr.needsUpdate = true;
      sc.offsetLine.computeLineDistances();
      sc.offsetLine.visible = px !== 0 || py !== 0 || pz !== 0;

      // Keep grid centered loosely around active coordinate so distant coordinates always show floor context
      const snapX = Math.round(px / 10) * 10;
      const snapZ = Math.round(pz / 10) * 10;
      sc.grid.position.set(snapX, 0, snapZ);
    }

    // Rebuild markers for all locations
    while (sc.markersGroup.children.length > 0) {
      const child = sc.markersGroup.children[0];
      sc.markersGroup.remove(child);
      disposeObjectTree(child);
    }

    spawnConfig.locations.forEach((loc, idx) => {
      if (idx === activeLocationIndex) return;
      const px = Number.isFinite(loc.position.x) ? loc.position.x : 0;
      const py = Number.isFinite(loc.position.y) ? loc.position.y : 0;
      const pz = Number.isFinite(loc.position.z) ? loc.position.z : 0;
      const markerGroup = new THREE.Group();
      markerGroup.userData = { locationIndex: idx };
      markerGroup.position.set(px, py, pz);

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 12, 10),
        new THREE.MeshBasicMaterial({
          color: loc.enabled ? 0x94a3b8 : 0x475569,
          transparent: true,
          opacity: loc.enabled ? 0.85 : 0.45,
        })
      );
      sphere.position.set(0, 0.35, 0);
      sphere.userData = { locationIndex: idx };

      const ringGeo = new THREE.RingGeometry(0.4, 0.52, 20);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: loc.enabled ? 0x94a3b8 : 0x475569,
          side: THREE.DoubleSide,
        })
      );
      ring.position.set(0, 0.02, 0);
      ring.userData = { locationIndex: idx };

      markerGroup.add(sphere, ring);
      sc.markersGroup.add(markerGroup);
    });

    // Rebuild random area wireframe box if mode === 'random_area'
    while (sc.areaGroup.children.length > 0) {
      const child = sc.areaGroup.children[0];
      sc.areaGroup.remove(child);
      disposeObjectTree(child);
    }

    if (spawnConfig.mode === 'random_area' && activeLocation?.area) {
      const a = activeLocation.area;
      const minX = Number.isFinite(a.minX) ? a.minX : 0;
      const maxX = Number.isFinite(a.maxX) ? a.maxX : minX + 1;
      const minY = Number.isFinite(a.minY) ? a.minY : 0;
      const maxY = Number.isFinite(a.maxY) ? a.maxY : minY + 1;
      const minZ = Number.isFinite(a.minZ) ? a.minZ : 0;
      const maxZ = Number.isFinite(a.maxZ) ? a.maxZ : minZ + 1;

      const w = Math.max(0.2, Math.abs(maxX - minX));
      const h = Math.max(0.2, Math.abs(maxY - minY));
      const d = Math.max(0.2, Math.abs(maxZ - minZ));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const cz = (minZ + maxZ) / 2;

      const boxGeo = new THREE.BoxGeometry(w, h, d);
      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9 })
      );
      wire.position.set(cx, cy, cz);
      const fill = new THREE.Mesh(
        boxGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
        })
      );
      fill.position.set(cx, cy, cz);
      sc.areaGroup.add(wire, fill);
    }
  }, [spawnConfig, activeLocation, activeLocationIndex]);

  // Auto-focus when switching selected location index
  useEffect(() => {
    sceneRef.current?.focusOnSpawn();
  }, [activeLocationIndex]);

  return (
    <div className="relative h-72 sm:h-80 w-full rounded-md border border-slate-300 dark:border-white/10 bg-[#0B101B] overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {contextLost && (
        <div className="absolute inset-0 bg-[#0B101B]/95 flex items-center justify-center p-4 text-center">
          <p className="text-xs text-slate-300 max-w-xs">
            {t('spawnEditor.previewUnavailable')}
          </p>
        </div>
      )}

      {/* Top Toolbar Overlay */}
      <div
        dir="ltr"
        className="absolute top-2 start-2 end-2 flex flex-wrap items-center justify-between gap-2 pointer-events-none"
      >
        <div className="pointer-events-auto inline-flex items-center gap-0.5 p-0.5 rounded border border-white/15 bg-[#0E131D]/90 backdrop-blur-xs">
          {(
            [
              { id: 'translate', label: t('spawnEditor.gizmoMove'), icon: <Move className="w-3 h-3" /> },
              { id: 'rotate', label: t('spawnEditor.gizmoRotate'), icon: <RotateCw className="w-3 h-3" /> },
              { id: 'scale', label: t('spawnEditor.gizmoScale'), icon: <Maximize2 className="w-3 h-3" /> },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setGizmoMode(btn.id)}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                gizmoMode === btn.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {btn.icon}
              <span>{btn.label}</span>
            </button>
          ))}
        </div>

        <div className="pointer-events-auto inline-flex items-center gap-1 p-0.5 rounded border border-white/15 bg-[#0E131D]/90 backdrop-blur-xs">
          <button
            type="button"
            onClick={() => sceneRef.current?.focusOnSpawn()}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10 rounded"
            title={t('spawnEditor.focusSpawn')}
          >
            <Crosshair className="w-3 h-3 text-blue-400" />
            <span>{t('spawnEditor.focusSpawn')}</span>
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.focusOnOrigin()}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 rounded"
            title={t('spawnEditor.focusOrigin')}
          >
            <Compass className="w-3 h-3 text-cyan-400" />
            <span>(0,0,0)</span>
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.setViewPreset('top')}
            className="px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 rounded"
          >
            {t('spawnEditor.viewTop')}
          </button>
          <button
            type="button"
            onClick={() => sceneRef.current?.setViewPreset('iso')}
            className="px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 rounded"
          >
            {t('spawnEditor.viewIso')}
          </button>
        </div>
      </div>

      {/* Bottom Readout Overlay */}
      {activeLocation && (
        <div
          dir="ltr"
          className="pointer-events-none absolute bottom-2 start-2 end-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono tabular-nums"
        >
          <div className="px-2 py-1 rounded border border-white/10 bg-[#0E131D]/85 text-slate-300">
            {t('spawnEditor.axisLegendShort')}
          </div>
          <div className="px-2 py-1 rounded border border-white/10 bg-[#0E131D]/85 text-slate-200">
            XYZ ({activeLocation.position.x}, {activeLocation.position.y}, {activeLocation.position.z})
            <span className="text-slate-500 mx-1.5">·</span>
            ROT ({activeLocation.rotation.x}°, {activeLocation.rotation.y}°, {activeLocation.rotation.z}°)
            <span className="text-slate-500 mx-1.5">·</span>
            SCL ({activeLocation.scale.x}, {activeLocation.scale.y}, {activeLocation.scale.z})
          </div>
        </div>
      )}
    </div>
  );
};
