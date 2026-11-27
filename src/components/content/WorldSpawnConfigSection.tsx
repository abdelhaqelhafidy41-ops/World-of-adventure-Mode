import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Info,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { FieldShell, findFieldError } from '@/src/components/content/ContentFieldControls';
import { SpawnPositionPreview3D } from '@/src/components/content/SpawnPositionPreview3D';
import {
  createDefaultSpawnBehavior,
  createDefaultSpawnConfig,
  createDefaultSpawnLocation,
  SPAWN_POSITION_MODES,
  SPAWN_TERRAIN_ALIGNMENTS,
  WOA_BIOMES,
} from '@/src/core/content/contentRegistry';
import { type TranslationKey, useI18n } from '@/src/i18n';
import {
  ContentSpawnBehavior,
  ContentSpawnConfig,
  ContentSpawnLocation,
  ContentValidationIssue,
  ModAsset,
  ModContentDatabase,
  SpawnNpcBehaviorMode,
  SpawnPositionMode,
  SpawnTerrainAlignment,
  SpawnTimeOfDay,
  SpawnVec3,
  WeatherCondition,
  WorldSpawnContentKind,
} from '@/src/types/mod';

interface WorldSpawnConfigSectionProps {
  kind: WorldSpawnContentKind;
  entryId: string;
  entryName: string;
  modelPath?: string;
  footprint?: { width: number; height: number; depth: number };
  assets: ModAsset[];
  contents: ModContentDatabase;
  spawnConfig?: ContentSpawnConfig;
  issues: ContentValidationIssue[];
  onChange: (next: ContentSpawnConfig | undefined) => void;
}

interface CopiedTransformPayload {
  position: SpawnVec3;
  rotation: SpawnVec3;
  scale: SpawnVec3;
}

let inMemoryCopiedTransform: CopiedTransformPayload | null = null;

interface CoordNumberInputProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  error?: string | null;
  onChange: (next: number) => void;
}

const CoordNumberInput: React.FC<CoordNumberInputProps> = ({
  label,
  value,
  step = 0.5,
  min,
  max,
  error,
  onChange,
}) => {
  const [draft, setDraft] = useState<string>(() =>
    Number.isFinite(value) ? String(value) : ''
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(Number.isFinite(value) ? String(value) : '');
    }
  }, [value, focused]);

  const commitText = (raw: string) => {
    setDraft(raw);
    const trimmed = raw.trim();
    if (
      trimmed === '' ||
      trimmed === '-' ||
      trimmed === '+' ||
      trimmed === '.' ||
      trimmed === '-.' ||
      trimmed === '+.' ||
      trimmed.endsWith('.')
    ) {
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    if (min !== undefined && parsed < min) return;
    if (max !== undefined && parsed > max) return;
    onChange(Object.is(parsed, -0) ? 0 : parsed);
  };

  const applyStep = (dir: -1 | 1) => {
    const base = Number.isFinite(value) ? value : 0;
    const raw = base + dir * step;
    const next = Math.round(raw * 1_000_000) / 1_000_000;
    const clamped =
      min !== undefined && next < min
        ? min
        : max !== undefined && next > max
          ? max
          : next;
    const clean = Object.is(clamped, -0) ? 0 : clamped;
    setDraft(String(clean));
    onChange(clean);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span dir="ltr" className="text-[11px] font-semibold font-mono text-slate-600 dark:text-slate-300">
          {label}
        </span>
      </div>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => applyStep(-1)}
          className="px-1.5 rounded-s border border-e-0 border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
          aria-label={`-${step}`}
        >
          <Minus className="w-3 h-3" />
        </button>
        <input
          type="text"
          inputMode="decimal"
          dir="ltr"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const parsed = Number(draft.trim());
            if (draft.trim() === '' || !Number.isFinite(parsed)) {
              setDraft(Number.isFinite(value) ? String(value) : '0');
            } else {
              let clamped = parsed;
              if (min !== undefined && clamped < min) clamped = min;
              if (max !== undefined && clamped > max) clamped = max;
              const clean = Object.is(clamped, -0) ? 0 : clamped;
              setDraft(String(clean));
              if (clean !== value) onChange(clean);
            }
          }}
          onChange={(e) => commitText(e.target.value)}
          className={`w-full min-w-0 px-2 py-1 text-xs font-mono tabular-nums text-center border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
          }`}
        />
        <button
          type="button"
          onClick={() => applyStep(1)}
          className="px-1.5 rounded-e border border-s-0 border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
          aria-label={`+${step}`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export const WorldSpawnConfigSection: React.FC<WorldSpawnConfigSectionProps> = ({
  kind,
  entryId,
  entryName,
  modelPath,
  footprint,
  assets,
  contents,
  spawnConfig,
  issues,
  onChange,
}) => {
  const { t } = useI18n();
  const [activeLocIdx, setActiveLocIdx] = useState(0);
  const [showPreview3D, setShowPreview3D] = useState(true);
  const [customBiome, setCustomBiome] = useState('');
  const [clipboardFeedback, setClipboardFeedback] = useState<string | null>(null);

  const isEnabled = Boolean(spawnConfig?.enabled);

  useEffect(() => {
    if (!spawnConfig) return;
    if (activeLocIdx >= spawnConfig.locations.length && spawnConfig.locations.length > 0) {
      setActiveLocIdx(spawnConfig.locations.length - 1);
    }
  }, [spawnConfig, activeLocIdx]);

  useEffect(() => {
    if (!clipboardFeedback) return;
    const timer = window.setTimeout(() => setClipboardFeedback(null), 1800);
    return () => clearTimeout(timer);
  }, [clipboardFeedback]);

  const spawnIssues = useMemo(
    () => issues.filter((issue) => issue.field.startsWith('spawnConfig')),
    [issues]
  );

  const referenceCandidates = useMemo(() => {
    const rows: { id: string; label: string }[] = [];
    const pushRows = (
      list: { id: string; name: string }[],
      kindLabel: string
    ) => {
      for (const item of list) {
        if (!item.id || item.id === entryId) continue;
        rows.push({ id: item.id, label: `${item.name || item.id} (${kindLabel})` });
      }
    };
    pushRows(contents.buildings, t('content.kind.building'));
    pushRows(contents.worldObjects ?? [], t('content.kind.world_object'));
    pushRows(contents.npcs, t('content.kind.npc'));
    pushRows(contents.monsters, t('content.kind.monster'));
    pushRows(contents.items, t('content.kind.item'));
    pushRows(contents.weapons, t('content.kind.weapon'));
    pushRows(contents.armor, t('content.kind.armor'));
    return rows;
  }, [contents, entryId, t]);

  const questOptions = useMemo(
    () => contents.quests.map((q) => ({ id: q.id, name: q.name })),
    [contents.quests]
  );

  const handleToggleAutoSpawn = (enabled: boolean) => {
    if (enabled) {
      if (spawnConfig) {
        onChange({
          ...spawnConfig,
          enabled: true,
          behavior: spawnConfig.behavior ?? createDefaultSpawnBehavior(kind),
          locations:
            spawnConfig.locations.length > 0
              ? spawnConfig.locations
              : [createDefaultSpawnLocation(0)],
        });
      } else {
        onChange(createDefaultSpawnConfig(kind));
      }
      setActiveLocIdx(0);
    } else if (spawnConfig) {
      onChange({ ...spawnConfig, enabled: false });
    }
  };

  const patchConfig = (patch: Partial<ContentSpawnConfig>) => {
    if (!spawnConfig) return;
    onChange({ ...spawnConfig, ...patch });
  };

  const patchBehavior = (patch: Partial<ContentSpawnBehavior>) => {
    if (!spawnConfig) return;
    onChange({
      ...spawnConfig,
      behavior: {
        ...(spawnConfig.behavior ?? createDefaultSpawnBehavior(kind)),
        ...patch,
      },
    });
  };

  const patchLocation = (index: number, patch: Partial<ContentSpawnLocation>) => {
    if (!spawnConfig) return;
    onChange({
      ...spawnConfig,
      locations: spawnConfig.locations.map((loc, i) =>
        i === index ? { ...loc, ...patch } : loc
      ),
    });
  };

  const activeLocation =
    spawnConfig && spawnConfig.locations.length > 0
      ? spawnConfig.locations[Math.min(activeLocIdx, spawnConfig.locations.length - 1)]
      : null;
  const activeIdx =
    spawnConfig && spawnConfig.locations.length > 0
      ? Math.min(activeLocIdx, spawnConfig.locations.length - 1)
      : 0;

  const handleAddLocation = () => {
    if (!spawnConfig) return;
    const prev = activeLocation;
    const nextIdx = spawnConfig.locations.length;
    const nextLoc = createDefaultSpawnLocation(nextIdx, {
      position: prev
        ? { x: prev.position.x + 2, y: prev.position.y, z: prev.position.z }
        : { x: 0, y: 0, z: 0 },
    });
    onChange({
      ...spawnConfig,
      locations: [...spawnConfig.locations, nextLoc],
    });
    setActiveLocIdx(nextIdx);
  };

  const handleDuplicateLocation = (index: number) => {
    if (!spawnConfig) return;
    const src = spawnConfig.locations[index];
    if (!src) return;
    const nextIdx = spawnConfig.locations.length;
    const duplicate: ContentSpawnLocation = {
      ...src,
      spawnId: `${src.spawnId}_copy_${nextIdx + 1}`,
      label: `${src.label} (${t('app.duplicateSuffix')})`,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      area: src.area ? { ...src.area } : undefined,
      conditions: {
        ...src.conditions,
        biomes: [...src.conditions.biomes],
      },
    };
    onChange({
      ...spawnConfig,
      locations: [...spawnConfig.locations, duplicate],
    });
    setActiveLocIdx(nextIdx);
  };

  const handleDeleteLocation = (index: number) => {
    if (!spawnConfig) return;
    const nextLocations = spawnConfig.locations.filter((_, i) => i !== index);
    onChange({
      ...spawnConfig,
      locations: nextLocations,
    });
    setActiveLocIdx((curr) => Math.max(0, Math.min(curr, nextLocations.length - 1)));
  };

  const handleResetTransform = () => {
    if (!activeLocation) return;
    patchLocation(activeIdx, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
  };

  const handleCopyCoords = async () => {
    if (!activeLocation) return;
    const payload: CopiedTransformPayload = {
      position: { ...activeLocation.position },
      rotation: { ...activeLocation.rotation },
      scale: { ...activeLocation.scale },
    };
    inMemoryCopiedTransform = payload;
    try {
      await navigator.clipboard?.writeText(JSON.stringify(payload));
    } catch {
      // clipboard API may be restricted in iframe; in-memory copy still works
    }
    setClipboardFeedback(t('spawnEditor.coordsCopied'));
  };

  const handlePasteCoords = async () => {
    if (!activeLocation) return;
    let payload: CopiedTransformPayload | null = inMemoryCopiedTransform;
    try {
      const clipText = await navigator.clipboard?.readText();
      if (clipText) {
        const parsed = JSON.parse(clipText) as Partial<CopiedTransformPayload>;
        if (
          parsed?.position &&
          typeof parsed.position.x === 'number' &&
          typeof parsed.position.y === 'number' &&
          typeof parsed.position.z === 'number'
        ) {
          payload = {
            position: {
              x: parsed.position.x,
              y: parsed.position.y,
              z: parsed.position.z,
            },
            rotation: {
              x: Number.isFinite(parsed.rotation?.x) ? parsed.rotation!.x : activeLocation.rotation.x,
              y: Number.isFinite(parsed.rotation?.y) ? parsed.rotation!.y : activeLocation.rotation.y,
              z: Number.isFinite(parsed.rotation?.z) ? parsed.rotation!.z : activeLocation.rotation.z,
            },
            scale: {
              x:
                Number.isFinite(parsed.scale?.x) && parsed.scale!.x > 0
                  ? parsed.scale!.x
                  : activeLocation.scale.x,
              y:
                Number.isFinite(parsed.scale?.y) && parsed.scale!.y > 0
                  ? parsed.scale!.y
                  : activeLocation.scale.y,
              z:
                Number.isFinite(parsed.scale?.z) && parsed.scale!.z > 0
                  ? parsed.scale!.z
                  : activeLocation.scale.z,
            },
          };
        }
      }
    } catch {
      // fallback to inMemoryCopiedTransform
    }

    if (!payload) {
      setClipboardFeedback(t('spawnEditor.noCopiedCoords'));
      return;
    }

    patchLocation(activeIdx, {
      position: { ...payload.position },
      rotation: { ...payload.rotation },
      scale: { ...payload.scale },
    });
    setClipboardFeedback(t('spawnEditor.coordsPasted'));
  };

  const behavior = spawnConfig?.behavior ?? createDefaultSpawnBehavior(kind);

  return (
    <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/10">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {t('spawnEditor.sectionTitle')}
            </h3>
            {isEnabled && spawnConfig && (
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                · {t('spawnEditor.locationsSummaryCount', { count: spawnConfig.locations.length })}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('spawnEditor.sectionDesc')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {spawnConfig && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="px-2 py-1 text-[11px] text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 rounded border border-slate-200 dark:border-white/10 hover:border-red-500/40"
              title={t('spawnEditor.clearConfigTooltip')}
            >
              {t('spawnEditor.clearConfig')}
            </button>
          )}
          <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 dark:border-white/15 bg-white dark:bg-[#101520] text-slate-800 dark:text-slate-100 cursor-pointer">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => handleToggleAutoSpawn(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>{t('spawnEditor.enableAutoSpawn')}</span>
          </label>
        </div>
      </div>

      {/* Disabled Empty State */}
      {!isEnabled && (
        <div className="p-3 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            {t('spawnEditor.disabledHint', { name: entryName || entryId })}
          </div>
          <button
            type="button"
            onClick={() => handleToggleAutoSpawn(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('spawnEditor.configureSpawnBtn')}
          </button>
        </div>
      )}

      {/* Active Configuration Workspace */}
      {isEnabled && spawnConfig && (
        <div className="space-y-5 p-3.5 sm:p-4 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520]">
          {/* Section-level Spawn Errors/Warnings */}
          {spawnIssues.length > 0 && (
            <div className="p-2.5 rounded border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-800 dark:text-amber-200 space-y-0.5">
              {spawnIssues.map((issue, idx) => (
                <div key={`${issue.field}_${idx}`}>
                  • {issue.message}
                </div>
              ))}
            </div>
          )}

          {/* Position Mode & Reference Anchor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldShell label={t('spawnEditor.positionMode')} required>
              <select
                value={spawnConfig.mode}
                onChange={(e) =>
                  patchConfig({ mode: e.target.value as SpawnPositionMode })
                }
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {SPAWN_POSITION_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`spawnEditor.mode.${m}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </FieldShell>

            {spawnConfig.mode === 'relative_reference' ? (
              <FieldShell
                label={t('spawnEditor.referenceObject')}
                required
                hint={t('spawnEditor.referenceRuntimeNote')}
                error={findFieldError(issues, 'spawnConfig.referenceObjectId')}
              >
                <div className="space-y-1.5">
                  <input
                    type="text"
                    dir="ltr"
                    list={`spawn-ref-list-${entryId}`}
                    value={spawnConfig.referenceObjectId ?? ''}
                    onChange={(e) => patchConfig({ referenceObjectId: e.target.value })}
                    placeholder="mod_id:shrine_altar"
                    className={`w-full px-2.5 py-1.5 text-xs font-mono rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
                      findFieldError(issues, 'spawnConfig.referenceObjectId')
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
                    }`}
                  />
                  <datalist id={`spawn-ref-list-${entryId}`}>
                    {referenceCandidates.map((cand) => (
                      <option key={cand.id} value={cand.id}>
                        {cand.label}
                      </option>
                    ))}
                  </datalist>
                </div>
              </FieldShell>
            ) : (
              <div className="p-2.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span>{t('spawnEditor.coordinateConvention')}</span>
              </div>
            )}
          </div>

          {/* 3D Interactive World Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <Globe className="w-3.5 h-3.5 text-cyan-500" />
                <span>{t('spawnEditor.preview3DTitle')}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview3D((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                {showPreview3D ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>{t('spawnEditor.hidePreview')}</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>{t('spawnEditor.showPreview')}</span>
                  </>
                )}
              </button>
            </div>

            {showPreview3D && spawnConfig.locations.length > 0 && (
              <SpawnPositionPreview3D
                kind={kind}
                modelPath={modelPath}
                footprint={footprint}
                assets={assets}
                spawnConfig={spawnConfig}
                activeLocationIndex={activeIdx}
                onSelectLocation={setActiveLocIdx}
                onChangeTransform={(idx, tr) => {
                  patchLocation(idx, {
                    position: tr.position,
                    rotation: tr.rotation,
                    scale: tr.scale,
                  });
                }}
              />
            )}
          </div>

          {/* Spawn Locations Manager */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t('spawnEditor.locationsTitle')}
              </h4>
              <button
                type="button"
                onClick={handleAddLocation}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('spawnEditor.addLocation')}
              </button>
            </div>

            {spawnConfig.locations.length === 0 ? (
              <div className="p-3 rounded border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
                <span>{t('val.spawnLocationsRequired')}</span>
                <button
                  type="button"
                  onClick={handleAddLocation}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500"
                >
                  {t('spawnEditor.addLocation')}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {spawnConfig.locations.map((loc, idx) => {
                  const isActive = idx === activeIdx;
                  return (
                    <button
                      key={`${loc.spawnId}_${idx}`}
                      type="button"
                      onClick={() => setActiveLocIdx(idx)}
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 text-xs rounded border transition-colors ${
                        isActive
                          ? 'border-blue-500 bg-blue-600/15 text-blue-700 dark:text-blue-200 font-semibold'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          loc.enabled ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      <span>{loc.label || `Location ${idx + 1}`}</span>
                      <span dir="ltr" className="font-mono text-[10px] tabular-nums opacity-75">
                        ({loc.position.x}, {loc.position.y}, {loc.position.z})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Active Location Form */}
            {activeLocation && (
              <div className="p-3 rounded border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-[#0B0F17] space-y-4">
                {/* Active Location Header Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-white/10">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeLocation.enabled}
                      onChange={(e) =>
                        patchLocation(activeIdx, { enabled: e.target.checked })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{t('spawnEditor.locationEnabled')}</span>
                  </label>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {clipboardFeedback && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium me-1">
                        {clipboardFeedback}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCopyCoords()}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10"
                    >
                      <ClipboardCopy className="w-3 h-3" />
                      <span>{t('spawnEditor.copyCoords')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePasteCoords()}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10"
                    >
                      <ClipboardPaste className="w-3 h-3" />
                      <span>{t('spawnEditor.pasteCoords')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetTransform}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{t('spawnEditor.resetCoords')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateLocation(activeIdx)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{t('spawnEditor.duplicateLocation')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLocation(activeIdx)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{t('spawnEditor.deleteLocation')}</span>
                    </button>
                  </div>
                </div>

                {/* Location Identity & Quantity */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FieldShell
                    label={t('spawnEditor.spawnId')}
                    required
                    error={findFieldError(issues, `spawnConfig.locations.${activeIdx}.spawnId`)}
                  >
                    <input
                      type="text"
                      dir="ltr"
                      value={activeLocation.spawnId}
                      onChange={(e) =>
                        patchLocation(activeIdx, { spawnId: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </FieldShell>

                  <FieldShell label={t('spawnEditor.locationLabel')}>
                    <input
                      type="text"
                      dir="auto"
                      value={activeLocation.label}
                      onChange={(e) =>
                        patchLocation(activeIdx, { label: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </FieldShell>

                  <FieldShell
                    label={t('spawnEditor.quantity')}
                    required
                    error={findFieldError(issues, `spawnConfig.locations.${activeIdx}.quantity`)}
                  >
                    <CoordNumberInput
                      label="QTY"
                      value={activeLocation.quantity}
                      step={1}
                      min={1}
                      error={findFieldError(issues, `spawnConfig.locations.${activeIdx}.quantity`)}
                      onChange={(val) =>
                        patchLocation(activeIdx, {
                          quantity: Math.max(1, Math.round(val)),
                        })
                      }
                    />
                  </FieldShell>
                </div>

                {/* Exact Coordinates: Position, Rotation, Scale */}
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('spawnEditor.worldCoordinates')}
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <CoordNumberInput
                        label="X (East/West)"
                        value={activeLocation.position.x}
                        step={0.5}
                        error={findFieldError(issues, `spawnConfig.locations.${activeIdx}.position`)}
                        onChange={(x) =>
                          patchLocation(activeIdx, {
                            position: { ...activeLocation.position, x },
                          })
                        }
                      />
                      <CoordNumberInput
                        label="Y (Height)"
                        value={activeLocation.position.y}
                        step={0.5}
                        error={findFieldError(issues, `spawnConfig.locations.${activeIdx}.position`)}
                        onChange={(y) =>
                          patchLocation(activeIdx, {
                            position: { ...activeLocation.position, y },
                          })
                        }
                      />
                      <CoordNumberInput
                        label="Z (North/South)"
                        value={activeLocation.position.z}
                        step={0.5}
                        error={findFieldError(issues, `spawnConfig.locations.${activeIdx}.position`)}
                        onChange={(z) =>
                          patchLocation(activeIdx, {
                            position: { ...activeLocation.position, z },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('spawnEditor.rotationDeg')}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <CoordNumberInput
                          label="Rot X°"
                          value={activeLocation.rotation.x}
                          step={5}
                          onChange={(x) =>
                            patchLocation(activeIdx, {
                              rotation: { ...activeLocation.rotation, x },
                            })
                          }
                        />
                        <CoordNumberInput
                          label="Rot Y°"
                          value={activeLocation.rotation.y}
                          step={15}
                          onChange={(y) =>
                            patchLocation(activeIdx, {
                              rotation: { ...activeLocation.rotation, y },
                            })
                          }
                        />
                        <CoordNumberInput
                          label="Rot Z°"
                          value={activeLocation.rotation.z}
                          step={5}
                          onChange={(z) =>
                            patchLocation(activeIdx, {
                              rotation: { ...activeLocation.rotation, z },
                            })
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('spawnEditor.scaleMultiplier')}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <CoordNumberInput
                          label="Scale X"
                          value={activeLocation.scale.x}
                          step={0.1}
                          min={0.01}
                          error={findFieldError(issues, `spawnConfig.locations.${activeIdx}.scale`)}
                          onChange={(x) =>
                            patchLocation(activeIdx, {
                              scale: { ...activeLocation.scale, x },
                            })
                          }
                        />
                        <CoordNumberInput
                          label="Scale Y"
                          value={activeLocation.scale.y}
                          step={0.1}
                          min={0.01}
                          error={findFieldError(issues, `spawnConfig.locations.${activeIdx}.scale`)}
                          onChange={(y) =>
                            patchLocation(activeIdx, {
                              scale: { ...activeLocation.scale, y },
                            })
                          }
                        />
                        <CoordNumberInput
                          label="Scale Z"
                          value={activeLocation.scale.z}
                          step={0.1}
                          min={0.01}
                          error={findFieldError(issues, `spawnConfig.locations.${activeIdx}.scale`)}
                          onChange={(z) =>
                            patchLocation(activeIdx, {
                              scale: { ...activeLocation.scale, z },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Random Area Bounds */}
                {spawnConfig.mode === 'random_area' && (() => {
                  const area = activeLocation.area ?? {
                    minX: activeLocation.position.x - 16,
                    maxX: activeLocation.position.x + 16,
                    minY: activeLocation.position.y,
                    maxY: activeLocation.position.y + 8,
                    minZ: activeLocation.position.z - 16,
                    maxZ: activeLocation.position.z + 16,
                    minDistance: 6,
                    maxInstances: 3,
                    deterministicSeedOffset: 0,
                  };
                  const patchArea = (patch: Partial<typeof area>) =>
                    patchLocation(activeIdx, { area: { ...area, ...patch } });

                  return (
                    <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h5 className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                          {t('spawnEditor.randomAreaBounds')}
                        </h5>
                        <button
                          type="button"
                          onClick={() =>
                            patchArea({
                              minX: activeLocation.position.x - 16,
                              maxX: activeLocation.position.x + 16,
                              minY: activeLocation.position.y,
                              maxY: activeLocation.position.y + 8,
                              minZ: activeLocation.position.z - 16,
                              maxZ: activeLocation.position.z + 16,
                            })
                          }
                          className="px-2 py-0.5 text-[11px] rounded border border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/15"
                        >
                          {t('spawnEditor.centerAreaOnPos')}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <CoordNumberInput
                          label="Min X"
                          value={area.minX}
                          step={1}
                          onChange={(minX) => patchArea({ minX })}
                        />
                        <CoordNumberInput
                          label="Max X"
                          value={area.maxX}
                          step={1}
                          onChange={(maxX) => patchArea({ maxX })}
                        />
                        <CoordNumberInput
                          label="Min Y"
                          value={area.minY}
                          step={1}
                          onChange={(minY) => patchArea({ minY })}
                        />
                        <CoordNumberInput
                          label="Max Y"
                          value={area.maxY}
                          step={1}
                          onChange={(maxY) => patchArea({ maxY })}
                        />
                        <CoordNumberInput
                          label="Min Z"
                          value={area.minZ}
                          step={1}
                          onChange={(minZ) => patchArea({ minZ })}
                        />
                        <CoordNumberInput
                          label="Max Z"
                          value={area.maxZ}
                          step={1}
                          onChange={(maxZ) => patchArea({ maxZ })}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <CoordNumberInput
                          label={t('spawnEditor.areaMinDistance')}
                          value={area.minDistance}
                          step={1}
                          min={0}
                          onChange={(minDistance) => patchArea({ minDistance })}
                        />
                        <CoordNumberInput
                          label={t('spawnEditor.areaMaxInstances')}
                          value={area.maxInstances}
                          step={1}
                          min={1}
                          onChange={(maxInstances) =>
                            patchArea({ maxInstances: Math.max(1, Math.round(maxInstances)) })
                          }
                        />
                        <CoordNumberInput
                          label={t('spawnEditor.areaSeedOffset')}
                          value={area.deterministicSeedOffset ?? 0}
                          step={1}
                          onChange={(deterministicSeedOffset) =>
                            patchArea({ deterministicSeedOffset: Math.round(deterministicSeedOffset) })
                          }
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Spawn Conditions */}
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
                  <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {t('spawnEditor.conditionsTitle')}
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                    {(
                      [
                        ['onNewWorld', t('spawnEditor.condNewWorld')],
                        ['onWorldLoadIfUnspawned', t('spawnEditor.condWorldLoad')],
                        ['onChunkLoad', t('spawnEditor.condChunkLoad')],
                        ['onPlayerEnterArea', t('spawnEditor.condPlayerEnter')],
                        ['preventDuplicateOnChunkReload', t('spawnEditor.condPreventDup')],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(activeLocation.conditions[key])}
                          onChange={(e) =>
                            patchLocation(activeIdx, {
                              conditions: {
                                ...activeLocation.conditions,
                                [key]: e.target.checked,
                              },
                            })
                          }
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>

                  {activeLocation.conditions.onPlayerEnterArea && (
                    <div className="max-w-xs">
                      <CoordNumberInput
                        label={t('spawnEditor.enterAreaRadius')}
                        value={activeLocation.conditions.enterAreaRadius}
                        step={2}
                        min={0.5}
                        onChange={(enterAreaRadius) =>
                          patchLocation(activeIdx, {
                            conditions: {
                              ...activeLocation.conditions,
                              enterAreaRadius,
                            },
                          })
                        }
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <FieldShell label={t('form.timeOfDay')}>
                      <select
                        value={activeLocation.conditions.timeOfDay}
                        onChange={(e) =>
                          patchLocation(activeIdx, {
                            conditions: {
                              ...activeLocation.conditions,
                              timeOfDay: e.target.value as SpawnTimeOfDay,
                            },
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100"
                      >
                        {(['any', 'day', 'night', 'dawn', 'dusk'] as const).map((tod) => (
                          <option key={tod} value={tod}>
                            {t(`content.time${tod.charAt(0).toUpperCase()}${tod.slice(1)}` as TranslationKey)}
                          </option>
                        ))}
                      </select>
                    </FieldShell>

                    <FieldShell label={t('form.weatherReq')}>
                      <select
                        value={activeLocation.conditions.weather}
                        onChange={(e) =>
                          patchLocation(activeIdx, {
                            conditions: {
                              ...activeLocation.conditions,
                              weather: e.target.value as WeatherCondition,
                            },
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100"
                      >
                        {(['any', 'clear', 'rain', 'storm'] as const).map((w) => (
                          <option key={w} value={w}>
                            {t(`form.weather.${w}` as TranslationKey)}
                          </option>
                        ))}
                      </select>
                    </FieldShell>

                    <FieldShell label={t('spawnEditor.regionOrDimension')}>
                      <input
                        type="text"
                        dir="ltr"
                        value={activeLocation.conditions.regionOrDimension ?? ''}
                        onChange={(e) =>
                          patchLocation(activeIdx, {
                            conditions: {
                              ...activeLocation.conditions,
                              regionOrDimension: e.target.value,
                            },
                          })
                        }
                        placeholder="overworld"
                        className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100"
                      />
                    </FieldShell>

                    <FieldShell
                      label={t('form.requiredQuestId')}
                      error={findFieldError(
                        issues,
                        `spawnConfig.locations.${activeIdx}.conditions.requiredQuestId`
                      )}
                    >
                      <div>
                        <input
                          type="text"
                          dir="ltr"
                          list={`spawn-quest-list-${entryId}`}
                          value={activeLocation.conditions.requiredQuestId ?? ''}
                          onChange={(e) =>
                            patchLocation(activeIdx, {
                              conditions: {
                                ...activeLocation.conditions,
                                requiredQuestId: e.target.value,
                              },
                            })
                          }
                          placeholder="mod_id:quest_id"
                          className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100"
                        />
                        <datalist id={`spawn-quest-list-${entryId}`}>
                          {questOptions.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.name}
                            </option>
                          ))}
                        </datalist>
                      </div>
                    </FieldShell>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <FieldShell label={t('spawnEditor.worldCondition')}>
                      <input
                        type="text"
                        dir="ltr"
                        value={activeLocation.conditions.worldCondition ?? ''}
                        onChange={(e) =>
                          patchLocation(activeIdx, {
                            conditions: {
                              ...activeLocation.conditions,
                              worldCondition: e.target.value,
                            },
                          })
                        }
                        placeholder="boss_defeated == false"
                        className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100"
                      />
                    </FieldShell>

                    <FieldShell label={t('spawnEditor.minPlayerDistance')}>
                      <input
                        type="number"
                        dir="ltr"
                        min={0}
                        step={1}
                        value={activeLocation.conditions.minPlayerDistance ?? ''}
                        onChange={(e) =>
                          patchLocation(activeIdx, {
                            conditions: {
                              ...activeLocation.conditions,
                              minPlayerDistance:
                                e.target.value === '' ? undefined : Number(e.target.value),
                            },
                          })
                        }
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-xs font-mono tabular-nums rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100"
                      />
                    </FieldShell>

                    <FieldShell label={t('spawnEditor.maxPlayerDistance')}>
                      <input
                        type="number"
                        dir="ltr"
                        min={0}
                        step={1}
                        value={activeLocation.conditions.maxPlayerDistance ?? ''}
                        onChange={(e) =>
                          patchLocation(activeIdx, {
                            conditions: {
                              ...activeLocation.conditions,
                              maxPlayerDistance:
                                e.target.value === '' ? undefined : Number(e.target.value),
                            },
                          })
                        }
                        placeholder="128"
                        className="w-full px-2 py-1.5 text-xs font-mono tabular-nums rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100"
                      />
                    </FieldShell>
                  </div>

                  {/* Biome Filters */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      {t('spawnEditor.biomeFilters')}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {WOA_BIOMES.map((biome) => {
                        const active = activeLocation.conditions.biomes.includes(biome);
                        return (
                          <button
                            key={biome}
                            type="button"
                            onClick={() => {
                              const nextBiomes = active
                                ? activeLocation.conditions.biomes.filter((b) => b !== biome)
                                : [...activeLocation.conditions.biomes, biome];
                              patchLocation(activeIdx, {
                                conditions: {
                                  ...activeLocation.conditions,
                                  biomes: nextBiomes,
                                },
                              });
                            }}
                            className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                              active
                                ? 'border-blue-500 bg-blue-600/15 text-blue-700 dark:text-blue-200 font-medium'
                                : 'border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                            }`}
                          >
                            {t(`content.biome.${biome}` as TranslationKey)}
                          </button>
                        );
                      })}
                      {activeLocation.conditions.biomes
                        .filter((b) => !WOA_BIOMES.includes(b))
                        .map((custom) => (
                          <button
                            key={custom}
                            type="button"
                            onClick={() =>
                              patchLocation(activeIdx, {
                                conditions: {
                                  ...activeLocation.conditions,
                                  biomes: activeLocation.conditions.biomes.filter(
                                    (b) => b !== custom
                                  ),
                                },
                              })
                            }
                            className="px-2 py-1 text-[11px] font-mono rounded border border-blue-500 bg-blue-600/15 text-blue-700 dark:text-blue-200"
                          >
                            {custom} ×
                          </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 max-w-xs pt-1">
                      <input
                        type="text"
                        dir="ltr"
                        value={customBiome}
                        onChange={(e) => setCustomBiome(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const clean = customBiome.trim();
                            if (clean && !activeLocation.conditions.biomes.includes(clean)) {
                              patchLocation(activeIdx, {
                                conditions: {
                                  ...activeLocation.conditions,
                                  biomes: [...activeLocation.conditions.biomes, clean],
                                },
                              });
                            }
                            setCustomBiome('');
                          }
                        }}
                        placeholder={t('content.customBiomePlaceholder')}
                        className="flex-1 px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const clean = customBiome.trim();
                          if (clean && !activeLocation.conditions.biomes.includes(clean)) {
                            patchLocation(activeIdx, {
                              conditions: {
                                ...activeLocation.conditions,
                                biomes: [...activeLocation.conditions.biomes, clean],
                              },
                            });
                          }
                          setCustomBiome('');
                        }}
                        className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10"
                      >
                        {t('common.add')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Content-Type-Specific Spawn Behavior */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('spawnEditor.behaviorTitle')}
            </h4>

            {kind === 'npc' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <FieldShell label={t('spawnEditor.npcMode')}>
                  <select
                    value={behavior.npcBehavior ?? 'stationary'}
                    onChange={(e) =>
                      patchBehavior({
                        npcBehavior: e.target.value as SpawnNpcBehaviorMode,
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                  >
                    <option value="stationary">{t('spawnEditor.npcStationary')}</option>
                    <option value="patrol">{t('spawnEditor.npcPatrol')}</option>
                  </select>
                </FieldShell>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-4">
                  <input
                    type="checkbox"
                    checked={behavior.uniquePersistent ?? true}
                    onChange={(e) =>
                      patchBehavior({ uniquePersistent: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{t('spawnEditor.npcUniquePersistent')}</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-4">
                  <input
                    type="checkbox"
                    checked={behavior.dialogueAvailable ?? true}
                    onChange={(e) =>
                      patchBehavior({ dialogueAvailable: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{t('spawnEditor.npcDialogueReady')}</span>
                </label>
              </div>
            )}

            {kind === 'monster' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <CoordNumberInput
                  label={t('spawnEditor.maxActiveInstances')}
                  value={behavior.maxActiveInstances ?? 4}
                  step={1}
                  min={1}
                  onChange={(val) =>
                    patchBehavior({ maxActiveInstances: Math.max(1, Math.round(val)) })
                  }
                />

                <FieldShell label={t('spawnEditor.groupBehavior')}>
                  <select
                    value={behavior.groupBehavior ?? 'pack'}
                    onChange={(e) =>
                      patchBehavior({
                        groupBehavior: e.target.value as 'solo' | 'pack' | 'territorial',
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                  >
                    <option value="solo">{t('spawnEditor.groupSolo')}</option>
                    <option value="pack">{t('spawnEditor.groupPack')}</option>
                    <option value="territorial">{t('spawnEditor.groupTerritorial')}</option>
                  </select>
                </FieldShell>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pb-1.5">
                  <input
                    type="checkbox"
                    checked={behavior.respawnEnabled ?? true}
                    onChange={(e) =>
                      patchBehavior({ respawnEnabled: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{t('spawnEditor.respawnEnabled')}</span>
                </label>

                <CoordNumberInput
                  label={t('spawnEditor.respawnDelay')}
                  value={behavior.respawnDelaySeconds ?? 180}
                  step={15}
                  min={0}
                  onChange={(val) =>
                    patchBehavior({ respawnDelaySeconds: Math.max(0, val) })
                  }
                />
              </div>
            )}

            {(kind === 'item' || kind === 'weapon' || kind === 'armor') && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pb-1.5">
                    <input
                      type="checkbox"
                      checked={behavior.pickupAvailable ?? true}
                      onChange={(e) =>
                        patchBehavior({ pickupAvailable: e.target.checked })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{t('spawnEditor.pickupAvailable')}</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pb-1.5">
                    <input
                      type="checkbox"
                      checked={behavior.respawnEnabled ?? false}
                      onChange={(e) =>
                        patchBehavior({ respawnEnabled: e.target.checked })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{t('spawnEditor.respawnEnabled')}</span>
                  </label>

                  <CoordNumberInput
                    label={t('spawnEditor.respawnDelay')}
                    value={behavior.respawnDelaySeconds ?? 120}
                    step={15}
                    min={0}
                    onChange={(val) =>
                      patchBehavior({ respawnDelaySeconds: Math.max(0, val) })
                    }
                  />

                  <div className="flex flex-wrap gap-3 pb-1.5">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={behavior.visualFloat ?? false}
                        onChange={(e) =>
                          patchBehavior({ visualFloat: e.target.checked })
                        }
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{t('spawnEditor.visualFloat')}</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={behavior.visualRotate ?? false}
                        onChange={(e) =>
                          patchBehavior({ visualRotate: e.target.checked })
                        }
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{t('spawnEditor.visualRotate')}</span>
                    </label>
                  </div>
                </div>
                {(behavior.visualFloat || behavior.visualRotate) && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('spawnEditor.visualRuntimeNote')}
                  </p>
                )}
              </div>
            )}

            {(kind === 'building' || kind === 'world_object') && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <FieldShell label={t('spawnEditor.terrainAlignment')}>
                  <select
                    value={behavior.terrainAlignment ?? 'conform_terrain'}
                    onChange={(e) =>
                      patchBehavior({
                        terrainAlignment: e.target.value as SpawnTerrainAlignment,
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                  >
                    {SPAWN_TERRAIN_ALIGNMENTS.map((align) => (
                      <option key={align} value={align}>
                        {t(`spawnEditor.terrain.${align}` as TranslationKey)}
                      </option>
                    ))}
                  </select>
                </FieldShell>

                <CoordNumberInput
                  label={t('spawnEditor.footprintRadius')}
                  value={
                    behavior.footprintRadius ??
                    (kind === 'building'
                      ? Math.max(footprint?.width ?? 4, footprint?.depth ?? 4) / 2
                      : 1.5)
                  }
                  step={0.5}
                  min={0.2}
                  onChange={(footprintRadius) => patchBehavior({ footprintRadius })}
                />

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pb-1.5">
                  <input
                    type="checkbox"
                    checked={behavior.validateCollisionOverlap ?? true}
                    onChange={(e) =>
                      patchBehavior({ validateCollisionOverlap: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{t('spawnEditor.validateOverlap')}</span>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
