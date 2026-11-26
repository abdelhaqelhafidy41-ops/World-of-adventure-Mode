import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Axis3d,
  Box,
  BoxSelect,
  Check,
  ChevronsDown,
  ChevronsUp,
  ClipboardPaste,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  FileText,
  FlipHorizontal2,
  FolderOpen,
  FolderPlus,
  Gauge,
  Grid,
  Image as ImageIcon,
  Layers,
  Link2,
  Lock,
  Magnet,
  Maximize2,
  MoreVertical,
  MousePointer,
  Move,
  Palette,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scale,
  Scissors,
  Shield,
  Sliders,
  Sparkles,
  Square,
  Sun,
  Target,
  Trash2,
  Ungroup,
  Unlink,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuEntry,
  ContextMenuHeader,
} from '@/src/components/common/ContextMenu';
import { getAssetBlobRecord } from '@/src/core/storage/modRepository';
import {
  CameraPreset,
  ClipboardNodeEntry,
  ContextMenuRequestPayload,
  disposeClipboardNodeEntry,
  GizmoMode,
  ModelInspectionResult,
  ModPreviewEngine,
  NodeInspectionDetails,
} from '@/src/core/three/ModPreviewEngine';
import { useI18n } from '@/src/i18n';
import { usePlatform } from '@/src/platform';
import {
  AssetTransform,
  EditorSettings,
  ExtractedMaterialInfo,
  LightingPreset,
  MaterialPreviewMode,
  ModAsset,
  ModContentDatabase,
  ModelDimensions,
  SceneEditorState,
  SceneHierarchyNode,
} from '@/src/types/mod';

export interface Viewport3DHandle {
  setNodeVisibility: (nodeId: string, visible: boolean) => void;
  showAllNodes: () => void;
  focusNode: (nodeId: string | null) => void;
  openContextMenuAt: (
    clientX: number,
    clientY: number,
    nodeId: string | null
  ) => void;
  renameNode: (nodeId: string, newName: string) => void;
}

interface Viewport3DProps {
  asset: ModAsset | null;
  projectAssets?: ModAsset[];
  contents?: ModContentDatabase;
  settings: EditorSettings;
  hierarchy?: SceneHierarchyNode[];
  selectedNodeId: string | null;
  selectedNodeIds?: string[];
  selectionCleared?: boolean;
  selectedNodeName: string | null;
  showBounds: boolean;
  showCollision: boolean;
  showPivot: boolean;
  lightingPreset: LightingPreset;
  materialMode: MaterialPreviewMode;
  onToggleBounds: () => void;
  onToggleCollision: () => void;
  onTogglePivot: () => void;
  onChangeLighting: (preset: LightingPreset) => void;
  onChangeMaterialMode: (mode: MaterialPreviewMode) => void;
  onSelectHierarchyNode?: (nodeId: string | null) => void;
  onSelectNodes?: (
    nodeIds: string[],
    primaryId: string | null,
    cleared?: boolean
  ) => void;
  onUpdateSettings: (patch: Partial<EditorSettings>) => void;
  onUpdateAsset?: (assetId: string, patch: Partial<ModAsset>) => void;
  onUpdateContents?: (next: ModContentDatabase) => void;
  onRenameAsset?: (assetId: string, newName: string) => void;
  onDuplicateAsset?: (assetId: string) => Promise<void>;
  onDeleteAsset?: (assetId: string) => Promise<void>;
  onReplaceAsset?: (assetId: string, file: File) => Promise<void>;
  onRevealAssetInBrowser?: (assetId: string) => void;
  onOpenTextureAsset?: (assetId: string) => void;
  onOpenInspector?: () => void;
  onTransformChange: (transform: AssetTransform) => void;
  onModelInspected: (info: ModelInspectionResult) => void;
  onHierarchyChanged?: (
    hierarchy: SceneHierarchyNode[],
    sceneState: SceneEditorState,
    stats: {
      dimensions: ModelDimensions;
      triangleEstimate: number;
      materials: ExtractedMaterialInfo[];
    }
  ) => void;
  onLog: (
    level: 'info' | 'warn' | 'error' | 'success',
    source: string,
    msg: string
  ) => void;
}

type EditorClipboard =
  | { kind: 'nodes'; entries: ClipboardNodeEntry[] }
  | { kind: 'asset'; assetId: string; assetName: string };

type ActiveModalState =
  | null
  | {
      kind: 'rename';
      targetType: 'root' | 'node';
      nodeId: string | null;
      initialName: string;
    }
  | {
      kind: 'info';
      details: NodeInspectionDetails;
    }
  | {
      kind: 'material';
      nodeId: string | null;
      name: string;
      color: string;
      roughness: number;
      metalness: number;
      emissive: string;
      emissiveIntensity: number;
      wireframe: boolean;
    }
  | {
      kind: 'collection';
      targetType: 'root' | 'nodes';
      nodeIds: string[];
      initial: string;
    }
  | { kind: 'assign-texture'; nodeId: string | null }
  | { kind: 'assign-material'; nodeId: string | null }
  | { kind: 'assign-content' }
  | { kind: 'assign-animation' }
  | { kind: 'confirm-delete-asset'; assetId: string; assetName: string };

function collectNodeCollections(nodes: SceneHierarchyNode[]): string[] {
  const set = new Set<string>();
  const walk = (arr: SceneHierarchyNode[]) => {
    for (const n of arr) {
      if (n.collection) set.add(n.collection);
      if (n.children.length > 0) walk(n.children);
    }
  };
  walk(nodes);
  return Array.from(set);
}

function hasAnyHiddenHierarchyNode(nodes: SceneHierarchyNode[]): boolean {
  return nodes.some((n) => !n.visible || hasAnyHiddenHierarchyNode(n.children));
}

export const Viewport3D = React.forwardRef<Viewport3DHandle, Viewport3DProps>(
  (
    {
      asset,
      projectAssets = [],
      contents,
      settings,
      hierarchy = [],
      selectedNodeId,
      selectedNodeIds = [],
      selectionCleared = false,
      selectedNodeName,
      showBounds,
      showCollision,
      showPivot,
      lightingPreset,
      materialMode,
      onToggleBounds,
      onToggleCollision,
      onTogglePivot,
      onChangeLighting,
      onChangeMaterialMode,
      onSelectHierarchyNode,
      onSelectNodes,
      onUpdateSettings,
      onUpdateAsset,
      onUpdateContents,
      onRenameAsset,
      onDuplicateAsset,
      onDeleteAsset,
      onReplaceAsset,
      onRevealAssetInBrowser,
      onOpenTextureAsset,
      onOpenInspector,
      onTransformChange,
      onModelInspected,
      onHierarchyChanged,
      onLog,
    },
    ref
  ) => {
    const { t } = useI18n();
    const platformInfo = usePlatform();
    const mountRef = useRef<HTMLDivElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const engineRef = useRef<ModPreviewEngine | null>(null);

    const transformCbRef = useRef(onTransformChange);
    const inspectedCbRef = useRef(onModelInspected);
    const hierarchyChangedCbRef = useRef(onHierarchyChanged);
    const nodeSelectCbRef = useRef(onSelectHierarchyNode);
    const nodesSelectCbRef = useRef(onSelectNodes);
    const selectedNodeIdRef = useRef<string | null>(selectedNodeId);
    const logCbRef = useRef(onLog);
    const tRef = useRef(t);

    const [gizmoMode, setGizmoMode] = useState<GizmoMode>('select');
    const [cameraPreset, setCameraPreset] = useState<CameraPreset>('perspective');
    const [autoRotate, setAutoRotate] = useState(false);
    const [contextLost, setContextLost] = useState(false);
    const [animations, setAnimations] = useState<string[]>([]);
    const [activeAnim, setActiveAnim] = useState<string | null>(null);

    const [clipboard, setClipboard] = useState<EditorClipboard | null>(null);
    const clipboardRef = useRef<EditorClipboard | null>(null);
    clipboardRef.current = clipboard;

    const [ctxMenu, setCtxMenu] = useState<{
      open: boolean;
      x: number;
      y: number;
      targetMode: 'root' | 'single' | 'multi' | 'empty';
      nodeIds: string[];
      primaryId: string | null;
    }>({
      open: false,
      x: 0,
      y: 0,
      targetMode: 'root',
      nodeIds: [],
      primaryId: null,
    });

    const [activeModal, setActiveModal] = useState<ActiveModalState>(null);
    const [renameInput, setRenameInput] = useState('');
    const [renameError, setRenameError] = useState<string | null>(null);
    const [collectionInput, setCollectionInput] = useState('');

    transformCbRef.current = onTransformChange;
    inspectedCbRef.current = onModelInspected;
    hierarchyChangedCbRef.current = onHierarchyChanged;
    nodeSelectCbRef.current = onSelectHierarchyNode;
    nodesSelectCbRef.current = onSelectNodes;
    selectedNodeIdRef.current = selectedNodeId;
    logCbRef.current = onLog;
    tRef.current = t;

    const effectiveSelectedIds = useMemo(
      () =>
        selectionCleared
          ? []
          : selectedNodeIds.length > 0
            ? selectedNodeIds
            : selectedNodeId
              ? [selectedNodeId]
              : [],
      [selectionCleared, selectedNodeIds, selectedNodeId]
    );

    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad/i.test(navigator.platform || '');
    const modKey = isMac ? '⌘' : 'Ctrl+';

    const dispatchSelection = useCallback(
      (nodeIds: string[], primaryId: string | null, cleared = false) => {
        if (nodesSelectCbRef.current) {
          nodesSelectCbRef.current(nodeIds, primaryId, cleared);
        } else {
          nodeSelectCbRef.current?.(primaryId);
        }
      },
      []
    );

    const openContextMenuFor = useCallback(
      (clientX: number, clientY: number, hitNodeId: string | null) => {
        const engine = engineRef.current;
        if (!engine || !asset || asset.type !== '3d-model') return;

        // Decide target mode from current selection + hit
        if (hitNodeId) {
          const currentIds = effectiveSelectedIds;
          const useIds = currentIds.includes(hitNodeId)
            ? currentIds
            : [hitNodeId];
          setCtxMenu({
            open: true,
            x: clientX,
            y: clientY,
            targetMode: useIds.length > 1 ? 'multi' : 'single',
            nodeIds: useIds,
            primaryId: hitNodeId,
          });
        } else if (effectiveSelectedIds.length > 0) {
          setCtxMenu({
            open: true,
            x: clientX,
            y: clientY,
            targetMode: effectiveSelectedIds.length > 1 ? 'multi' : 'single',
            nodeIds: effectiveSelectedIds,
            primaryId:
              selectedNodeId ?? effectiveSelectedIds[effectiveSelectedIds.length - 1],
          });
        } else if (selectionCleared) {
          setCtxMenu({
            open: true,
            x: clientX,
            y: clientY,
            targetMode: 'empty',
            nodeIds: [],
            primaryId: null,
          });
        } else {
          setCtxMenu({
            open: true,
            x: clientX,
            y: clientY,
            targetMode: 'root',
            nodeIds: [],
            primaryId: null,
          });
        }
      },
      [asset, effectiveSelectedIds, selectedNodeId, selectionCleared]
    );

    const openMenuRef = useRef<
      (req: ContextMenuRequestPayload) => void
    >(() => {});
    openMenuRef.current = (req: ContextMenuRequestPayload) => {
      openContextMenuFor(req.clientX, req.clientY, req.hitNodeId);
    };

    useImperativeHandle(ref, () => ({
      setNodeVisibility: (nodeId: string, visible: boolean) => {
        engineRef.current?.setNodeVisibility(nodeId, visible);
      },
      showAllNodes: () => {
        engineRef.current?.showAllNodes();
      },
      focusNode: (nodeId: string | null) => {
        engineRef.current?.focusOnNode(nodeId);
      },
      openContextMenuAt: (
        clientX: number,
        clientY: number,
        nodeId: string | null
      ) => {
        if (nodeId === null) {
          setCtxMenu({
            open: true,
            x: clientX,
            y: clientY,
            targetMode: 'root',
            nodeIds: [],
            primaryId: null,
          });
        } else {
          openContextMenuFor(clientX, clientY, nodeId);
        }
      },
      renameNode: (nodeId: string, newName: string) => {
        engineRef.current?.renameNode(nodeId, newName);
      },
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const engine = new ModPreviewEngine(container, {
        onTransformChange: (next) => transformCbRef.current(next),
        onModelInspected: (info) => inspectedCbRef.current(info),
        onHierarchyChanged: (nextHierarchy, sceneState, stats) => {
          hierarchyChangedCbRef.current?.(nextHierarchy, sceneState, stats);
        },
        onHierarchyNodeSelected: (nodeId, ids, cleared) => {
          dispatchSelection(ids, nodeId, cleared);
        },
        onContextMenuRequest: (req) => openMenuRef.current(req),
        onAnimationsDetected: (clips) => {
          setAnimations(clips);
          setActiveAnim(null);
        },
        onLongPress: () => engine.focusOnNode(selectedNodeIdRef.current ?? null),
        onLoadError: (msg) => logCbRef.current('error', '3D Preview', msg),
        onContextLost: () => {
          setContextLost(true);
          logCbRef.current('warn', '3D Preview', tRef.current('viewport.contextLostLog'));
        },
        onContextRestored: () => {
          setContextLost(false);
          logCbRef.current(
            'info',
            '3D Preview',
            tRef.current('viewport.contextRestoredLog')
          );
        },
      });
      engineRef.current = engine;

      return () => {
        if (clipboardRef.current?.kind === 'nodes') {
          clipboardRef.current.entries.forEach(disposeClipboardNodeEntry);
        }
        engine.dispose();
        engineRef.current = null;
      };
    }, [dispatchSelection]);

    useEffect(() => {
      engineRef.current?.setTheme(settings.theme);
    }, [settings.theme]);

    useEffect(() => {
      engineRef.current?.setLowPowerMode(settings.lowPowerMode);
    }, [settings.lowPowerMode]);

    useEffect(() => {
      engineRef.current?.setDisplayOptions({
        grid: settings.viewportGrid,
        axes: settings.viewportAxes,
        shadows: settings.showShadows,
      });
    }, [
      settings.viewportGrid,
      settings.viewportAxes,
      settings.showShadows,
      settings.lowPowerMode,
    ]);

    useEffect(() => {
      engineRef.current?.setSnapSettings(settings.snapToGrid, settings.gridStep);
    }, [settings.snapToGrid, settings.gridStep]);

    useEffect(() => {
      engineRef.current?.setLightingPreset(lightingPreset);
    }, [lightingPreset]);

    useEffect(() => {
      engineRef.current?.setMaterialPreviewMode(materialMode);
    }, [materialMode]);

    useEffect(() => {
      engineRef.current?.setVisualizationFlags({
        boundingBox: showBounds,
        pivot: showPivot,
        pivotMode: asset?.pivotMode ?? 'bottom-center',
        collision: showCollision,
        collisionConfig: asset?.collision ?? { shape: 'box', scale: 1, offsetY: 0 },
      });
    }, [showBounds, showPivot, showCollision, asset?.pivotMode, asset?.collision]);

    useEffect(() => {
      void engineRef.current?.loadAsset(asset);
    }, [asset]);

    useEffect(() => {
      engineRef.current?.selectNodes(
        effectiveSelectedIds,
        selectedNodeId,
        selectionCleared
      );
    }, [effectiveSelectedIds, selectedNodeId, selectionCleared]);

    useEffect(() => {
      engineRef.current?.setGizmoMode(gizmoMode);
    }, [gizmoMode]);

    useEffect(() => {
      engineRef.current?.setAutoRotate(autoRotate);
    }, [autoRotate]);

    const replaceClipboard = useCallback((next: EditorClipboard | null) => {
      setClipboard((prev) => {
        if (prev?.kind === 'nodes') {
          prev.entries.forEach(disposeClipboardNodeEntry);
        }
        return next;
      });
    }, []);

    // ---- Linked Mod Content Helpers ----
    const linkedModEntries = useMemo(() => {
      if (!asset || !contents) return [];
      const links: { kind: string; uid: string; label: string }[] = [];
      contents.weapons.forEach((w) => {
        if (w.model === asset.path)
          links.push({ kind: 'weapon', uid: w.uid, label: w.name });
      });
      contents.armor.forEach((a) => {
        if (a.model === asset.path)
          links.push({ kind: 'armor', uid: a.uid, label: a.name });
      });
      contents.npcs.forEach((n) => {
        if (n.model === asset.path)
          links.push({ kind: 'npc', uid: n.uid, label: n.name });
      });
      contents.monsters.forEach((m) => {
        if (m.model === asset.path)
          links.push({ kind: 'monster', uid: m.uid, label: m.name });
      });
      contents.buildings.forEach((b) => {
        if (b.model === asset.path)
          links.push({ kind: 'building', uid: b.uid, label: b.name });
      });
      (contents.worldObjects ?? []).forEach((w) => {
        if (w.model === asset.path)
          links.push({ kind: 'worldObject', uid: w.uid, label: w.name });
      });
      return links;
    }, [asset, contents]);

    const linkableContentCandidates = useMemo(() => {
      if (!contents) return [];
      const out: { kind: string; uid: string; label: string; currentModel: string }[] =
        [];
      contents.weapons.forEach((w) =>
        out.push({ kind: 'weapon', uid: w.uid, label: w.name, currentModel: w.model })
      );
      contents.armor.forEach((a) =>
        out.push({ kind: 'armor', uid: a.uid, label: a.name, currentModel: a.model })
      );
      contents.npcs.forEach((n) =>
        out.push({ kind: 'npc', uid: n.uid, label: n.name, currentModel: n.model })
      );
      contents.monsters.forEach((m) =>
        out.push({
          kind: 'monster',
          uid: m.uid,
          label: m.name,
          currentModel: m.model,
        })
      );
      contents.buildings.forEach((b) =>
        out.push({
          kind: 'building',
          uid: b.uid,
          label: b.name,
          currentModel: b.model,
        })
      );
      (contents.worldObjects ?? []).forEach((w) =>
        out.push({
          kind: 'worldObject',
          uid: w.uid,
          label: w.name,
          currentModel: w.model,
        })
      );
      return out;
    }, [contents]);

    const textureAssets = useMemo(
      () => projectAssets.filter((a) => a.type === 'texture'),
      [projectAssets]
    );

    const existingCollections = useMemo(() => {
      const set = new Set<string>();
      projectAssets.forEach((a) => {
        if (a.collection) set.add(a.collection);
      });
      collectNodeCollections(hierarchy).forEach((c) => set.add(c));
      return Array.from(set).sort();
    }, [projectAssets, hierarchy]);

    const anyHiddenInScene = useMemo(
      () => Boolean(asset?.hidden) || hasAnyHiddenHierarchyNode(hierarchy),
      [asset?.hidden, hierarchy]
    );

    // ---- Action Handlers ----
    const handleCopySelection = useCallback(
      (nodeIds: string[]) => {
        const engine = engineRef.current;
        if (!asset) return;
        if (nodeIds.length > 0 && engine) {
          const entries = engine.copyNodesToClipboard(nodeIds);
          if (entries.length > 0) {
            replaceClipboard({ kind: 'nodes', entries });
            onLog(
              'info',
              '3D Editor',
              t('ctx3d.logCopied', { count: entries.length })
            );
          }
        } else {
          replaceClipboard({
            kind: 'asset',
            assetId: asset.id,
            assetName: asset.name,
          });
          onLog('info', '3D Editor', t('ctx3d.logCopied', { count: 1 }));
        }
      },
      [asset, onLog, replaceClipboard, t]
    );

    const handleCutSelection = useCallback(
      (nodeIds: string[]) => {
        const engine = engineRef.current;
        if (!asset) return;
        if (nodeIds.length > 0 && engine) {
          const entries = engine.copyNodesToClipboard(nodeIds);
          if (entries.length > 0) {
            replaceClipboard({ kind: 'nodes', entries });
            engine.deleteNodes(nodeIds);
            dispatchSelection([], null, true);
            onLog(
              'info',
              '3D Editor',
              t('ctx3d.logCut', { count: entries.length })
            );
          }
        } else if (onDeleteAsset) {
          replaceClipboard({
            kind: 'asset',
            assetId: asset.id,
            assetName: asset.name,
          });
          setActiveModal({
            kind: 'confirm-delete-asset',
            assetId: asset.id,
            assetName: asset.name,
          });
        }
      },
      [asset, dispatchSelection, onDeleteAsset, onLog, replaceClipboard, t]
    );

    const handlePasteClipboard = useCallback(() => {
      const engine = engineRef.current;
      if (!clipboard || !asset) return;
      if (clipboard.kind === 'nodes' && engine) {
        const created = engine.pasteClipboardNodes(clipboard.entries);
        if (created.length > 0) {
          dispatchSelection(created, created[created.length - 1], false);
          onLog('success', '3D Editor', t('ctx3d.logPasted', { count: created.length }));
        }
      } else if (clipboard.kind === 'asset' && onDuplicateAsset) {
        void onDuplicateAsset(clipboard.assetId);
        onLog('success', '3D Editor', t('ctx3d.logPasted', { count: 1 }));
      }
    }, [asset, clipboard, dispatchSelection, onDuplicateAsset, onLog, t]);

    const handleDuplicateSelection = useCallback(
      (nodeIds: string[]) => {
        const engine = engineRef.current;
        if (!asset) return;
        if (nodeIds.length > 0 && engine) {
          const created = engine.duplicateNodes(nodeIds, false);
          if (created.length > 0) {
            dispatchSelection(created, created[created.length - 1], false);
            onLog('info', '3D Editor', t('ctx3d.logDuplicated'));
          }
        } else if (onDuplicateAsset) {
          void onDuplicateAsset(asset.id);
        }
      },
      [asset, dispatchSelection, onDuplicateAsset, onLog, t]
    );

    const handleDeleteSelection = useCallback(
      (nodeIds: string[]) => {
        const engine = engineRef.current;
        if (!asset) return;
        if (nodeIds.length > 0 && engine) {
          const ok = engine.deleteNodes(nodeIds);
          if (ok) {
            dispatchSelection([], null, true);
            onLog('warn', '3D Editor', t('ctx3d.logDeleted'));
          }
        } else if (onDeleteAsset) {
          setActiveModal({
            kind: 'confirm-delete-asset',
            assetId: asset.id,
            assetName: asset.name,
          });
        }
      },
      [asset, dispatchSelection, onDeleteAsset, onLog, t]
    );

    const handleOpenRename = useCallback(
      (targetType: 'root' | 'node', nodeId: string | null) => {
        if (!asset) return;
        let currentName = asset.name;
        if (targetType === 'node' && nodeId) {
          const info = engineRef.current?.getNodeInspection(nodeId);
          currentName = info?.name ?? selectedNodeName ?? 'Object';
        }
        setRenameInput(currentName);
        setRenameError(null);
        setActiveModal({
          kind: 'rename',
          targetType,
          nodeId,
          initialName: currentName,
        });
      },
      [asset, selectedNodeName]
    );

    const handleSubmitRename = (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!activeModal || activeModal.kind !== 'rename' || !asset) return;
      const trimmed = renameInput.trim();
      if (!trimmed) {
        setRenameError(t('ctx3d.renameEmptyError'));
        return;
      }
      if (activeModal.targetType === 'root') {
        onRenameAsset?.(asset.id, trimmed);
        onLog(
          'info',
          '3D Editor',
          t('ctx3d.logRenamed', { from: activeModal.initialName, to: trimmed })
        );
      } else if (activeModal.nodeId) {
        const finalName =
          engineRef.current?.renameNode(activeModal.nodeId, trimmed) ?? trimmed;
        onLog(
          'info',
          '3D Editor',
          t('ctx3d.logRenamed', { from: activeModal.initialName, to: finalName })
        );
      }
      setActiveModal(null);
    };

    const handleSubmitMaterial = (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeModal || activeModal.kind !== 'material') return;
      engineRef.current?.updateNodeMaterial(activeModal.nodeId, {
        name: activeModal.name,
        color: activeModal.color,
        roughness: activeModal.roughness,
        metalness: activeModal.metalness,
        emissive: activeModal.emissive,
        emissiveIntensity: activeModal.emissiveIntensity,
        wireframe: activeModal.wireframe,
      });
      if (!activeModal.nodeId && asset && !asset.isImported && onUpdateAsset) {
        onUpdateAsset(asset.id, {
          material: {
            ...asset.material,
            color: activeModal.color,
            roughness: activeModal.roughness,
            metalness: activeModal.metalness,
            emissiveIntensity: activeModal.emissiveIntensity,
            wireframe: activeModal.wireframe,
          },
        });
      }
      setActiveModal(null);
    };

    const handleSubmitCollection = (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeModal || activeModal.kind !== 'collection') return;
      const col = collectionInput.trim();
      if (!col) return;
      if (activeModal.targetType === 'root' && asset && onUpdateAsset) {
        onUpdateAsset(asset.id, { collection: col });
      } else {
        engineRef.current?.setNodesCollection(activeModal.nodeIds, col);
      }
      setActiveModal(null);
    };

    const handleApplyTextureAsset = async (
      nodeId: string | null,
      texAsset: ModAsset
    ) => {
      if (!texAsset.blobKey || !engineRef.current) return;
      const rec = await getAssetBlobRecord(texAsset.blobKey);
      if (!rec) return;
      const blob = new Blob([rec.data], { type: texAsset.mimeType || 'image/png' });
      const ok = await engineRef.current.applyTextureToNode(
        nodeId,
        blob,
        texAsset.id,
        texAsset.name
      );
      if (ok) {
        onLog('success', '3D Editor', t('ctx3d.logTextureApplied', { name: texAsset.name }));
      }
      setActiveModal(null);
    };

    const handleLinkContentEntry = (kind: string, uid: string) => {
      if (!asset || !contents || !onUpdateContents) return;
      const next: ModContentDatabase = {
        ...contents,
        weapons: contents.weapons.map((w) =>
          kind === 'weapon' && w.uid === uid ? { ...w, model: asset.path } : w
        ),
        armor: contents.armor.map((a) =>
          kind === 'armor' && a.uid === uid ? { ...a, model: asset.path } : a
        ),
        npcs: contents.npcs.map((n) =>
          kind === 'npc' && n.uid === uid ? { ...n, model: asset.path } : n
        ),
        monsters: contents.monsters.map((m) =>
          kind === 'monster' && m.uid === uid ? { ...m, model: asset.path } : m
        ),
        buildings: contents.buildings.map((b) =>
          kind === 'building' && b.uid === uid ? { ...b, model: asset.path } : b
        ),
        worldObjects: (contents.worldObjects ?? []).map((w) =>
          kind === 'worldObject' && w.uid === uid ? { ...w, model: asset.path } : w
        ),
      };
      const entry = linkableContentCandidates.find(
        (c) => c.kind === kind && c.uid === uid
      );
      onUpdateContents(next);
      onLog(
        'success',
        '3D Editor',
        t('ctx3d.logLinkedContent', { name: entry?.label ?? uid })
      );
      setActiveModal(null);
    };

    const handleUnlinkContentEntry = (kind: string, uid: string, label: string) => {
      if (!contents || !onUpdateContents) return;
      const next: ModContentDatabase = {
        ...contents,
        weapons: contents.weapons.map((w) =>
          kind === 'weapon' && w.uid === uid ? { ...w, model: '' } : w
        ),
        armor: contents.armor.map((a) =>
          kind === 'armor' && a.uid === uid ? { ...a, model: '' } : a
        ),
        npcs: contents.npcs.map((n) =>
          kind === 'npc' && n.uid === uid ? { ...n, model: '' } : n
        ),
        monsters: contents.monsters.map((m) =>
          kind === 'monster' && m.uid === uid ? { ...m, model: '' } : m
        ),
        buildings: contents.buildings.map((b) =>
          kind === 'building' && b.uid === uid ? { ...b, model: '' } : b
        ),
        worldObjects: (contents.worldObjects ?? []).map((w) =>
          kind === 'worldObject' && w.uid === uid ? { ...w, model: '' } : w
        ),
      };
      onUpdateContents(next);
      onLog('info', '3D Editor', t('ctx3d.logUnlinkedContent', { name: label }));
    };

    // ---- Keyboard Shortcuts inside 3D Viewport ----
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (!asset || asset.type !== '3d-model') return;
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName ?? '';
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target?.isContentEditable
        ) {
          return;
        }
        if (activeModal) return;

        const key = e.key.toLowerCase();
        const hasMod = e.ctrlKey || e.metaKey;

        if (hasMod && !e.altKey) {
          if (key === 'd') {
            e.preventDefault();
            handleDuplicateSelection(effectiveSelectedIds);
            return;
          }
          if (key === 'c') {
            e.preventDefault();
            handleCopySelection(effectiveSelectedIds);
            return;
          }
          if (key === 'x') {
            e.preventDefault();
            handleCutSelection(effectiveSelectedIds);
            return;
          }
          if (key === 'v') {
            e.preventDefault();
            handlePasteClipboard();
            return;
          }
        }

        if (!hasMod && !e.altKey) {
          if (e.key === 'F2') {
            e.preventDefault();
            if (effectiveSelectedIds.length === 1) {
              handleOpenRename('node', effectiveSelectedIds[0]);
            } else if (effectiveSelectedIds.length === 0 && !selectionCleared) {
              handleOpenRename('root', null);
            }
            return;
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
            if (!selectionCleared) {
              e.preventDefault();
              handleDeleteSelection(effectiveSelectedIds);
            }
            return;
          }
          if (key === 'f') {
            e.preventDefault();
            engineRef.current?.focusOnNodes(effectiveSelectedIds);
            return;
          }
          if (key === 'g') {
            e.preventDefault();
            setGizmoMode('translate');
            return;
          }
          if (key === 'r') {
            e.preventDefault();
            setGizmoMode('rotate');
            return;
          }
          if (key === 's') {
            e.preventDefault();
            setGizmoMode('scale');
            return;
          }
          if (e.key === 'Escape' && !ctxMenu.open) {
            dispatchSelection([], null, true);
          }
        }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [
      activeModal,
      asset,
      ctxMenu.open,
      dispatchSelection,
      effectiveSelectedIds,
      handleCopySelection,
      handleCutSelection,
      handleDeleteSelection,
      handleDuplicateSelection,
      handleOpenRename,
      handlePasteClipboard,
      selectionCleared,
    ]);

    // ---- Build Contextual Menu Entries ----
    const { menuHeader, menuItems } = useMemo<{
      menuHeader: ContextMenuHeader | undefined;
      menuItems: ContextMenuEntry[];
    }>(() => {
      if (!ctxMenu.open || !asset || asset.type !== '3d-model') {
        return { menuHeader: undefined, menuItems: [] };
      }
      const engine = engineRef.current;
      if (!engine) return { menuHeader: undefined, menuItems: [] };

      const mode = ctxMenu.targetMode;
      const targetIds = ctxMenu.nodeIds;
      const primaryId = ctxMenu.primaryId;

      if (mode === 'empty') {
        const items: ContextMenuEntry[] = [
          {
            id: 'select-root',
            label: t('ctx3d.selectRoot'),
            icon: <Box className="w-3.5 h-3.5 text-blue-400" />,
            onSelect: () => dispatchSelection([], null, false),
          },
          {
            id: 'select-all',
            label: t('ctx3d.selectAll'),
            icon: <Layers className="w-3.5 h-3.5" />,
            onSelect: () => {
              const allIds = engine.selectAllNodes();
              dispatchSelection(allIds, allIds[0] ?? null, allIds.length === 0);
            },
          },
        ];
        if (anyHiddenInScene) {
          items.push({
            id: 'show-all',
            label: t('ctx3d.showAll'),
            icon: <Eye className="w-3.5 h-3.5 text-emerald-500" />,
            onSelect: () => {
              if (asset.hidden && onUpdateAsset) onUpdateAsset(asset.id, { hidden: false });
              engine.showAllNodes();
            },
          });
        }
        if (clipboard) {
          items.push({ id: 'sep-paste', type: 'separator' });
          items.push({
            id: 'paste',
            label: t('ctx3d.paste'),
            shortcut: `${modKey}V`,
            icon: <ClipboardPaste className="w-3.5 h-3.5" />,
            onSelect: handlePasteClipboard,
          });
        }
        items.push({ id: 'sep-frame', type: 'separator' });
        items.push({
          id: 'frame-model',
          label: t('ctx3d.frameSelected'),
          shortcut: 'F',
          icon: <Maximize2 className="w-3.5 h-3.5" />,
          onSelect: () => engine.focusOnNode(null),
        });
        return {
          menuHeader: {
            title: asset.name,
            subtitle: t('ctx3d.rootLabel'),
          },
          menuItems: items,
        };
      }

      const isRoot = mode === 'root';
      const isSingle = mode === 'single';
      const isMulti = mode === 'multi';
      const primaryInfo = engine.getNodeInspection(isRoot ? null : primaryId);

      const isLocked = isRoot
        ? Boolean(asset.locked)
        : targetIds.some((id) => Boolean(engine.getNodeInspection(id)?.locked));
      const isHidden = isRoot
        ? Boolean(asset.hidden)
        : targetIds.every((id) => engine.getNodeInspection(id)?.visible === false);

      const header: ContextMenuHeader = isMulti
        ? {
            title: t('ctx3d.multiLabel', { count: targetIds.length }),
            subtitle: asset.name,
            badge: `${targetIds.length}`,
          }
        : isRoot
          ? {
              title: asset.name,
              subtitle: `${asset.format} · ${asset.modCategory ?? 'Item'}`,
              badge: isLocked ? t('ctx3d.lockedBadge') : t('ctx3d.rootLabel'),
            }
          : {
              title: primaryInfo?.name ?? 'Object',
              subtitle: `${primaryInfo?.type ?? 'Mesh'} · ${primaryInfo?.triangleCount ?? 0} tris`,
              badge: isLocked
                ? t('ctx3d.lockedBadge')
                : primaryInfo?.collection || primaryInfo?.type,
            };

      const entries: ContextMenuEntry[] = [];

      // 1. Primary Object Actions
      if (!isMulti && onOpenInspector) {
        entries.push({
          id: 'edit-inspector',
          label: t('ctx3d.edit'),
          icon: <Sliders className="w-3.5 h-3.5 text-blue-500" />,
          onSelect: onOpenInspector,
        });
      }
      if (!isMulti) {
        entries.push({
          id: 'rename',
          label: t('ctx3d.rename'),
          shortcut: 'F2',
          icon: <Pencil className="w-3.5 h-3.5" />,
          onSelect: () => handleOpenRename(isRoot ? 'root' : 'node', primaryId),
        });
      }
      entries.push({
        id: 'duplicate',
        label: t('ctx3d.duplicate'),
        shortcut: `${modKey}D`,
        icon: <Copy className="w-3.5 h-3.5" />,
        onSelect: () => handleDuplicateSelection(isRoot ? [] : targetIds),
      });
      entries.push({
        id: 'copy',
        label: t('ctx3d.copy'),
        shortcut: `${modKey}C`,
        icon: <Copy className="w-3.5 h-3.5" />,
        onSelect: () => handleCopySelection(isRoot ? [] : targetIds),
      });
      entries.push({
        id: 'cut',
        label: t('ctx3d.cut'),
        shortcut: `${modKey}X`,
        disabled: isLocked,
        icon: <Scissors className="w-3.5 h-3.5" />,
        onSelect: () => handleCutSelection(isRoot ? [] : targetIds),
      });
      entries.push({
        id: 'paste',
        label: t('ctx3d.paste'),
        shortcut: `${modKey}V`,
        disabled: !clipboard,
        icon: <ClipboardPaste className="w-3.5 h-3.5" />,
        onSelect: handlePasteClipboard,
      });

      // Selection submenu
      entries.push({
        id: 'selection-sub',
        label: t('ctx3d.select'),
        icon: <MousePointer className="w-3.5 h-3.5" />,
        children: [
          ...(!isRoot
            ? [
                {
                  id: 'sel-root',
                  label: t('ctx3d.selectRoot'),
                  icon: <Box className="w-3.5 h-3.5" />,
                  onSelect: () => dispatchSelection([], null, false),
                },
              ]
            : []),
          {
            id: 'sel-all',
            label: t('ctx3d.selectAll'),
            icon: <Layers className="w-3.5 h-3.5" />,
            onSelect: () => {
              const allIds = engine.selectAllNodes();
              dispatchSelection(allIds, allIds[0] ?? null, allIds.length === 0);
            },
          },
          {
            id: 'deselect',
            label: t('ctx3d.deselect'),
            shortcut: 'Esc',
            icon: <X className="w-3.5 h-3.5" />,
            onSelect: () => dispatchSelection([], null, true),
          },
        ],
      });

      entries.push({ id: 'sep-vis', type: 'separator' });

      // Visibility & Lock
      entries.push({
        id: 'toggle-vis',
        label: isHidden ? t('ctx3d.show') : t('ctx3d.hide'),
        icon: isHidden ? (
          <Eye className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <EyeOff className="w-3.5 h-3.5" />
        ),
        onSelect: () => {
          if (isRoot && onUpdateAsset) {
            onUpdateAsset(asset.id, { hidden: !isHidden });
          } else {
            engine.setNodesVisibility(targetIds, isHidden);
          }
        },
      });
      if (anyHiddenInScene) {
        entries.push({
          id: 'show-all-hidden',
          label: t('ctx3d.showAll'),
          icon: <Eye className="w-3.5 h-3.5 text-emerald-500" />,
          onSelect: () => {
            if (asset.hidden && onUpdateAsset) onUpdateAsset(asset.id, { hidden: false });
            engine.showAllNodes();
          },
        });
      }
      entries.push({
        id: 'toggle-lock',
        label: isLocked ? t('ctx3d.unlock') : t('ctx3d.lock'),
        icon: isLocked ? (
          <Unlock className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <Lock className="w-3.5 h-3.5 text-amber-500" />
        ),
        onSelect: () => {
          if (isRoot && onUpdateAsset) {
            onUpdateAsset(asset.id, { locked: !isLocked });
          } else {
            engine.setNodesLocked(targetIds, !isLocked);
          }
        },
      });

      entries.push({ id: 'sep-3d', type: 'separator' });

      // 2. Transform Submenu
      const resetRootPart = (part: 'all' | 'position' | 'rotation' | 'scale') => {
        if (!onUpdateAsset) return;
        const next: AssetTransform = {
          position:
            part === 'all' || part === 'position'
              ? { x: 0, y: 0, z: 0 }
              : asset.transform.position,
          rotation:
            part === 'all' || part === 'rotation'
              ? { x: 0, y: 0, z: 0 }
              : asset.transform.rotation,
          scale:
            part === 'all' || part === 'scale'
              ? { x: 1, y: 1, z: 1 }
              : asset.transform.scale,
        };
        onUpdateAsset(asset.id, { transform: next });
      };

      entries.push({
        id: 'transform-sub',
        label: t('ctx3d.transformSub'),
        disabled: isLocked,
        icon: <Move className="w-3.5 h-3.5" />,
        children: [
          {
            id: 'gizmo-move',
            label: t('ctx3d.move'),
            shortcut: 'G',
            checked: gizmoMode === 'translate',
            icon: <Move className="w-3.5 h-3.5" />,
            onSelect: () => setGizmoMode('translate'),
          },
          {
            id: 'gizmo-rotate',
            label: t('ctx3d.rotate'),
            shortcut: 'R',
            checked: gizmoMode === 'rotate',
            icon: <RotateCw className="w-3.5 h-3.5" />,
            onSelect: () => setGizmoMode('rotate'),
          },
          {
            id: 'gizmo-scale',
            label: t('ctx3d.scale'),
            shortcut: 'S',
            checked: gizmoMode === 'scale',
            icon: <Scale className="w-3.5 h-3.5" />,
            onSelect: () => setGizmoMode('scale'),
          },
          { id: 'sep-tr-reset', type: 'separator' },
          {
            id: 'reset-tr',
            label: t('ctx3d.resetTransform'),
            icon: <RotateCcw className="w-3.5 h-3.5" />,
            onSelect: () =>
              isRoot ? resetRootPart('all') : engine.resetNodesTransform(targetIds, 'all'),
          },
          {
            id: 'reset-pos',
            label: t('ctx3d.resetPos'),
            onSelect: () =>
              isRoot
                ? resetRootPart('position')
                : engine.resetNodesTransform(targetIds, 'position'),
          },
          {
            id: 'reset-rot',
            label: t('ctx3d.resetRot'),
            onSelect: () =>
              isRoot
                ? resetRootPart('rotation')
                : engine.resetNodesTransform(targetIds, 'rotation'),
          },
          {
            id: 'reset-scale',
            label: t('ctx3d.resetScale'),
            onSelect: () =>
              isRoot
                ? resetRootPart('scale')
                : engine.resetNodesTransform(targetIds, 'scale'),
          },
          ...(!isRoot
            ? ([
                { id: 'sep-tr-apply', type: 'separator' },
                {
                  id: 'apply-tr',
                  label: t('ctx3d.applyTransform'),
                  icon: <Check className="w-3.5 h-3.5 text-emerald-500" />,
                  onSelect: () => {
                    if (engine.applyTransformToNodes(targetIds, 'all')) {
                      onLog('info', '3D Editor', t('ctx3d.logAppliedTransform'));
                    }
                  },
                },
                {
                  id: 'apply-pos',
                  label: t('ctx3d.applyPos'),
                  onSelect: () => engine.applyTransformToNodes(targetIds, 'position'),
                },
                {
                  id: 'apply-rot',
                  label: t('ctx3d.applyRot'),
                  onSelect: () => engine.applyTransformToNodes(targetIds, 'rotation'),
                },
                {
                  id: 'apply-scale',
                  label: t('ctx3d.applyScale'),
                  onSelect: () => engine.applyTransformToNodes(targetIds, 'scale'),
                },
                {
                  id: 'freeze-tr',
                  label: t('ctx3d.freezeTransform'),
                  onSelect: () => {
                    if (engine.applyTransformToNodes(targetIds, 'all')) {
                      onLog('info', '3D Editor', t('ctx3d.logAppliedTransform'));
                    }
                  },
                },
              ] as ContextMenuEntry[])
            : []),
        ],
      });

      // 3. Organization Submenu
      const collectionChildren: ContextMenuEntry[] = [
        ...existingCollections.map((col) => ({
          id: `col-${col}`,
          label: col,
          checked: isRoot
            ? asset.collection === col
            : primaryInfo?.collection === col,
          onSelect: () => {
            if (isRoot && onUpdateAsset) onUpdateAsset(asset.id, { collection: col });
            else engine.setNodesCollection(targetIds, col);
          },
        })),
        ...(existingCollections.length > 0
          ? ([{ id: 'sep-col', type: 'separator' }] as ContextMenuEntry[])
          : []),
        {
          id: 'col-new',
          label: t('ctx3d.newCollection'),
          icon: <FolderPlus className="w-3.5 h-3.5" />,
          onSelect: () => {
            setCollectionInput('');
            setActiveModal({
              kind: 'collection',
              targetType: isRoot ? 'root' : 'nodes',
              nodeIds: targetIds,
              initial: '',
            });
          },
        },
        ...((isRoot ? asset.collection : primaryInfo?.collection)
          ? ([
              {
                id: 'col-clear',
                label: t('ctx3d.clearCollection'),
                onSelect: () => {
                  if (isRoot && onUpdateAsset)
                    onUpdateAsset(asset.id, { collection: undefined });
                  else engine.setNodesCollection(targetIds, undefined);
                },
              },
            ] as ContextMenuEntry[])
          : []),
      ];

      const orgChildren: ContextMenuEntry[] = [];
      if (!isRoot) {
        orgChildren.push({
          id: 'group-nodes',
          label: t('ctx3d.group'),
          icon: <FolderPlus className="w-3.5 h-3.5 text-amber-500" />,
          onSelect: () => {
            const gId = engine.groupNodes(targetIds, 'Group');
            if (gId) {
              dispatchSelection([gId], gId, false);
              onLog('info', '3D Editor', t('ctx3d.logGrouped', { name: 'Group' }));
            }
          },
        });
        if (isSingle && primaryId && primaryInfo?.isGroupWithChildren) {
          orgChildren.push({
            id: 'ungroup-node',
            label: t('ctx3d.ungroup'),
            icon: <Ungroup className="w-3.5 h-3.5" />,
            onSelect: () => {
              const name = primaryInfo.name;
              const moved = engine.ungroupNode(primaryId);
              dispatchSelection(moved, moved[0] ?? null, moved.length === 0);
              onLog('info', '3D Editor', t('ctx3d.logUngrouped', { name }));
            },
          });
        }
        orgChildren.push({ id: 'sep-org-col', type: 'separator' });
      }

      orgChildren.push({
        id: 'assign-collection',
        label: (isRoot ? asset.collection : primaryInfo?.collection)
          ? t('ctx3d.moveCollection')
          : t('ctx3d.addCollection'),
        icon: <Layers className="w-3.5 h-3.5" />,
        children: collectionChildren,
      });

      if (isSingle && primaryId && primaryInfo && primaryInfo.siblingCount > 1) {
        orgChildren.push({ id: 'sep-org-order', type: 'separator' });
        orgChildren.push({
          id: 'move-up',
          label: t('ctx3d.moveUp'),
          disabled: primaryInfo.siblingIndex <= 0,
          icon: <ArrowUp className="w-3.5 h-3.5" />,
          onSelect: () => engine.reorderNode(primaryId, 'up'),
        });
        orgChildren.push({
          id: 'move-down',
          label: t('ctx3d.moveDown'),
          disabled: primaryInfo.siblingIndex >= primaryInfo.siblingCount - 1,
          icon: <ArrowDown className="w-3.5 h-3.5" />,
          onSelect: () => engine.reorderNode(primaryId, 'down'),
        });
        orgChildren.push({
          id: 'bring-front',
          label: t('ctx3d.bringFront'),
          disabled: primaryInfo.siblingIndex <= 0,
          icon: <ChevronsUp className="w-3.5 h-3.5" />,
          onSelect: () => engine.reorderNode(primaryId, 'front'),
        });
        orgChildren.push({
          id: 'send-back',
          label: t('ctx3d.sendBack'),
          disabled: primaryInfo.siblingIndex >= primaryInfo.siblingCount - 1,
          icon: <ChevronsDown className="w-3.5 h-3.5" />,
          onSelect: () => engine.reorderNode(primaryId, 'back'),
        });
      }

      entries.push({
        id: 'org-sub',
        label: t('ctx3d.orgSub'),
        icon: <Layers className="w-3.5 h-3.5" />,
        children: orgChildren,
      });

      // 4. 3D Actions Submenu
      const toolsChildren: ContextMenuEntry[] = [
        {
          id: 'focus-obj',
          label: t('ctx3d.focusObject'),
          shortcut: 'F',
          icon: <Crosshair className="w-3.5 h-3.5" />,
          onSelect: () => engine.focusOnNodes(isRoot ? [] : targetIds),
        },
        {
          id: 'frame-sel',
          label: t('ctx3d.frameSelected'),
          icon: <Maximize2 className="w-3.5 h-3.5" />,
          onSelect: () => engine.focusOnNodes(isRoot ? [] : targetIds),
        },
        { id: 'sep-pivot', type: 'separator' },
        {
          id: 'center-pivot',
          label: t('ctx3d.centerPivot'),
          disabled: isLocked,
          icon: <Target className="w-3.5 h-3.5" />,
          onSelect: () => {
            if (isRoot && onUpdateAsset) onUpdateAsset(asset.id, { pivotMode: 'center' });
            else if (primaryId) engine.centerNodePivot(primaryId, 'center');
          },
        },
        {
          id: 'reset-pivot',
          label: t('ctx3d.resetPivot'),
          disabled: isLocked,
          icon: <Target className="w-3.5 h-3.5" />,
          onSelect: () => {
            if (isRoot && onUpdateAsset)
              onUpdateAsset(asset.id, { pivotMode: 'bottom-center' });
            else if (primaryId) engine.centerNodePivot(primaryId, 'bottom');
          },
        },
        { id: 'sep-mirror', type: 'separator' },
        {
          id: 'mirror-x',
          label: t('ctx3d.mirrorX'),
          disabled: isLocked,
          icon: <FlipHorizontal2 className="w-3.5 h-3.5" />,
          onSelect: () => engine.mirrorNodes(isRoot ? [] : targetIds, 'x'),
        },
        {
          id: 'mirror-y',
          label: t('ctx3d.mirrorY'),
          disabled: isLocked,
          icon: <FlipHorizontal2 className="w-3.5 h-3.5" />,
          onSelect: () => engine.mirrorNodes(isRoot ? [] : targetIds, 'y'),
        },
        {
          id: 'mirror-z',
          label: t('ctx3d.mirrorZ'),
          disabled: isLocked,
          icon: <FlipHorizontal2 className="w-3.5 h-3.5" />,
          onSelect: () => engine.mirrorNodes(isRoot ? [] : targetIds, 'z'),
        },
      ];

      if (!isRoot) {
        toolsChildren.push({ id: 'sep-inst', type: 'separator' });
        toolsChildren.push({
          id: 'make-instance',
          label: t('ctx3d.makeInstance'),
          icon: <Sparkles className="w-3.5 h-3.5" />,
          onSelect: () => {
            const created = engine.duplicateNodes(targetIds, true);
            if (created.length > 0) {
              dispatchSelection(created, created[created.length - 1], false);
            }
          },
        });
        if (primaryInfo?.isSharedGeometry || primaryInfo?.isSharedMaterial || isMulti) {
          toolsChildren.push({
            id: 'make-unique',
            label: t('ctx3d.makeUnique'),
            onSelect: () => engine.makeNodesUnique(targetIds),
          });
        }
      }

      if (isMulti && targetIds.length >= 2) {
        toolsChildren.push({ id: 'sep-align', type: 'separator' });
        toolsChildren.push({
          id: 'align-x',
          label: t('ctx3d.alignX'),
          disabled: isLocked,
          onSelect: () => engine.alignNodes(targetIds, 'x'),
        });
        toolsChildren.push({
          id: 'align-y',
          label: t('ctx3d.alignY'),
          disabled: isLocked,
          onSelect: () => engine.alignNodes(targetIds, 'y'),
        });
        toolsChildren.push({
          id: 'align-z',
          label: t('ctx3d.alignZ'),
          disabled: isLocked,
          onSelect: () => engine.alignNodes(targetIds, 'z'),
        });
        if (targetIds.length >= 3) {
          toolsChildren.push({
            id: 'dist-x',
            label: t('ctx3d.distX'),
            disabled: isLocked,
            onSelect: () => engine.distributeNodes(targetIds, 'x'),
          });
          toolsChildren.push({
            id: 'dist-y',
            label: t('ctx3d.distY'),
            disabled: isLocked,
            onSelect: () => engine.distributeNodes(targetIds, 'y'),
          });
          toolsChildren.push({
            id: 'dist-z',
            label: t('ctx3d.distZ'),
            disabled: isLocked,
            onSelect: () => engine.distributeNodes(targetIds, 'z'),
          });
        }
      }

      entries.push({
        id: 'tools-sub',
        label: t('ctx3d.toolsSub'),
        icon: <Crosshair className="w-3.5 h-3.5" />,
        children: toolsChildren,
      });

      // 5. Mod / Model / Material / Texture / Animation Submenus
      entries.push({ id: 'sep-mod', type: 'separator' });

      if (isRoot) {
        const modelChildren: ContextMenuEntry[] = [
          ...(onReplaceAsset
            ? ([
                {
                  id: 'replace-model',
                  label: t('ctx3d.replaceModel'),
                  icon: <Upload className="w-3.5 h-3.5" />,
                  onSelect: () => replaceInputRef.current?.click(),
                },
                ...(asset.isImported
                  ? ([
                      {
                        id: 'reimport-model',
                        label: t('ctx3d.reimportModel'),
                        icon: <RefreshCw className="w-3.5 h-3.5" />,
                        onSelect: () => replaceInputRef.current?.click(),
                      },
                    ] as ContextMenuEntry[])
                  : []),
              ] as ContextMenuEntry[])
            : []),
          {
            id: 'view-model-info',
            label: t('ctx3d.viewModelInfo'),
            icon: <FileText className="w-3.5 h-3.5" />,
            onSelect: () => {
              const info = engine.getNodeInspection(null);
              if (info) setActiveModal({ kind: 'info', details: info });
            },
          },
          ...(onRevealAssetInBrowser
            ? ([
                {
                  id: 'open-asset-loc',
                  label: t('ctx3d.openAssetLocation'),
                  icon: <FolderOpen className="w-3.5 h-3.5" />,
                  onSelect: () => onRevealAssetInBrowser(asset.id),
                },
              ] as ContextMenuEntry[])
            : []),
          ...(contents && onUpdateContents && linkableContentCandidates.length > 0
            ? ([
                { id: 'sep-link', type: 'separator' },
                {
                  id: 'assign-content',
                  label: t('ctx3d.assignContent'),
                  icon: <Link2 className="w-3.5 h-3.5 text-blue-500" />,
                  onSelect: () => setActiveModal({ kind: 'assign-content' }),
                },
                ...linkedModEntries.map((lk) => ({
                  id: `unlink-${lk.kind}-${lk.uid}`,
                  label: t('ctx3d.removeContentRef', { name: lk.label }),
                  icon: <Unlink className="w-3.5 h-3.5 text-amber-500" />,
                  onSelect: () => handleUnlinkContentEntry(lk.kind, lk.uid, lk.label),
                })),
              ] as ContextMenuEntry[])
            : []),
        ];

        entries.push({
          id: 'model-sub',
          label: t('ctx3d.modelSub'),
          icon: <Box className="w-3.5 h-3.5 text-blue-500" />,
          children: modelChildren,
        });
      } else if (primaryInfo) {
        entries.push({
          id: 'view-node-info',
          label: t('ctx3d.viewModelInfo'),
          icon: <FileText className="w-3.5 h-3.5" />,
          onSelect: () => setActiveModal({ kind: 'info', details: primaryInfo }),
        });
      }

      // Material submenu (if mesh or root has meshes)
      if (!isMulti && primaryInfo?.canEditMaterial) {
        const matTargetId = isRoot ? null : primaryId;
        const matChildren: ContextMenuEntry[] = [
          {
            id: 'edit-material',
            label: t('ctx3d.editMaterial'),
            icon: <Palette className="w-3.5 h-3.5 text-blue-500" />,
            onSelect: () =>
              setActiveModal({
                kind: 'material',
                nodeId: matTargetId,
                name: primaryInfo.materialName ?? 'SurfaceMaterial',
                color: primaryInfo.materialColor ?? asset.material.color ?? '#94a3b8',
                roughness: primaryInfo.roughness ?? asset.material.roughness ?? 0.5,
                metalness: primaryInfo.metalness ?? asset.material.metalness ?? 0.2,
                emissive: primaryInfo.emissive ?? '#000000',
                emissiveIntensity: primaryInfo.emissiveIntensity ?? 0,
                wireframe: Boolean(primaryInfo.wireframe),
              }),
          },
          ...(matTargetId
            ? ([
                {
                  id: 'dup-material',
                  label: t('ctx3d.duplicateMaterial'),
                  icon: <Copy className="w-3.5 h-3.5" />,
                  onSelect: () => engine.duplicateNodeMaterial(matTargetId),
                },
              ] as ContextMenuEntry[])
            : []),
          ...(contents?.materials && contents.materials.length > 0
            ? ([
                {
                  id: 'assign-proj-mat',
                  label: t('ctx3d.assignMaterial'),
                  icon: <Link2 className="w-3.5 h-3.5" />,
                  onSelect: () =>
                    setActiveModal({ kind: 'assign-material', nodeId: matTargetId }),
                },
              ] as ContextMenuEntry[])
            : []),
          ...(matTargetId
            ? ([
                {
                  id: 'remove-material',
                  label: t('ctx3d.removeMaterial'),
                  onSelect: () => engine.removeNodeMaterial(matTargetId),
                },
              ] as ContextMenuEntry[])
            : []),
        ];

        entries.push({
          id: 'mat-sub',
          label: t('ctx3d.materialSub'),
          icon: <Palette className="w-3.5 h-3.5" />,
          children: matChildren,
        });
      }

      // Texture submenu (only when texture exists or project has texture assets)
      if (
        !isMulti &&
        primaryInfo?.canEditMaterial &&
        (primaryInfo.hasTexture || textureAssets.length > 0)
      ) {
        const texTargetId = isRoot ? null : primaryId;
        const texChildren: ContextMenuEntry[] = [];
        if (textureAssets.length > 0) {
          texChildren.push({
            id: 'replace-texture',
            label: t('ctx3d.replaceTexture'),
            icon: <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />,
            onSelect: () =>
              setActiveModal({ kind: 'assign-texture', nodeId: texTargetId }),
          });
        }
        if (primaryInfo.textureAssetId && onOpenTextureAsset) {
          texChildren.push({
            id: 'open-texture',
            label: t('ctx3d.openTexture'),
            icon: <FolderOpen className="w-3.5 h-3.5" />,
            onSelect: () => onOpenTextureAsset(primaryInfo.textureAssetId!),
          });
        }
        if (primaryInfo.hasTexture) {
          texChildren.push({
            id: 'remove-texture',
            label: t('ctx3d.removeTexture'),
            icon: <Trash2 className="w-3.5 h-3.5 text-amber-500" />,
            onSelect: () => engine.removeTextureFromNode(texTargetId),
          });
        }
        if (texChildren.length > 0) {
          entries.push({
            id: 'tex-sub',
            label: t('ctx3d.textureSub'),
            icon: <ImageIcon className="w-3.5 h-3.5" />,
            children: texChildren,
          });
        }
      }

      // Animation submenu (only when GLB/GLTF clips or project animations exist)
      const hasProjectAnims = Boolean(contents?.animations && contents.animations.length > 0);
      const assignedAnimId = asset.metadata?.assignedAnimationId as string | undefined;
      if (animations.length > 0 || hasProjectAnims) {
        const animChildren: ContextMenuEntry[] = [];
        animations.forEach((clipName) => {
          const isPlaying = activeAnim === clipName;
          animChildren.push({
            id: `anim-play-${clipName}`,
            label: t('ctx3d.previewAnim', { name: clipName }),
            checked: isPlaying,
            icon: <Play className="w-3.5 h-3.5 text-emerald-500" />,
            onSelect: () => {
              if (engine.playAnimation(clipName)) {
                setActiveAnim(clipName);
                onLog('info', '3D Editor', t('ctx3d.logAnimPlaying', { name: clipName }));
              }
            },
          });
        });
        if (activeAnim) {
          animChildren.push({
            id: 'anim-stop',
            label: t('ctx3d.stopAnim'),
            icon: <Square className="w-3.5 h-3.5 text-amber-500" />,
            onSelect: () => {
              engine.stopAnimation();
              setActiveAnim(null);
              onLog('info', '3D Editor', t('ctx3d.logAnimStopped'));
            },
          });
        }
        if (hasProjectAnims) {
          if (animChildren.length > 0) {
            animChildren.push({ id: 'sep-anim-proj', type: 'separator' });
          }
          animChildren.push({
            id: 'assign-anim-entry',
            label: t('ctx3d.assignAnim'),
            icon: <Link2 className="w-3.5 h-3.5" />,
            onSelect: () => setActiveModal({ kind: 'assign-animation' }),
          });
          if (assignedAnimId && onUpdateAsset) {
            const { assignedAnimationId: _removed, ...restMeta } = asset.metadata;
            animChildren.push({
              id: 'remove-anim-link',
              label: t('ctx3d.removeAnimRef', { name: assignedAnimId }),
              icon: <Unlink className="w-3.5 h-3.5 text-amber-500" />,
              onSelect: () => onUpdateAsset(asset.id, { metadata: restMeta }),
            });
          }
        }
        entries.push({
          id: 'anim-sub',
          label: t('ctx3d.animSub'),
          icon: <Play className="w-3.5 h-3.5" />,
          children: animChildren,
        });
      }

      // Delete (destructive, bottom)
      if (!isRoot || onDeleteAsset) {
        entries.push({ id: 'sep-del', type: 'separator' });
        entries.push({
          id: 'delete-obj',
          label: t('ctx3d.delete'),
          shortcut: 'Del',
          danger: true,
          disabled: isLocked,
          icon: <Trash2 className="w-3.5 h-3.5" />,
          onSelect: () => handleDeleteSelection(isRoot ? [] : targetIds),
        });
      }

      return { menuHeader: header, menuItems: entries };
    }, [
      activeAnim,
      animations,
      anyHiddenInScene,
      asset,
      clipboard,
      contents,
      ctxMenu,
      dispatchSelection,
      existingCollections,
      gizmoMode,
      handleCopySelection,
      handleCutSelection,
      handleDeleteSelection,
      handleDuplicateSelection,
      handleOpenRename,
      handlePasteClipboard,
      linkableContentCandidates.length,
      linkedModEntries,
      modKey,
      onDeleteAsset,
      onLog,
      onOpenInspector,
      onOpenTextureAsset,
      onReplaceAsset,
      onRevealAssetInBrowser,
      onUpdateAsset,
      onUpdateContents,
      t,
      textureAssets.length,
    ]);

    const handleCameraPreset = (preset: CameraPreset) => {
      setCameraPreset(preset);
      engineRef.current?.setCameraPreset(preset);
    };

    const handleResetView = () => {
      setCameraPreset('perspective');
      setAutoRotate(false);
      engineRef.current?.resetView();
    };

    const gizmoButtons: { id: GizmoMode; label: string; icon: React.ReactNode }[] = [
      { id: 'select', label: t('viewport.gizmoOrbit'), icon: <MousePointer className="w-3.5 h-3.5" /> },
      { id: 'translate', label: t('viewport.modeTranslate'), icon: <Move className="w-3.5 h-3.5" /> },
      { id: 'rotate', label: t('viewport.modeRotate'), icon: <RotateCw className="w-3.5 h-3.5" /> },
      { id: 'scale', label: t('viewport.modeScale'), icon: <Scale className="w-3.5 h-3.5" /> },
    ];

    const camButtons: { id: CameraPreset; label: string }[] = [
      { id: 'perspective', label: t('viewport.camPersp') },
      { id: 'front', label: t('viewport.camFront') },
      { id: 'side', label: t('viewport.camSide') },
      { id: 'top', label: t('viewport.camTop') },
      { id: 'iso', label: t('viewport.camIso') },
    ];

    const hudButtonRef = useRef<HTMLButtonElement>(null);

    return (
      <div className="relative w-full h-full flex flex-col bg-[#0E131D] overflow-hidden">
        {/* Hidden file input for Replace / Re-import Model */}
        <input
          ref={replaceInputRef}
          type="file"
          accept=".glb,.gltf,.obj"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file && asset && onReplaceAsset) {
              void onReplaceAsset(asset.id, file);
            }
          }}
        />

        {/* Primary Toolbar: Transform & Camera Controls */}
        <div className="min-h-10 shrink-0 px-3 py-1 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0">
            {gizmoButtons.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setGizmoMode(btn.id)}
                title={btn.label}
                className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:py-1 min-h-[36px] sm:min-h-0 touch-target text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  gizmoMode === btn.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5'
                }`}
              >
                {btn.icon}
                <span className="hidden sm:inline">{btn.label}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => onUpdateSettings({ snapToGrid: !settings.snapToGrid })}
              title={t('viewport.snapTooltip')}
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                settings.snapToGrid
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-600/10'
                  : 'text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <Magnet className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('viewport.snapLabel')}</span>
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {camButtons.map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => handleCameraPreset(cam.id)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  cameraPreset === cam.id
                    ? 'bg-slate-900 text-white dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {cam.label}
              </button>
            ))}

            <span className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />

            <button
              type="button"
              onClick={() => engineRef.current?.zoomIn()}
              title={t('viewport.zoomInTooltip')}
              className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => engineRef.current?.zoomOut()}
              title={t('viewport.zoomOutTooltip')}
              className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => engineRef.current?.focusOnNodes(effectiveSelectedIds)}
              title={t('viewport.focusTooltip')}
              className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setAutoRotate((r) => !r)}
              title={t('viewport.autoRotate')}
              className={`p-1.5 rounded transition-colors ${
                autoRotate
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-600/10'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleResetView}
              title={t('viewport.resetCamera')}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('viewport.resetShort')}</span>
            </button>
          </div>
        </div>

        {/* Secondary Bar: Lighting, Material Preview & Diagnostic Overlays */}
        <div className="h-9 shrink-0 px-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0F141F] flex items-center justify-between gap-3 overflow-x-auto text-[11px]">
          <div className="flex items-center gap-3 shrink-0">
            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
              <span>{t('viewport.lighting')}</span>
              <select
                value={lightingPreset}
                onChange={(e) => onChangeLighting(e.target.value as LightingPreset)}
                className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-200 focus:outline-none"
              >
                <option value="studio">{t('viewport.lightStudio')}</option>
                <option value="daylight">{t('viewport.lightDaylight')}</option>
                <option value="forge">{t('viewport.lightWarmForge')}</option>
                <option value="night">{t('viewport.lightMidnight')}</option>
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
              <span>{t('viewport.shadingLabel')}</span>
              <select
                value={materialMode}
                onChange={(e) =>
                  onChangeMaterialMode(e.target.value as MaterialPreviewMode)
                }
                className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-200 focus:outline-none"
              >
                <option value="pbr">{t('viewport.shadingPbr')}</option>
                <option value="unlit">{t('viewport.shadingUnlit')}</option>
                <option value="clay">{t('viewport.shadingClay')}</option>
                <option value="normals">{t('viewport.shadingNormals')}</option>
                <option value="wireframe">{t('viewport.shadingWireframe')}</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onUpdateSettings({ viewportGrid: !settings.viewportGrid })}
              title={t('viewport.gridTooltip')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-colors whitespace-nowrap ${
                settings.viewportGrid
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-600/10'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Grid className="w-3 h-3" />
              {t('viewport.grid')}
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ viewportAxes: !settings.viewportAxes })}
              title={t('viewport.axesTooltip')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-colors whitespace-nowrap ${
                settings.viewportAxes
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-600/10'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Axis3d className="w-3 h-3" />
              {t('viewport.axesLabel')}
            </button>

            <button
              type="button"
              onClick={onToggleBounds}
              title={t('viewport.boundsTooltip')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-colors whitespace-nowrap ${
                showBounds
                  ? 'text-sky-600 dark:text-sky-400 bg-sky-500/15'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <BoxSelect className="w-3 h-3" />
              {t('viewport.bounds')}
            </button>

            <button
              type="button"
              onClick={onToggleCollision}
              title={t('viewport.collisionTooltip')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-colors whitespace-nowrap ${
                showCollision
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Shield className="w-3 h-3" />
              {t('viewport.collision')}
            </button>

            <button
              type="button"
              onClick={onTogglePivot}
              title={t('viewport.pivotTooltip')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-colors whitespace-nowrap ${
                showPivot
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-500/15'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Target className="w-3 h-3" />
              {t('viewport.pivotLabel')}
            </button>

            <span className="w-px h-3.5 bg-slate-200 dark:bg-white/10 mx-1" />

            <button
              type="button"
              onClick={() => onUpdateSettings({ showShadows: !settings.showShadows })}
              title={t('viewport.shadowsTooltip')}
              className={`p-1 rounded transition-colors ${
                settings.showShadows && !settings.lowPowerMode
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-600/10'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ lowPowerMode: !settings.lowPowerMode })
              }
              title={t('viewport.lowEndTooltip')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded transition-colors whitespace-nowrap ${
                settings.lowPowerMode
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Gauge className="w-3 h-3" />
              <span className="hidden xl:inline">{t('viewport.lowEnd')}</span>
            </button>
          </div>
        </div>

        {/* Isolated WebGL canvas mount — always LTR so 3D gizmos & coordinates never mirror */}
        <div
          className="relative flex-1 min-h-0 touch-pan-canvas"
          dir="ltr"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div ref={mountRef} className="w-full h-full touch-pan-canvas" />

          <div
            dir="auto"
            className="pointer-events-none hidden sm:block absolute end-3 bottom-3 px-2 py-1 rounded bg-[#0B0F17]/80 border border-white/10 text-[10px] text-slate-300"
          >
            {t(platformInfo.isTouchPrimary ? 'viewport.touchHint' : 'viewport.mouseHint')}
          </div>

          {asset && asset.type === '3d-model' && (
            <div className="absolute start-3 bottom-3 flex items-center gap-1.5 max-w-[calc(100%-1.5rem)]">
              <div className="pointer-events-none px-2.5 py-1.5 rounded bg-[#0B0F17]/90 border border-white/10 text-[11px] text-slate-200 font-mono tabular-nums truncate">
                <span dir="auto">{asset.name}</span>
                {effectiveSelectedIds.length > 1
                  ? ` › ${effectiveSelectedIds.length} ${t('hierarchy.multiHint', {
                      count: effectiveSelectedIds.length,
                    })}`
                  : selectedNodeName
                    ? ` › ${selectedNodeName}`
                    : ''}
                {asset.locked ? ` · ${t('ctx3d.hudLockedNotice')}` : ''}
                {` · ${asset.modCategory ?? 'Item'}`}
                {asset.dimensions
                  ? ` · ${asset.dimensions.width}×${asset.dimensions.height}×${asset.dimensions.depth} m`
                  : ''}
                {` · ${t('viewport.tris', { count: asset.triangleEstimate })}`}
              </div>

              <button
                ref={hudButtonRef}
                type="button"
                title={t('ctx3d.hudContextBtn')}
                onClick={() => {
                  const rect = hudButtonRef.current?.getBoundingClientRect();
                  const x = rect ? rect.left : 120;
                  const y = rect ? rect.top - 12 : 240;
                  openContextMenuFor(
                    x,
                    y,
                    selectedNodeId ?? effectiveSelectedIds[0] ?? null
                  );
                }}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded bg-[#0B0F17]/90 hover:bg-[#172033] border border-white/15 text-[11px] text-slate-200 transition-colors shrink-0 min-h-[32px] touch-target"
              >
                <MoreVertical className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t('ctx3d.hudContextBtn')}</span>
              </button>
            </div>
          )}

          {(!asset || asset.type !== '3d-model') && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              <div className="px-4 py-2.5 rounded bg-[#0B0F17]/85 border border-white/10 text-xs text-slate-300 text-center">
                {t('viewport.selectModelPrompt')}
              </div>
            </div>
          )}

          {contextLost && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0B0F17]/90 p-4">
              <div className="px-4 py-3 rounded border border-amber-500/30 bg-[#121823] text-xs text-amber-300 text-center">
                {t('viewport.contextPausedInline')}
              </div>
            </div>
          )}
        </div>

        {/* Professional Hierarchical 3D Object Context Menu */}
        <ContextMenu
          open={ctxMenu.open}
          x={ctxMenu.x}
          y={ctxMenu.y}
          header={menuHeader}
          items={menuItems}
          onClose={() => setCtxMenu((prev) => ({ ...prev, open: false }))}
        />

        {/* Dialogs & Popovers (Respect RTL/LTR cleanly via document dir) */}
        {activeModal && (
          <div
            className="fixed inset-0 z-[80] bg-black/55 flex items-center justify-center p-4"
            onClick={() => setActiveModal(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white dark:border-white/15 dark:bg-[#121823] shadow-2xl overflow-hidden"
            >
              {/* Rename Dialog */}
              {activeModal.kind === 'rename' && (
                <form onSubmit={handleSubmitRename} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t('ctx3d.renameTitle')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activeModal.targetType === 'root'
                      ? t('ctx3d.renameAssetSubtitle')
                      : t('ctx3d.renameNodeSubtitle')}
                  </p>
                  <input
                    type="text"
                    autoFocus
                    dir="auto"
                    value={renameInput}
                    placeholder={t('ctx3d.renamePlaceholder')}
                    onChange={(e) => {
                      setRenameInput(e.target.value);
                      setRenameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setActiveModal(null);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/15 dark:bg-[#0B0F17] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {renameError && (
                    <p className="text-[11px] text-red-600 dark:text-red-400">
                      {renameError}
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500"
                    >
                      {t('common.save')}
                    </button>
                  </div>
                </form>
              )}

              {/* Object / Model Info Modal */}
              {activeModal.kind === 'info' && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {t('ctx3d.infoTitle')} · {activeModal.details.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('ctx3d.infoType')}
                      </dt>
                      <dd className="font-mono text-slate-900 dark:text-slate-100">
                        {activeModal.details.type}
                      </dd>
                    </div>
                    {asset && (
                      <div>
                        <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('ctx3d.infoFormat')}
                        </dt>
                        <dd className="font-mono text-slate-900 dark:text-slate-100">
                          {asset.format}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('ctx3d.infoMeshes')}
                      </dt>
                      <dd dir="ltr" className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {activeModal.details.meshCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('ctx3d.infoTris')}
                      </dt>
                      <dd dir="ltr" className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {activeModal.details.triangleCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('ctx3d.infoDims')}
                      </dt>
                      <dd dir="ltr" className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {activeModal.details.dimensions.width} ×{' '}
                        {activeModal.details.dimensions.height} ×{' '}
                        {activeModal.details.dimensions.depth} m
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('ctx3d.infoWorldPos')}
                      </dt>
                      <dd dir="ltr" className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {activeModal.details.worldPosition.x},{' '}
                        {activeModal.details.worldPosition.y},{' '}
                        {activeModal.details.worldPosition.z}
                      </dd>
                    </div>
                    {activeModal.details.materialName && (
                      <div>
                        <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('ctx3d.infoMaterial')}
                        </dt>
                        <dd className="font-mono truncate text-slate-900 dark:text-slate-100">
                          {activeModal.details.materialName}
                        </dd>
                      </div>
                    )}
                    {activeModal.details.collection && (
                      <div>
                        <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('ctx3d.infoCollection')}
                        </dt>
                        <dd className="text-slate-900 dark:text-slate-100 truncate">
                          {activeModal.details.collection}
                        </dd>
                      </div>
                    )}
                    {asset && (
                      <div className="col-span-2">
                        <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('ctx3d.infoPath')}
                        </dt>
                        <dd dir="ltr" className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                          {asset.path}
                        </dd>
                      </div>
                    )}
                    {animations.length > 0 && (
                      <div className="col-span-2">
                        <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('ctx3d.infoAnimations')}
                        </dt>
                        <dd className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {animations.join(', ')}
                        </dd>
                      </div>
                    )}
                    {linkedModEntries.length > 0 && (
                      <div className="col-span-2">
                        <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('ctx3d.infoLinkedContent')}
                        </dt>
                        <dd className="text-[11px] text-blue-600 dark:text-blue-400">
                          {linkedModEntries.map((l) => l.label).join(', ')}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500"
                    >
                      {t('common.close')}
                    </button>
                  </div>
                </div>
              )}

              {/* Material Editor Modal */}
              {activeModal.kind === 'material' && (
                <form onSubmit={handleSubmitMaterial} className="p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t('ctx3d.matEditorTitle')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      {t('ctx3d.matNameLabel')}
                    </label>
                    <input
                      type="text"
                      value={activeModal.name}
                      onChange={(e) =>
                        setActiveModal({ ...activeModal, name: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white dark:border-white/15 dark:bg-[#0B0F17] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                        {t('inspector.primaryColor')}
                      </label>
                      <div dir="ltr" className="flex items-center gap-2 px-2 py-1 rounded border border-slate-200 dark:border-white/10">
                        <input
                          type="color"
                          value={activeModal.color}
                          onChange={(e) =>
                            setActiveModal({ ...activeModal, color: e.target.value })
                          }
                          className="w-5 h-5 border-0 bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-[11px]">
                          {activeModal.color.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                        {t('inspector.accentColor')}
                      </label>
                      <div dir="ltr" className="flex items-center gap-2 px-2 py-1 rounded border border-slate-200 dark:border-white/10">
                        <input
                          type="color"
                          value={activeModal.emissive}
                          onChange={(e) =>
                            setActiveModal({ ...activeModal, emissive: e.target.value })
                          }
                          className="w-5 h-5 border-0 bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-[11px]">
                          {activeModal.emissive.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span>{t('inspector.roughness')}</span>
                      <span dir="ltr" className="font-mono">
                        {activeModal.roughness.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.04"
                      max="1"
                      step="0.02"
                      value={activeModal.roughness}
                      onChange={(e) =>
                        setActiveModal({
                          ...activeModal,
                          roughness: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span>{t('inspector.metalness')}</span>
                      <span dir="ltr" className="font-mono">
                        {activeModal.metalness.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.02"
                      value={activeModal.metalness}
                      onChange={(e) =>
                        setActiveModal({
                          ...activeModal,
                          metalness: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <label className="flex items-center justify-between pt-1 cursor-pointer">
                    <span>{t('inspector.wireframeOverlay')}</span>
                    <input
                      type="checkbox"
                      checked={activeModal.wireframe}
                      onChange={(e) =>
                        setActiveModal({ ...activeModal, wireframe: e.target.checked })
                      }
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500"
                    >
                      {t('common.save')}
                    </button>
                  </div>
                </form>
              )}

              {/* New Collection Modal */}
              {activeModal.kind === 'collection' && (
                <form onSubmit={handleSubmitCollection} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t('ctx3d.collectionTitle')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    autoFocus
                    dir="auto"
                    value={collectionInput}
                    placeholder={t('ctx3d.collectionPlaceholder')}
                    onChange={(e) => setCollectionInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 bg-white dark:border-white/15 dark:bg-[#0B0F17] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={!collectionInput.trim()}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                    >
                      {t('common.save')}
                    </button>
                  </div>
                </form>
              )}

              {/* Assign Texture Picker */}
              {activeModal.kind === 'assign-texture' && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t('ctx3d.assignTexTitle')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {textureAssets.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('ctx3d.assignTexEmpty')}
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1.5">
                      {textureAssets.map((ta) => (
                        <button
                          key={ta.id}
                          type="button"
                          onClick={() =>
                            void handleApplyTextureAsset(activeModal.nodeId, ta)
                          }
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded border border-slate-200 dark:border-white/10 hover:bg-blue-600/10 text-start"
                        >
                          <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                            {ta.name}
                          </span>
                          <span dir="ltr" className="text-[10px] font-mono text-slate-400">
                            {ta.format}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Assign Project Material Picker */}
              {activeModal.kind === 'assign-material' && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t('ctx3d.assignMatTitle')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {!contents?.materials || contents.materials.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('ctx3d.assignMatEmpty')}
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1.5">
                      {contents.materials.map((mc) => (
                        <button
                          key={mc.uid}
                          type="button"
                          onClick={() => {
                            engineRef.current?.updateNodeMaterial(activeModal.nodeId, {
                              name: mc.name,
                              color: mc.baseColor,
                              roughness: mc.roughness,
                              metalness: mc.metallic,
                              emissive: mc.emissiveColor,
                              emissiveIntensity: mc.emissiveIntensity,
                            });
                            setActiveModal(null);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded border border-slate-200 dark:border-white/10 hover:bg-blue-600/10 text-start"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-3.5 h-3.5 rounded border border-black/15 shrink-0"
                              style={{ backgroundColor: mc.baseColor }}
                            />
                            <span className="truncate font-medium">{mc.name}</span>
                          </span>
                          <span dir="ltr" className="text-[10px] font-mono text-slate-400">
                            {mc.shaderProfile}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Assign Mod Content Entry Picker */}
              {activeModal.kind === 'assign-content' && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t('ctx3d.assignContentTitle')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {linkableContentCandidates.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('ctx3d.assignContentEmpty')}
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1.5">
                      {linkableContentCandidates.map((entry) => (
                        <button
                          key={`${entry.kind}_${entry.uid}`}
                          type="button"
                          onClick={() => handleLinkContentEntry(entry.kind, entry.uid)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded border border-slate-200 dark:border-white/10 hover:bg-blue-600/10 text-start"
                        >
                          <span className="truncate font-medium">{entry.label}</span>
                          <span dir="ltr" className="text-[10px] font-mono text-slate-400 uppercase">
                            {entry.kind}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Assign Project Animation Picker */}
              {activeModal.kind === 'assign-animation' && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t('ctx3d.assignAnimTitle')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {!contents?.animations || contents.animations.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('ctx3d.assignAnimEmpty')}
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-1.5">
                      {contents.animations.map((anim) => (
                        <button
                          key={anim.uid}
                          type="button"
                          onClick={() => {
                            if (asset && onUpdateAsset) {
                              onUpdateAsset(asset.id, {
                                metadata: {
                                  ...asset.metadata,
                                  assignedAnimationId: anim.id,
                                },
                              });
                            }
                            setActiveModal(null);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded border border-slate-200 dark:border-white/10 hover:bg-blue-600/10 text-start"
                        >
                          <span className="truncate font-medium">{anim.name}</span>
                          <span dir="ltr" className="text-[10px] font-mono text-slate-400">
                            {anim.clipName}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Confirm Delete Asset Modal */}
              {activeModal.kind === 'confirm-delete-asset' && (
                <div className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
                    {t('ctx3d.deleteAssetTitle')}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {t('ctx3d.deleteAssetDesc', { name: activeModal.assetName })}
                  </p>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const id = activeModal.assetId;
                        setActiveModal(null);
                        void onDeleteAsset?.(id);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-500"
                    >
                      {t('ctx3d.delete')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);
