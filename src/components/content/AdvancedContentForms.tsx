import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  AssetReferenceField,
  FieldShell,
  findFieldError,
  ReferenceListEditor,
  WOA_BIOMES,
} from '@/src/components/content/ContentFieldControls';
import {
  BUILDING_CATEGORIES,
  CRAFTING_STATIONS,
  QUEST_OBJECTIVE_TYPES,
} from '@/src/core/content/contentRegistry';
import { type TranslationKey, useI18n } from '@/src/i18n';
import {
  BuildingCategory,
  BuildingDefinition,
  ContentValidationIssue,
  CraftingRecipeDefinition,
  CraftingStationType,
  ModAsset,
  ModContentDatabase,
  QuestDefinition,
  QuestObjectiveType,
  QuestType,
  SpawnDefinition,
  SpawnTimeOfDay,
  WeatherCondition,
} from '@/src/types/mod';

function numInput(
  value: number,
  onChange: (v: number) => void,
  opts: { min?: number; max?: number; step?: number; error?: string | null } = {}
) {
  return (
    <input
      type="number"
      dir="ltr"
      min={opts.min}
      max={opts.max}
      step={opts.step ?? 'any'}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
        opts.error
          ? 'border-red-500 focus:ring-red-500'
          : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
      }`}
    />
  );
}

// ============================================================================
// 1. QUEST EDITOR FORM
// ============================================================================
interface QuestEditorFormProps {
  quest: QuestDefinition;
  modId: string;
  contents: ModContentDatabase;
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<QuestDefinition>) => void;
}

export const QuestEditorForm: React.FC<QuestEditorFormProps> = ({
  quest,
  modId,
  contents,
  issues,
  onPatch,
}) => {
  const { t } = useI18n();
  const npcListId = React.useId();
  const itemListId = React.useId();
  const monsterListId = React.useId();
  const questListId = React.useId();

  const allItemIds = [
    ...contents.items.map((i) => i.id),
    ...contents.weapons.map((w) => w.id),
    ...contents.armor.map((a) => a.id),
  ];

  const addObjective = () => {
    onPatch({
      objectives: [
        ...quest.objectives,
        {
          id: `obj_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          type: 'kill',
          summary: '',
          targetId: contents.monsters[0]?.id ?? `${modId}:target_id`,
          requiredCount: 1,
        },
      ],
    });
  };

  const updateObjective = (
    idx: number,
    patch: Partial<QuestDefinition['objectives'][number]>
  ) => {
    onPatch({
      objectives: quest.objectives.map((obj, i) =>
        i === idx ? { ...obj, ...patch } : obj
      ),
    });
  };

  const addRewardItem = () => {
    onPatch({
      rewards: {
        ...quest.rewards,
        items: [
          ...quest.rewards.items,
          {
            id: `rew_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            itemId: allItemIds[0] ?? `${modId}:reward_item`,
            quantity: 1,
          },
        ],
      },
    });
  };

  const addDialogueStage = () => {
    onPatch({
      dialogue: [
        ...quest.dialogue,
        {
          id: `qdlg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          stage: 'offer',
          speakerNpcId: quest.giverNpcId || `${modId}:npc_id`,
          text: '',
        },
      ],
    });
  };

  return (
    <>
      <datalist id={npcListId}>
        {contents.npcs.map((n) => (
          <option key={n.uid} value={n.id} />
        ))}
      </datalist>
      <datalist id={itemListId}>
        {allItemIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      <datalist id={monsterListId}>
        {contents.monsters.map((m) => (
          <option key={m.uid} value={m.id} />
        ))}
      </datalist>
      <datalist id={questListId}>
        {contents.quests
          .filter((q) => q.uid !== quest.uid)
          .map((q) => (
            <option key={q.uid} value={q.id} />
          ))}
      </datalist>

      {/* Classification & Quest Chain Settings */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
          {t('form.questOverview')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <FieldShell label={t('content.questStyle')} required>
            <select
              value={quest.questType}
              onChange={(e) =>
                onPatch({ questType: e.target.value as QuestType })
              }
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="main">{t('form.mainQuest')}</option>
              <option value="side">{t('form.sideQuest')}</option>
            </select>
          </FieldShell>

          <FieldShell label={t('form.chapterRegion')}>
            <input
              type="text"
              dir="auto"
              value={quest.chapterOrRegion}
              onChange={(e) => onPatch({ chapterOrRegion: e.target.value })}
              placeholder="Skyreach Highlands"
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </FieldShell>

          <FieldShell label={t('form.recommendedLevel')}>
            {numInput(
              quest.recommendedLevel,
              (v) => onPatch({ recommendedLevel: Math.max(1, Math.round(v)) }),
              { min: 1, step: 1 }
            )}
          </FieldShell>

          <FieldShell label={t('form.giverNpcId')}>
            <input
              type="text"
              dir="ltr"
              list={npcListId}
              value={quest.giverNpcId}
              onChange={(e) => onPatch({ giverNpcId: e.target.value })}
              placeholder={`${modId}:npc_id`}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </FieldShell>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={quest.repeatable}
            onChange={(e) => onPatch({ repeatable: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          {t('form.repeatable')}
        </label>
      </section>

      {/* Objectives (Kill, Collect, Talk, Reach Location) */}
      <section className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('form.objectivesSection', { count: quest.objectives.length })}
          </h3>
          <button
            type="button"
            onClick={addObjective}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Plus className="w-3 h-3" />
            {t('form.addObjective')}
          </button>
        </div>

        {quest.objectives.map((obj, idx) => {
          const targetDatalist =
            obj.type === 'kill'
              ? monsterListId
              : obj.type === 'collect'
                ? itemListId
                : obj.type === 'talk'
                  ? npcListId
                  : undefined;

          return (
            <div
              key={obj.id}
              className="p-3 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 items-end">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      {t('form.objectiveType')}
                    </label>
                    <select
                      value={obj.type}
                      onChange={(e) => {
                        const type = e.target.value as QuestObjectiveType;
                        updateObjective(idx, {
                          type,
                          location:
                            type === 'reach_location'
                              ? obj.location ?? { x: 0, y: 0, z: 0, radius: 10 }
                              : undefined,
                        });
                      }}
                      className="w-full px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none"
                    >
                      {QUEST_OBJECTIVE_TYPES.map((qt) => (
                        <option key={qt.id} value={qt.id}>
                          {t(`content.questObj.${qt.id}` as TranslationKey)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      {t('form.objectiveSummaryEn')}
                    </label>
                    <input
                      type="text"
                      dir="auto"
                      value={obj.summary}
                      onChange={(e) => {
                        const nextSummary = e.target.value;
                        updateObjective(idx, {
                          summary: nextSummary,
                          summaryTranslations: obj.summaryTranslations
                            ? { ...obj.summaryTranslations, en: nextSummary }
                            : undefined,
                        });
                      }}
                      placeholder={t('content.placeholderEn')}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      {t('form.objectiveSummaryAr')}
                    </label>
                    <input
                      type="text"
                      dir="rtl"
                      value={obj.summaryTranslations?.ar ?? ''}
                      onChange={(e) =>
                        updateObjective(idx, {
                          summaryTranslations: {
                            ...(obj.summaryTranslations ?? {}),
                            en: obj.summary,
                            ar: e.target.value,
                          },
                        })
                      }
                      placeholder={t('content.placeholderAr')}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onPatch({
                      objectives: quest.objectives.filter((_, i) => i !== idx),
                    })
                  }
                  title={t('content.removeTooltip')}
                  className="p-1 text-slate-400 hover:text-red-500 mt-4"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {obj.type === 'kill'
                      ? t('form.targetMonsterId')
                      : obj.type === 'collect'
                        ? t('form.targetItemId')
                        : obj.type === 'talk'
                          ? t('form.targetNpcId')
                          : t('form.targetLocationId')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    list={targetDatalist}
                    value={obj.targetId}
                    onChange={(e) =>
                      updateObjective(idx, { targetId: e.target.value })
                    }
                    placeholder={`${modId}:target_id`}
                    className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none"
                  />
                </div>

                {(obj.type === 'kill' || obj.type === 'collect') && (
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      {t('form.requiredCount')}
                    </label>
                    {numInput(
                      obj.requiredCount,
                      (v) =>
                        updateObjective(idx, {
                          requiredCount: Math.max(1, Math.round(v)),
                        }),
                      { min: 1, step: 1 }
                    )}
                  </div>
                )}
              </div>

              {obj.type === 'collect' && (
                <label className="inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(obj.consumeOnComplete)}
                    onChange={(e) =>
                      updateObjective(idx, {
                        consumeOnComplete: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  {t('form.consumeOnComplete')}
                </label>
              )}

              {obj.type === 'reach_location' && (
                <div dir="ltr" className="grid grid-cols-4 gap-2 pt-1">
                  {(['x', 'y', 'z', 'radius'] as const).map((coord) => (
                    <div key={coord}>
                      <label className="block text-[10px] uppercase text-slate-400 mb-0.5">
                        {coord === 'radius'
                          ? t('form.reachRadius')
                          : t('form.posAxis', { axis: coord.toUpperCase() })}
                      </label>
                      {numInput(
                        obj.location?.[coord] ?? (coord === 'radius' ? 10 : 0),
                        (v) =>
                          updateObjective(idx, {
                            location: {
                              x: obj.location?.x ?? 0,
                              y: obj.location?.y ?? 0,
                              z: obj.location?.z ?? 0,
                              radius: obj.location?.radius ?? 10,
                              [coord]: v,
                            },
                          }),
                        { min: coord === 'radius' ? 1 : undefined, step: 1 }
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Rewards */}
      <section className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('form.rewardsSection')}
          </h3>
          <button
            type="button"
            onClick={addRewardItem}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Plus className="w-3 h-3" />
            {t('form.rewardItems')}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FieldShell label={t('form.rewardXp')}>
            {numInput(
              quest.rewards.xp,
              (v) =>
                onPatch({
                  rewards: { ...quest.rewards, xp: Math.max(0, Math.round(v)) },
                }),
              { min: 0, step: 25 }
            )}
          </FieldShell>

          <FieldShell label={t('form.rewardGold')}>
            {numInput(
              quest.rewards.gold,
              (v) =>
                onPatch({
                  rewards: { ...quest.rewards, gold: Math.max(0, Math.round(v)) },
                }),
              { min: 0, step: 10 }
            )}
          </FieldShell>

          <FieldShell label={t('form.repFaction')}>
            <input
              type="text"
              dir="ltr"
              value={quest.rewards.reputationFaction}
              onChange={(e) =>
                onPatch({
                  rewards: {
                    ...quest.rewards,
                    reputationFaction: e.target.value,
                  },
                })
              }
              className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none"
            />
          </FieldShell>

          <FieldShell label={t('form.repAmount')}>
            {numInput(
              quest.rewards.reputationAmount,
              (v) =>
                onPatch({
                  rewards: {
                    ...quest.rewards,
                    reputationAmount: Math.round(v),
                  },
                }),
              { step: 10 }
            )}
          </FieldShell>
        </div>

        {quest.rewards.items.map((ri, idx) => (
          <div
            key={ri.id}
            className="grid grid-cols-12 gap-2 items-center p-2 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]"
          >
            <div className="col-span-8">
              <input
                type="text"
                dir="ltr"
                list={itemListId}
                value={ri.itemId}
                onChange={(e) =>
                  onPatch({
                    rewards: {
                      ...quest.rewards,
                      items: quest.rewards.items.map((row, i) =>
                        i === idx ? { ...row, itemId: e.target.value } : row
                      ),
                    },
                  })
                }
                placeholder={`${modId}:reward_item`}
                className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none"
              />
            </div>
            <div className="col-span-3">
              {numInput(
                ri.quantity,
                (v) =>
                  onPatch({
                    rewards: {
                      ...quest.rewards,
                      items: quest.rewards.items.map((row, i) =>
                        i === idx
                          ? { ...row, quantity: Math.max(1, Math.round(v)) }
                          : row
                      ),
                    },
                  }),
                { min: 1, step: 1 }
              )}
            </div>
            <div className="col-span-1 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    rewards: {
                      ...quest.rewards,
                      items: quest.rewards.items.filter((_, i) => i !== idx),
                    },
                  })
                }
                title={t('content.removeTooltip')}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Quest Dialogue Stages */}
      <section className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('form.questDialoguesTitle', { count: quest.dialogue.length })}
          </h3>
          <button
            type="button"
            onClick={addDialogueStage}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Plus className="w-3 h-3" />
            {t('form.addStageDialogue')}
          </button>
        </div>

        {quest.dialogue.map((dlg, idx) => (
          <div
            key={dlg.id}
            className="p-2.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                <select
                  value={dlg.stage}
                  onChange={(e) =>
                    onPatch({
                      dialogue: quest.dialogue.map((d, i) =>
                        i === idx
                          ? {
                              ...d,
                              stage: e.target.value as
                                | 'offer'
                                | 'in_progress'
                                | 'complete',
                            }
                          : d
                      ),
                    })
                  }
                  className="px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                >
                  <option value="offer">{t('content.stage.offer')}</option>
                  <option value="in_progress">{t('content.stage.in_progress')}</option>
                  <option value="complete">{t('content.stage.complete')}</option>
                </select>
                <input
                  type="text"
                  dir="ltr"
                  list={npcListId}
                  value={dlg.speakerNpcId}
                  onChange={(e) =>
                    onPatch({
                      dialogue: quest.dialogue.map((d, i) =>
                        i === idx ? { ...d, speakerNpcId: e.target.value } : d
                      ),
                    })
                  }
                  placeholder={t('form.speakerNpcId')}
                  className="flex-1 px-2 py-1 text-[11px] font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    dialogue: quest.dialogue.filter((_, i) => i !== idx),
                  })
                }
                title={t('content.removeTooltip')}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  {t('form.questDialogueTextEn')}
                </label>
                <textarea
                  rows={2}
                  dir="auto"
                  value={dlg.text}
                  onChange={(e) => {
                    const nextText = e.target.value;
                    onPatch({
                      dialogue: quest.dialogue.map((d, i) =>
                        i === idx
                          ? {
                              ...d,
                              text: nextText,
                              textTranslations: d.textTranslations
                                ? { ...d.textTranslations, en: nextText }
                                : undefined,
                            }
                          : d
                      ),
                    });
                  }}
                  placeholder={t('content.placeholderEn')}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  {t('form.questDialogueTextAr')}
                </label>
                <textarea
                  rows={2}
                  dir="rtl"
                  value={dlg.textTranslations?.ar ?? ''}
                  onChange={(e) =>
                    onPatch({
                      dialogue: quest.dialogue.map((d, i) =>
                        i === idx
                          ? {
                              ...d,
                              textTranslations: {
                                ...(d.textTranslations ?? {}),
                                en: d.text,
                                ar: e.target.value,
                              },
                            }
                          : d
                      ),
                    })
                  }
                  placeholder={t('content.placeholderAr')}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 resize-none"
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Quest Chains */}
      <section className="space-y-4 pt-2 border-t border-slate-200 dark:border-white/10">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {t('form.questOverview')}
        </h3>

        <ReferenceListEditor
          label={t('form.prereqQuests')}
          values={quest.chain.prerequisiteQuestIds}
          placeholder={`${modId}:intro_quest`}
          error={findFieldError(issues, 'chain')}
          onChange={(prerequisiteQuestIds) =>
            onPatch({
              chain: { ...quest.chain, prerequisiteQuestIds },
            })
          }
        />

        <FieldShell
          label={t('form.nextQuestId')}
          error={findFieldError(issues, 'chain.nextQuestId')}
        >
          <input
            type="text"
            dir="ltr"
            list={questListId}
            value={quest.chain.nextQuestId}
            onChange={(e) =>
              onPatch({
                chain: { ...quest.chain, nextQuestId: e.target.value },
              })
            }
            placeholder={`${modId}:next_quest_in_chain`}
            className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </FieldShell>
      </section>
    </>
  );
};

// ============================================================================
// 2. CRAFTING EDITOR FORM
// ============================================================================
interface CraftingEditorFormProps {
  recipe: CraftingRecipeDefinition;
  modId: string;
  contents: ModContentDatabase;
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<CraftingRecipeDefinition>) => void;
}

export const CraftingEditorForm: React.FC<CraftingEditorFormProps> = ({
  recipe,
  modId,
  contents,
  issues,
  onPatch,
}) => {
  const { t } = useI18n();
  const itemListId = React.useId();
  const allItemIds = [
    ...contents.items.map((i) => i.id),
    ...contents.weapons.map((w) => w.id),
    ...contents.armor.map((a) => a.id),
  ];

  const addIngredient = () => {
    onPatch({
      ingredients: [
        ...recipe.ingredients,
        {
          id: `ing_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          itemId: allItemIds[0] ?? `${modId}:ingredient_item`,
          quantity: 1,
        },
      ],
    });
  };

  return (
    <>
      <datalist id={itemListId}>
        {allItemIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>

      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
          {t('form.recipeSection')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldShell label={t('form.craftingStation')} required>
            <select
              value={recipe.station}
              onChange={(e) =>
                onPatch({ station: e.target.value as CraftingStationType })
              }
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {CRAFTING_STATIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(`content.station.${s.id}` as TranslationKey)}
                </option>
              ))}
            </select>
          </FieldShell>

          <FieldShell
            label={t('form.craftTime')}
            required
            error={findFieldError(issues, 'craftTimeSeconds')}
          >
            {numInput(
              recipe.craftTimeSeconds,
              (v) => onPatch({ craftTimeSeconds: Math.max(0, v) }),
              {
                min: 0,
                step: 0.5,
                error: findFieldError(issues, 'craftTimeSeconds'),
              }
            )}
          </FieldShell>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <FieldShell
              label={t('form.outputItemId')}
              required
              error={findFieldError(issues, 'outputItemId')}
            >
              <input
                type="text"
                dir="ltr"
                list={itemListId}
                value={recipe.outputItemId}
                onChange={(e) => onPatch({ outputItemId: e.target.value })}
                placeholder={`${modId}:output_item`}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </FieldShell>
          </div>

          <FieldShell
            label={t('form.outputQty')}
            required
            error={findFieldError(issues, 'outputQuantity')}
          >
            {numInput(
              recipe.outputQuantity,
              (v) => onPatch({ outputQuantity: Math.max(1, Math.round(v)) }),
              {
                min: 1,
                step: 1,
                error: findFieldError(issues, 'outputQuantity'),
              }
            )}
          </FieldShell>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={recipe.unlockedByDefault}
            onChange={(e) => onPatch({ unlockedByDefault: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          {t('form.unlockedDefault')}
        </label>
      </section>

      <section className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('form.ingredientsSection', { count: recipe.ingredients.length })}
          </h3>
          <button
            type="button"
            onClick={addIngredient}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Plus className="w-3 h-3" />
            {t('form.addIngredient')}
          </button>
        </div>

        {recipe.ingredients.map((ing, idx) => (
          <div
            key={ing.id}
            className="grid grid-cols-12 gap-2 items-center p-2 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]"
          >
            <div className="col-span-8">
              <label className="block text-[10px] text-slate-400 mb-0.5">
                {t('form.ingredientItemId')}
              </label>
              <input
                type="text"
                dir="ltr"
                list={itemListId}
                value={ing.itemId}
                onChange={(e) =>
                  onPatch({
                    ingredients: recipe.ingredients.map((row, i) =>
                      i === idx ? { ...row, itemId: e.target.value } : row
                    ),
                  })
                }
                placeholder={`${modId}:ingredient_id`}
                className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
              />
            </div>
            <div className="col-span-3">
              <label className="block text-[10px] text-slate-400 mb-0.5">
                {t('form.quantity')}
              </label>
              {numInput(
                ing.quantity,
                (v) =>
                  onPatch({
                    ingredients: recipe.ingredients.map((row, i) =>
                      i === idx
                        ? { ...row, quantity: Math.max(1, Math.round(v)) }
                        : row
                    ),
                  }),
                { min: 1, step: 1 }
              )}
            </div>
            <div className="col-span-1 flex justify-end pt-4">
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    ingredients: recipe.ingredients.filter((_, i) => i !== idx),
                  })
                }
                title={t('content.removeTooltip')}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
};

// ============================================================================
// 3. BUILDING EDITOR FORM
// ============================================================================
interface BuildingEditorFormProps {
  building: BuildingDefinition;
  modId: string;
  assets: ModAsset[];
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<BuildingDefinition>) => void;
  onPreviewAssetIn3D?: (assetId: string) => void;
}

export const BuildingEditorForm: React.FC<BuildingEditorFormProps> = ({
  building,
  modId,
  assets,
  issues,
  onPatch,
  onPreviewAssetIn3D,
}) => {
  const { t } = useI18n();
  const modelAssets = assets.filter((a) => a.type === '3d-model');

  const footprintLabels = {
    width: t('form.footprintWidthShort'),
    height: t('form.footprintHeightShort'),
    depth: t('form.footprintDepthShort'),
  };

  return (
    <>
      {/* Metadata & Footprint */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
          {t('content.buildingFootprintTitle')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldShell label={t('content.buildingCategoryLabel')} required>
            <select
              value={building.category}
              onChange={(e) =>
                onPatch({ category: e.target.value as BuildingCategory })
              }
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {BUILDING_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(`content.buildingCat.${c.id}` as TranslationKey)}
                </option>
              ))}
            </select>
          </FieldShell>

          <AssetReferenceField
            label={t('form.model3d')}
            required
            value={building.model}
            assetType="3d-model"
            assets={assets}
            placeholder="assets/models/building.glb"
            error={findFieldError(issues, 'model')}
            onChange={(model) => onPatch({ model })}
            onPreviewModel={onPreviewAssetIn3D}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {(['width', 'height', 'depth'] as const).map((dim) => (
            <FieldShell
              key={dim}
              label={footprintLabels[dim]}
              required
              error={findFieldError(issues, 'footprint')}
            >
              {numInput(
                building.footprint[dim],
                (v) =>
                  onPatch({
                    footprint: { ...building.footprint, [dim]: v },
                  }),
                { min: 0.5, step: 0.5 }
              )}
            </FieldShell>
          ))}
        </div>
      </section>

      {/* Structure Pieces */}
      <section className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('form.structurePieces', { count: building.pieces.length })}
          </h3>
          <button
            type="button"
            onClick={() =>
              onPatch({
                pieces: [
                  ...building.pieces,
                  {
                    id: `piece_${Date.now()}`,
                    name: `Structure Part ${building.pieces.length + 1}`,
                    model: modelAssets[0]?.path ?? building.model,
                    position: { x: 0, y: 0, z: 0 },
                    rotationDeg: { x: 0, y: 0, z: 0 },
                    scale: 1,
                  },
                ],
              })
            }
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Plus className="w-3 h-3" />
            {t('form.addPiece')}
          </button>
        </div>

        {building.pieces.map((piece, idx) => (
          <div
            key={piece.id}
            className="p-2.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                dir="auto"
                value={piece.name}
                onChange={(e) =>
                  onPatch({
                    pieces: building.pieces.map((p, i) =>
                      i === idx ? { ...p, name: e.target.value } : p
                    ),
                  })
                }
                placeholder={t('form.pieceNamePlaceholder')}
                className="w-40 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
              />
              <input
                type="text"
                dir="ltr"
                value={piece.model}
                onChange={(e) =>
                  onPatch({
                    pieces: building.pieces.map((p, i) =>
                      i === idx ? { ...p, model: e.target.value } : p
                    ),
                  })
                }
                placeholder="assets/models/piece.glb"
                className="flex-1 px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    pieces: building.pieces.filter((_, i) => i !== idx),
                  })
                }
                title={t('content.removeTooltip')}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div dir="ltr" className="grid grid-cols-5 gap-2">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <div key={axis}>
                  <label className="block text-[10px] uppercase text-slate-400">
                    {t('form.posAxis', { axis: axis.toUpperCase() })}
                  </label>
                  {numInput(
                    piece.position[axis],
                    (v) =>
                      onPatch({
                        pieces: building.pieces.map((p, i) =>
                          i === idx
                            ? { ...p, position: { ...p.position, [axis]: v } }
                            : p
                        ),
                      }),
                    { step: 0.25 }
                  )}
                </div>
              ))}
              <div>
                <label className="block text-[10px] text-slate-400">
                  {t('form.yawDeg')}
                </label>
                {numInput(
                  piece.rotationDeg.y,
                  (v) =>
                    onPatch({
                      pieces: building.pieces.map((p, i) =>
                        i === idx
                          ? { ...p, rotationDeg: { ...p.rotationDeg, y: v } }
                          : p
                      ),
                    }),
                  { step: 15 }
                )}
              </div>
              <div>
                <label className="block text-[10px] text-slate-400">
                  {t('form.pieceScale')}
                </label>
                {numInput(
                  piece.scale,
                  (v) =>
                    onPatch({
                      pieces: building.pieces.map((p, i) =>
                        i === idx ? { ...p, scale: Math.max(0.1, v) } : p
                      ),
                    }),
                  { min: 0.1, step: 0.1 }
                )}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Construction Materials */}
      <section className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('form.constructionMats', { count: building.materials.length })}
          </h3>
          <button
            type="button"
            onClick={() =>
              onPatch({
                materials: [
                  ...building.materials,
                  {
                    id: `bmat_${Date.now()}`,
                    materialName: 'Timber Beam',
                    itemId: `${modId}:material_id`,
                    quantity: 5,
                  },
                ],
              })
            }
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Plus className="w-3 h-3" />
            {t('form.addMaterial')}
          </button>
        </div>

        {building.materials.map((mat, idx) => (
          <div
            key={mat.id}
            className="grid grid-cols-12 gap-2 items-center p-2 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]"
          >
            <div className="col-span-4">
              <input
                type="text"
                dir="auto"
                value={mat.materialName}
                onChange={(e) =>
                  onPatch({
                    materials: building.materials.map((m, i) =>
                      i === idx ? { ...m, materialName: e.target.value } : m
                    ),
                  })
                }
                placeholder={t('form.materialLabelPlaceholder')}
                className="w-full px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
              />
            </div>
            <div className="col-span-5">
              <input
                type="text"
                dir="ltr"
                value={mat.itemId}
                onChange={(e) =>
                  onPatch({
                    materials: building.materials.map((m, i) =>
                      i === idx ? { ...m, itemId: e.target.value } : m
                    ),
                  })
                }
                placeholder="woa:materials/stone"
                className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
              />
            </div>
            <div className="col-span-2">
              {numInput(
                mat.quantity,
                (v) =>
                  onPatch({
                    materials: building.materials.map((m, i) =>
                      i === idx
                        ? { ...m, quantity: Math.max(1, Math.round(v)) }
                        : m
                    ),
                  }),
                { min: 1, step: 1 }
              )}
            </div>
            <div className="col-span-1 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    materials: building.materials.filter((_, i) => i !== idx),
                  })
                }
                title={t('content.removeTooltip')}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Placement Points & Collision */}
      <section className="space-y-4 pt-2 border-t border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('form.placementPoints', { count: building.placementPoints.length })}
          </h3>
          <button
            type="button"
            onClick={() =>
              onPatch({
                placementPoints: [
                  ...building.placementPoints,
                  {
                    id: `pp_${Date.now()}`,
                    name: 'Snap Socket',
                    pointType: 'snap_socket',
                    position: { x: 0, y: 0, z: 0 },
                    facingDeg: 0,
                  },
                ],
              })
            }
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Plus className="w-3 h-3" />
            {t('form.addPoint')}
          </button>
        </div>

        {building.placementPoints.map((pt, idx) => (
          <div
            key={pt.id}
            className="p-2.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                dir="auto"
                value={pt.name}
                onChange={(e) =>
                  onPatch({
                    placementPoints: building.placementPoints.map((p, i) =>
                      i === idx ? { ...p, name: e.target.value } : p
                    ),
                  })
                }
                placeholder={t('form.pointName')}
                className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
              />
              <select
                value={pt.pointType}
                onChange={(e) =>
                  onPatch({
                    placementPoints: building.placementPoints.map((p, i) =>
                      i === idx
                        ? {
                            ...p,
                            pointType: e.target.value as
                              | 'ground_anchor'
                              | 'snap_socket'
                              | 'wall_mount'
                              | 'roof_mount',
                          }
                        : p
                    ),
                  })
                }
                className="px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
              >
                <option value="ground_anchor">{t('form.pointType.ground_anchor')}</option>
                <option value="snap_socket">{t('form.pointType.snap_socket')}</option>
                <option value="wall_mount">{t('form.pointType.wall_mount')}</option>
                <option value="roof_mount">{t('form.pointType.roof_mount')}</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    placementPoints: building.placementPoints.filter(
                      (_, i) => i !== idx
                    ),
                  })
                }
                title={t('content.removeTooltip')}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div dir="ltr" className="grid grid-cols-4 gap-2">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <div key={axis}>
                  <label className="block text-[10px] uppercase text-slate-400">
                    {axis}
                  </label>
                  {numInput(
                    pt.position[axis],
                    (v) =>
                      onPatch({
                        placementPoints: building.placementPoints.map((p, i) =>
                          i === idx
                            ? { ...p, position: { ...p.position, [axis]: v } }
                            : p
                        ),
                      }),
                    { step: 0.25 }
                  )}
                </div>
              ))}
              <div>
                <label className="block text-[10px] text-slate-400">
                  {t('form.facingDegInput')}
                </label>
                {numInput(
                  pt.facingDeg,
                  (v) =>
                    onPatch({
                      placementPoints: building.placementPoints.map((p, i) =>
                        i === idx ? { ...p, facingDeg: v } : p
                      ),
                    }),
                  { step: 15 }
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Building Collision */}
        <div className="p-3 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('form.buildingCollision')}
            </span>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={building.collision.enabled}
                onChange={(e) =>
                  onPatch({
                    collision: {
                      ...building.collision,
                      enabled: e.target.checked,
                    },
                  })
                }
                className="rounded border-slate-300 text-emerald-500"
              />
              {t('form.collisionEnabled')}
            </label>
          </div>

          {building.collision.enabled && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  {t('form.collisionShapeLabel')}
                </label>
                <select
                  value={building.collision.shape}
                  onChange={(e) =>
                    onPatch({
                      collision: {
                        ...building.collision,
                        shape: e.target.value as 'box' | 'compound' | 'mesh',
                      },
                    })
                  }
                  className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                >
                  <option value="box">{t('form.shapeBoxVolume')}</option>
                  <option value="compound">{t('form.shapeCompoundHulls')}</option>
                  <option value="mesh">{t('form.shapeStaticMesh')}</option>
                </select>
              </div>
              {(['width', 'height', 'depth', 'offsetY'] as const).map((k) => (
                <div key={k}>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t(`form.collisionDim.${k}` as TranslationKey)}
                  </label>
                  {numInput(
                    building.collision[k],
                    (v) =>
                      onPatch({
                        collision: { ...building.collision, [k]: v },
                      }),
                    { min: k === 'offsetY' ? undefined : 0.2, step: 0.25 }
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Doors, Windows & Interactive Objects */}
      <section className="space-y-4 pt-2 border-t border-slate-200 dark:border-white/10">
        {/* Doors */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('form.doorsSection', { count: building.doors.length })}
            </h3>
            <button
              type="button"
              onClick={() =>
                onPatch({
                  doors: [
                    ...building.doors,
                    {
                      id: `door_${Date.now()}`,
                      name: 'Entry Door',
                      model: 'woa:models/wooden_door.glb',
                      position: { x: 0, y: 0, z: 3 },
                      rotationYDeg: 0,
                      locked: false,
                      keyItemId: '',
                    },
                  ],
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <Plus className="w-3 h-3" />
              {t('form.addDoor')}
            </button>
          </div>

          {building.doors.map((door, idx) => (
            <div
              key={door.id}
              className="p-2.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  dir="auto"
                  value={door.name}
                  onChange={(e) =>
                    onPatch({
                      doors: building.doors.map((d, i) =>
                        i === idx ? { ...d, name: e.target.value } : d
                      ),
                    })
                  }
                  placeholder={t('form.doorName')}
                  className="w-36 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={door.model}
                  onChange={(e) =>
                    onPatch({
                      doors: building.doors.map((d, i) =>
                        i === idx ? { ...d, model: e.target.value } : d
                      ),
                    })
                  }
                  placeholder={t('form.doorModelPlaceholder')}
                  className="flex-1 px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                />
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
                  <input
                    type="checkbox"
                    checked={door.locked}
                    onChange={(e) =>
                      onPatch({
                        doors: building.doors.map((d, i) =>
                          i === idx ? { ...d, locked: e.target.checked } : d
                        ),
                      })
                    }
                  />
                  {t('form.locked')}
                </label>
                <button
                  type="button"
                  onClick={() =>
                    onPatch({
                      doors: building.doors.filter((_, i) => i !== idx),
                    })
                  }
                  title={t('content.removeTooltip')}
                  className="p-1 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div dir="ltr" className="grid grid-cols-5 gap-2">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <div key={axis}>
                    <label className="block text-[10px] uppercase text-slate-400">
                      {axis}
                    </label>
                    {numInput(
                      door.position[axis],
                      (v) =>
                        onPatch({
                          doors: building.doors.map((d, i) =>
                            i === idx
                              ? { ...d, position: { ...d.position, [axis]: v } }
                              : d
                          ),
                        }),
                      { step: 0.25 }
                    )}
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] text-slate-400">
                    {t('form.yawDeg')}
                  </label>
                  {numInput(
                    door.rotationYDeg,
                    (v) =>
                      onPatch({
                        doors: building.doors.map((d, i) =>
                          i === idx ? { ...d, rotationYDeg: v } : d
                        ),
                      }),
                    { step: 15 }
                  )}
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">
                    {t('form.keyItemId')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    disabled={!door.locked}
                    value={door.keyItemId}
                    onChange={(e) =>
                      onPatch({
                        doors: building.doors.map((d, i) =>
                          i === idx ? { ...d, keyItemId: e.target.value } : d
                        ),
                      })
                    }
                    placeholder={`${modId}:door_key`}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 disabled:opacity-40"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Windows */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('form.windowsSection', { count: building.windows.length })}
            </h3>
            <button
              type="button"
              onClick={() =>
                onPatch({
                  windows: [
                    ...building.windows,
                    {
                      id: `win_${Date.now()}`,
                      name: 'Side Window',
                      model: 'woa:models/glass_window.glb',
                      position: { x: 2.5, y: 1.6, z: 0 },
                      width: 1.0,
                      height: 1.2,
                      destructible: false,
                    },
                  ],
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <Plus className="w-3 h-3" />
              {t('form.addWindow')}
            </button>
          </div>

          {building.windows.map((win, idx) => (
            <div
              key={win.id}
              className="p-2.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  dir="auto"
                  value={win.name}
                  onChange={(e) =>
                    onPatch({
                      windows: building.windows.map((w, i) =>
                        i === idx ? { ...w, name: e.target.value } : w
                      ),
                    })
                  }
                  placeholder={t('form.windowName')}
                  className="w-36 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={win.model}
                  onChange={(e) =>
                    onPatch({
                      windows: building.windows.map((w, i) =>
                        i === idx ? { ...w, model: e.target.value } : w
                      ),
                    })
                  }
                  className="flex-1 px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                />
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
                  <input
                    type="checkbox"
                    checked={win.destructible}
                    onChange={(e) =>
                      onPatch({
                        windows: building.windows.map((w, i) =>
                          i === idx
                            ? { ...w, destructible: e.target.checked }
                            : w
                        ),
                      })
                    }
                  />
                  {t('form.destructible')}
                </label>
                <button
                  type="button"
                  onClick={() =>
                    onPatch({
                      windows: building.windows.filter((_, i) => i !== idx),
                    })
                  }
                  title={t('content.removeTooltip')}
                  className="p-1 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div dir="ltr" className="grid grid-cols-5 gap-2">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <div key={axis}>
                    <label className="block text-[10px] uppercase text-slate-400">
                      {axis}
                    </label>
                    {numInput(
                      win.position[axis],
                      (v) =>
                        onPatch({
                          windows: building.windows.map((w, i) =>
                            i === idx
                              ? { ...w, position: { ...w.position, [axis]: v } }
                              : w
                          ),
                        }),
                      { step: 0.25 }
                    )}
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] text-slate-400">
                    {t('form.collisionDim.width')}
                  </label>
                  {numInput(
                    win.width,
                    (v) =>
                      onPatch({
                        windows: building.windows.map((w, i) =>
                          i === idx ? { ...w, width: Math.max(0.2, v) } : w
                        ),
                      }),
                    { min: 0.2, step: 0.1 }
                  )}
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">
                    {t('form.collisionDim.height')}
                  </label>
                  {numInput(
                    win.height,
                    (v) =>
                      onPatch({
                        windows: building.windows.map((w, i) =>
                          i === idx ? { ...w, height: Math.max(0.2, v) } : w
                        ),
                      }),
                    { min: 0.2, step: 0.1 }
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Interactive Objects */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('form.interactiveObjects', { count: building.interactiveObjects.length })}
            </h3>
            <button
              type="button"
              onClick={() =>
                onPatch({
                  interactiveObjects: [
                    ...building.interactiveObjects,
                    {
                      id: `io_${Date.now()}`,
                      name: 'Supply Chest',
                      objectType: 'chest',
                      targetId: `${modId}:loot_chest`,
                      position: { x: 0, y: 0, z: 0 },
                      interactionPrompt: 'Open Storage Chest',
                    },
                  ],
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <Plus className="w-3 h-3" />
              {t('form.addInteractive')}
            </button>
          </div>

          {building.interactiveObjects.map((io, idx) => (
            <div
              key={io.id}
              className="p-2.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] space-y-2"
            >
              <div className="flex items-center gap-2">
                <select
                  value={io.objectType}
                  onChange={(e) =>
                    onPatch({
                      interactiveObjects: building.interactiveObjects.map(
                        (item, i) =>
                          i === idx
                            ? {
                                ...item,
                                objectType: e.target.value as
                                  | 'chest'
                                  | 'crafting_station'
                                  | 'bed'
                                  | 'lever'
                                  | 'portal'
                                  | 'beacon',
                              }
                            : item
                      ),
                    })
                  }
                  className="px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                >
                  {(
                    [
                      'chest',
                      'crafting_station',
                      'bed',
                      'lever',
                      'portal',
                      'beacon',
                    ] as const
                  ).map((oType) => (
                    <option key={oType} value={oType}>
                      {t(`form.interactiveType.${oType}` as TranslationKey)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  dir="auto"
                  value={io.name}
                  onChange={(e) =>
                    onPatch({
                      interactiveObjects: building.interactiveObjects.map(
                        (item, i) =>
                          i === idx ? { ...item, name: e.target.value } : item
                      ),
                    })
                  }
                  placeholder={t('form.interactiveNamePlaceholder')}
                  className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() =>
                    onPatch({
                      interactiveObjects: building.interactiveObjects.filter(
                        (_, i) => i !== idx
                      ),
                    })
                  }
                  title={t('content.removeTooltip')}
                  className="p-1 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('form.targetObjectId')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={io.targetId}
                    onChange={(e) =>
                      onPatch({
                        interactiveObjects: building.interactiveObjects.map(
                          (item, i) =>
                            i === idx ? { ...item, targetId: e.target.value } : item
                        ),
                      })
                    }
                    placeholder={t('form.interactiveTargetPlaceholder')}
                    className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('form.promptEn')}
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    value={io.interactionPrompt}
                    onChange={(e) => {
                      const nextPrompt = e.target.value;
                      onPatch({
                        interactiveObjects: building.interactiveObjects.map(
                          (item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  interactionPrompt: nextPrompt,
                                  promptTranslations: item.promptTranslations
                                    ? { ...item.promptTranslations, en: nextPrompt }
                                    : undefined,
                                }
                              : item
                        ),
                      });
                    }}
                    placeholder={t('content.placeholderEn')}
                    className="w-full px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    {t('form.promptAr')}
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={io.promptTranslations?.ar ?? ''}
                    onChange={(e) =>
                      onPatch({
                        interactiveObjects: building.interactiveObjects.map(
                          (item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  promptTranslations: {
                                    ...(item.promptTranslations ?? {}),
                                    en: item.interactionPrompt,
                                    ar: e.target.value,
                                  },
                                }
                              : item
                        ),
                      })
                    }
                    placeholder={t('content.placeholderAr')}
                    className="w-full px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                  />
                </div>
              </div>
              <div dir="ltr" className="grid grid-cols-3 gap-2">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <div key={axis}>
                    <label className="block text-[10px] uppercase text-slate-400">
                      {t('form.posAxis', { axis: axis.toUpperCase() })}
                    </label>
                    {numInput(
                      io.position[axis],
                      (v) =>
                        onPatch({
                          interactiveObjects: building.interactiveObjects.map(
                            (item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    position: { ...item.position, [axis]: v },
                                  }
                                : item
                          ),
                        }),
                      { step: 0.25 }
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
};

// ============================================================================
// 4. SPAWN EDITOR FORM
// ============================================================================
interface SpawnEditorFormProps {
  spawn: SpawnDefinition;
  modId: string;
  contents: ModContentDatabase;
  issues: ContentValidationIssue[];
  onPatch: (patch: Partial<SpawnDefinition>) => void;
}

export const SpawnEditorForm: React.FC<SpawnEditorFormProps> = ({
  spawn,
  modId,
  contents,
  issues,
  onPatch,
}) => {
  const { t } = useI18n();
  const entityListId = React.useId();
  const entityOptions = [
    ...contents.monsters.map((m) => m.id),
    ...contents.npcs.map((n) => n.id),
  ];

  return (
    <>
      <datalist id={entityListId}>
        {entityOptions.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>

      {/* Target Entity & Restrictions */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
          {t('form.spawnMeta')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldShell
            label={t('form.targetEntityId')}
            required
            error={findFieldError(issues, 'entityId')}
          >
            <input
              type="text"
              dir="ltr"
              list={entityListId}
              value={spawn.entityId}
              onChange={(e) => onPatch({ entityId: e.target.value })}
              placeholder={`${modId}:creature_id`}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </FieldShell>

          <FieldShell label={t('form.timeOfDay')} required>
            <select
              value={spawn.timeOfDay}
              onChange={(e) =>
                onPatch({ timeOfDay: e.target.value as SpawnTimeOfDay })
              }
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="any">{t('content.timeAny')}</option>
              <option value="day">{t('content.timeDay')}</option>
              <option value="night">{t('content.timeNight')}</option>
              <option value="dawn">{t('content.timeDawn')}</option>
              <option value="dusk">{t('content.timeDusk')}</option>
            </select>
          </FieldShell>
        </div>

        <ReferenceListEditor
          label={t('form.allowedBiomes')}
          values={spawn.biomes}
          placeholder={t('content.customBiomePlaceholder')}
          presets={WOA_BIOMES}
          presetLabelPrefix="content.biome."
          error={findFieldError(issues, 'biomes')}
          onChange={(biomes) => onPatch({ biomes })}
        />
      </section>

      {/* Spawn Points */}
      <section className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('form.spawnPoints', { count: spawn.spawnPoints.length })}
          </h3>
          <button
            type="button"
            onClick={() =>
              onPatch({
                spawnPoints: [
                  ...spawn.spawnPoints,
                  {
                    id: `sp_${Date.now()}`,
                    label: `Spawn Anchor ${spawn.spawnPoints.length + 1}`,
                    x: 0,
                    y: 0,
                    z: 0,
                    radius: 12,
                    yawDeg: 0,
                  },
                ],
              })
            }
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Plus className="w-3 h-3" />
            {t('form.addSpawnPoint')}
          </button>
        </div>

        {spawn.spawnPoints.map((pt, idx) => (
          <div
            key={pt.id}
            className="p-2.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                dir="auto"
                value={pt.label}
                onChange={(e) =>
                  onPatch({
                    spawnPoints: spawn.spawnPoints.map((s, i) =>
                      i === idx ? { ...s, label: e.target.value } : s
                    ),
                  })
                }
                placeholder={t('form.spawnPointPlaceholder')}
                className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    spawnPoints: spawn.spawnPoints.filter((_, i) => i !== idx),
                  })
                }
                title={t('content.removeTooltip')}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div dir="ltr" className="grid grid-cols-5 gap-2">
              {(['x', 'y', 'z', 'radius', 'yawDeg'] as const).map((field) => (
                <div key={field}>
                  <label className="block text-[10px] text-slate-400 uppercase">
                    {field === 'yawDeg'
                      ? t('form.yawDeg')
                      : field === 'radius'
                        ? t('form.reachRadius')
                        : field}
                  </label>
                  {numInput(
                    pt[field],
                    (v) =>
                      onPatch({
                        spawnPoints: spawn.spawnPoints.map((s, i) =>
                          i === idx ? { ...s, [field]: v } : s
                        ),
                      }),
                    { min: field === 'radius' ? 1 : undefined, step: 1 }
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Spawn Conditions */}
      <section className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {t('form.spawnConditions')}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <FieldShell
            label={t('form.minPlayerLv')}
            error={findFieldError(issues, 'conditions.level')}
          >
            {numInput(
              spawn.conditions.minPlayerLevel,
              (v) =>
                onPatch({
                  conditions: {
                    ...spawn.conditions,
                    minPlayerLevel: Math.max(1, Math.round(v)),
                  },
                }),
              { min: 1, step: 1 }
            )}
          </FieldShell>

          <FieldShell label={t('form.maxPlayerLv')}>
            {numInput(
              spawn.conditions.maxPlayerLevel,
              (v) =>
                onPatch({
                  conditions: {
                    ...spawn.conditions,
                    maxPlayerLevel: Math.max(1, Math.round(v)),
                  },
                }),
              { min: 1, step: 1 }
            )}
          </FieldShell>

          <FieldShell label={t('form.weatherReq')}>
            <select
              value={spawn.conditions.weather}
              onChange={(e) =>
                onPatch({
                  conditions: {
                    ...spawn.conditions,
                    weather: e.target.value as WeatherCondition,
                  },
                })
              }
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
            >
              {(['any', 'clear', 'rain', 'storm'] as const).map((w) => (
                <option key={w} value={w}>
                  {t(`form.weather.${w}` as TranslationKey)}
                </option>
              ))}
            </select>
          </FieldShell>

          <FieldShell label={t('form.minLight')}>
            {numInput(
              spawn.conditions.minLightLevel,
              (v) =>
                onPatch({
                  conditions: {
                    ...spawn.conditions,
                    minLightLevel: Math.max(0, Math.min(15, Math.round(v))),
                  },
                }),
              { min: 0, max: 15, step: 1 }
            )}
          </FieldShell>

          <FieldShell label={t('form.maxLight')}>
            {numInput(
              spawn.conditions.maxLightLevel,
              (v) =>
                onPatch({
                  conditions: {
                    ...spawn.conditions,
                    maxLightLevel: Math.max(0, Math.min(15, Math.round(v))),
                  },
                }),
              { min: 0, max: 15, step: 1 }
            )}
          </FieldShell>

          <FieldShell label={t('form.requiredQuestId')}>
            <input
              type="text"
              dir="ltr"
              value={spawn.conditions.requiredQuestId}
              onChange={(e) =>
                onPatch({
                  conditions: {
                    ...spawn.conditions,
                    requiredQuestId: e.target.value,
                  },
                })
              }
              placeholder={t('form.optionalQuestPlaceholder')}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
            />
          </FieldShell>
        </div>
      </section>

      {/* Population Limits & Respawn Rules */}
      <section className="space-y-4 pt-2 border-t border-slate-200 dark:border-white/10">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {t('form.populationRespawn')}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FieldShell
            label={t('form.maxPop')}
            required
            error={findFieldError(issues, 'population')}
          >
            {numInput(
              spawn.population.maxPopulation,
              (v) =>
                onPatch({
                  population: {
                    ...spawn.population,
                    maxPopulation: Math.max(1, Math.round(v)),
                  },
                }),
              { min: 1, step: 1 }
            )}
          </FieldShell>

          <FieldShell label={t('form.maxPerChunk')}>
            {numInput(
              spawn.population.maxPerChunk,
              (v) =>
                onPatch({
                  population: {
                    ...spawn.population,
                    maxPerChunk: Math.max(1, Math.round(v)),
                  },
                }),
              { min: 1, step: 1 }
            )}
          </FieldShell>

          <FieldShell label={t('form.groupMin')}>
            {numInput(
              spawn.population.groupMin,
              (v) =>
                onPatch({
                  population: {
                    ...spawn.population,
                    groupMin: Math.max(1, Math.round(v)),
                  },
                }),
              { min: 1, step: 1 }
            )}
          </FieldShell>

          <FieldShell label={t('form.groupMax')}>
            {numInput(
              spawn.population.groupMax,
              (v) =>
                onPatch({
                  population: {
                    ...spawn.population,
                    groupMax: Math.max(1, Math.round(v)),
                  },
                }),
              { min: 1, step: 1 }
            )}
          </FieldShell>
        </div>

        <div className="p-3 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={spawn.respawn.enabled}
                onChange={(e) =>
                  onPatch({
                    respawn: { ...spawn.respawn, enabled: e.target.checked },
                  })
                }
                className="rounded border-slate-300 text-blue-600"
              />
              {t('form.enableRespawn')}
            </label>

            {spawn.respawn.enabled && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={spawn.respawn.requirePlayerAway}
                  onChange={(e) =>
                    onPatch({
                      respawn: {
                        ...spawn.respawn,
                        requirePlayerAway: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-slate-300 text-blue-600"
                />
                {t('form.requirePlayerAway')}
              </label>
            )}
          </div>

          {spawn.respawn.enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldShell
                label={t('form.respawnDelay')}
                error={findFieldError(issues, 'respawn')}
              >
                {numInput(
                  spawn.respawn.delaySeconds,
                  (v) =>
                    onPatch({
                      respawn: {
                        ...spawn.respawn,
                        delaySeconds: Math.max(0, Math.round(v)),
                      },
                    }),
                  { min: 0, step: 15 }
                )}
              </FieldShell>

              <FieldShell label={t('form.minPlayerDist')}>
                {numInput(
                  spawn.respawn.minPlayerDistance,
                  (v) =>
                    onPatch({
                      respawn: {
                        ...spawn.respawn,
                        minPlayerDistance: Math.max(0, Math.round(v)),
                      },
                    }),
                  { min: 0, step: 4 }
                )}
              </FieldShell>
            </div>
          )}
        </div>
      </section>
    </>
  );
};
