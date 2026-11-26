import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle2,
  Code2,
  FolderTree,
  GitBranch,
  History,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Redo2,
  Save,
  ShieldAlert,
  Sliders,
  Terminal,
  Undo2,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  AnyWorkbenchKind,
  ContentEditorsWorkbench,
} from '@/src/components/content/ContentEditorsWorkbench';
import { SystemsAndGraphsWorkbench } from '@/src/components/editors/SystemsAndGraphsWorkbench';
import { AssetBrowser } from '@/src/components/panels/AssetBrowser';
import { AssetMediaPreview } from '@/src/components/panels/AssetMediaPreview';
import { ConsolePanel } from '@/src/components/panels/ConsolePanel';
import { FileEditorPanel } from '@/src/components/panels/FileEditorPanel';
import { ModStructureExplorer } from '@/src/components/panels/ModStructureExplorer';
import { ModTestSandbox } from '@/src/components/panels/ModTestSandbox';
import { PropertiesInspector } from '@/src/components/panels/PropertiesInspector';
import { SceneHierarchyPanel } from '@/src/components/panels/SceneHierarchyPanel';
import { ValidationPanel } from '@/src/components/panels/ValidationPanel';
import { Viewport3D, Viewport3DHandle } from '@/src/components/panels/Viewport3D';
import {
  CONTENT_FILE_PATHS,
  EXTENDED_CONFIG_FILE_PATHS,
  resolveProjectContents,
  validateAllContents,
} from '@/src/core/content/contentRegistry';
import { ModelInspectionResult } from '@/src/core/three/ModPreviewEngine';
import { validateModProject } from '@/src/core/validation/modValidator';
import { useI18n } from '@/src/i18n';
import { useBackNavigation } from '@/src/platform';
import {
  AssetPresetKind,
  AssetTransform,
  ConsoleEntry,
  EditorSettings,
  ExtractedMaterialInfo,
  LightingPreset,
  LogLevel,
  MaterialPreviewMode,
  ModAsset,
  ModContentDatabase,
  ModFileNode,
  ModManifest,
  ModProject,
  ModValidationReport,
  ModelDimensions,
  ProjectBackupRecord,
  SceneEditorState,
  SceneHierarchyNode,
  ValidationIssue,
} from '@/src/types/mod';

interface WorkspaceViewProps {
  project: ModProject;
  allProjects: ModProject[];
  backups: ProjectBackupRecord[];
  settings: EditorSettings;
  logs: ConsoleEntry[];
  pendingIssueFocus?: { issue: ValidationIssue; token: number } | null;
  canUndo: boolean;
  canRedo: boolean;
  lastSavedAt: string | null;
  onUndo: () => void;
  onRedo: () => void;
  onManualSave: () => void;
  onOpenBuild?: () => void;
  onUpdateSettings: (patch: Partial<EditorSettings>) => void;
  onSelectAsset: (assetId: string) => void;
  onUpdateAsset: (assetId: string, patch: Partial<ModAsset>) => void;
  onUpdateContents: (next: ModContentDatabase) => void;
  onImportAssetFiles: (files: FileList | File[]) => Promise<void>;
  onAddProceduralAsset: (name: string, preset: AssetPresetKind) => void;
  onRenameAsset: (assetId: string, newName: string) => void;
  onReplaceAsset: (assetId: string, file: File) => Promise<void>;
  onDuplicateAsset: (assetId: string) => Promise<void>;
  onDeleteAsset: (assetId: string) => Promise<void>;
  onUpdateManifest: (patch: Partial<ModManifest>) => void;
  onSaveFile: (path: string, content: string) => void;
  onUpsertLocalizationFile: (locale: string, content: string) => void;
  onAddFile: (parentPath: string, fileName: string, kind: 'script' | 'data') => void;
  onDeleteFile: (path: string) => void;
  onBumpVersion: (part: 'patch' | 'minor' | 'major', summary: string) => void;
  onCreateBackup: (label: string) => Promise<void>;
  onRestoreBackup: (backup: ProjectBackupRecord) => Promise<void>;
  onDeleteBackup: (backupId: string) => Promise<void>;
  onExportWorkspaceProject: () => Promise<void>;
  onLog: (level: LogLevel, source: string, message: string) => void;
  onClearLogs: () => void;
}

type LeftTab = 'scene' | 'assets' | 'structure';
type CenterTab = 'viewport' | 'content' | 'systems' | 'editor' | 'validation' | 'test';
type MobilePane =
  | 'viewport'
  | 'test'
  | 'content'
  | 'systems'
  | 'validation'
  | 'explorer'
  | 'inspector'
  | 'console';

const LEFT_DOCK_KEY = 'woa_left_dock_width';
const RIGHT_DOCK_KEY = 'woa_right_dock_width';

function readStoredWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    const num = raw ? Number(raw) : NaN;
    if (Number.isFinite(num) && num >= min && num <= max) return num;
  } catch {
    // ignore storage read error
  }
  return fallback;
}

function findHierarchyNodeName(
  nodes: SceneHierarchyNode[],
  targetId: string | null
): string | null {
  if (!targetId) return null;
  for (const node of nodes) {
    if (node.id === targetId) return node.name;
    const child = findHierarchyNodeName(node.children, targetId);
    if (child) return child;
  }
  return null;
}

function updateHierarchyVisibility(
  nodes: SceneHierarchyNode[],
  targetId: string,
  visible: boolean
): SceneHierarchyNode[] {
  return nodes.map((node) => ({
    ...node,
    visible: node.id === targetId ? visible : node.visible,
    children: updateHierarchyVisibility(node.children, targetId, visible),
  }));
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  project,
  allProjects,
  backups,
  settings,
  logs,
  pendingIssueFocus,
  canUndo,
  canRedo,
  lastSavedAt,
  onUndo,
  onRedo,
  onManualSave,
  onOpenBuild,
  onUpdateSettings,
  onSelectAsset,
  onUpdateAsset,
  onUpdateContents,
  onImportAssetFiles,
  onAddProceduralAsset,
  onRenameAsset,
  onReplaceAsset,
  onDuplicateAsset,
  onDeleteAsset,
  onUpdateManifest,
  onSaveFile,
  onUpsertLocalizationFile,
  onAddFile,
  onDeleteFile,
  onBumpVersion,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  onExportWorkspaceProject,
  onLog,
  onClearLogs,
}) => {
  const { t, language } = useI18n();
  const viewportRef = useRef<Viewport3DHandle>(null);
  const onSelectAssetRef = useRef(onSelectAsset);
  onSelectAssetRef.current = onSelectAsset;
  const lastFocusTokenRef = useRef<number | null>(null);

  const [leftTab, setLeftTab] = useState<LeftTab>('scene');
  const [centerTab, setCenterTab] = useState<CenterTab>('viewport');
  const [contentKind, setContentKind] = useState<AnyWorkbenchKind>('item');
  const [contentFocus, setContentFocus] = useState<{
    kind: AnyWorkbenchKind;
    uid: string;
    token: number;
  } | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>('viewport');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    'mod.manifest.json'
  );
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);

  // Desktop resizable & collapsible docks
  const [leftDockWidth, setLeftDockWidth] = useState<number>(() =>
    readStoredWidth(LEFT_DOCK_KEY, 304, 240, 440)
  );
  const [rightDockWidth, setRightDockWidth] = useState<number>(() =>
    readStoredWidth(RIGHT_DOCK_KEY, 320, 260, 460)
  );
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [workspaceDragOver, setWorkspaceDragOver] = useState(false);

  const [validationReport, setValidationReport] =
    useState<ModValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Android back button returns to main 3D viewport from sub-panes before exiting workspace
  useBackNavigation(() => {
    if (mobilePane !== 'viewport') {
      setMobilePane('viewport');
      setCenterTab('viewport');
      return true;
    }
    return false;
  }, true);

  // Desktop keyboard shortcuts: Ctrl/Cmd+B (Build), Ctrl/Cmd+1..6 (Tabs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
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
      const key = e.key.toLowerCase();
      if (key === 'b' && onOpenBuild) {
        e.preventDefault();
        onOpenBuild();
        return;
      }
      const tabOrder: CenterTab[] = [
        'viewport',
        'content',
        'systems',
        'editor',
        'validation',
        'test',
      ];
      const digit = Number(key);
      if (digit >= 1 && digit <= 6) {
        e.preventDefault();
        setCenterTab(tabOrder[digit - 1]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenBuild]);

  const startResize = (side: 'left' | 'right', e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftDockWidth : rightDockWidth;
    const isRtl = document.documentElement.dir === 'rtl';

    const onMove = (ev: PointerEvent) => {
      const rawDelta = ev.clientX - startX;
      const orientedDelta = isRtl ? -rawDelta : rawDelta;
      if (side === 'left') {
        const next = Math.max(240, Math.min(440, startW + orientedDelta));
        setLeftDockWidth(next);
        try {
          localStorage.setItem(LEFT_DOCK_KEY, String(next));
        } catch {
          // ignore
        }
      } else {
        const next = Math.max(260, Math.min(460, startW - orientedDelta));
        setRightDockWidth(next);
        try {
          localStorage.setItem(RIGHT_DOCK_KEY, String(next));
        } catch {
          // ignore
        }
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const runLiveValidation = useCallback(async () => {
    void language;
    setIsValidating(true);
    try {
      const report = await validateModProject(
        project,
        allProjects,
        settings.defaultTargetPlatform
      );
      setValidationReport(report);
    } finally {
      setIsValidating(false);
    }
  }, [project, allProjects, settings.defaultTargetPlatform, language]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runLiveValidation();
    }, 220);
    return () => clearTimeout(timer);
  }, [runLiveValidation]);

  const resolvedContents = useMemo(() => resolveProjectContents(project), [project]);
  const contentValidation = useMemo(
    () => {
      void language;
      return validateAllContents(resolvedContents, project.manifest.modId);
    },
    [resolvedContents, project.manifest.modId, language]
  );

  const handleInspectIssue = useCallback(
    (issue: ValidationIssue) => {
      if (issue.targetType === 'manifest') {
        setSelectedFilePath('mod.manifest.json');
        setCenterTab('editor');
        setMobilePane('inspector');
        return;
      }
      if (issue.targetType === 'asset' && issue.targetRef) {
        onSelectAssetRef.current(issue.targetRef);
        setCenterTab('viewport');
        setMobilePane('viewport');
        return;
      }
      if (issue.targetType === 'content' && issue.targetRef) {
        const [kind, uid] = issue.targetRef.split(':');
        if (kind) {
          setContentKind(kind as AnyWorkbenchKind);
          if (uid) {
            setContentFocus({
              kind: kind as AnyWorkbenchKind,
              uid,
              token: Date.now(),
            });
          }
          setCenterTab('content');
          setMobilePane('content');
          return;
        }
      }
      if (issue.targetRef || issue.file) {
        const path = issue.targetRef || issue.file;
        setSelectedFilePath(path);
        setCenterTab('editor');
        setMobilePane('viewport');
      }
    },
    []
  );

  useEffect(() => {
    if (pendingIssueFocus && pendingIssueFocus.token !== lastFocusTokenRef.current) {
      lastFocusTokenRef.current = pendingIssueFocus.token;
      handleInspectIssue(pendingIssueFocus.issue);
    }
  }, [pendingIssueFocus, handleInspectIssue]);

  // 3D Editor state
  const [hierarchy, setHierarchy] = useState<SceneHierarchyNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectionCleared, setSelectionCleared] = useState(false);
  const [showBounds, setShowBounds] = useState(true);
  const [showCollision, setShowCollision] = useState(false);
  const [showPivot, setShowPivot] = useState(true);
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('studio');
  const [materialMode, setMaterialMode] = useState<MaterialPreviewMode>('pbr');

  const activeAsset =
    project.assets.find((a) => a.id === project.activeAssetId) ??
    project.assets[0] ??
    null;

  const selectedFile =
    project.files.find((f) => f.path === selectedFilePath && f.type !== 'folder') ??
    null;

  const selectedNodeName = findHierarchyNodeName(hierarchy, selectedNodeId);

  const handleSelectNodes = useCallback(
    (nodeIds: string[], primaryId: string | null, cleared = false) => {
      setSelectedNodeIds(nodeIds);
      setSelectedNodeId(primaryId);
      setSelectionCleared(cleared);
    },
    []
  );

  const handleSelectFileNode = (node: ModFileNode) => {
    setSelectedFilePath(node.path);
    if (
      (node.type === 'asset-3d' ||
        node.type === 'texture' ||
        node.type === 'audio') &&
      node.assetId
    ) {
      onSelectAsset(node.assetId);
      handleSelectNodes([], null, false);
      setCenterTab('viewport');
      setMobilePane('viewport');
    } else {
      const matchedKind = (
        [
          ...Object.entries(CONTENT_FILE_PATHS),
          ...Object.entries(EXTENDED_CONFIG_FILE_PATHS),
        ] as [AnyWorkbenchKind, string][]
      ).find(([, path]) => path === node.path)?.[0];
      if (matchedKind) {
        setContentKind(matchedKind);
      }
      setCenterTab('editor');
      setMobilePane('viewport');
    }
  };

  const handleSelectAssetItem = (assetId: string) => {
    onSelectAsset(assetId);
    handleSelectNodes([], null, false);
    const matchingFile = project.files.find((f) => f.assetId === assetId);
    if (matchingFile) {
      setSelectedFilePath(matchingFile.path);
    }
    setCenterTab('viewport');
    setMobilePane('viewport');
  };

  const handleViewportTransformChange = (transform: AssetTransform) => {
    if (!activeAsset) return;
    onUpdateAsset(activeAsset.id, { transform });
  };

  const handleModelInspected = (info: ModelInspectionResult) => {
    setHierarchy(info.hierarchy);

    const current = project.assets.find((a) => a.id === info.assetId);
    if (!current) return;
    const eqNum = (a?: number, b?: number) =>
      a === b || (Number.isNaN(a) && Number.isNaN(b));
    const sameDims =
      eqNum(current.dimensions?.width, info.dimensions.width) &&
      eqNum(current.dimensions?.height, info.dimensions.height) &&
      eqNum(current.dimensions?.depth, info.dimensions.depth);
    const sameTris = eqNum(current.triangleEstimate, info.triangleEstimate);
    const sameMats =
      (current.extractedMaterials?.length ?? 0) === info.materials.length;

    if (!sameDims || !sameTris || !sameMats) {
      onUpdateAsset(info.assetId, {
        dimensions: info.dimensions,
        triangleEstimate: info.triangleEstimate,
        extractedMaterials: info.materials,
      });
    }
  };

  const handleHierarchyChanged = (
    nextHierarchy: SceneHierarchyNode[],
    sceneState: SceneEditorState,
    stats: {
      dimensions: ModelDimensions;
      triangleEstimate: number;
      materials: ExtractedMaterialInfo[];
    }
  ) => {
    setHierarchy(nextHierarchy);
    if (!activeAsset) return;
    onUpdateAsset(activeAsset.id, {
      sceneState,
      dimensions: stats.dimensions,
      triangleEstimate: stats.triangleEstimate,
      extractedMaterials: stats.materials,
    });
  };

  const handleToggleNodeVisibility = (nodeId: string, visible: boolean) => {
    setHierarchy((prev) => updateHierarchyVisibility(prev, nodeId, visible));
    viewportRef.current?.setNodeVisibility(nodeId, visible);
  };

  const handleShowAllNodes = () => {
    if (activeAsset?.hidden) {
      onUpdateAsset(activeAsset.id, { hidden: false });
    }
    viewportRef.current?.showAllNodes();
  };

  const handleFocusNode = (nodeId: string | null) => {
    viewportRef.current?.focusNode(nodeId);
  };

  const handleHierarchyContextMenu = (
    clientX: number,
    clientY: number,
    nodeId: string | null
  ) => {
    viewportRef.current?.openContextMenuAt(clientX, clientY, nodeId);
  };

  const handleRenameFromHierarchy = (nodeId: string | null, newName: string) => {
    if (nodeId) {
      viewportRef.current?.renameNode(nodeId, newName);
    } else if (activeAsset) {
      onRenameAsset(activeAsset.id, newName);
    }
  };

  const handleWorkspaceDrop = async (e: React.DragEvent) => {
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    setWorkspaceDragOver(false);
    try {
      await onImportAssetFiles(e.dataTransfer.files);
      setLeftTab('assets');
    } catch (err) {
      onLog(
        'error',
        'Assets',
        err instanceof Error ? err.message : t('app.assetImportFailed', { error: '' })
      );
    }
  };

  const inspectorMode: 'asset' | 'manifest' =
    centerTab === 'editor' && selectedFile?.path === 'mod.manifest.json'
      ? 'manifest'
      : 'asset';

  const previewTabLabel =
    activeAsset?.type === 'texture'
      ? t('workspace.texturePreview')
      : activeAsset?.type === 'audio'
        ? t('workspace.audioPreview')
        : t('workspace.tabViewport');

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col overflow-hidden pb-14 md:pb-0"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setWorkspaceDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setWorkspaceDragOver(false);
        }
      }}
      onDrop={handleWorkspaceDrop}
    >
      {workspaceDragOver && (
        <div className="pointer-events-none fixed inset-4 z-40 rounded-xl border-2 border-dashed border-blue-500 bg-blue-600/10 backdrop-blur-xs flex items-center justify-center">
          <div className="px-6 py-4 rounded-lg bg-[#0E131D]/95 border border-blue-500/40 text-sm font-semibold text-white flex items-center gap-3 shadow-xl">
            <Upload className="w-5 h-5 text-blue-400" />
            <span>{t('workspace.dropAssetHint')}</span>
          </div>
        </div>
      )}

      {/* Mobile / Narrow-Screen Pane Switcher (< lg) */}
      <div className="lg:hidden h-11 shrink-0 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] px-2 flex items-center gap-1.5 overflow-x-auto">
        {(
          [
            { id: 'viewport', label: previewTabLabel, icon: <Box className="w-3.5 h-3.5" /> },
            { id: 'test', label: t('workspace.paneModTest'), icon: <Play className="w-3.5 h-3.5" /> },
            { id: 'content', label: t('workspace.paneContent'), icon: <Package className="w-3.5 h-3.5" /> },
            { id: 'systems', label: t('workspace.paneSystems'), icon: <GitBranch className="w-3.5 h-3.5" /> },
            { id: 'validation', label: t('workspace.tabValidation'), icon: <ShieldAlert className="w-3.5 h-3.5" /> },
            { id: 'explorer', label: t('workspace.paneSceneAssets'), icon: <FolderTree className="w-3.5 h-3.5" /> },
            { id: 'inspector', label: t('workspace.paneInspector'), icon: <Sliders className="w-3.5 h-3.5" /> },
            { id: 'console', label: t('workspace.tabConsole'), icon: <Terminal className="w-3.5 h-3.5" /> },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setMobilePane(tab.id);
              if (tab.id === 'content') setCenterTab('content');
              else if (tab.id === 'systems') setCenterTab('systems');
              else if (tab.id === 'validation') setCenterTab('validation');
              else if (tab.id === 'test') setCenterTab('test');
              else if (
                tab.id === 'viewport' &&
                (centerTab === 'content' ||
                  centerTab === 'systems' ||
                  centerTab === 'validation' ||
                  centerTab === 'test')
              ) {
                setCenterTab('viewport');
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 min-h-[38px] touch-target ${
              mobilePane === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main 3-Column IDE Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Dock: Scene Hierarchy / Asset Browser / Mod Structure */}
        <aside
          style={{ width: leftCollapsed ? undefined : `${leftDockWidth}px` }}
          className={`${
            mobilePane === 'explorer' ? 'flex !w-full' : 'hidden'
          } ${leftCollapsed ? 'lg:hidden' : 'lg:flex'} shrink-0 flex-col border-e border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823]`}
        >
          <div className="h-10 shrink-0 px-2 border-b border-slate-200 dark:border-white/10 flex items-center gap-1">
            {(
              [
                { id: 'scene', label: t('workspace.dockScene') },
                { id: 'assets', label: t('workspace.dockAssets') },
                { id: 'structure', label: t('workspace.dockFiles') },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLeftTab(tab.id)}
                className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  leftTab === tab.id
                    ? 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            {leftTab === 'scene' ? (
              <SceneHierarchyPanel
                assetName={
                  activeAsset?.type === '3d-model' ? activeAsset.name : null
                }
                assetLocked={activeAsset?.locked}
                assetHidden={activeAsset?.hidden}
                assetCollection={activeAsset?.collection}
                hierarchy={activeAsset?.type === '3d-model' ? hierarchy : []}
                selectedNodeId={selectedNodeId}
                selectedNodeIds={selectedNodeIds}
                selectionCleared={selectionCleared}
                onSelectNodes={handleSelectNodes}
                onToggleVisibility={handleToggleNodeVisibility}
                onShowAll={handleShowAllNodes}
                onFocusNode={handleFocusNode}
                onNodeContextMenu={handleHierarchyContextMenu}
                onRenameNode={handleRenameFromHierarchy}
              />
            ) : leftTab === 'assets' ? (
              <AssetBrowser
                assets={project.assets}
                activeAssetId={activeAsset?.id ?? null}
                onSelectAsset={handleSelectAssetItem}
                onImportFiles={onImportAssetFiles}
                onAddProceduralAsset={onAddProceduralAsset}
                onRenameAsset={onRenameAsset}
                onReplaceAsset={onReplaceAsset}
                onDuplicateAsset={onDuplicateAsset}
                onDeleteAsset={onDeleteAsset}
              />
            ) : (
              <ModStructureExplorer
                modName={project.manifest.name}
                files={project.files}
                selectedFilePath={selectedFilePath}
                onSelectFile={handleSelectFileNode}
                onAddFile={onAddFile}
                onDeleteFile={onDeleteFile}
              />
            )}
          </div>
        </aside>

        {/* Left Resize Handle (Desktop lg+) */}
        {!leftCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            title={t('workspace.resizePanels')}
            onPointerDown={(e) => startResize('left', e)}
            className="hidden lg:flex w-1 cursor-col-resize bg-transparent hover:bg-blue-500/50 active:bg-blue-500 transition-colors shrink-0"
          />
        )}

        {/* Center Stage: 3D Editor Viewport / Mod Test Sandbox / Content Editors / File Editor / Validation */}
        <main
          className={`${
            mobilePane === 'viewport' ||
            mobilePane === 'test' ||
            mobilePane === 'content' ||
            mobilePane === 'systems' ||
            mobilePane === 'validation'
              ? 'flex'
              : 'hidden'
          } lg:flex flex-1 min-w-0 min-h-0 flex-col bg-slate-100 dark:bg-[#0B0F17]`}
        >
          <div className="h-10 shrink-0 px-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] flex items-center justify-between gap-4 overflow-x-auto">
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setLeftCollapsed((c) => !c)}
                title={t('workspace.toggleLeftDock')}
                className="hidden lg:inline-flex p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors shrink-0"
              >
                {leftCollapsed ? (
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                ) : (
                  <PanelLeftClose className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setCenterTab('viewport')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  centerTab === 'viewport'
                    ? 'bg-slate-900 text-white dark:bg-white/10 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                {previewTabLabel}
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('content')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  centerTab === 'content'
                    ? 'bg-slate-900 text-white dark:bg-white/10 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                {t('workspace.tabContent')}
                {contentValidation.totalErrors > 0 && (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('systems')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  centerTab === 'systems'
                    ? 'bg-slate-900 text-white dark:bg-white/10 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                {t('workspace.tabSystems')}
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('editor')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  centerTab === 'editor'
                    ? 'bg-slate-900 text-white dark:bg-white/10 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                {t('workspace.tabFile')}
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('validation')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  centerTab === 'validation'
                    ? 'bg-slate-900 text-white dark:bg-white/10 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {validationReport && validationReport.errorCount > 0 ? (
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                ) : validationReport && validationReport.warningCount > 0 ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                )}
                <span>{t('workspace.tabValidation')}</span>
                {validationReport &&
                  (validationReport.errorCount > 0 ||
                    validationReport.warningCount > 0) && (
                    <span dir="ltr" className="font-mono text-[11px] tabular-nums opacity-80">
                      ({validationReport.errorCount + validationReport.warningCount})
                    </span>
                  )}
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('test')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  centerTab === 'test'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                {t('workspace.tabSandbox')}
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={!canUndo}
                onClick={onUndo}
                title={t('workspace.undoTooltip')}
                className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10 disabled:opacity-35 transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={onRedo}
                title={t('workspace.redoTooltip')}
                className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10 disabled:opacity-35 transition-colors"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onManualSave}
                title={t('workspace.saveNowTooltip')}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
              >
                <Save className="w-3 h-3" />
                <span className="hidden xl:inline">{t('common.save')}</span>
              </button>
              <button
                type="button"
                onClick={() => void onCreateBackup(`${t('workspace.snapshotBtn')} v${project.manifest.version}`)}
                title={t('workspace.snapshotTooltip')}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
              >
                <History className="w-3 h-3" />
                <span className="hidden xl:inline">{t('workspace.snapshotBtn')}</span>
              </button>
              <span className="hidden 2xl:inline-block text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 ps-1">
                {settings.autoSave
                  ? lastSavedAt
                    ? t('workspace.autosavedAt', { time: lastSavedAt })
                    : t('workspace.autosaveOn')
                  : t('workspace.autosaveOff')}
              </span>
              <button
                type="button"
                onClick={() => setRightCollapsed((c) => !c)}
                title={t('workspace.toggleRightDock')}
                className="hidden lg:inline-flex p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors shrink-0"
              >
                {rightCollapsed ? (
                  <PanelRightOpen className="w-3.5 h-3.5" />
                ) : (
                  <PanelRightClose className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            {centerTab === 'viewport' ? (
              activeAsset &&
              (activeAsset.type === 'texture' || activeAsset.type === 'audio') ? (
                <AssetMediaPreview asset={activeAsset} />
              ) : (
                <Viewport3D
                  ref={viewportRef}
                  asset={activeAsset}
                  projectAssets={project.assets}
                  contents={resolvedContents}
                  settings={settings}
                  hierarchy={hierarchy}
                  selectedNodeId={selectedNodeId}
                  selectedNodeIds={selectedNodeIds}
                  selectionCleared={selectionCleared}
                  selectedNodeName={selectedNodeName}
                  showBounds={showBounds}
                  showCollision={showCollision}
                  showPivot={showPivot}
                  lightingPreset={lightingPreset}
                  materialMode={materialMode}
                  onToggleBounds={() => setShowBounds((v) => !v)}
                  onToggleCollision={() => setShowCollision((v) => !v)}
                  onTogglePivot={() => setShowPivot((v) => !v)}
                  onChangeLighting={setLightingPreset}
                  onChangeMaterialMode={setMaterialMode}
                  onSelectNodes={handleSelectNodes}
                  onUpdateSettings={onUpdateSettings}
                  onUpdateAsset={onUpdateAsset}
                  onUpdateContents={onUpdateContents}
                  onRenameAsset={onRenameAsset}
                  onDuplicateAsset={onDuplicateAsset}
                  onDeleteAsset={onDeleteAsset}
                  onReplaceAsset={onReplaceAsset}
                  onRevealAssetInBrowser={(assetId) => {
                    onSelectAsset(assetId);
                    setLeftCollapsed(false);
                    setLeftTab('assets');
                    setMobilePane('explorer');
                  }}
                  onOpenTextureAsset={(texAssetId) => {
                    onSelectAsset(texAssetId);
                    setCenterTab('viewport');
                    setMobilePane('viewport');
                  }}
                  onOpenInspector={() => {
                    setRightCollapsed(false);
                    setMobilePane('inspector');
                  }}
                  onTransformChange={handleViewportTransformChange}
                  onModelInspected={handleModelInspected}
                  onHierarchyChanged={handleHierarchyChanged}
                  onLog={onLog}
                />
              )
            ) : centerTab === 'test' ? (
              <ModTestSandbox
                project={project}
                settings={settings}
                onLog={onLog}
              />
            ) : centerTab === 'content' ? (
              <ContentEditorsWorkbench
                modId={project.manifest.modId}
                contents={resolvedContents}
                assets={project.assets}
                activeKind={contentKind}
                focusTarget={contentFocus}
                onChangeKind={setContentKind}
                onUpdateContents={onUpdateContents}
                onPreviewAssetIn3D={(assetId) => {
                  onSelectAsset(assetId);
                  handleSelectNodes([], null, false);
                  setCenterTab('viewport');
                  setMobilePane('viewport');
                }}
              />
            ) : centerTab === 'systems' ? (
              <SystemsAndGraphsWorkbench
                project={project}
                allProjects={allProjects}
                backups={backups}
                onUpdateManifest={onUpdateManifest}
                onUpdateContents={onUpdateContents}
                onSaveFile={onSaveFile}
                onUpsertLocalizationFile={onUpsertLocalizationFile}
                onBumpVersion={onBumpVersion}
                onCreateBackup={onCreateBackup}
                onRestoreBackup={onRestoreBackup}
                onDeleteBackup={onDeleteBackup}
                onExportWorkspaceProject={onExportWorkspaceProject}
                onFocusContent={(kind, uid) => {
                  setContentKind(kind);
                  setContentFocus({ kind, uid, token: Date.now() });
                  setCenterTab('content');
                  setMobilePane('content');
                }}
                onSelectAsset={(assetId) => {
                  onSelectAsset(assetId);
                  handleSelectNodes([], null, false);
                  setCenterTab('viewport');
                  setMobilePane('viewport');
                }}
                onLog={onLog}
              />
            ) : centerTab === 'validation' ? (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="max-w-5xl mx-auto">
                  <ValidationPanel
                    report={validationReport}
                    isValidating={isValidating}
                    onRunValidation={() => void runLiveValidation()}
                    onInspectIssue={handleInspectIssue}
                  />
                </div>
              </div>
            ) : (
              <FileEditorPanel file={selectedFile} onSaveFile={onSaveFile} />
            )}
          </div>
        </main>

        {/* Right Resize Handle (Desktop lg+) */}
        {!rightCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            title={t('workspace.resizePanels')}
            onPointerDown={(e) => startResize('right', e)}
            className="hidden lg:flex w-1 cursor-col-resize bg-transparent hover:bg-blue-500/50 active:bg-blue-500 transition-colors shrink-0"
          />
        )}

        {/* Right Dock: Object Inspector */}
        <aside
          style={{ width: rightCollapsed ? undefined : `${rightDockWidth}px` }}
          className={`${
            mobilePane === 'inspector' ? 'flex !w-full' : 'hidden'
          } ${rightCollapsed ? 'lg:hidden' : 'lg:flex'} shrink-0 flex-col border-s border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823]`}
        >
          <PropertiesInspector
            mode={inspectorMode}
            asset={activeAsset}
            manifest={project.manifest}
            workspaceModIds={allProjects.map((p) => p.manifest.modId)}
            selectedNodeName={selectedNodeName}
            showBounds={showBounds}
            showCollision={showCollision}
            showPivot={showPivot}
            onToggleBounds={() => setShowBounds((v) => !v)}
            onToggleCollision={() => setShowCollision((v) => !v)}
            onTogglePivot={() => setShowPivot((v) => !v)}
            onUpdateAsset={onUpdateAsset}
            onUpdateManifest={onUpdateManifest}
          />
        </aside>

        {/* Mobile-only Console View */}
        {mobilePane === 'console' && (
          <div className="lg:hidden flex-1 flex flex-col min-h-0">
            <ConsolePanel
              logs={logs}
              collapsed={false}
              onToggleCollapse={() => setMobilePane('viewport')}
              onClear={onClearLogs}
            />
          </div>
        )}
      </div>

      {/* Desktop Bottom Dock: Console / Log Panel */}
      <div className="hidden lg:block">
        <ConsolePanel
          logs={logs}
          collapsed={consoleCollapsed}
          onToggleCollapse={() => setConsoleCollapsed((c) => !c)}
          onClear={onClearLogs}
        />
      </div>
    </div>
  );
};
