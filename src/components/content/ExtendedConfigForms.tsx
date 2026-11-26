import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, Play, Plus, Square, Trash2, Volume2 } from 'lucide-react';
import {
  AssetReferenceField,
  FieldShell,
  LootTableEditor,
  WOA_BIOMES,
  findFieldError,
} from '@/src/components/content/ContentFieldControls';
import {
  GraphEdgeItem,
  GraphNodeItem,
  NodeGraphCanvas,
} from '@/src/components/graphs/NodeGraphCanvas';
import { AnimationTimelineEditor } from '@/src/components/studios/AnimationTimelineEditor';
import { MaterialPreviewThumb } from '@/src/components/studios/MaterialPreviewThumb';
import { SandboxAudioEngine } from '@/src/core/audio/sandboxAudio';
import {
  ANIMATION_TARGET_TYPES,
  AUDIO_BUS_TYPES,
  MATERIAL_SHADER_PROFILES,
  WEAPON_ANIMATIONS,
  WORLD_OBJECT_KINDS,
} from '@/src/core/content/contentRegistry';
import { type TranslationKey, useI18n } from '@/src/i18n';
import {
  AnimationConfigEntry,
  AudioConfigEntry,
  AudioTriggerType,
  ContentValidationIssue,
  DialogueChoice,
  DialogueTreeDefinition,
  DialogueTreeNode,
  LootTableDefinition,
  MaterialAlphaMode,
  MaterialConfigEntry,
  ModAsset,
  ModContentDatabase,
  WorldObjectDefinition,
} from '@/src/types/mod';

export type ConfigPatchOptions = {
  recordUndo?: boolean;
  historyGroupKey?: string;
};

const AUDIO_TRIGGER_TYPES: AudioTriggerType[] = [
  'manual',
  'attack',
  'hit',
  'interact',
  'ambient',
  'quest',
];

const MATERIAL_ALPHA_MODES: MaterialAlphaMode[] = ['opaque', 'blend', 'cutoff'];

const inputClass = (hasError?: string | null) =>
  `w-full px-2.5 py-1.5 text-xs rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
    hasError
      ? 'border-red-500 focus:ring-red-500'
      : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
  }`;

const numInputClass = (hasError?: string | null) =>
  `w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
    hasError
      ? 'border-red-500 focus:ring-red-500'
      : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
  }`;

// -----------------------------------------------------------------------------
// 1. Animation Configuration Form
// -----------------------------------------------------------------------------
export const AnimationConfigForm: React.FC<{
  anim: AnimationConfigEntry;
  contents: ModContentDatabase;
  assets?: ModAsset[];
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<AnimationConfigEntry>, opts?: ConfigPatchOptions) => void;
}> = ({ anim, contents, assets = [], issues, onPatch }) => {
  const { t } = useI18n();
  const audioCueIds = (contents.audioCues ?? []).map((a) => a.id);
  const audioRef = useRef<SandboxAudioEngine | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const handleTriggerSoundCue = (soundCueId: string) => {
    if (!audioRef.current) {
      audioRef.current = new SandboxAudioEngine();
    }
    const cue = (contents.audioCues ?? []).find(
      (c) => c.id === soundCueId || c.uid === soundCueId
    );
    const refPath = cue?.assetPath || soundCueId;
    audioRef.current.setVolume(Math.min(1, Math.max(0.1, cue?.volume ?? 0.7)));
    void audioRef.current.playSoundReference(refPath, assets).catch(() => {
      audioRef.current?.playProceduralCue('woa:sfx_swing');
    });
  };

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
        {t('form.extAnimation')}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldShell label={t('form.animTargetType')} required>
          <select
            value={anim.targetType}
            onChange={(e) =>
              onPatch({
                targetType: e.target.value as AnimationConfigEntry['targetType'],
              })
            }
            className={inputClass()}
          >
            {ANIMATION_TARGET_TYPES.map((targetType) => (
              <option key={targetType} value={targetType}>
                {t(`form.animTarget.${targetType}` as TranslationKey)}
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell
          label={t('form.clipName')}
          required
          error={findFieldError(issues, 'clipName')}
        >
          <input
            type="text"
            dir="ltr"
            list="woa_anim_clips"
            value={anim.clipName}
            onChange={(e) => onPatch({ clipName: e.target.value })}
            placeholder="swing_one_handed"
            className={`${inputClass(findFieldError(issues, 'clipName'))} font-mono`}
          />
          <datalist id="woa_anim_clips">
            {WEAPON_ANIMATIONS.map((clip) => (
              <option key={clip} value={clip} />
            ))}
            <option value="idle_loop" />
            <option value="walk_cycle" />
            <option value="cast_spell" />
            <option value="interact_trigger" />
          </datalist>
        </FieldShell>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FieldShell
          label={t('form.playbackSpeed')}
          required
          error={findFieldError(issues, 'speed')}
        >
          <input
            type="number"
            dir="ltr"
            min={0.1}
            max={5}
            step={0.05}
            value={Number.isFinite(anim.speed) ? anim.speed : 1}
            onChange={(e) => onPatch({ speed: parseFloat(e.target.value) || 1 })}
            className={numInputClass(findFieldError(issues, 'speed'))}
          />
        </FieldShell>

        <FieldShell
          label={t('form.blendSeconds')}
          error={findFieldError(issues, 'blendSeconds')}
        >
          <input
            type="number"
            dir="ltr"
            min={0}
            max={3}
            step={0.02}
            value={Number.isFinite(anim.blendSeconds) ? anim.blendSeconds : 0}
            onChange={(e) => onPatch({ blendSeconds: parseFloat(e.target.value) || 0 })}
            className={numInputClass(findFieldError(issues, 'blendSeconds'))}
          />
        </FieldShell>

        <FieldShell
          label={t('form.hitFrame')}
          error={findFieldError(issues, 'hitFrameNormalized')}
        >
          <input
            type="number"
            dir="ltr"
            min={0}
            max={1}
            step={0.05}
            value={
              Number.isFinite(anim.hitFrameNormalized) ? anim.hitFrameNormalized : 0.5
            }
            onChange={(e) =>
              onPatch({ hitFrameNormalized: parseFloat(e.target.value) })
            }
            className={numInputClass(findFieldError(issues, 'hitFrameNormalized'))}
          />
        </FieldShell>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <FieldShell
          label={t('form.soundCueId')}
          error={findFieldError(issues, 'soundCueId')}
        >
          <input
            type="text"
            dir="ltr"
            list="woa_anim_cues"
            value={anim.soundCueId}
            onChange={(e) => onPatch({ soundCueId: e.target.value })}
            placeholder="modId:sfx_cue"
            className={`${inputClass(findFieldError(issues, 'soundCueId'))} font-mono`}
          />
          <datalist id="woa_anim_cues">
            {audioCueIds.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </FieldShell>

        <label className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B0F17] cursor-pointer">
          <input
            type="checkbox"
            checked={anim.loop}
            onChange={(e) => onPatch({ loop: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {t('form.loopAnim')}
          </span>
        </label>
      </div>

      <AnimationTimelineEditor
        animation={anim}
        onChange={(next, opts) => onPatch(next, opts)}
        onTriggerSoundCue={handleTriggerSoundCue}
      />
    </section>
  );
};

// -----------------------------------------------------------------------------
// 2. Audio Configuration Form
// -----------------------------------------------------------------------------
export const AudioConfigForm: React.FC<{
  cue: AudioConfigEntry;
  assets: ModAsset[];
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<AudioConfigEntry>, opts?: ConfigPatchOptions) => void;
}> = ({ cue, assets, issues, onPatch }) => {
  const { t } = useI18n();
  const audioEngineRef = useRef<SandboxAudioEngine | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      audioEngineRef.current?.dispose();
      audioEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioEngineRef.current?.stopAll();
    setIsPreviewPlaying(false);
    setPreviewError(null);
  }, [cue.uid]);

  const handleTogglePreview = async () => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new SandboxAudioEngine();
    }
    if (isPreviewPlaying) {
      audioEngineRef.current.stopAll();
      setIsPreviewPlaying(false);
      return;
    }
    setPreviewError(null);
    audioEngineRef.current.setVolume(Math.min(1, Math.max(0, cue.volume)));
    try {
      setIsPreviewPlaying(true);
      await audioEngineRef.current.playSoundReference(cue.assetPath, assets);
      if (cue.assetPath.startsWith('woa:')) {
        window.setTimeout(() => setIsPreviewPlaying(false), 320);
      }
    } catch (err) {
      setIsPreviewPlaying(false);
      setPreviewError(err instanceof Error ? err.message : 'Unable to play audio cue.');
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/10 pb-2">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-sky-500" />
          {t('form.extAudio')}
        </h3>
        <button
          type="button"
          onClick={() => void handleTogglePreview()}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
            isPreviewPlaying
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : 'border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B0F17] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
          }`}
        >
          {isPreviewPlaying ? (
            <Square className="w-3 h-3" />
          ) : (
            <Play className="w-3 h-3 text-emerald-500" />
          )}
          {isPreviewPlaying ? t('form.stopAudioPreview') : t('form.testPlayAudio')}
        </button>
      </div>

      {previewError && (
        <div className="px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-[11px] text-red-600 dark:text-red-300">
          {previewError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldShell label={t('form.audioBus')} required>
          <select
            value={cue.bus}
            onChange={(e) =>
              onPatch({ bus: e.target.value as AudioConfigEntry['bus'] })
            }
            className={inputClass()}
          >
            {AUDIO_BUS_TYPES.map((b) => (
              <option key={b} value={b}>
                {t(`form.bus.${b}` as TranslationKey)}
              </option>
            ))}
          </select>
        </FieldShell>

        <AssetReferenceField
          label={t('form.soundFilePath')}
          required
          value={cue.assetPath}
          assetType="audio"
          assets={assets}
          placeholder="assets/audio/sfx.ogg"
          error={findFieldError(issues, 'assetPath')}
          onChange={(assetPath) => onPatch({ assetPath })}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FieldShell label={t('form.volume')} error={findFieldError(issues, 'volume')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={2}
            step={0.05}
            value={Number.isFinite(cue.volume) ? cue.volume : 1}
            onChange={(e) => onPatch({ volume: parseFloat(e.target.value) })}
            className={numInputClass(findFieldError(issues, 'volume'))}
          />
        </FieldShell>

        <FieldShell label={t('form.pitchMin')} error={findFieldError(issues, 'pitch')}>
          <input
            type="number"
            dir="ltr"
            min={0.2}
            max={3}
            step={0.05}
            value={Number.isFinite(cue.pitchMin) ? cue.pitchMin : 1}
            onChange={(e) => onPatch({ pitchMin: parseFloat(e.target.value) })}
            className={numInputClass(findFieldError(issues, 'pitch'))}
          />
        </FieldShell>

        <FieldShell label={t('form.pitchMax')}>
          <input
            type="number"
            dir="ltr"
            min={0.2}
            max={3}
            step={0.05}
            value={Number.isFinite(cue.pitchMax) ? cue.pitchMax : 1}
            onChange={(e) => onPatch({ pitchMax: parseFloat(e.target.value) })}
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.maxDistance')}>
          <input
            type="number"
            dir="ltr"
            min={1}
            max={250}
            step={1}
            value={Number.isFinite(cue.maxDistanceMeters) ? cue.maxDistanceMeters : 24}
            onChange={(e) =>
              onPatch({ maxDistanceMeters: parseFloat(e.target.value) || 24 })
            }
            className={numInputClass()}
          />
        </FieldShell>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FieldShell label={t('form.audioTrigger')}>
          <select
            value={cue.trigger ?? 'manual'}
            onChange={(e) =>
              onPatch({ trigger: e.target.value as AudioTriggerType })
            }
            className={inputClass()}
          >
            {AUDIO_TRIGGER_TYPES.map((tr) => (
              <option key={tr} value={tr}>
                {t(`form.trigger.${tr}` as TranslationKey)}
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell label={t('form.minDistance')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={100}
            step={0.5}
            value={Number.isFinite(cue.minDistanceMeters) ? cue.minDistanceMeters : 2}
            onChange={(e) =>
              onPatch({ minDistanceMeters: Math.max(0, parseFloat(e.target.value) || 0) })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.fadeInSeconds')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={15}
            step={0.05}
            value={Number.isFinite(cue.fadeInSeconds) ? cue.fadeInSeconds : 0}
            onChange={(e) =>
              onPatch({ fadeInSeconds: Math.max(0, parseFloat(e.target.value) || 0) })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.fadeOutSeconds')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={15}
            step={0.05}
            value={Number.isFinite(cue.fadeOutSeconds) ? cue.fadeOutSeconds : 0}
            onChange={(e) =>
              onPatch({ fadeOutSeconds: Math.max(0, parseFloat(e.target.value) || 0) })
            }
            className={numInputClass()}
          />
        </FieldShell>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={cue.spatial}
            onChange={(e) => onPatch({ spatial: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          {t('form.spatial3d')}
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={cue.loop}
            onChange={(e) => onPatch({ loop: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          {t('form.loopAudio')}
        </label>
      </div>
    </section>
  );
};

// -----------------------------------------------------------------------------
// 3. Material Configuration Form
// -----------------------------------------------------------------------------
export const MaterialConfigForm: React.FC<{
  mat: MaterialConfigEntry;
  assets: ModAsset[];
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<MaterialConfigEntry>, opts?: ConfigPatchOptions) => void;
}> = ({ mat, assets, issues, onPatch }) => {
  const { t } = useI18n();

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
        {t('form.extMaterial')}
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5">
          <MaterialPreviewThumb material={mat} assets={assets} />
        </div>

        <div className="lg:col-span-7 space-y-4">
          <FieldShell label={t('form.shaderProfile')} required>
            <select
              value={mat.shaderProfile}
              onChange={(e) =>
                onPatch({
                  shaderProfile: e.target.value as MaterialConfigEntry['shaderProfile'],
                })
              }
              className={inputClass()}
            >
              {MATERIAL_SHADER_PROFILES.map((s) => (
                <option key={s} value={s}>
                  {t(`form.shader.${s}` as TranslationKey)}
                </option>
              ))}
            </select>
          </FieldShell>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldShell label={t('form.baseColor')}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={mat.baseColor}
                  onChange={(e) =>
                    onPatch(
                      { baseColor: e.target.value },
                      { recordUndo: true, historyGroupKey: `mat_col_${mat.uid}` }
                    )
                  }
                  className="h-8 w-10 rounded border border-slate-300 dark:border-white/15 bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={mat.baseColor}
                  onChange={(e) => onPatch({ baseColor: e.target.value })}
                  className={`${inputClass()} font-mono`}
                />
              </div>
            </FieldShell>

            <FieldShell label={t('form.emissiveColor')}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={mat.emissiveColor}
                  onChange={(e) =>
                    onPatch(
                      { emissiveColor: e.target.value },
                      { recordUndo: true, historyGroupKey: `mat_em_${mat.uid}` }
                    )
                  }
                  className="h-8 w-10 rounded border border-slate-300 dark:border-white/15 bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={mat.emissiveColor}
                  onChange={(e) => onPatch({ emissiveColor: e.target.value })}
                  className={`${inputClass()} font-mono`}
                />
              </div>
            </FieldShell>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AssetReferenceField
          label={t('form.albedoOptional')}
          value={mat.albedoTexture}
          assetType="texture"
          assets={assets}
          placeholder="assets/textures/albedo.png"
          onChange={(albedoTexture) => onPatch({ albedoTexture })}
        />

        <AssetReferenceField
          label={t('form.normalOptional')}
          value={mat.normalTexture}
          assetType="texture"
          assets={assets}
          placeholder="assets/textures/normal.png"
          onChange={(normalTexture) => onPatch({ normalTexture })}
        />

        <AssetReferenceField
          label={t('form.aoOptional')}
          value={mat.aoTexture ?? ''}
          assetType="texture"
          assets={assets}
          placeholder="assets/textures/ao.png"
          onChange={(aoTexture) => onPatch({ aoTexture })}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <FieldShell label={t('form.metallic')} error={findFieldError(issues, 'metallic')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={1}
            step={0.05}
            value={Number.isFinite(mat.metallic) ? mat.metallic : 0}
            onChange={(e) => onPatch({ metallic: parseFloat(e.target.value) })}
            className={numInputClass(findFieldError(issues, 'metallic'))}
          />
        </FieldShell>

        <FieldShell label={t('form.roughness')} error={findFieldError(issues, 'roughness')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={1}
            step={0.05}
            value={Number.isFinite(mat.roughness) ? mat.roughness : 0.5}
            onChange={(e) => onPatch({ roughness: parseFloat(e.target.value) })}
            className={numInputClass(findFieldError(issues, 'roughness'))}
          />
        </FieldShell>

        <FieldShell
          label={t('form.emissiveIntensity')}
          error={findFieldError(issues, 'emissiveIntensity')}
        >
          <input
            type="number"
            dir="ltr"
            min={0}
            max={5}
            step={0.1}
            value={Number.isFinite(mat.emissiveIntensity) ? mat.emissiveIntensity : 0}
            onChange={(e) =>
              onPatch({ emissiveIntensity: parseFloat(e.target.value) })
            }
            className={numInputClass(findFieldError(issues, 'emissiveIntensity'))}
          />
        </FieldShell>

        <FieldShell label={t('form.normalScale')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={2}
            step={0.1}
            value={Number.isFinite(mat.normalScale) ? mat.normalScale : 1}
            onChange={(e) =>
              onPatch({ normalScale: Math.max(0, parseFloat(e.target.value) || 0) })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.aoIntensity')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={2}
            step={0.1}
            value={Number.isFinite(mat.aoIntensity) ? mat.aoIntensity : 1}
            onChange={(e) =>
              onPatch({ aoIntensity: Math.max(0, parseFloat(e.target.value) || 0) })
            }
            className={numInputClass()}
          />
        </FieldShell>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <FieldShell label={t('form.alphaMode')}>
          <select
            value={mat.alphaMode ?? (mat.transparent ? 'blend' : 'opaque')}
            onChange={(e) => {
              const alphaMode = e.target.value as MaterialAlphaMode;
              onPatch({
                alphaMode,
                transparent: alphaMode === 'blend',
              });
            }}
            className={inputClass()}
          >
            {MATERIAL_ALPHA_MODES.map((m) => (
              <option key={m} value={m}>
                {m === 'opaque'
                  ? t('form.alphaOpaque')
                  : m === 'blend'
                    ? t('form.alphaBlend')
                    : t('form.alphaCutoff')}
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell label={t('form.opacity')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={1}
            step={0.05}
            value={Number.isFinite(mat.opacity) ? mat.opacity : 1}
            onChange={(e) => {
              const opacity = Math.min(1, Math.max(0, parseFloat(e.target.value) || 0));
              onPatch({
                opacity,
                transparent:
                  opacity < 1
                    ? true
                    : (mat.alphaMode ?? 'opaque') === 'blend',
              });
            }}
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.alphaCutoffThreshold')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            max={1}
            step={0.05}
            value={Number.isFinite(mat.alphaCutoff) ? mat.alphaCutoff : 0.5}
            onChange={(e) =>
              onPatch({
                alphaCutoff: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
              })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.uvTilingX')}>
          <input
            type="number"
            dir="ltr"
            min={0.1}
            step={0.5}
            value={mat.uvTiling.x}
            onChange={(e) =>
              onPatch({
                uvTiling: { ...mat.uvTiling, x: parseFloat(e.target.value) || 1 },
              })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.uvTilingY')}>
          <input
            type="number"
            dir="ltr"
            min={0.1}
            step={0.5}
            value={mat.uvTiling.y}
            onChange={(e) =>
              onPatch({
                uvTiling: { ...mat.uvTiling, y: parseFloat(e.target.value) || 1 },
              })
            }
            className={numInputClass()}
          />
        </FieldShell>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-center">
        <FieldShell label={t('form.uvOffsetX')}>
          <input
            type="number"
            dir="ltr"
            step={0.05}
            value={mat.uvOffset?.x ?? 0}
            onChange={(e) =>
              onPatch({
                uvOffset: {
                  x: parseFloat(e.target.value) || 0,
                  y: mat.uvOffset?.y ?? 0,
                },
              })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.uvOffsetY')}>
          <input
            type="number"
            dir="ltr"
            step={0.05}
            value={mat.uvOffset?.y ?? 0}
            onChange={(e) =>
              onPatch({
                uvOffset: {
                  x: mat.uvOffset?.x ?? 0,
                  y: parseFloat(e.target.value) || 0,
                },
              })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer pt-4">
          <input
            type="checkbox"
            checked={mat.doubleSided}
            onChange={(e) => onPatch({ doubleSided: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          {t('form.doubleSided')}
        </label>
      </div>
    </section>
  );
};

// -----------------------------------------------------------------------------
// 4. Standalone Loot Table Editor Form
// -----------------------------------------------------------------------------
export const LootTableConfigForm: React.FC<{
  table: LootTableDefinition;
  modId: string;
  availableItemIds: string[];
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<LootTableDefinition>) => void;
}> = ({ table, modId, availableItemIds, issues, onPatch }) => {
  const { t } = useI18n();

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
        {t('form.extLootTable')}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <FieldShell
          label={t('form.rollsMin')}
          required
          error={findFieldError(issues, 'rolls')}
        >
          <input
            type="number"
            dir="ltr"
            min={1}
            step={1}
            value={table.rollsMin}
            onChange={(e) =>
              onPatch({ rollsMin: Math.max(1, parseInt(e.target.value, 10) || 1) })
            }
            className={numInputClass(findFieldError(issues, 'rolls'))}
          />
        </FieldShell>

        <FieldShell label={t('form.rollsMax')} required>
          <input
            type="number"
            dir="ltr"
            min={1}
            step={1}
            value={table.rollsMax}
            onChange={(e) =>
              onPatch({ rollsMax: Math.max(1, parseInt(e.target.value, 10) || 1) })
            }
            className={numInputClass(findFieldError(issues, 'rolls'))}
          />
        </FieldShell>

        <label className="flex items-center gap-2 px-3 py-2 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B0F17] cursor-pointer">
          <input
            type="checkbox"
            checked={table.guaranteeOne}
            onChange={(e) => onPatch({ guaranteeOne: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {t('form.guaranteeOne')}
          </span>
        </label>
      </div>

      <LootTableEditor
        entries={table.entries}
        modId={modId}
        availableItemIds={availableItemIds}
        issues={issues}
        onChange={(entries) => onPatch({ entries })}
      />
    </section>
  );
};

// -----------------------------------------------------------------------------
// 5. Dialogue Tree Editor Form
// -----------------------------------------------------------------------------
export const DialogueTreeConfigForm: React.FC<{
  tree: DialogueTreeDefinition;
  modId: string;
  contents: ModContentDatabase;
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<DialogueTreeDefinition>, opts?: ConfigPatchOptions) => void;
}> = ({ tree, modId, contents, issues, onPatch }) => {
  const { t } = useI18n();
  const [showGraph, setShowGraph] = useState(true);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(
    tree.rootNodeId || tree.nodes[0]?.id || null
  );
  const npcIds = contents.npcs.map((n) => n.id);
  const questIds = contents.quests.map((q) => q.id);

  const dialogueGraphNodes = useMemo<GraphNodeItem[]>(
    () =>
      tree.nodes.map((node, idx) => ({
        id: node.id,
        kind: node.id === tree.rootNodeId ? 'start' : 'dialogue',
        title: node.speakerName || node.id,
        subtitle: node.text.slice(0, 42),
        badge: node.id === tree.rootNodeId ? 'ROOT' : node.mood,
        position: node.position ?? {
          x: 36 + (idx % 3) * 240,
          y: 36 + Math.floor(idx / 3) * 116,
        },
        portsOut: ['out'],
      })),
    [tree.nodes, tree.rootNodeId]
  );

  const dialogueGraphEdges = useMemo<GraphEdgeItem[]>(() => {
    const validIds = new Set(tree.nodes.map((n) => n.id));
    const list: GraphEdgeItem[] = [];
    for (const node of tree.nodes) {
      for (const ch of node.choices) {
        if (ch.nextNodeId && validIds.has(ch.nextNodeId)) {
          list.push({
            id: `${node.id}_${ch.id}_${ch.nextNodeId}`,
            fromNodeId: node.id,
            fromPort: 'out',
            toNodeId: ch.nextNodeId,
            toPort: 'in',
            label: ch.label.slice(0, 22),
          });
        }
      }
    }
    return list;
  }, [tree.nodes]);

  const addNode = () => {
    const id = `node_${tree.nodes.length + 1}_${Math.random().toString(36).slice(2, 5)}`;
    const nextNode: DialogueTreeNode = {
      id,
      speakerName: contents.npcs.find((n) => n.id === tree.npcId)?.name || 'Speaker',
      speakerNpcId: tree.npcId,
      mood: 'neutral',
      text: 'New dialogue branch line.',
      condition: '',
      questTriggerId: '',
      choices: [],
      position: {
        x: 36 + (tree.nodes.length % 3) * 240,
        y: 36 + Math.floor(tree.nodes.length / 3) * 116,
      },
    };
    onPatch({
      nodes: [...tree.nodes, nextNode],
      rootNodeId: tree.rootNodeId || id,
    });
  };

  const updateNode = (
    idx: number,
    patch: Partial<DialogueTreeNode>,
    opts?: ConfigPatchOptions
  ) => {
    onPatch(
      {
        nodes: tree.nodes.map((n, i) => (i === idx ? { ...n, ...patch } : n)),
      },
      opts
    );
  };

  const removeNode = (idx: number) => {
    onPatch({ nodes: tree.nodes.filter((_, i) => i !== idx) });
  };

  const addChoice = (nodeIdx: number) => {
    const node = tree.nodes[nodeIdx];
    const nextChoice: DialogueChoice = {
      id: `ch_${Date.now().toString().slice(-4)}`,
      label: 'Continue...',
      nextNodeId: '',
    };
    updateNode(nodeIdx, { choices: [...node.choices, nextChoice] });
  };

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldShell
          label={t('form.ownerNpcId')}
          required
          error={findFieldError(issues, 'npcId')}
        >
          <input
            type="text"
            dir="ltr"
            list="woa_dlg_npcs"
            value={tree.npcId}
            onChange={(e) => onPatch({ npcId: e.target.value })}
            placeholder={`${modId}:npc_id`}
            className={`${inputClass(findFieldError(issues, 'npcId'))} font-mono`}
          />
          <datalist id="woa_dlg_npcs">
            {npcIds.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </FieldShell>

        <FieldShell
          label={t('form.rootNodeId')}
          required
          error={findFieldError(issues, 'rootNodeId')}
        >
          <select
            dir="ltr"
            value={tree.rootNodeId}
            onChange={(e) => onPatch({ rootNodeId: e.target.value })}
            className={`${inputClass(findFieldError(issues, 'rootNodeId'))} font-mono`}
          >
            {tree.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} — {n.text.slice(0, 32)}
              </option>
            ))}
          </select>
        </FieldShell>
      </div>

      {/* Node Branching Flow Summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <GitBranch className="w-3.5 h-3.5 text-blue-500" />
            {t('form.dialogueNodesTitle', { count: tree.nodes.length })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGraph((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                showGraph
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                  : 'border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <GitBranch className="w-3 h-3" />
              {t('form.dialogueGraphToggle')}
            </button>
            <button
              type="button"
              onClick={addNode}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              {t('form.addDialogueNode')}
            </button>
          </div>
        </div>

        {showGraph && tree.nodes.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('form.dialogueGraphHint')}
            </p>
            <NodeGraphCanvas
              nodes={dialogueGraphNodes}
              edges={dialogueGraphEdges}
              selectedNodeId={selectedGraphNodeId}
              heightClass="h-[250px]"
              onSelectNode={(nid) => setSelectedGraphNodeId(nid)}
              onMoveNode={(nid, pos, dragging) => {
                const nodeIdx = tree.nodes.findIndex((n) => n.id === nid);
                if (nodeIdx >= 0) {
                  updateNode(
                    nodeIdx,
                    { position: pos },
                    dragging
                      ? { recordUndo: true, historyGroupKey: `dlg_drag_${tree.uid}_${nid}` }
                      : { recordUndo: true }
                  );
                }
              }}
            />
          </div>
        )}

        <datalist id="woa_dlg_quests">
          {questIds.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>

        <div className="space-y-3">
          {tree.nodes.map((node, idx) => (
            <div
              key={`${node.id}_${idx}`}
              className={`p-3 rounded-md border bg-white dark:bg-[#0B0F17] space-y-3 ${
                selectedGraphNodeId === node.id
                  ? 'border-blue-500 ring-1 ring-blue-500/40'
                  : 'border-slate-200 dark:border-white/10'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span dir="ltr" className="text-[11px] font-mono font-semibold text-blue-600 dark:text-blue-400">
                    {node.id === tree.rootNodeId ? 'ROOT' : `#${idx + 1}`}
                  </span>
                  <input
                    type="text"
                    dir="ltr"
                    value={node.id}
                    onChange={(e) => updateNode(idx, { id: e.target.value })}
                    placeholder="node_id"
                    className="w-36 px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#121823] text-slate-900 dark:text-slate-100"
                  />
                  <select
                    value={node.mood}
                    onChange={(e) =>
                      updateNode(idx, {
                        mood: e.target.value as DialogueTreeNode['mood'],
                      })
                    }
                    className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#121823] text-slate-700 dark:text-slate-200"
                  >
                    {(['neutral', 'friendly', 'quest', 'trade', 'urgent'] as const).map(
                      (m) => (
                        <option key={m} value={m}>
                          {t(`content.mood.${m}` as TranslationKey)}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {tree.nodes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeNode(idx)}
                    title={t('content.deleteTooltip')}
                    className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('form.nodeTextEn')}
                  </label>
                  <textarea
                    rows={2}
                    dir="auto"
                    value={node.text}
                    onChange={(e) => {
                      const nextText = e.target.value;
                      updateNode(idx, {
                        text: nextText,
                        textTranslations: node.textTranslations
                          ? { ...node.textTranslations, en: nextText }
                          : undefined,
                      });
                    }}
                    placeholder={t('content.placeholderEn')}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#121823] text-slate-900 dark:text-slate-100 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('form.nodeTextAr')}
                  </label>
                  <textarea
                    rows={2}
                    dir="rtl"
                    value={node.textTranslations?.ar ?? ''}
                    onChange={(e) =>
                      updateNode(idx, {
                        textTranslations: {
                          ...(node.textTranslations ?? {}),
                          en: node.text,
                          ar: e.target.value,
                        },
                      })
                    }
                    placeholder={t('content.placeholderAr')}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#121823] text-slate-900 dark:text-slate-100 resize-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldShell label={t('form.questTriggerId')}>
                  <input
                    type="text"
                    dir="ltr"
                    list="woa_dlg_quests"
                    value={node.questTriggerId ?? ''}
                    onChange={(e) =>
                      updateNode(idx, { questTriggerId: e.target.value })
                    }
                    placeholder={`${modId}:quest_id`}
                    className={`${inputClass()} font-mono`}
                  />
                </FieldShell>

                <FieldShell label={t('form.conditionExpr')}>
                  <input
                    type="text"
                    dir="ltr"
                    value={node.condition ?? ''}
                    onChange={(e) => updateNode(idx, { condition: e.target.value })}
                    placeholder="player.level >= 3"
                    className={`${inputClass()} font-mono`}
                  />
                </FieldShell>
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-200/70 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {t('form.choicesTitle', { count: node.choices.length })}
                  </span>
                  <button
                    type="button"
                    onClick={() => addChoice(idx)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                  >
                    <Plus className="w-3 h-3" />
                    {t('form.addChoice')}
                  </button>
                </div>

                {node.choices.map((ch, cIdx) => (
                  <div
                    key={ch.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2 rounded border border-slate-200/60 dark:border-white/5 bg-slate-50/70 dark:bg-[#101520]"
                  >
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        dir="auto"
                        value={ch.label}
                        onChange={(e) => {
                          const nextLabel = e.target.value;
                          updateNode(idx, {
                            choices: node.choices.map((c, j) =>
                              j === cIdx
                                ? {
                                    ...c,
                                    label: nextLabel,
                                    labelTranslations: c.labelTranslations
                                      ? { ...c.labelTranslations, en: nextLabel }
                                      : undefined,
                                  }
                                : c
                            ),
                          });
                        }}
                        placeholder={t('form.choiceLabelEn')}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-white/10 bg-white dark:bg-[#121823] text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        dir="rtl"
                        value={ch.labelTranslations?.ar ?? ''}
                        onChange={(e) =>
                          updateNode(idx, {
                            choices: node.choices.map((c, j) =>
                              j === cIdx
                                ? {
                                    ...c,
                                    labelTranslations: {
                                      ...(c.labelTranslations ?? {}),
                                      en: c.label,
                                      ar: e.target.value,
                                    },
                                  }
                                : c
                            ),
                          })
                        }
                        placeholder={t('form.choiceLabelAr')}
                        className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-white/10 bg-white dark:bg-[#121823] text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <select
                      dir="ltr"
                      value={ch.nextNodeId}
                      onChange={(e) =>
                        updateNode(idx, {
                          choices: node.choices.map((c, j) =>
                            j === cIdx ? { ...c, nextNodeId: e.target.value } : c
                          ),
                        })
                      }
                      className="sm:col-span-3 px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-white/10 bg-white dark:bg-[#121823] text-slate-800 dark:text-slate-200"
                    >
                      <option value="">{t('form.endConversation')}</option>
                      {tree.nodes.map((target) => (
                        <option key={target.id} value={target.id}>
                          {'-> '}
                          {target.id}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        updateNode(idx, {
                          choices: node.choices.filter((_, j) => j !== cIdx),
                        })
                      }
                      title={t('content.removeTooltip')}
                      className="sm:col-span-1 p-1 text-slate-400 hover:text-red-500 justify-self-end"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// -----------------------------------------------------------------------------
// 6. World Object Editor Form
// -----------------------------------------------------------------------------
export const WorldObjectConfigForm: React.FC<{
  worldObject: WorldObjectDefinition;
  contents: ModContentDatabase;
  assets: ModAsset[];
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<WorldObjectDefinition>) => void;
  onPreviewAssetIn3D?: (assetId: string) => void;
}> = ({ worldObject, contents, assets, issues, onPatch, onPreviewAssetIn3D }) => {
  const { t } = useI18n();

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
        {t('form.extWorldObject')}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldShell label={t('form.worldObjType')} required>
          <select
            value={worldObject.objectType}
            onChange={(e) =>
              onPatch({
                objectType: e.target.value as WorldObjectDefinition['objectType'],
              })
            }
            className={inputClass()}
          >
            {WORLD_OBJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`form.worldObjType.${k}` as TranslationKey)}
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell label={t('form.biome')} required>
          <select
            value={worldObject.biome}
            onChange={(e) => onPatch({ biome: e.target.value })}
            className={inputClass()}
          >
            {WOA_BIOMES.map((b) => (
              <option key={b} value={b}>
                {t(`content.biome.${b}` as TranslationKey)}
              </option>
            ))}
          </select>
        </FieldShell>
      </div>

      <AssetReferenceField
        label={t('form.model3d')}
        required
        value={worldObject.model}
        assetType="3d-model"
        assets={assets}
        placeholder="assets/models/object.woa3d"
        error={findFieldError(issues, 'model')}
        onChange={(model) => onPatch({ model })}
        onPreviewModel={onPreviewAssetIn3D}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldShell
          label={t('form.promptEn')}
          required
          error={findFieldError(issues, 'interactionPrompt')}
        >
          <input
            type="text"
            dir="auto"
            value={worldObject.interactionPrompt}
            onChange={(e) => {
              const nextPrompt = e.target.value;
              onPatch({
                interactionPrompt: nextPrompt,
                promptTranslations: worldObject.promptTranslations
                  ? { ...worldObject.promptTranslations, en: nextPrompt }
                  : undefined,
              });
            }}
            placeholder={t('content.placeholderEn')}
            className={inputClass(findFieldError(issues, 'interactionPrompt'))}
          />
        </FieldShell>

        <FieldShell label={t('form.promptAr')}>
          <input
            type="text"
            dir="rtl"
            value={worldObject.promptTranslations?.ar ?? ''}
            onChange={(e) =>
              onPatch({
                promptTranslations: {
                  ...(worldObject.promptTranslations ?? {}),
                  en: worldObject.interactionPrompt,
                  ar: e.target.value,
                },
              })
            }
            placeholder={t('content.placeholderAr')}
            className={inputClass()}
          />
        </FieldShell>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <FieldShell label={t('form.scale')} required error={findFieldError(issues, 'scale')}>
          <input
            type="number"
            dir="ltr"
            min={0.1}
            step={0.1}
            value={Number.isFinite(worldObject.scale) ? worldObject.scale : 1}
            onChange={(e) => onPatch({ scale: parseFloat(e.target.value) || 1 })}
            className={numInputClass(findFieldError(issues, 'scale'))}
          />
        </FieldShell>

        <FieldShell label={t('form.respawnSeconds')}>
          <input
            type="number"
            dir="ltr"
            min={0}
            step={15}
            value={worldObject.respawnSeconds}
            onChange={(e) =>
              onPatch({ respawnSeconds: Math.max(0, parseInt(e.target.value, 10) || 0) })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.posAxis', { axis: 'X' })}>
          <input
            type="number"
            dir="ltr"
            step={1}
            value={worldObject.position.x}
            onChange={(e) =>
              onPatch({
                position: { ...worldObject.position, x: parseFloat(e.target.value) || 0 },
              })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.posAxis', { axis: 'Y' })}>
          <input
            type="number"
            dir="ltr"
            step={1}
            value={worldObject.position.y}
            onChange={(e) =>
              onPatch({
                position: { ...worldObject.position, y: parseFloat(e.target.value) || 0 },
              })
            }
            className={numInputClass()}
          />
        </FieldShell>

        <FieldShell label={t('form.posAxis', { axis: 'Z' })}>
          <input
            type="number"
            dir="ltr"
            step={1}
            value={worldObject.position.z}
            onChange={(e) =>
              onPatch({
                position: { ...worldObject.position, z: parseFloat(e.target.value) || 0 },
              })
            }
            className={numInputClass()}
          />
        </FieldShell>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldShell label={t('form.materialConfigId')}>
          <select
            dir="ltr"
            value={worldObject.materialConfigId}
            onChange={(e) => onPatch({ materialConfigId: e.target.value })}
            className={`${inputClass()} font-mono`}
          >
            <option value="">{t('form.defaultAssetMat')}</option>
            {(contents.materials ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.id})
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell label={t('form.interactionAudioOptional')}>
          <select
            dir="ltr"
            value={worldObject.audioCueId}
            onChange={(e) => onPatch({ audioCueId: e.target.value })}
            className={`${inputClass()} font-mono`}
          >
            <option value="">{t('form.noneOption')}</option>
            {(contents.audioCues ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id})
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell label={t('form.lootTableId')}>
          <select
            dir="ltr"
            value={worldObject.lootTableId}
            onChange={(e) => onPatch({ lootTableId: e.target.value })}
            className={`${inputClass()} font-mono`}
          >
            <option value="">{t('form.noneOption')}</option>
            {(contents.lootTables ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.id})
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell label={t('form.linkedQuestId')}>
          <select
            dir="ltr"
            value={worldObject.questId}
            onChange={(e) => onPatch({ questId: e.target.value })}
            className={`${inputClass()} font-mono`}
          >
            <option value="">{t('form.noneOption')}</option>
            {contents.quests.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name} ({q.id})
              </option>
            ))}
          </select>
        </FieldShell>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
        <input
          type="checkbox"
          checked={worldObject.collisionEnabled}
          onChange={(e) => onPatch({ collisionEnabled: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        {t('form.enablePhysicsCollision')}
      </label>
    </section>
  );
};
