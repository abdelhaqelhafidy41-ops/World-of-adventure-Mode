import React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Clock,
  Filter,
  Gift,
  Play,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  EVENT_ACTION_BY_TYPE,
  EVENT_CONDITION_BY_FIELD,
  EVENT_TRIGGER_BY_TYPE,
} from '@/src/core/events/eventCatalog';
import { useI18n } from '@/src/i18n';
import { ModEventDefinition } from '@/src/types/mod';

export type EventEditorStage = 'trigger' | 'conditions' | 'actions' | 'execution';

interface EventFlowVisualizerProps {
  event: ModEventDefinition;
  activeStage: EventEditorStage;
  missingRefIds: Set<string>;
  hasCycleWarning: boolean;
  hasUnsupportedCondition: boolean;
  onFocusStage: (stage: EventEditorStage) => void;
  onMoveAction: (index: number, delta: -1 | 1) => void;
  onRemoveAction: (index: number) => void;
  onRemoveConditionRule: (groupIdx: number, ruleIdx: number) => void;
}

export const EventFlowVisualizer: React.FC<EventFlowVisualizerProps> = ({
  event,
  activeStage,
  missingRefIds,
  hasCycleWarning,
  hasUnsupportedCondition,
  onFocusStage,
  onMoveAction,
  onRemoveAction,
  onRemoveConditionRule,
}) => {
  const { t } = useI18n();
  const trigDesc = EVENT_TRIGGER_BY_TYPE.get(event.trigger.type);
  const triggerTargetMissing = Boolean(
    event.trigger.targetMode === 'specific_id' &&
      event.trigger.targetId &&
      missingRefIds.has(event.trigger.targetId.trim())
  );

  const totalConditions = event.conditionGroups.reduce((sum, g) => sum + g.rules.length, 0);
  const indexedActions = event.actions.map((action, index) => ({
    action,
    index,
    desc: EVENT_ACTION_BY_TYPE.get(action.type),
  }));
  const logicActions = indexedActions.filter((entry) => entry.desc?.group !== 'rewards');
  const rewardActions = indexedActions.filter((entry) => entry.desc?.group === 'rewards');

  const triggerTargetSummary = (() => {
    if (event.trigger.targetMode === 'any') return t('events.targetMode.any');
    if (event.trigger.targetMode === 'specific_id') {
      return event.trigger.targetId?.trim() || t('events.flow.unsetTarget');
    }
    if (event.trigger.targetMode === 'category') {
      return event.trigger.targetCategory?.trim() || t('events.flow.unsetTarget');
    }
    if (event.trigger.targetMode === 'mod_namespace') {
      return `${event.trigger.targetModId || '?'}:*`;
    }
    if (event.trigger.targetMode === 'threshold') {
      return `Lv >= ${event.trigger.threshold ?? 1}`;
    }
    const a = event.trigger.area;
    return a ? `(${a.x}, ${a.y}, ${a.z}) · r=${a.radius}m` : t('events.flow.unsetTarget');
  })();

  const renderActionRow = (entry: (typeof indexedActions)[number]) => {
    const targetMissing = Boolean(
      entry.action.targetId && missingRefIds.has(entry.action.targetId.trim())
    );
    return (
      <div
        key={entry.action.id}
        className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-[11px] ${
          targetMissing
            ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
            : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-200'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">
            {t(`events.action.${entry.action.type}` as Parameters<typeof t>[0])}
          </div>
          <div dir="ltr" className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate tabular-nums">
            {entry.action.type === 'give_multiple_items'
              ? `${entry.action.bundleItems?.length ?? 0} item(s)`
              : entry.action.targetId
                ? `${entry.action.targetId}${entry.action.quantity ? ` ×${entry.action.quantity}` : ''}`
                : entry.action.amount !== undefined
                  ? `+${entry.action.amount}`
                  : entry.action.message || '—'}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            disabled={entry.index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMoveAction(entry.index, -1);
            }}
            title={t('events.flow.moveUp')}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-30"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={entry.index === event.actions.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMoveAction(entry.index, 1);
            }}
            title={t('events.flow.moveDown')}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-30"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveAction(entry.index);
            }}
            title={t('events.flow.removeNode')}
            className="p-1 rounded text-red-500 hover:bg-red-500/10"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
            {t('events.flow.title')}
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('events.flow.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          <span>
            {t('events.flow.summaryCounts', {
              conditions: totalConditions,
              actions: logicActions.length,
              rewards: rewardActions.length,
            })}
          </span>
          {hasCycleWarning && (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t('events.flow.cycleFlag')}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-2">
        {/* Stage 1: Trigger */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onFocusStage('trigger')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFocusStage('trigger');
            }
          }}
          className={`rounded-md border p-3 text-start cursor-pointer transition-colors ${
            activeStage === 'trigger'
              ? 'border-blue-500 bg-blue-500/5'
              : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
              <Zap className="w-3.5 h-3.5" />
              {t('events.flow.stageTrigger')}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {trigDesc?.runtimeSupport === 'game_runtime_dependent'
                ? t('events.support.gameShort')
                : t('events.support.sandboxShort')}
            </span>
          </div>
          <div className="text-xs font-medium text-slate-900 dark:text-white truncate">
            {t(`events.trigger.${event.trigger.type}` as Parameters<typeof t>[0])}
          </div>
          <div
            dir="ltr"
            className={`mt-1 text-[11px] font-mono truncate ${
              triggerTargetMissing
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {triggerTargetSummary}
          </div>
        </div>

        <div className="hidden xl:flex items-center justify-center text-slate-400">
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </div>

        {/* Stage 2: Conditions */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onFocusStage('conditions')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFocusStage('conditions');
            }
          }}
          className={`rounded-md border p-3 text-start cursor-pointer transition-colors ${
            activeStage === 'conditions'
              ? 'border-blue-500 bg-blue-500/5'
              : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              <Filter className="w-3.5 h-3.5" />
              {t('events.flow.stageConditions')}
            </span>
            <span dir="ltr" className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {event.conditionCombinator.toUpperCase()} · {totalConditions}
            </span>
          </div>
          {totalConditions === 0 ? (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('events.flow.alwaysTrue')}
            </div>
          ) : (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {event.conditionGroups.map((grp, gIdx) =>
                grp.rules.map((rule, rIdx) => {
                  const desc = EVENT_CONDITION_BY_FIELD.get(rule.field);
                  const isUnsupported = !desc || desc.runtimeSupport === 'unsupported';
                  return (
                    <div
                      key={rule.id}
                      className={`flex items-center justify-between gap-1 px-2 py-1 rounded border text-[11px] ${
                        isUnsupported
                          ? 'border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-300'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span className="truncate">
                        {t(`events.cond.${rule.field}` as Parameters<typeof t>[0])}{' '}
                        <span dir="ltr" className="font-mono text-[10px] opacity-80">
                          {rule.operator} {String(rule.targetId || rule.value || '')}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveConditionRule(gIdx, rIdx);
                        }}
                        title={t('events.flow.removeNode')}
                        className="p-0.5 rounded text-red-500 hover:bg-red-500/10 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
              {hasUnsupportedCondition && (
                <div className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                  {t('events.flow.unsupportedCondNote')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hidden xl:flex items-center justify-center text-slate-400">
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </div>

        {/* Stage 3: Actions */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onFocusStage('actions')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFocusStage('actions');
            }
          }}
          className={`rounded-md border p-3 text-start cursor-pointer transition-colors ${
            activeStage === 'actions'
              ? 'border-blue-500 bg-blue-500/5'
              : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
              <Play className="w-3.5 h-3.5" />
              {t('events.flow.stageActions')}
            </span>
            <span dir="ltr" className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {logicActions.length}
            </span>
          </div>
          {logicActions.length === 0 ? (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('events.flow.noLogicActions')}
            </div>
          ) : (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {logicActions.map(renderActionRow)}
            </div>
          )}
        </div>

        <div className="hidden xl:flex items-center justify-center text-slate-400">
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </div>

        {/* Stage 4: Rewards & Execution */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onFocusStage(rewardActions.length > 0 ? 'actions' : 'execution')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFocusStage(rewardActions.length > 0 ? 'actions' : 'execution');
            }
          }}
          className={`rounded-md border p-3 text-start cursor-pointer transition-colors ${
            activeStage === 'execution'
              ? 'border-blue-500 bg-blue-500/5'
              : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <Gift className="w-3.5 h-3.5" />
              {t('events.flow.stageRewards')}
            </span>
            <span dir="ltr" className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {rewardActions.length}
            </span>
          </div>
          {rewardActions.length === 0 ? (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('events.flow.noRewards')}
            </div>
          ) : (
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {rewardActions.map(renderActionRow)}
            </div>
          )}
          <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
            <span className="inline-flex items-center gap-1 truncate">
              <Clock className="w-3 h-3 shrink-0" />
              {t(`events.scope.${event.execution.scope}` as Parameters<typeof t>[0])}
            </span>
            {event.execution.cooldownSeconds > 0 && (
              <span dir="ltr" className="font-mono shrink-0">
                {event.execution.cooldownSeconds}s
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
