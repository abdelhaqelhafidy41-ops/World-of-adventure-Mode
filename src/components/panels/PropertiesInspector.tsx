import React from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  CURRENT_GAME_VERSION,
  validateSupportedGameVersion,
} from '@/src/core/api/woaModApiSpec';
import { MOD_CATEGORIES } from '@/src/core/project/modScaffolder';
import { type TranslationKey, useI18n } from '@/src/i18n';
import {
  ASSET_MOD_CATEGORIES,
  AssetCollisionConfig,
  AssetMaterialConfig,
  AssetModCategory,
  AssetPresetKind,
  AssetTransform,
  CollisionShape,
  ModAsset,
  ModCategory,
  ModDependency,
  ModManifest,
  PivotMode,
} from '@/src/types/mod';

interface PropertiesInspectorProps {
  mode: 'asset' | 'manifest';
  asset: ModAsset | null;
  manifest: ModManifest;
  workspaceModIds?: string[];
  selectedNodeName: string | null;
  showBounds: boolean;
  showCollision: boolean;
  showPivot: boolean;
  onToggleBounds: () => void;
  onToggleCollision: () => void;
  onTogglePivot: () => void;
  onUpdateAsset: (
    assetId: string,
    patch: Partial<ModAsset>,
    options?: { recordUndo?: boolean; historyGroupKey?: string }
  ) => void;
  onUpdateManifest: (patch: Partial<ModManifest>) => void;
}

const PRESET_IDS: AssetPresetKind[] = [
  'relic-sword',
  'crystal-obelisk',
  'frontier-crate',
  'clockwork-sentinel',
  'beacon-pedestal',
];

export const PropertiesInspector: React.FC<PropertiesInspectorProps> = ({
  mode,
  asset,
  manifest,
  workspaceModIds = [],
  selectedNodeName,
  showBounds,
  showCollision,
  showPivot,
  onToggleBounds,
  onToggleCollision,
  onTogglePivot,
  onUpdateAsset,
  onUpdateManifest,
}) => {
  const { t, language } = useI18n();
  const gestureSeqRef = React.useRef(1);
  const bumpGesture = () => {
    gestureSeqRef.current += 1;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return t('common.bytes', { value: bytes });
    if (bytes < 1024 * 1024) {
      return t('common.kb', { value: (bytes / 1024).toFixed(1) });
    }
    return t('common.mb', { value: (bytes / (1024 * 1024)).toFixed(2) });
  };

  const toggleCategory = (cat: ModCategory) => {
    const next = manifest.categories.includes(cat)
      ? manifest.categories.length > 1
        ? manifest.categories.filter((c) => c !== cat)
        : manifest.categories
      : [...manifest.categories, cat];
    onUpdateManifest({ categories: next });
  };

  if (mode === 'manifest' || !asset) {
    const arName = manifest.translations?.name?.ar ?? '';
    const arDesc = manifest.translations?.description?.ar ?? '';

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10 shrink-0">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('inspector.manifestTitle')}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t('inspector.manifestNameEn')}
            </label>
            <input
              type="text"
              dir="auto"
              value={manifest.name}
              onChange={(e) => {
                const name = e.target.value;
                onUpdateManifest({
                  name,
                  translations: manifest.translations
                    ? {
                        ...manifest.translations,
                        name: { ...(manifest.translations.name ?? {}), en: name },
                      }
                    : undefined,
                });
              }}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t('inspector.manifestNameAr')}
            </label>
            <input
              type="text"
              dir="rtl"
              value={arName}
              placeholder={t('createMod.modNameArPlaceholder')}
              onChange={(e) =>
                onUpdateManifest({
                  translations: {
                    ...(manifest.translations ?? {}),
                    name: {
                      ...(manifest.translations?.name ?? {}),
                      en: manifest.name,
                      ar: e.target.value,
                    },
                  },
                })
              }
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t('inspector.manifestModId')}
            </label>
            <input
              type="text"
              dir="ltr"
              value={manifest.modId}
              readOnly
              className="w-full px-2.5 py-1.5 font-mono rounded border border-slate-200 bg-slate-100 text-slate-500 dark:border-white/5 dark:bg-[#0E131D] dark:text-slate-400 cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                {t('inspector.manifestVersion')}
              </label>
              <input
                type="text"
                dir="ltr"
                value={manifest.version}
                onChange={(e) => onUpdateManifest({ version: e.target.value })}
                className="w-full px-2.5 py-1.5 font-mono tabular-nums rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                {t('inspector.manifestAuthor')}
              </label>
              <input
                type="text"
                dir="auto"
                value={manifest.author}
                onChange={(e) => onUpdateManifest({ author: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t('inspector.manifestGameVer')}
            </label>
            {(() => {
              const gameVerCheck = validateSupportedGameVersion(manifest.supportedGameVersion);
              return (
                <>
                  <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={manifest.supportedGameVersion}
                    onChange={(e) =>
                      onUpdateManifest({ supportedGameVersion: e.target.value })
                    }
                    placeholder={CURRENT_GAME_VERSION}
                    aria-invalid={!gameVerCheck.valid}
                    className={`w-full px-2.5 py-1.5 font-mono tabular-nums rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
                      gameVerCheck.valid
                        ? 'border-slate-300 focus:ring-blue-500 dark:border-white/10'
                        : 'border-red-500 focus:ring-red-500 dark:border-red-500/70'
                    }`}
                  />
                  {!gameVerCheck.valid && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                      {gameVerCheck.error}
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t('inspector.manifestEntry')}
            </label>
            <input
              type="text"
              dir="ltr"
              value={manifest.entryPoint}
              onChange={(e) => onUpdateManifest({ entryPoint: e.target.value })}
              placeholder="scripts/main.ts"
              className="w-full px-2.5 py-1.5 font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t('inspector.manifestDescEn')}
            </label>
            <textarea
              rows={3}
              dir="auto"
              value={manifest.description}
              onChange={(e) => {
                const description = e.target.value;
                onUpdateManifest({
                  description,
                  translations: manifest.translations
                    ? {
                        ...manifest.translations,
                        description: {
                          ...(manifest.translations.description ?? {}),
                          en: description,
                        },
                      }
                    : undefined,
                });
              }}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t('inspector.manifestDescAr')}
            </label>
            <textarea
              rows={2}
              dir="rtl"
              value={arDesc}
              placeholder={t('createMod.descriptionArPlaceholder')}
              onChange={(e) =>
                onUpdateManifest({
                  translations: {
                    ...(manifest.translations ?? {}),
                    description: {
                      ...(manifest.translations?.description ?? {}),
                      en: manifest.description,
                      ar: e.target.value,
                    },
                  },
                })
              }
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
              {t('inspector.manifestCategories')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MOD_CATEGORIES.map((cat) => {
                const active = manifest.categories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t(`cat.${cat}` as TranslationKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                {t('inspector.depsSection', {
                  count: (manifest.dependencies ?? []).length,
                })}
              </label>
              <button
                type="button"
                onClick={() => {
                  const candidate =
                    workspaceModIds.find((id) => id !== manifest.modId) ??
                    'com.author.dependency_mod';
                  const next: ModDependency[] = [
                    ...(manifest.dependencies ?? []),
                    { modId: candidate, versionRange: '^1.0.0', optional: false },
                  ];
                  onUpdateManifest({ dependencies: next });
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <Plus className="w-3 h-3" />
                {t('common.add')}
              </button>
            </div>

            {(manifest.dependencies ?? []).length === 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('inspector.depsEmpty')}
              </p>
            ) : (
              <div className="space-y-2">
                {(manifest.dependencies ?? []).map((dep, idx) => (
                  <div
                    key={`${dep.modId}_${idx}`}
                    className="p-2 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        dir="ltr"
                        value={dep.modId}
                        onChange={(e) => {
                          const next = (manifest.dependencies ?? []).map((d, i) =>
                            i === idx ? { ...d, modId: e.target.value } : d
                          );
                          onUpdateManifest({ dependencies: next });
                        }}
                        placeholder="com.author.base_mod"
                        className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = (manifest.dependencies ?? []).filter(
                            (_, i) => i !== idx
                          );
                          onUpdateManifest({ dependencies: next });
                        }}
                        className="p-1 text-slate-400 hover:text-red-500"
                        title={t('inspector.depRemoveTooltip')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={dep.versionRange}
                        onChange={(e) => {
                          const next = (manifest.dependencies ?? []).map((d, i) =>
                            i === idx ? { ...d, versionRange: e.target.value } : d
                          );
                          onUpdateManifest({ dependencies: next });
                        }}
                        placeholder="^1.0.0"
                        className="w-24 px-2 py-1 text-[11px] font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                      />
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(dep.optional)}
                          onChange={(e) => {
                            const next = (manifest.dependencies ?? []).map((d, i) =>
                              i === idx ? { ...d, optional: e.target.checked } : d
                            );
                            onUpdateManifest({ dependencies: next });
                          }}
                        />
                        {t('inspector.depOptional')}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const updateTransform = (
    group: keyof AssetTransform,
    axis: 'x' | 'y' | 'z',
    val: number,
    historyGroupKey?: string
  ) => {
    const safe = Number.isFinite(val) ? val : 0;
    onUpdateAsset(
      asset.id,
      {
        transform: {
          ...asset.transform,
          [group]: {
            ...asset.transform[group],
            [axis]: safe,
          },
        },
      },
      historyGroupKey ? { historyGroupKey } : undefined
    );
  };

  const updateMaterial = (
    patch: Partial<AssetMaterialConfig>,
    historyGroupKey?: string
  ) => {
    onUpdateAsset(
      asset.id,
      {
        material: {
          ...asset.material,
          ...patch,
        },
      },
      historyGroupKey ? { historyGroupKey } : undefined
    );
  };

  const collision: AssetCollisionConfig = asset.collision ?? {
    shape: 'box',
    scale: 1,
    offsetY: 0,
  };

  const updateCollision = (
    patch: Partial<AssetCollisionConfig>,
    historyGroupKey?: string
  ) => {
    onUpdateAsset(
      asset.id,
      {
        collision: {
          ...collision,
          ...patch,
        },
      },
      historyGroupKey ? { historyGroupKey } : undefined
    );
  };

  const resetTransform = () => {
    onUpdateAsset(asset.id, {
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {t('inspector.objectInspectorTitle')}
        </span>
        <span dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
          {asset.format}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5 text-xs">
        {/* Identity & Mod Category Assignment */}
        <section className="space-y-2.5">
          {selectedNodeName && (
            <div className="px-2.5 py-1.5 rounded border border-blue-500/30 bg-blue-500/10 text-[11px] text-blue-700 dark:text-blue-300 flex items-center justify-between">
              <span className="truncate">
                {t('inspector.nodePrefix', { name: selectedNodeName })}
              </span>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t('inspector.objectName')}
            </label>
            <input
              type="text"
              dir="auto"
              value={asset.name}
              onChange={(e) => onUpdateAsset(asset.id, { name: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t('inspector.assetRoleLabel')}
            </label>
            <select
              value={asset.modCategory ?? 'Item'}
              onChange={(e) =>
                onUpdateAsset(asset.id, {
                  modCategory: e.target.value as AssetModCategory,
                })
              }
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ASSET_MOD_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`inspector.assetCat.${cat}` as TranslationKey)}
                </option>
              ))}
            </select>
          </div>

          {!asset.isImported && asset.type === '3d-model' && asset.preset && (
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                {t('inspector.baseArchetype')}
              </label>
              <select
                value={asset.preset}
                onChange={(e) =>
                  onUpdateAsset(asset.id, {
                    preset: e.target.value as AssetPresetKind,
                  })
                }
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PRESET_IDS.map((presetId) => (
                  <option key={presetId} value={presetId}>
                    {t(`inspector.preset.${presetId}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* 3D Transform & Pivot */}
        {asset.type === '3d-model' && (
          <section className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('inspector.transformTitle')}
                </span>
                {asset.locked && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    {t('ctx3d.lockedBadge')}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={Boolean(asset.locked)}
                onClick={resetTransform}
                title={t('inspector.resetTransform')}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3 h-3" />
                {t('inspector.resetBtn')}
              </button>
            </div>

            {(['position', 'rotation', 'scale'] as const).map((group) => (
              <div key={group}>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t(
                    group === 'position'
                      ? 'inspector.posGroup'
                      : group === 'rotation'
                        ? 'inspector.rotGroup'
                        : 'inspector.scaleGroup'
                  )}
                </div>
                <div dir="ltr" className="grid grid-cols-3 gap-1.5">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <label
                      key={axis}
                      className={`flex items-center rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] px-1.5 py-1 ${
                        asset.locked ? 'opacity-50' : ''
                      }`}
                    >
                      <span
                        className={`text-[10px] font-mono font-semibold uppercase me-1.5 ${
                          axis === 'x'
                            ? 'text-red-500'
                            : axis === 'y'
                              ? 'text-emerald-500'
                              : 'text-blue-500'
                        }`}
                      >
                        {axis}
                      </span>
                      <input
                        type="number"
                        dir="ltr"
                        disabled={Boolean(asset.locked)}
                        step={group === 'rotation' ? 5 : 0.1}
                        value={asset.transform[group][axis]}
                        onFocus={bumpGesture}
                        onBlur={bumpGesture}
                        onChange={(e) =>
                          updateTransform(
                            group,
                            axis,
                            parseFloat(e.target.value),
                            `tr:${asset.id}:${group}:${axis}:${gestureSeqRef.current}`
                          )
                        }
                        className="w-full bg-transparent text-[11px] font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none disabled:cursor-not-allowed"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="pt-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('inspector.pivotLabel')}
                </label>
                <select
                  value={asset.pivotMode ?? 'bottom-center'}
                  onChange={(e) =>
                    onUpdateAsset(asset.id, {
                      pivotMode: e.target.value as PivotMode,
                    })
                  }
                  className="px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none"
                >
                  <option value="bottom-center">{t('inspector.pivotGrounded')}</option>
                  <option value="center">{t('inspector.pivotCentered')}</option>
                </select>
              </div>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  {t('inspector.showPivotGizmo')}
                </span>
                <input
                  type="checkbox"
                  checked={showPivot}
                  onChange={onTogglePivot}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                />
              </label>
            </div>
          </section>
        )}

        {/* Bounding Box & Collision Configuration */}
        {asset.type === '3d-model' && (
          <section className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2.5">
            <span className="block font-semibold text-slate-800 dark:text-slate-200">
              {t('inspector.boundsCollision')}
            </span>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] text-slate-600 dark:text-slate-300">
                {t('inspector.showBoundingBox')}
              </span>
              <input
                type="checkbox"
                checked={showBounds}
                onChange={onToggleBounds}
                className="rounded border-slate-300 text-sky-500 focus:ring-sky-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] text-slate-600 dark:text-slate-300">
                {t('inspector.showCollisionVolume')}
              </span>
              <input
                type="checkbox"
                checked={showCollision}
                onChange={onToggleCollision}
                className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
              />
            </label>

            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                {t('inspector.collisionShape')}
              </label>
              <select
                value={collision.shape}
                onChange={(e) =>
                  updateCollision({ shape: e.target.value as CollisionShape })
                }
                className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="box">{t('inspector.boxCollider')}</option>
                <option value="capsule">{t('inspector.capsuleCollider')}</option>
                <option value="sphere">{t('inspector.sphereCollider')}</option>
                <option value="none">{t('inspector.noCollision')}</option>
              </select>
            </div>

            {collision.shape !== 'none' && (
              <>
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('inspector.collisionScale')}
                    </span>
                    <span dir="ltr" className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      {collision.scale.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.05"
                    value={collision.scale}
                    onPointerDown={bumpGesture}
                    onPointerUp={bumpGesture}
                    onBlur={bumpGesture}
                    onChange={(e) =>
                      updateCollision(
                        { scale: parseFloat(e.target.value) },
                        `col:${asset.id}:scale:${gestureSeqRef.current}`
                      )
                    }
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('inspector.collisionOffsetY')}
                    </span>
                    <span dir="ltr" className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      {collision.offsetY.toFixed(2)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.05"
                    value={collision.offsetY}
                    onPointerDown={bumpGesture}
                    onPointerUp={bumpGesture}
                    onBlur={bumpGesture}
                    onChange={(e) =>
                      updateCollision(
                        { offsetY: parseFloat(e.target.value) },
                        `col:${asset.id}:offsetY:${gestureSeqRef.current}`
                      )
                    }
                    className="w-full accent-emerald-500"
                  />
                </div>
              </>
            )}
          </section>
        )}

        {/* Extracted 3D Materials List */}
        {asset.type === '3d-model' &&
          asset.extractedMaterials &&
          asset.extractedMaterials.length > 0 && (
            <section className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('inspector.extractedMats', {
                    count: asset.extractedMaterials.length,
                  })}
                </span>
                <span dir="ltr" className="text-[11px] font-mono tabular-nums text-slate-500">
                  {asset.extractedMaterials.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {asset.extractedMaterials.map((mat, i) => (
                  <div
                    key={`${mat.name}_${i}`}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-sm border border-black/15 dark:border-white/20 shrink-0"
                        style={{ backgroundColor: mat.color }}
                      />
                      <div className="min-w-0">
                        <div dir="auto" className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">
                          {mat.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          <span dir="ltr">{mat.type}</span>
                          {typeof mat.roughness === 'number'
                            ? ` · ${t('inspector.roughnessShort', { val: mat.roughness })}`
                            : ''}
                          {typeof mat.metalness === 'number'
                            ? ` ${t('inspector.metalnessShort', { val: mat.metalness })}`
                            : ''}
                          {mat.hasTexture ? ` · ${t('inspector.texturedBadge')}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        {/* Procedural PBR Material Controls */}
        {asset.type === '3d-model' && (
          <section className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-3">
            <span className="block font-semibold text-slate-800 dark:text-slate-200">
              {t('inspector.surfaceControls')}
            </span>

            {!asset.isImported && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      {t('inspector.primaryColor')}
                    </label>
                    <div dir="ltr" className="flex items-center gap-2 px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]">
                      <input
                        type="color"
                        value={asset.material.color}
                        onPointerDown={bumpGesture}
                        onBlur={bumpGesture}
                        onChange={(e) =>
                          updateMaterial(
                            { color: e.target.value },
                            `mat:${asset.id}:color:${gestureSeqRef.current}`
                          )
                        }
                        className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                      />
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {asset.material.color.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      {t('inspector.accentColor')}
                    </label>
                    <div dir="ltr" className="flex items-center gap-2 px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]">
                      <input
                        type="color"
                        value={asset.material.accentColor}
                        onPointerDown={bumpGesture}
                        onBlur={bumpGesture}
                        onChange={(e) =>
                          updateMaterial(
                            { accentColor: e.target.value },
                            `mat:${asset.id}:accent:${gestureSeqRef.current}`
                          )
                        }
                        className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                      />
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {asset.material.accentColor.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('inspector.roughness')}
                    </span>
                    <span dir="ltr" className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      {asset.material.roughness.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.01"
                    value={asset.material.roughness}
                    onPointerDown={bumpGesture}
                    onPointerUp={bumpGesture}
                    onBlur={bumpGesture}
                    onChange={(e) =>
                      updateMaterial(
                        { roughness: parseFloat(e.target.value) },
                        `mat:${asset.id}:roughness:${gestureSeqRef.current}`
                      )
                    }
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('inspector.metalness')}
                    </span>
                    <span dir="ltr" className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      {asset.material.metalness.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={asset.material.metalness}
                    onPointerDown={bumpGesture}
                    onPointerUp={bumpGesture}
                    onBlur={bumpGesture}
                    onChange={(e) =>
                      updateMaterial(
                        { metalness: parseFloat(e.target.value) },
                        `mat:${asset.id}:metalness:${gestureSeqRef.current}`
                      )
                    }
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('inspector.emissive')}
                    </span>
                    <span dir="ltr" className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      {asset.material.emissiveIntensity.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={asset.material.emissiveIntensity}
                    onPointerDown={bumpGesture}
                    onPointerUp={bumpGesture}
                    onBlur={bumpGesture}
                    onChange={(e) =>
                      updateMaterial(
                        { emissiveIntensity: parseFloat(e.target.value) },
                        `mat:${asset.id}:emissive:${gestureSeqRef.current}`
                      )
                    }
                    className="w-full accent-blue-600"
                  />
                </div>
              </>
            )}

            <label className="flex items-center justify-between pt-1 cursor-pointer">
              <span className="text-[11px] text-slate-600 dark:text-slate-300">
                {t('inspector.wireframeOverlay')}
              </span>
              <input
                type="checkbox"
                checked={asset.material.wireframe}
                onChange={(e) => updateMaterial({ wireframe: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </section>
        )}

        {/* Asset Metadata */}
        <section className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2">
          <span className="block font-semibold text-slate-800 dark:text-slate-200">
            {t('inspector.assetMetadata')}
          </span>
          <dl className="space-y-1.5 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">
                {t('inspector.assetPath')}
              </dt>
              <dd dir="ltr" className="font-mono text-slate-800 dark:text-slate-200 truncate text-end">
                {asset.path}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">
                {t('media.fileSize')}
              </dt>
              <dd dir="ltr" className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {formatBytes(asset.sizeBytes)}
              </dd>
            </div>
            {asset.type === '3d-model' && (
              <>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500 dark:text-slate-400">
                    {t('inspector.triangles')}
                  </dt>
                  <dd dir="ltr" className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {asset.triangleEstimate.toLocaleString(
                      language === 'ar' ? 'ar' : 'en-US'
                    )}
                  </dd>
                </div>
                {asset.dimensions && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">
                      {t('inspector.dimensions')}
                    </dt>
                    <dd dir="ltr" className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {asset.dimensions.width} × {asset.dimensions.height} ×{' '}
                      {asset.dimensions.depth} m
                    </dd>
                  </div>
                )}
              </>
            )}
            {asset.type === 'texture' && asset.resolution && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">
                  {t('media.resolution')}
                </dt>
                <dd dir="ltr" className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {asset.resolution.width} × {asset.resolution.height} px
                </dd>
              </div>
            )}
            {asset.type === 'audio' && typeof asset.durationSeconds === 'number' && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">
                  {t('media.duration')}
                </dt>
                <dd dir="ltr" className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {asset.durationSeconds.toFixed(2)} s
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </div>
  );
};

