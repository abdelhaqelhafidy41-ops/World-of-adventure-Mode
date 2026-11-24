import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Axis3d,
  BoxSelect,
  Crosshair,
  Gauge,
  Grid,
  Magnet,
  MousePointer,
  Move,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scale,
  Shield,
  Sun,
  Target,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CameraPreset,
  GizmoMode,
  ModelInspectionResult,
  ModPreviewEngine,
} from '@/src/core/three/ModPreviewEngine';
import { useI18n } from '@/src/i18n';
import { usePlatform } from '@/src/platform';
import {
  AssetTransform,
  EditorSettings,
  LightingPreset,
  MaterialPreviewMode,
  ModAsset,
} from '@/src/types/mod';

export interface Viewport3DHandle {
  setNodeVisibility: (nodeId: string, visible: boolean) => void;
  focusNode: (nodeId: string | null) => void;
}

interface Viewport3DProps {
  asset: ModAsset | null;
  settings: EditorSettings;
  selectedNodeId: string | null;
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
  onSelectHierarchyNode: (nodeId: string | null) => void;
  onUpdateSettings: (patch: Partial<EditorSettings>) => void;
  onTransformChange: (transform: AssetTransform) => void;
  onModelInspected: (info: ModelInspectionResult) => void;
  onLog: (
    level: 'info' | 'warn' | 'error' | 'success',
    source: string,
    msg: string
  ) => void;
}

export const Viewport3D = React.forwardRef<Viewport3DHandle, Viewport3DProps>(
  (
    {
      asset,
      settings,
      selectedNodeId,
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
      onUpdateSettings,
      onTransformChange,
      onModelInspected,
      onLog,
    },
    ref
  ) => {
    const { t } = useI18n();
    const platformInfo = usePlatform();
    const mountRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<ModPreviewEngine | null>(null);
    const transformCbRef = useRef(onTransformChange);
    const inspectedCbRef = useRef(onModelInspected);
    const nodeSelectCbRef = useRef(onSelectHierarchyNode);
    const selectedNodeIdRef = useRef<string | null>(selectedNodeId);
    const logCbRef = useRef(onLog);
    const tRef = useRef(t);

    const [gizmoMode, setGizmoMode] = useState<GizmoMode>('select');
    const [cameraPreset, setCameraPreset] = useState<CameraPreset>('perspective');
    const [autoRotate, setAutoRotate] = useState(false);
    const [contextLost, setContextLost] = useState(false);

    transformCbRef.current = onTransformChange;
    inspectedCbRef.current = onModelInspected;
    nodeSelectCbRef.current = onSelectHierarchyNode;
    selectedNodeIdRef.current = selectedNodeId;
    logCbRef.current = onLog;
    tRef.current = t;

    useImperativeHandle(ref, () => ({
      setNodeVisibility: (nodeId: string, visible: boolean) => {
        engineRef.current?.setNodeVisibility(nodeId, visible);
      },
      focusNode: (nodeId: string | null) => {
        engineRef.current?.focusOnNode(nodeId);
      },
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const engine = new ModPreviewEngine(container, {
        onTransformChange: (next) => transformCbRef.current(next),
        onModelInspected: (info) => inspectedCbRef.current(info),
        onHierarchyNodeSelected: (nodeId) => nodeSelectCbRef.current(nodeId),
        onLongPress: () => engine.focusOnNode(selectedNodeIdRef.current ?? null),
        onLoadError: (msg) => logCbRef.current('error', '3D Preview', msg),
        onContextLost: () => {
          setContextLost(true);
          logCbRef.current('warn', '3D Preview', tRef.current('viewport.contextLostLog'));
        },
        onContextRestored: () => {
          setContextLost(false);
          logCbRef.current('info', '3D Preview', tRef.current('viewport.contextRestoredLog'));
        },
      });
      engineRef.current = engine;

      return () => {
        engine.dispose();
        engineRef.current = null;
      };
    }, []);

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
    }, [settings.viewportGrid, settings.viewportAxes, settings.showShadows, settings.lowPowerMode]);

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
      engineRef.current?.selectHierarchyNode(selectedNodeId);
    }, [selectedNodeId]);

    useEffect(() => {
      engineRef.current?.setGizmoMode(gizmoMode);
    }, [gizmoMode]);

    useEffect(() => {
      engineRef.current?.setAutoRotate(autoRotate);
    }, [autoRotate]);

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

    return (
      <div className="relative w-full h-full flex flex-col bg-[#0E131D] overflow-hidden">
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
              onClick={() => engineRef.current?.focusOnNode(selectedNodeId)}
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
        <div className="relative flex-1 min-h-0 touch-pan-canvas" dir="ltr">
          <div ref={mountRef} className="w-full h-full touch-pan-canvas" />

          <div
            dir={platformInfo.isTouchPrimary ? 'auto' : 'auto'}
            className="pointer-events-none hidden sm:block absolute end-3 bottom-3 px-2 py-1 rounded bg-[#0B0F17]/80 border border-white/10 text-[10px] text-slate-300"
          >
            {t(platformInfo.isTouchPrimary ? 'viewport.touchHint' : 'viewport.mouseHint')}
          </div>

          {asset && asset.type === '3d-model' && (
            <div className="pointer-events-none absolute start-3 bottom-3 px-2.5 py-1.5 rounded bg-[#0B0F17]/90 border border-white/10 text-[11px] text-slate-200 font-mono tabular-nums max-w-[calc(100%-1.5rem)] truncate">
              <span dir="auto">{asset.name}</span>
              {selectedNodeName ? ` › ${selectedNodeName}` : ''}
              {` · ${asset.modCategory ?? 'Item'}`}
              {asset.dimensions
                ? ` · ${asset.dimensions.width}×${asset.dimensions.height}×${asset.dimensions.depth} m`
                : ''}
              {` · ${t('viewport.tris', { count: asset.triangleEstimate })}`}
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
      </div>
    );
  }
);
