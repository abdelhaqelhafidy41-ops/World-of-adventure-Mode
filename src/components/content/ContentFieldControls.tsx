import React, { useState } from 'react';
import {
  AlertCircle,
  Box,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  extractObjectPart,
  formatNamespacedId,
  WOA_BIOMES,
} from '@/src/core/content/contentRegistry';
import {
  type LocalizedTextMap,
  MOD_CONTENT_LOCALES,
  type TranslationKey,
  useI18n,
} from '@/src/i18n';
import {
  ContentValidationIssue,
  LootDropEntry,
  ModAsset,
  NpcDialogueLine,
} from '@/src/types/mod';

export function findFieldError(
  issues: ContentValidationIssue[],
  field: string
): string | null {
  const match = issues.find((i) => i.field === field);
  return match ? match.message : null;
}

interface FieldShellProps {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}

export const FieldShell: React.FC<FieldShellProps> = ({
  label,
  required,
  error,
  hint,
  children,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-2">
      <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required && (
          <span className="text-red-500 ms-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <span className="text-[10px] text-slate-400 truncate">{hint}</span>
      )}
    </div>
    {children}
    {error && (
      <div className="flex items-start gap-1 text-[11px] text-red-600 dark:text-red-400 leading-snug">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    )}
  </div>
);

interface LocalizedTextFieldProps {
  label: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  value: string;
  translations?: LocalizedTextMap;
  error?: string | null;
  onChange: (nextValue: string, nextTranslations: LocalizedTextMap) => void;
}

export const LocalizedTextField: React.FC<LocalizedTextFieldProps> = ({
  label,
  required,
  multiline = false,
  rows = 2,
  value,
  translations,
  error,
  onChange,
}) => {
  const { t, language } = useI18n();
  const [activeLocale, setActiveLocale] = useState<'en' | 'ar'>(language);
  const arValue = translations?.ar ?? '';
  const hasArabic = arValue.trim().length > 0;

  const handleEnChange = (nextVal: string) => {
    const nextMap: LocalizedTextMap = {
      ...(translations ?? {}),
      en: nextVal,
    };
    onChange(nextVal, nextMap);
  };

  const handleArChange = (nextAr: string) => {
    const nextMap: LocalizedTextMap = {
      ...(translations ?? {}),
      en: translations?.en ?? value,
      ar: nextAr,
    };
    onChange(value, nextMap);
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {label}
          {required && (
            <span className="text-red-500 ms-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>

        <div className="inline-flex items-center rounded border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#0B0F17] p-0.5">
          {MOD_CONTENT_LOCALES.map((loc) => {
            const code = loc.code as 'en' | 'ar';
            const active = activeLocale === code;
            return (
              <button
                key={loc.code}
                type="button"
                onClick={() => setActiveLocale(code)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                  active
                    ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <span>
                  {code === 'en'
                    ? t('content.fieldLangDefault')
                    : t('content.fieldLangArabic')}
                </span>
                {code === 'ar' && hasArabic && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {activeLocale === 'en' ? (
        multiline ? (
          <textarea
            rows={rows}
            dir="auto"
            value={value}
            onChange={(e) => handleEnChange(e.target.value)}
            placeholder={t('content.placeholderEn')}
            className={`w-full px-2.5 py-1.5 text-xs rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 resize-none ${
              error
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
            }`}
          />
        ) : (
          <input
            type="text"
            dir="auto"
            value={value}
            onChange={(e) => handleEnChange(e.target.value)}
            placeholder={t('content.placeholderEn')}
            className={`w-full px-2.5 py-1.5 text-xs rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
              error
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
            }`}
          />
        )
      ) : multiline ? (
        <textarea
          rows={rows}
          dir="rtl"
          value={arValue}
          onChange={(e) => handleArChange(e.target.value)}
          placeholder={t('content.placeholderAr')}
          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      ) : (
        <input
          type="text"
          dir="rtl"
          value={arValue}
          onChange={(e) => handleArChange(e.target.value)}
          placeholder={t('content.placeholderAr')}
          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}

      {activeLocale === 'ar' && !hasArabic && (
        <div className="text-[10px] text-slate-400">
          {t('content.localeAllEmpty')}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1 text-[11px] text-red-600 dark:text-red-400 leading-snug">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

interface NamespacedIdFieldProps {
  value: string;
  modId: string;
  objectName: string;
  error?: string | null;
  onChange: (nextId: string) => void;
}

export const NamespacedIdField: React.FC<NamespacedIdFieldProps> = ({
  value,
  modId,
  objectName,
  error,
  onChange,
}) => {
  const { t } = useI18n();
  const wrongPrefix =
    value.includes(':') && !value.startsWith(`${modId}:`);

  const handleFixPrefix = () => {
    const slug = extractObjectPart(value) || objectName || 'object';
    onChange(formatNamespacedId(modId, slug));
  };

  const handleFromName = () => {
    onChange(formatNamespacedId(modId, objectName || 'object'));
  };

  return (
    <FieldShell
      label={t('content.namespacedIdLabel')}
      required
      error={error}
      hint={t('content.namespaceHint', { modId })}
    >
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${modId}:object_id`}
          className={`flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
          }`}
        />
        {wrongPrefix && (
          <button
            type="button"
            onClick={handleFixPrefix}
            title={t('content.fixPrefixTooltip', { modId })}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 whitespace-nowrap shrink-0"
          >
            <Wand2 className="w-3 h-3" />
            {t('content.fixPrefixBtn')}
          </button>
        )}
        <button
          type="button"
          onClick={handleFromName}
          title={t('content.fromNameTooltip')}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-3 h-3" />
          {t('content.fromNameBtn')}
        </button>
      </div>
    </FieldShell>
  );
};

interface AssetReferenceFieldProps {
  label: string;
  required?: boolean;
  value: string;
  assetType: '3d-model' | 'texture' | 'audio';
  assets: ModAsset[];
  placeholder: string;
  error?: string | null;
  onChange: (value: string) => void;
  onPreviewModel?: (assetId: string) => void;
}

export const AssetReferenceField: React.FC<AssetReferenceFieldProps> = ({
  label,
  required,
  value,
  assetType,
  assets,
  placeholder,
  error,
  onChange,
  onPreviewModel,
}) => {
  const { t } = useI18n();
  const matchingAssets = assets.filter((a) => a.type === assetType);
  const selectedProjectAsset = matchingAssets.find((a) => a.path === value);

  const pickerPlaceholder =
    assetType === '3d-model'
      ? t('content.pickModels', { count: matchingAssets.length })
      : assetType === 'texture'
        ? t('content.pickTextures', { count: matchingAssets.length })
        : t('content.pickAudio', { count: matchingAssets.length });

  return (
    <FieldShell label={label} required={required} error={error}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            dir="ltr"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
              error
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
            }`}
          />
          {assetType === '3d-model' && selectedProjectAsset && onPreviewModel && (
            <button
              type="button"
              onClick={() => onPreviewModel(selectedProjectAsset.id)}
              title={t('content.openIn3D')}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded border border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300 hover:bg-blue-500/20 whitespace-nowrap shrink-0"
            >
              <Box className="w-3 h-3" />
              3D
            </button>
          )}
        </div>

        {matchingAssets.length > 0 && (
          <select
            value={selectedProjectAsset ? selectedProjectAsset.path : ''}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
            className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] text-slate-600 dark:text-slate-300 focus:outline-none"
          >
            <option value="">{pickerPlaceholder}</option>
            {matchingAssets.map((a) => (
              <option key={a.id} value={a.path}>
                {a.name} ({a.path})
              </option>
            ))}
          </select>
        )}
      </div>
    </FieldShell>
  );
};

interface LootTableEditorProps {
  entries: LootDropEntry[];
  modId: string;
  availableItemIds: string[];
  issues: ContentValidationIssue[];
  onChange: (next: LootDropEntry[]) => void;
}

export const LootTableEditor: React.FC<LootTableEditorProps> = ({
  entries,
  modId,
  availableItemIds,
  issues,
  onChange,
}) => {
  const { t } = useI18n();
  const listId = React.useId();

  const handleAdd = () => {
    const defaultItem = availableItemIds[0] ?? `${modId}:item_id`;
    onChange([
      ...entries,
      {
        id: `loot_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        itemId: defaultItem,
        minCount: 1,
        maxCount: 1,
        chance: 50,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<LootDropEntry>) => {
    onChange(entries.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const removeRow = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  const lootIssues = issues.filter((i) => i.field.startsWith('loot.'));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {t('content.lootTableTitle', { count: entries.length })}
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors whitespace-nowrap"
        >
          <Plus className="w-3 h-3" />
          {t('form.addLootRow')}
        </button>
      </div>

      <datalist id={listId}>
        {availableItemIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>

      {entries.length === 0 ? (
        <div className="px-3 py-3 rounded border border-dashed border-slate-200 dark:border-white/10 text-[11px] text-slate-500 dark:text-slate-400">
          {t('content.lootEmptyHint')}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((row, idx) => (
            <div
              key={row.id}
              className="grid grid-cols-12 gap-2 items-center p-2 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]"
            >
              <div className="col-span-12 sm:col-span-5">
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  {t('content.lootItemIdLabel')}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  list={listId}
                  value={row.itemId}
                  onChange={(e) => updateRow(idx, { itemId: e.target.value })}
                  placeholder={`${modId}:item_id`}
                  className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  {t('content.lootMinLabel')}
                </label>
                <input
                  type="number"
                  dir="ltr"
                  min={1}
                  value={row.minCount}
                  onChange={(e) =>
                    updateRow(idx, { minCount: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-full px-2 py-1 text-xs font-mono tabular-nums rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none"
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  {t('content.lootMaxLabel')}
                </label>
                <input
                  type="number"
                  dir="ltr"
                  min={1}
                  value={row.maxCount}
                  onChange={(e) =>
                    updateRow(idx, { maxCount: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-full px-2 py-1 text-xs font-mono tabular-nums rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none"
                />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  {t('content.lootChanceLabel')}
                </label>
                <input
                  type="number"
                  dir="ltr"
                  min={0.1}
                  max={100}
                  step={0.5}
                  value={row.chance}
                  onChange={(e) =>
                    updateRow(idx, { chance: Number(e.target.value) || 0 })
                  }
                  className="w-full px-2 py-1 text-xs font-mono tabular-nums rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none"
                />
              </div>
              <div className="col-span-1 flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  title={t('content.removeTooltip')}
                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {lootIssues.map((issue, idx) => (
        <div
          key={`${issue.field}_${idx}`}
          className="flex items-start gap-1 text-[11px] text-red-600 dark:text-red-400"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
};

interface DialogueListEditorProps {
  lines: NpcDialogueLine[];
  issues: ContentValidationIssue[];
  onChange: (next: NpcDialogueLine[]) => void;
}

export const DialogueListEditor: React.FC<DialogueListEditorProps> = ({
  lines,
  issues,
  onChange,
}) => {
  const { t } = useI18n();

  const handleAdd = () => {
    onChange([
      ...lines,
      {
        id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        speakerMood: 'neutral',
        text: '',
        condition: '',
      },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<NpcDialogueLine>) => {
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) => {
    onChange(lines.filter((_, i) => i !== idx));
  };

  const dialogueIssues = issues.filter((i) => i.field.startsWith('dialogue.'));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {t('content.dialogueLinesTitle', { count: lines.length })}
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors whitespace-nowrap"
        >
          <Plus className="w-3 h-3" />
          {t('form.addDialogueLine')}
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="px-3 py-3 rounded border border-dashed border-slate-200 dark:border-white/10 text-[11px] text-slate-500 dark:text-slate-400">
          {t('content.dialogueEmptyHint')}
        </div>
      ) : (
        <div className="space-y-2">
          {lines.map((line, idx) => (
            <div
              key={line.id}
              className="p-2.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <select
                    value={line.speakerMood}
                    onChange={(e) =>
                      updateLine(idx, {
                        speakerMood: e.target.value as NpcDialogueLine['speakerMood'],
                      })
                    }
                    className="px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none"
                  >
                    {(['neutral', 'friendly', 'trade', 'quest', 'urgent'] as const).map(
                      (mood) => (
                        <option key={mood} value={mood}>
                          {t(`content.mood.${mood}` as TranslationKey)}
                        </option>
                      )
                    )}
                  </select>
                  <input
                    type="text"
                    dir="ltr"
                    value={line.condition ?? ''}
                    onChange={(e) => updateLine(idx, { condition: e.target.value })}
                    placeholder={t('content.dialogueConditionPlaceholder')}
                    className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  title={t('content.removeTooltip')}
                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-500/10 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('form.dialogueTextEn')}
                  </label>
                  <textarea
                    rows={2}
                    dir="auto"
                    value={line.text}
                    onChange={(e) => {
                      const nextText = e.target.value;
                      updateLine(idx, {
                        text: nextText,
                        textTranslations: line.textTranslations
                          ? { ...line.textTranslations, en: nextText }
                          : undefined,
                      });
                    }}
                    placeholder={t('content.dialogueLinePlaceholder')}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('form.dialogueTextAr')}
                  </label>
                  <textarea
                    rows={2}
                    dir="rtl"
                    value={line.textTranslations?.ar ?? ''}
                    onChange={(e) =>
                      updateLine(idx, {
                        textTranslations: {
                          ...(line.textTranslations ?? {}),
                          en: line.text,
                          ar: e.target.value,
                        },
                      })
                    }
                    placeholder={t('content.placeholderAr')}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogueIssues.map((issue, idx) => (
        <div
          key={`${issue.field}_${idx}`}
          className="flex items-start gap-1 text-[11px] text-red-600 dark:text-red-400"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
};

interface ReferenceListEditorProps {
  label: string;
  values: string[];
  placeholder: string;
  presets?: string[];
  presetLabelPrefix?: string;
  error?: string | null;
  onChange: (next: string[]) => void;
}

export const ReferenceListEditor: React.FC<ReferenceListEditorProps> = ({
  label,
  values,
  placeholder,
  presets,
  presetLabelPrefix,
  error,
  onChange,
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  const addEntry = (val: string) => {
    const clean = val.trim();
    if (!clean || values.includes(clean)) return;
    onChange([...values, clean]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          dir="ltr"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addEntry(draft);
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => addEntry(draft)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-slate-900 text-white dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/15 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('common.add')}
        </button>
      </div>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => {
            const active = values.includes(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() =>
                  active
                    ? onChange(values.filter((v) => v !== preset))
                    : onChange([...values, preset])
                }
                className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                  presetLabelPrefix ? '' : 'font-mono'
                } ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                {presetLabelPrefix
                  ? t(`${presetLabelPrefix}${preset}` as TranslationKey)
                  : preset}
              </button>
            );
          })}
        </div>
      )}

      {values.filter((v) => !presets || !presets.includes(v)).length > 0 && (
        <div className="space-y-1">
          {values
            .filter((v) => !presets || !presets.includes(v))
            .map((val, idx) => (
              <div
                key={`${val}_${idx}`}
                className="flex items-center justify-between gap-2 px-2.5 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]"
              >
                <span dir="ltr" className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
                  {val}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(values.filter((item) => item !== val))}
                  title={t('content.removeTooltip')}
                  className="p-0.5 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1 text-[11px] text-red-600 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export { WOA_BIOMES };

