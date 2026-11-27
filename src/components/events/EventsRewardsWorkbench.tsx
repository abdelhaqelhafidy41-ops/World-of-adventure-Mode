import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Link2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  BUILTIN_GAME_TARGETS,
  BUILTIN_TRIGGER_CATEGORY_OPTIONS,
  EVENT_ACTION_BY_TYPE,
  EVENT_ACTION_CATALOG,
  EVENT_CONDITION_BY_FIELD,
  EVENT_CONDITION_CATALOG,
  EVENT_EXECUTION_SCOPES,
  EVENT_RESET_BEHAVIORS,
  EVENT_TEMPLATE_IDS,
  EVENT_TRIGGER_BY_TYPE,
  EVENT_TRIGGER_CATALOG,
  createDefaultActionForType,
  createDefaultTriggerConfig,
  createEventFromTemplate,
} from '@/src/core/events/eventCatalog';
import {
  collectEventReferencedContentIds,
  detectEventChainCycles,
  validateModEventConfig,
} from '@/src/core/events/eventEngine';
import {
  collectAllContentIds,
  ensureUniqueId,
  formatNamespacedId,
  resolveProjectContents,
  suggestObjectSlug,
} from '@/src/core/content/contentRegistry';
import {
  EventEditorStage,
  EventFlowVisualizer,
} from '@/src/components/events/EventFlowVisualizer';
import { useI18n } from '@/src/i18n';
import {
  EventActionType,
  EventConditionField,
  EventConditionOperator,
  EventExecutionScope,
  EventResetBehavior,
  EventTargetMode,
  EventTemplatePresetId,
  EventTriggerCategory,
  EventTriggerType,
  ModContentDatabase,
  ModEventAction,
  ModEventConditionGroup,
  ModEventConditionRule,
  ModEventDefinition,
  ModManifest,
  ModProject,
} from '@/src/types/mod';

interface EventsRewardsWorkbenchProps {
  modId: string;
  contents: ModContentDatabase;
  manifest: ModManifest;
  allProjects: ModProject[];
  focusTarget?: { uid?: string | null; token: number } | null;
  onUpdateContents: (
    next: ModContentDatabase,
    options?: { recordUndo?: boolean; historyGroupKey?: string }
  ) => void;
  onUpdateManifest: (patch: Partial<ModManifest>) => void;
}

interface TargetOption {
  id: string;
  label: string;
  source: 'mod' | 'external' | 'builtin';
  sourceModId: string;
  category: string;
}

const TRIGGER_CATEGORY_ORDER: EventTriggerCategory[] = [
  'world_player',
  'npc_dialogue',
  'combat',
  'destruction_gathering',
  'quest_crafting',
];

const CONDITION_ENUM_OPTIONS: Partial<Record<EventConditionField, string[]>> = {
  time_of_day: ['day', 'night', 'dawn', 'dusk'],
  weather: ['clear', 'rain', 'storm', 'snow', 'fog'],
  quest_state: ['not_started', 'active', 'completed', 'failed'],
  player_missing_item: ['true', 'false'],
};

const STATUS_EFFECT_OPTIONS: NonNullable<ModEventAction['statusEffect']>[] = [
  'bleed',
  'burn',
  'frost',
  'stun',
  'knockback',
  'regeneration',
  'haste',
  'shield',
];

const OPERATORS: { id: EventConditionOperator; label: string }[] = [
  { id: '==', label: '==' },
  { id: '!=', label: '!=' },
  { id: '>=', label: '>=' },
  { id: '<=', label: '<=' },
  { id: '>', label: '>' },
  { id: '<', label: '<' },
  { id: 'contains', label: 'contains' },
];

export const EventsRewardsWorkbench: React.FC<EventsRewardsWorkbenchProps> = ({
  modId,
  contents,
  manifest,
  allProjects,
  focusTarget,
  onUpdateContents,
  onUpdateManifest,
}) => {
  const { t, language } = useI18n();
  const events = useMemo(() => contents.events ?? [], [contents.events]);
  const [selectedUid, setSelectedUid] = useState<string | null>(() => events[0]?.uid ?? null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | EventTriggerCategory>('all');
  const [activeStage, setActiveStage] = useState<EventEditorStage>('trigger');
  const [newActionType, setNewActionType] = useState<EventActionType>('give_item');

  const stageRefs = {
    trigger: useRef<HTMLDivElement>(null),
    conditions: useRef<HTMLDivElement>(null),
    actions: useRef<HTMLDivElement>(null),
    execution: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    if (focusTarget?.uid && events.some((e) => e.uid === focusTarget.uid)) {
      setSelectedUid(focusTarget.uid);
    }
  }, [focusTarget, events]);

  useEffect(() => {
    if (events.length === 0) {
      if (selectedUid !== null) setSelectedUid(null);
      return;
    }
    if (!selectedUid || !events.some((e) => e.uid === selectedUid)) {
      setSelectedUid(events[0].uid);
    }
  }, [events, selectedUid]);

  const idIndex = useMemo(() => collectAllContentIds(contents), [contents]);
  const cycleReports = useMemo(() => detectEventChainCycles(events), [events]);

  const validationByUid = useMemo(() => {
    const map = new Map<string, ReturnType<typeof validateModEventConfig>>();
    for (const ev of events) {
      map.set(ev.uid, validateModEventConfig(ev, modId, idIndex));
    }
    return map;
  }, [events, modId, idIndex]);

  const declaredDepSet = useMemo(
    () => new Set((manifest.dependencies ?? []).map((d) => d.modId.trim()).filter(Boolean)),
    [manifest.dependencies]
  );

  // Build unified target catalog: Current Mod + Compatible Installed Workspace Mods + Built-in Base Game (woa:*)
  const { targetOptions, knownIdSet } = useMemo(() => {
    const opts: TargetOption[] = [];
    const known = new Set<string>();

    const pushFromDb = (
      sourceMod: string,
      db: ModContentDatabase,
      source: 'mod' | 'external'
    ) => {
      const pushList = (
        category: string,
        list: { id: string; name: string; translations?: { name?: { en?: string; ar?: string } } }[]
      ) => {
        for (const entry of list) {
          if (!entry.id?.trim()) continue;
          const label =
            (entry.translations?.name?.[language] ?? '').trim() || entry.name || entry.id;
          opts.push({
            id: entry.id,
            label: `${label} (${entry.id})`,
            source,
            sourceModId: sourceMod,
            category,
          });
          known.add(entry.id.trim());
        }
      };

      pushList('item', db.items);
      pushList('weapon', db.weapons);
      pushList('armor', db.armor);
      pushList('npc', db.npcs);
      pushList('monster', db.monsters);
      pushList('quest', db.quests);
      pushList('recipe', db.recipes);
      pushList('building', db.buildings);
      pushList('world_object', db.worldObjects ?? []);
      pushList('dialogue', db.dialogues ?? []);
      pushList('audio', db.audioCues ?? []);
      pushList('loot_table', db.lootTables ?? []);
    };

    pushFromDb(modId, contents, 'mod');

    for (const other of allProjects) {
      if (other.manifest.modId.trim() === modId.trim()) continue;
      const resolvedOther = resolveProjectContents(other);
      pushFromDb(other.manifest.modId, resolvedOther, 'external');
    }

    for (const bt of BUILTIN_GAME_TARGETS) {
      opts.push({
        id: bt.id,
        label: `${language === 'ar' ? bt.labelAr : bt.labelEn} (${bt.id})`,
        source: 'builtin',
        sourceModId: 'woa',
        category: bt.kind,
      });
      known.add(bt.id);
    }

    return { targetOptions: opts, knownIdSet: known };
  }, [modId, contents, allProjects, language]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (categoryFilter !== 'all' && ev.category !== categoryFilter) return false;
      if (!q) return true;
      const locName = (ev.translations?.name?.[language] ?? '').toLowerCase();
      return (
        ev.id.toLowerCase().includes(q) ||
        ev.name.toLowerCase().includes(q) ||
        locName.includes(q) ||
        ev.trigger.type.toLowerCase().includes(q)
      );
    });
  }, [events, search, categoryFilter, language]);

  const activeEvent = useMemo(
    () => events.find((e) => e.uid === selectedUid) ?? null,
    [events, selectedUid]
  );

  const commitEvents = (
    nextEvents: ModEventDefinition[],
    historyGroupKey?: string
  ) => {
    onUpdateContents(
      { ...contents, events: nextEvents },
      historyGroupKey ? { recordUndo: true, historyGroupKey } : undefined
    );
  };

  const updateActiveEvent = (
    updater: (ev: ModEventDefinition) => ModEventDefinition,
    historyGroupKey?: string
  ) => {
    if (!activeEvent) return;
    const now = new Date().toISOString();
    commitEvents(
      events.map((ev) =>
        ev.uid === activeEvent.uid ? { ...updater(ev), updatedAt: now } : ev
      ),
      historyGroupKey
    );
  };

  const handleAddTemplate = (preset: EventTemplatePresetId) => {
    const existingIds = new Set(idIndex.keys());
    const created = createEventFromTemplate(preset, modId, existingIds, contents);
    commitEvents([...events, created]);
    setSelectedUid(created.uid);
  };

  const handleAddBlank = () => {
    const existingIds = new Set(idIndex.keys());
    const created = createEventFromTemplate('starter_sword', modId, existingIds, contents);
    created.id = ensureUniqueId(modId, 'custom_event', existingIds);
    created.name = 'Custom Gameplay Event';
    created.description = 'Triggered gameplay rule with custom conditions and rewards.';
    created.translations = {
      name: { en: 'Custom Gameplay Event', ar: 'حدث لعب مخصص' },
      description: {
        en: 'Triggered gameplay rule with custom conditions and rewards.',
        ar: 'قاعدة حدث لعب مخصصة مع شروط ومكافآت.',
      },
    };
    delete created.templatePreset;
    commitEvents([...events, created]);
    setSelectedUid(created.uid);
  };

  const handleDuplicateEvent = (ev: ModEventDefinition) => {
    const existingIds = new Set(idIndex.keys());
    const baseSlug = ev.id.includes(':') ? ev.id.split(':')[1] : suggestObjectSlug(ev.name, 'event');
    const copy: ModEventDefinition = {
      ...structuredClone(ev),
      uid: `event_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      id: ensureUniqueId(modId, `${baseSlug}_copy`, existingIds),
      name: `${ev.name} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    commitEvents([...events, copy]);
    setSelectedUid(copy.uid);
  };

  const handleDeleteEvent = (uid: string) => {
    const next = events.filter((e) => e.uid !== uid);
    commitEvents(next);
    if (selectedUid === uid) {
      setSelectedUid(next[0]?.uid ?? null);
    }
  };

  const handleFocusStage = (stage: EventEditorStage) => {
    setActiveStage(stage);
    stageRefs[stage].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activeIssues = activeEvent ? validationByUid.get(activeEvent.uid) ?? [] : [];
  const activeCycles = useMemo(() => {
    if (!activeEvent) return [];
    const activeId = activeEvent.id.trim();
    return cycleReports.filter(
      (c) => c.eventUids.includes(activeEvent.uid) || (activeId && c.cycleIds.includes(activeId))
    );
  }, [activeEvent, cycleReports]);

  const activeMissingRefs = useMemo(() => {
    const set = new Set<string>();
    const undeclaredDeps = new Set<string>();
    if (!activeEvent) return { missingSet: set, undeclaredDeps };

    for (const { refId } of collectEventReferencedContentIds(activeEvent)) {
      const colonIdx = refId.indexOf(':');
      const ns = colonIdx > 0 ? refId.slice(0, colonIdx) : '';
      if (ns && ns !== modId && ns !== 'woa' && !declaredDepSet.has(ns)) {
        undeclaredDeps.add(ns);
      }
      if (!knownIdSet.has(refId)) {
        set.add(refId);
      }
    }
    if (
      activeEvent.trigger.targetMode === 'mod_namespace' &&
      activeEvent.trigger.targetModId?.trim()
    ) {
      const ns = activeEvent.trigger.targetModId.trim();
      if (ns !== modId && ns !== 'woa' && !declaredDepSet.has(ns)) {
        undeclaredDeps.add(ns);
      }
    }
    return { missingSet: set, undeclaredDeps };
  }, [activeEvent, knownIdSet, modId, declaredDepSet]);

  const handleDeclareDependency = (depModId: string) => {
    if (declaredDepSet.has(depModId)) return;
    const matchProj = allProjects.find((p) => p.manifest.modId === depModId);
    const verRange = matchProj ? `>=${matchProj.manifest.version}` : '>=1.0.0';
    onUpdateManifest({
      dependencies: [
        ...(manifest.dependencies ?? []),
        { modId: depModId, versionRange: verRange, optional: false },
      ],
    });
  };

  const renderTargetPicker = (
    value: string,
    onChange: (nextId: string) => void,
    allowedCategories: string[],
    placeholder: string
  ) => {
    const scoped = targetOptions.filter((opt) => allowedCategories.includes(opt.category));
    const modOpts = scoped.filter((o) => o.source === 'mod');
    const extOpts = scoped.filter((o) => o.source === 'external');
    const builtOpts = scoped.filter((o) => o.source === 'builtin');
    const isKnown = !value || scoped.some((o) => o.id === value);

    return (
      <div className="space-y-1.5">
        <select
          dir="ltr"
          value={isKnown ? value : '__custom__'}
          onChange={(e) => {
            const v = e.target.value;
            if (v !== '__custom__') onChange(v);
          }}
          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
        >
          <option value="">{placeholder}</option>
          {modOpts.length > 0 && (
            <optgroup label={t('events.picker.currentMod')}>
              {modOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {extOpts.length > 0 && (
            <optgroup label={t('events.picker.installedMods')}>
              {extOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {builtOpts.length > 0 && (
            <optgroup label={t('events.picker.baseGame')}>
              {builtOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {!isKnown && <option value="__custom__">{value}</option>}
        </select>
        <input
          dir="ltr"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
        />
      </div>
    );
  };

  const getAllowedCategoriesForSubject = (subject?: string): string[] => {
    switch (subject) {
      case 'item':
        return ['item', 'weapon', 'armor'];
      case 'weapon':
        return ['weapon'];
      case 'equip_item':
        return ['weapon', 'armor', 'item'];
      case 'npc':
        return ['npc'];
      case 'dialogue':
      case 'dialogue_choice':
        return ['dialogue', 'npc'];
      case 'monster':
      case 'boss':
      case 'animal':
      case 'entity':
      case 'entity_and_weapon':
        return ['monster', 'npc'];
      case 'world_object':
      case 'container':
      case 'block':
      case 'resource':
      case 'tree':
      case 'ore':
        return ['world_object', 'building'];
      case 'building':
        return ['building'];
      case 'quest':
        return ['quest'];
      case 'recipe':
        return ['recipe'];
      default:
        return [
          'item',
          'weapon',
          'armor',
          'npc',
          'monster',
          'quest',
          'recipe',
          'building',
          'world_object',
          'dialogue',
        ];
    }
  };

  const getAllowedCategoriesForAction = (targetKind?: string): string[] => {
    switch (targetKind) {
      case 'item':
        return ['item', 'weapon', 'armor'];
      case 'weapon':
        return ['weapon'];
      case 'equip':
        return ['weapon', 'armor', 'item'];
      case 'recipe':
        return ['recipe'];
      case 'quest':
        return ['quest'];
      case 'dialogue':
        return ['dialogue'];
      case 'sound':
        return ['audio'];
      case 'entity':
        return ['monster', 'npc'];
      case 'faction':
        return ['faction'];
      default:
        return ['item', 'weapon', 'armor'];
    }
  };

  const selectedDialogueChoices = useMemo(() => {
    if (!activeEvent || activeEvent.trigger.type !== 'on_dialogue_choice_selected') return [];
    const targetId = activeEvent.trigger.targetId?.trim();
    const dlg = (contents.dialogues ?? []).find(
      (d) => d.id === targetId || d.npcId === targetId
    );
    if (!dlg) return [];
    return dlg.nodes.flatMap((n) =>
      n.choices.map((ch) => ({
        id: ch.id,
        label:
          (ch.labelTranslations?.[language] ?? '').trim() ||
          ch.label ||
          ch.id,
      }))
    );
  }, [activeEvent, contents.dialogues, language]);

  const activeTriggerDesc = activeEvent
    ? EVENT_TRIGGER_BY_TYPE.get(activeEvent.trigger.type)
    : undefined;

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row bg-slate-100 dark:bg-[#0B0F17] overflow-hidden">
      {/* Left Sidebar: Event Inventory, Search, Filters & 5 One-Click Templates */}
      <aside className="w-full lg:w-80 xl:w-88 shrink-0 border-b lg:border-b-0 lg:border-e border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] flex flex-col max-h-[38vh] lg:max-h-none">
        <div className="p-3.5 border-b border-slate-200 dark:border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-blue-500" />
                {t('events.title')}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {t('events.countSummary', {
                  total: events.length,
                  enabled: events.filter((e) => e.enabled).length,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddBlank}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('events.newEventBtn')}
            </button>
          </div>

          {/* 5 Quick Event Templates */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              {t('events.templatesLabel')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TEMPLATE_IDS.map((tplId) => (
                <button
                  key={tplId}
                  type="button"
                  onClick={() => handleAddTemplate(tplId)}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  + {t(`events.template.${tplId}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('events.searchPlaceholder')}
                className="w-full ps-8 pe-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | EventTriggerCategory)}
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
            >
              <option value="all">{t('events.filterAllCategories')}</option>
              {TRIGGER_CATEGORY_ORDER.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`events.category.${cat}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Event List */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-200 dark:divide-white/10">
          {filteredEvents.length === 0 ? (
            <div className="p-5 text-center space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {events.length === 0 ? t('events.emptyTitle') : t('events.noMatchTitle')}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {events.length === 0 ? t('events.emptyDesc') : t('events.noMatchDesc')}
              </p>
            </div>
          ) : (
            filteredEvents.map((ev) => {
              const issues = validationByUid.get(ev.uid) ?? [];
              const errCount = issues.filter((i) => i.level === 'error').length;
              const isSelected = ev.uid === selectedUid;
              const displayName =
                (ev.translations?.name?.[language] ?? '').trim() || ev.name || ev.id;
              return (
                <div
                  key={ev.uid}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedUid(ev.uid)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedUid(ev.uid);
                    }
                  }}
                  className={`px-3.5 py-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {errCount > 0 ? (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {displayName}
                        </span>
                      </div>
                      <div dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {ev.id}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className="truncate">
                          {t(`events.trigger.${ev.trigger.type}` as Parameters<typeof t>[0])}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{ev.actions.length} act</span>
                        <span aria-hidden="true">·</span>
                        <span className={ev.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                          {ev.enabled ? t('events.enabledLabel') : t('events.disabledLabel')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={ev.enabled}
                        aria-label={t('events.toggleEnabled')}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          commitEvents(
                            events.map((item) =>
                              item.uid === ev.uid ? { ...item, enabled } : item
                            )
                          );
                        }}
                        className="rounded border-slate-300 dark:border-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => handleDuplicateEvent(ev)}
                        title={t('events.duplicateBtn')}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(ev.uid)}
                        title={t('events.deleteBtn')}
                        className="p-1 rounded text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Main Detail Editor */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 sm:p-6">
        {!activeEvent ? (
          <div className="max-w-2xl mx-auto mt-10 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-8 text-center space-y-3">
            <Zap className="w-8 h-8 text-blue-500 mx-auto" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {t('events.emptyTitle')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {t('events.emptyDesc')}
            </p>
            <div className="pt-2 flex flex-wrap justify-center gap-2">
              {EVENT_TEMPLATE_IDS.map((tplId) => (
                <button
                  key={tplId}
                  type="button"
                  onClick={() => handleAddTemplate(tplId)}
                  className="px-3 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] hover:border-blue-500 text-xs font-medium text-slate-800 dark:text-slate-100"
                >
                  + {t(`events.template.${tplId}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-5">
            {/* Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/10">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                    {(activeEvent.translations?.name?.[language] ?? '').trim() ||
                      activeEvent.name ||
                      activeEvent.id}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">·</span>
                  <span
                    className={`text-xs font-medium ${
                      activeIssues.some((i) => i.level === 'error') || activeCycles.length > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {activeIssues.some((i) => i.level === 'error') || activeCycles.length > 0
                      ? t('events.statusErrors', {
                          count:
                            activeIssues.filter((i) => i.level === 'error').length +
                            activeCycles.length,
                        })
                      : t('events.statusValid')}
                  </span>
                </div>
                <div dir="ltr" className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {activeEvent.id}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeEvent.enabled}
                    onChange={(e) =>
                      updateActiveEvent((ev) => ({ ...ev, enabled: e.target.checked }))
                    }
                  />
                  <span>{t('events.enabledLabel')}</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleDuplicateEvent(activeEvent)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {t('events.duplicateBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteEvent(activeEvent.uid)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-500/30 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('events.deleteBtn')}
                </button>
              </div>
            </div>

            {/* Circular Chain / Undeclared Dep / Validation Banners */}
            {activeCycles.length > 0 && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {t('events.cycleWarningTitle')}
                </div>
                {activeCycles.map((c, idx) => (
                  <p key={idx}>{c.reason}</p>
                ))}
              </div>
            )}

            {activeMissingRefs.undeclaredDeps.size > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 shrink-0" />
                  <span>
                    {t('events.undeclaredDepsNotice', {
                      mods: Array.from(activeMissingRefs.undeclaredDeps).join(', '),
                    })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(activeMissingRefs.undeclaredDeps).map((dep) => (
                    <button
                      key={dep}
                      type="button"
                      onClick={() => handleDeclareDependency(dep)}
                      className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium whitespace-nowrap"
                    >
                      {t('events.addDependencyBtn', { modId: dep })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeIssues.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300 space-y-1">
                {activeIssues.map((iss, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{iss.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Interactive Node Flow Visualizer */}
            <EventFlowVisualizer
              event={activeEvent}
              activeStage={activeStage}
              missingRefIds={activeMissingRefs.missingSet}
              hasCycleWarning={activeCycles.length > 0}
              hasUnsupportedCondition={activeEvent.conditionGroups.some((g) =>
                g.rules.some((r) => EVENT_CONDITION_BY_FIELD.get(r.field)?.runtimeSupport === 'unsupported')
              )}
              onFocusStage={handleFocusStage}
              onMoveAction={(idx, delta) => {
                const targetIdx = idx + delta;
                if (targetIdx < 0 || targetIdx >= activeEvent.actions.length) return;
                updateActiveEvent((ev) => {
                  const copy = [...ev.actions];
                  const [moved] = copy.splice(idx, 1);
                  copy.splice(targetIdx, 0, moved);
                  return { ...ev, actions: copy };
                });
              }}
              onRemoveAction={(idx) => {
                updateActiveEvent((ev) => ({
                  ...ev,
                  actions: ev.actions.filter((_, i) => i !== idx),
                }));
              }}
              onRemoveConditionRule={(gIdx, rIdx) => {
                updateActiveEvent((ev) => ({
                  ...ev,
                  conditionGroups: ev.conditionGroups.map((g, gi) =>
                    gi === gIdx ? { ...g, rules: g.rules.filter((_, ri) => ri !== rIdx) } : g
                  ),
                }));
              }}
            />

            {/* Section 1: Identity & Localization */}
            <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('events.section.identity')}
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t('events.field.id')}
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveEvent((ev) => ({
                            ...ev,
                            id: formatNamespacedId(modId, ev.name || 'event'),
                          }))
                        }
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {t('content.fromNameBtn')}
                      </button>
                      {!activeEvent.id.startsWith(`${modId}:`) && (
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveEvent((ev) => {
                              const part = ev.id.includes(':') ? ev.id.split(':')[1] : ev.id;
                              return { ...ev, id: formatNamespacedId(modId, part) };
                            })
                          }
                          className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          {t('content.fixPrefixBtn')}
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    dir="ltr"
                    type="text"
                    value={activeEvent.id}
                    onChange={(e) =>
                      updateActiveEvent(
                        (ev) => ({ ...ev, id: e.target.value }),
                        `ev_id_${activeEvent.uid}`
                      )
                    }
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.category')}
                  </label>
                  <select
                    value={activeEvent.category}
                    onChange={(e) =>
                      updateActiveEvent((ev) => ({
                        ...ev,
                        category: e.target.value as EventTriggerCategory,
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  >
                    {TRIGGER_CATEGORY_ORDER.map((cat) => (
                      <option key={cat} value={cat}>
                        {t(`events.category.${cat}` as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.nameEn')}
                  </label>
                  <input
                    type="text"
                    value={activeEvent.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveEvent(
                        (ev) => ({
                          ...ev,
                          name: val,
                          translations: {
                            ...ev.translations,
                            name: { ...ev.translations?.name, en: val },
                          },
                        }),
                        `ev_name_${activeEvent.uid}`
                      );
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.nameAr')}
                  </label>
                  <input
                    dir="rtl"
                    type="text"
                    value={activeEvent.translations?.name?.ar ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveEvent(
                        (ev) => ({
                          ...ev,
                          translations: {
                            ...ev.translations,
                            name: { ...ev.translations?.name, ar: val },
                          },
                        }),
                        `ev_name_ar_${activeEvent.uid}`
                      );
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.descEn')}
                  </label>
                  <textarea
                    rows={2}
                    value={activeEvent.description}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveEvent(
                        (ev) => ({
                          ...ev,
                          description: val,
                          translations: {
                            ...ev.translations,
                            description: { ...ev.translations?.description, en: val },
                          },
                        }),
                        `ev_desc_${activeEvent.uid}`
                      );
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.descAr')}
                  </label>
                  <textarea
                    dir="rtl"
                    rows={2}
                    value={activeEvent.translations?.description?.ar ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveEvent(
                        (ev) => ({
                          ...ev,
                          translations: {
                            ...ev.translations,
                            description: { ...ev.translations?.description, ar: val },
                          },
                        }),
                        `ev_desc_ar_${activeEvent.uid}`
                      );
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Trigger Configuration */}
            <section
              ref={stageRefs.trigger}
              onFocus={() => setActiveStage('trigger')}
              className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('events.section.trigger')}
                </h4>
                {activeTriggerDesc && (
                  <span
                    className={`text-[11px] font-medium ${
                      activeTriggerDesc.runtimeSupport === 'game_runtime_dependent'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {activeTriggerDesc.runtimeSupport === 'game_runtime_dependent'
                      ? t('events.support.gameRuntimeNote')
                      : t('events.support.sandboxAndGameNote')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.triggerType')}
                  </label>
                  <select
                    value={activeEvent.trigger.type}
                    onChange={(e) => {
                      const nextType = e.target.value as EventTriggerType;
                      const desc = EVENT_TRIGGER_BY_TYPE.get(nextType);
                      const nextTrigger = createDefaultTriggerConfig(nextType, contents);
                      updateActiveEvent((ev) => ({
                        ...ev,
                        category: desc?.category ?? ev.category,
                        trigger: nextTrigger,
                      }));
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  >
                    {TRIGGER_CATEGORY_ORDER.map((cat) => (
                      <optgroup
                        key={cat}
                        label={t(`events.category.${cat}` as Parameters<typeof t>[0])}
                      >
                        {EVENT_TRIGGER_CATALOG.filter((td) => td.category === cat).map((td) => (
                          <option key={td.type} value={td.type}>
                            {t(`events.trigger.${td.type}` as Parameters<typeof t>[0])}
                            {td.runtimeSupport === 'game_runtime_dependent'
                              ? ` (${t('events.support.gameShort')})`
                              : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.targetMode')}
                  </label>
                  <select
                    value={activeEvent.trigger.targetMode}
                    onChange={(e) => {
                      const mode = e.target.value as EventTargetMode;
                      updateActiveEvent((ev) => ({
                        ...ev,
                        trigger: {
                          ...ev.trigger,
                          targetMode: mode,
                          ...(mode === 'area' || mode === 'coordinates'
                            ? {
                                area: ev.trigger.area ?? {
                                  x: 0,
                                  y: 0,
                                  z: 0,
                                  radius: 12,
                                  label: 'Trigger Zone',
                                },
                              }
                            : {}),
                          ...(mode === 'threshold'
                            ? { threshold: ev.trigger.threshold ?? 5 }
                            : {}),
                        },
                      }));
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  >
                    {(activeTriggerDesc?.supportedTargetModes ?? ['any']).map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`events.targetMode.${mode}` as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Trigger Target Parameters */}
              {activeEvent.trigger.targetMode === 'specific_id' &&
                activeTriggerDesc?.targetSubject !== 'none' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-white/10">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {t('events.field.targetId')}
                      </label>
                      {renderTargetPicker(
                        activeEvent.trigger.targetId ?? '',
                        (nextId) =>
                          updateActiveEvent((ev) => ({
                            ...ev,
                            trigger: { ...ev.trigger, targetId: nextId },
                          })),
                        getAllowedCategoriesForSubject(activeTriggerDesc?.targetSubject),
                        t('events.placeholder.selectTarget')
                      )}
                    </div>

                    {activeEvent.trigger.type === 'on_dialogue_choice_selected' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {t('events.field.dialogueChoiceId')}
                        </label>
                        {selectedDialogueChoices.length > 0 && (
                          <select
                            dir="ltr"
                            value={activeEvent.trigger.secondaryTargetId ?? ''}
                            onChange={(e) =>
                              updateActiveEvent((ev) => ({
                                ...ev,
                                trigger: {
                                  ...ev.trigger,
                                  secondaryTargetId: e.target.value,
                                },
                              }))
                            }
                            className="w-full mb-1.5 px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
                          >
                            <option value="">{t('events.placeholder.selectChoice')}</option>
                            {selectedDialogueChoices.map((ch) => (
                              <option key={ch.id} value={ch.id}>
                                {ch.label} ({ch.id})
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          dir="ltr"
                          type="text"
                          value={activeEvent.trigger.secondaryTargetId ?? ''}
                          onChange={(e) =>
                            updateActiveEvent((ev) => ({
                              ...ev,
                              trigger: { ...ev.trigger, secondaryTargetId: e.target.value },
                            }))
                          }
                          placeholder="choice_id (e.g. accept_reward)"
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
                        />
                      </div>
                    )}

                    {activeEvent.trigger.type === 'on_entity_killed_by_weapon' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {t('events.field.requiredWeaponId')}
                        </label>
                        {renderTargetPicker(
                          activeEvent.trigger.secondaryTargetId ?? '',
                          (nextId) =>
                            updateActiveEvent((ev) => ({
                              ...ev,
                              trigger: { ...ev.trigger, secondaryTargetId: nextId },
                            })),
                          ['weapon'],
                          t('events.placeholder.selectWeapon')
                        )}
                      </div>
                    )}
                  </div>
                )}

              {activeEvent.trigger.targetMode === 'category' && (
                <div className="pt-2 border-t border-slate-200 dark:border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('events.field.targetCategory')}
                    </label>
                    <select
                      value={activeEvent.trigger.targetCategory ?? ''}
                      onChange={(e) =>
                        updateActiveEvent((ev) => ({
                          ...ev,
                          trigger: { ...ev.trigger, targetCategory: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                    >
                      <option value="">{t('events.placeholder.selectCategory')}</option>
                      {BUILTIN_TRIGGER_CATEGORY_OPTIONS.map((catOpt) => (
                        <option key={catOpt.id} value={catOpt.id}>
                          {language === 'ar' ? catOpt.labelAr : catOpt.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {activeEvent.trigger.targetMode === 'mod_namespace' && (
                <div className="pt-2 border-t border-slate-200 dark:border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('events.field.targetModId')}
                    </label>
                    <div className="flex gap-2">
                      <select
                        dir="ltr"
                        value={activeEvent.trigger.targetModId ?? ''}
                        onChange={(e) =>
                          updateActiveEvent((ev) => ({
                            ...ev,
                            trigger: { ...ev.trigger, targetModId: e.target.value },
                          }))
                        }
                        className="flex-1 px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
                      >
                        <option value={modId}>{modId} (Current)</option>
                        <option value="woa">woa (Base Game)</option>
                        {allProjects
                          .filter((p) => p.manifest.modId !== modId)
                          .map((p) => (
                            <option key={p.id} value={p.manifest.modId}>
                              {p.manifest.name} ({p.manifest.modId})
                            </option>
                          ))}
                      </select>
                      <input
                        dir="ltr"
                        type="text"
                        value={activeEvent.trigger.targetModId ?? ''}
                        onChange={(e) =>
                          updateActiveEvent((ev) => ({
                            ...ev,
                            trigger: { ...ev.trigger, targetModId: e.target.value },
                          }))
                        }
                        placeholder={modId}
                        className="w-44 px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(activeEvent.trigger.targetMode === 'area' ||
                activeEvent.trigger.targetMode === 'coordinates') && (
                <div className="pt-2 border-t border-slate-200 dark:border-white/10 grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <label key={axis} className="block">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-mono">
                        {axis}
                      </span>
                      <input
                        dir="ltr"
                        type="number"
                        step="0.5"
                        value={activeEvent.trigger.area?.[axis] ?? 0}
                        onChange={(e) => {
                          const num = Number(e.target.value);
                          updateActiveEvent((ev) => ({
                            ...ev,
                            trigger: {
                              ...ev.trigger,
                              area: {
                                x: ev.trigger.area?.x ?? 0,
                                y: ev.trigger.area?.y ?? 0,
                                z: ev.trigger.area?.z ?? 0,
                                radius: ev.trigger.area?.radius ?? 10,
                                [axis]: Number.isFinite(num) ? num : 0,
                              },
                            },
                          }));
                        }}
                        className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                      />
                    </label>
                  ))}
                  <label className="block">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('events.field.radius')}
                    </span>
                    <input
                      dir="ltr"
                      type="number"
                      min={0.5}
                      step="0.5"
                      value={activeEvent.trigger.area?.radius ?? 10}
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        updateActiveEvent((ev) => ({
                          ...ev,
                          trigger: {
                            ...ev.trigger,
                            area: {
                              x: ev.trigger.area?.x ?? 0,
                              y: ev.trigger.area?.y ?? 0,
                              z: ev.trigger.area?.z ?? 0,
                              radius: Number.isFinite(num) ? num : 10,
                            },
                          },
                        }));
                      }}
                      className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                    />
                  </label>
                  <label className="block col-span-2 sm:col-span-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('events.field.areaLabel')}
                    </span>
                    <input
                      type="text"
                      value={activeEvent.trigger.area?.label ?? ''}
                      onChange={(e) =>
                        updateActiveEvent((ev) => ({
                          ...ev,
                          trigger: {
                            ...ev.trigger,
                            area: {
                              x: ev.trigger.area?.x ?? 0,
                              y: ev.trigger.area?.y ?? 0,
                              z: ev.trigger.area?.z ?? 0,
                              radius: ev.trigger.area?.radius ?? 10,
                              label: e.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>
              )}

              {activeEvent.trigger.targetMode === 'threshold' && (
                <div className="pt-2 border-t border-slate-200 dark:border-white/10 max-w-xs">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.levelThreshold')}
                  </label>
                  <input
                    dir="ltr"
                    type="number"
                    min={1}
                    value={activeEvent.trigger.threshold ?? 1}
                    onChange={(e) =>
                      updateActiveEvent((ev) => ({
                        ...ev,
                        trigger: { ...ev.trigger, threshold: Math.max(1, Number(e.target.value) || 1) },
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>
              )}
            </section>

            {/* Section 3: Visual Conditions Builder */}
            <section
              ref={stageRefs.conditions}
              onFocus={() => setActiveStage('conditions')}
              className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('events.section.conditions')}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('events.section.conditionsHint')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={activeEvent.conditionCombinator}
                    onChange={(e) =>
                      updateActiveEvent((ev) => ({
                        ...ev,
                        conditionCombinator: e.target.value as 'and' | 'or',
                      }))
                    }
                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  >
                    <option value="and">{t('events.logic.allGroupsAnd')}</option>
                    <option value="or">{t('events.logic.anyGroupOr')}</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const newGroup: ModEventConditionGroup = {
                        id: `grp_${Date.now()}`,
                        logic: 'and',
                        rules: [
                          {
                            id: `cond_${Date.now()}`,
                            field: 'player_level',
                            operator: '>=',
                            value: 1,
                          },
                        ],
                      };
                      updateActiveEvent((ev) => ({
                        ...ev,
                        conditionGroups: [...ev.conditionGroups, newGroup],
                      }));
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('events.addConditionGroup')}
                  </button>
                </div>
              </div>

              {activeEvent.conditionGroups.length === 0 ? (
                <div className="p-4 rounded border border-dashed border-slate-200 dark:border-white/10 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('events.noConditionGroups')}
                </div>
              ) : (
                <div className="space-y-3">
                  {activeEvent.conditionGroups.map((group, gIdx) => (
                    <div
                      key={group.id}
                      className="rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] p-3 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                            {t('events.conditionGroupTitle', { index: gIdx + 1 })}
                          </span>
                          <select
                            value={group.logic}
                            onChange={(e) =>
                              updateActiveEvent((ev) => ({
                                ...ev,
                                conditionGroups: ev.conditionGroups.map((g, idx) =>
                                  idx === gIdx
                                    ? { ...g, logic: e.target.value as 'and' | 'or' }
                                    : g
                                ),
                              }))
                            }
                            className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] text-slate-900 dark:text-slate-100"
                          >
                            <option value="and">{t('events.logic.rulesAnd')}</option>
                            <option value="or">{t('events.logic.rulesOr')}</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const newRule: ModEventConditionRule = {
                                id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                                field: 'player_level',
                                operator: '>=',
                                value: 1,
                              };
                              updateActiveEvent((ev) => ({
                                ...ev,
                                conditionGroups: ev.conditionGroups.map((g, idx) =>
                                  idx === gIdx ? { ...g, rules: [...g.rules, newRule] } : g
                                ),
                              }));
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-blue-500"
                          >
                            <Plus className="w-3 h-3" />
                            {t('events.addRuleBtn')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveEvent((ev) => ({
                                ...ev,
                                conditionGroups: ev.conditionGroups.filter((_, idx) => idx !== gIdx),
                              }))
                            }
                            className="p-1 rounded text-red-500 hover:bg-red-500/10"
                            title={t('events.removeGroupBtn')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {group.rules.map((rule, rIdx) => {
                          const condDesc = EVENT_CONDITION_BY_FIELD.get(rule.field);
                          const isUnsupported =
                            !condDesc || condDesc.runtimeSupport === 'unsupported';
                          const updateRule = (patch: Partial<ModEventConditionRule>) => {
                            updateActiveEvent((ev) => ({
                              ...ev,
                              conditionGroups: ev.conditionGroups.map((g, gi) =>
                                gi === gIdx
                                  ? {
                                      ...g,
                                      rules: g.rules.map((r, ri) =>
                                        ri === rIdx ? { ...r, ...patch } : r
                                      ),
                                    }
                                  : g
                              ),
                            }));
                          };

                          return (
                            <div
                              key={rule.id}
                              className={`p-2.5 rounded border space-y-2 ${
                                isUnsupported
                                  ? 'border-red-500/40 bg-red-500/5'
                                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823]'
                              }`}
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.7fr_1.4fr_auto] gap-2 items-center">
                                <select
                                  value={rule.field}
                                  onChange={(e) => {
                                    const nextField = e.target.value as EventConditionField;
                                    const nextDesc = EVENT_CONDITION_BY_FIELD.get(nextField);
                                    const enumOpts = CONDITION_ENUM_OPTIONS[nextField];
                                    updateRule({
                                      field: nextField,
                                      operator: nextDesc?.defaultOperator ?? '==',
                                      value: enumOpts?.[0] ?? (nextDesc?.valueType === 'number' ? 1 : ''),
                                      ...(nextField === 'world_coordinates'
                                        ? { area: { x: 0, y: 0, z: 0, radius: 12 } }
                                        : {}),
                                    });
                                  }}
                                  className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                                >
                                  {EVENT_CONDITION_CATALOG.map((cd) => (
                                    <option key={cd.field} value={cd.field}>
                                      {t(`events.cond.${cd.field}` as Parameters<typeof t>[0])}
                                      {cd.runtimeSupport === 'unsupported'
                                        ? ` [${t('events.support.unsupportedTag')}]`
                                        : ''}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  dir="ltr"
                                  value={rule.operator}
                                  onChange={(e) =>
                                    updateRule({
                                      operator: e.target.value as EventConditionOperator,
                                    })
                                  }
                                  className="px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
                                >
                                  {OPERATORS.map((op) => (
                                    <option key={op.id} value={op.id}>
                                      {op.label}
                                    </option>
                                  ))}
                                </select>

                                {CONDITION_ENUM_OPTIONS[rule.field] ? (
                                  <select
                                    value={String(rule.value)}
                                    onChange={(e) => updateRule({ value: e.target.value })}
                                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                                  >
                                    {(CONDITION_ENUM_OPTIONS[rule.field] ?? []).map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    dir="ltr"
                                    type={condDesc?.valueType === 'number' ? 'number' : 'text'}
                                    value={String(rule.value)}
                                    onChange={(e) =>
                                      updateRule({
                                        value:
                                          condDesc?.valueType === 'number'
                                            ? Number(e.target.value)
                                            : e.target.value,
                                      })
                                    }
                                    placeholder={t('events.placeholder.condValue')}
                                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
                                  />
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    updateActiveEvent((ev) => ({
                                      ...ev,
                                      conditionGroups: ev.conditionGroups.map((g, gi) =>
                                        gi === gIdx
                                          ? { ...g, rules: g.rules.filter((_, ri) => ri !== rIdx) }
                                          : g
                                      ),
                                    }))
                                  }
                                  className="p-1.5 rounded text-red-500 hover:bg-red-500/10 justify-self-end"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {condDesc?.needsTargetId && (
                                <div>
                                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                                    {t('events.field.condTargetId')}
                                  </label>
                                  {rule.field === 'world_flag' ? (
                                    <input
                                      dir="ltr"
                                      type="text"
                                      value={rule.targetId ?? ''}
                                      onChange={(e) => updateRule({ targetId: e.target.value })}
                                      placeholder="flag_name"
                                      className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono"
                                    />
                                  ) : (
                                    renderTargetPicker(
                                      rule.targetId ?? '',
                                      (nextId) => updateRule({ targetId: nextId }),
                                      rule.field === 'quest_state'
                                        ? ['quest']
                                        : ['item', 'weapon', 'armor'],
                                      t('events.placeholder.selectTarget')
                                    )
                                  )}
                                </div>
                              )}

                              {rule.field === 'world_coordinates' && (
                                <div className="grid grid-cols-4 gap-2">
                                  {(['x', 'y', 'z'] as const).map((axis) => (
                                    <label key={axis} className="block">
                                      <span className="text-[10px] font-mono uppercase text-slate-500">
                                        {axis}
                                      </span>
                                      <input
                                        dir="ltr"
                                        type="number"
                                        value={rule.area?.[axis] ?? 0}
                                        onChange={(e) =>
                                          updateRule({
                                            area: {
                                              x: rule.area?.x ?? 0,
                                              y: rule.area?.y ?? 0,
                                              z: rule.area?.z ?? 0,
                                              radius: rule.area?.radius ?? 10,
                                              [axis]: Number(e.target.value) || 0,
                                            },
                                          })
                                        }
                                        className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] font-mono tabular-nums"
                                      />
                                    </label>
                                  ))}
                                  <label className="block">
                                    <span className="text-[10px] text-slate-500">
                                      {t('events.field.radius')}
                                    </span>
                                    <input
                                      dir="ltr"
                                      type="number"
                                      min={0.5}
                                      value={rule.area?.radius ?? 10}
                                      onChange={(e) =>
                                        updateRule({
                                          area: {
                                            x: rule.area?.x ?? 0,
                                            y: rule.area?.y ?? 0,
                                            z: rule.area?.z ?? 0,
                                            radius: Number(e.target.value) || 10,
                                          },
                                        })
                                      }
                                      className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] font-mono tabular-nums"
                                    />
                                  </label>
                                </div>
                              )}

                              {isUnsupported && (
                                <div className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{t('events.unsupportedMultiplayerExplain')}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Section 4: Actions & Rewards Builder */}
            <section
              ref={stageRefs.actions}
              onFocus={() => setActiveStage('actions')}
              className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t('events.section.actions')}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('events.section.actionsHint')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={newActionType}
                    onChange={(e) => setNewActionType(e.target.value as EventActionType)}
                    className="px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  >
                    {(['rewards', 'progression', 'world_feedback'] as const).map((cat) => (
                      <optgroup
                        key={cat}
                        label={t(`events.actionCat.${cat}` as Parameters<typeof t>[0])}
                      >
                        {EVENT_ACTION_CATALOG.filter((a) => a.group === cat).map((a) => (
                          <option key={a.type} value={a.type}>
                            {t(`events.action.${a.type}` as Parameters<typeof t>[0])}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const created = createDefaultActionForType(newActionType, contents);
                      updateActiveEvent((ev) => ({
                        ...ev,
                        actions: [...ev.actions, created],
                      }));
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('events.addActionBtn')}
                  </button>
                </div>
              </div>

              {activeEvent.actions.length === 0 ? (
                <div className="p-4 rounded border border-dashed border-red-400/50 text-center text-xs text-red-600 dark:text-red-400">
                  {t('events.noActionsError')}
                </div>
              ) : (
                <div className="space-y-3">
                  {activeEvent.actions.map((act, idx) => {
                    const actDesc = EVENT_ACTION_BY_TYPE.get(act.type);
                    const updateAct = (patch: Partial<ModEventAction>) => {
                      updateActiveEvent((ev) => ({
                        ...ev,
                        actions: ev.actions.map((item, i) =>
                          i === idx ? { ...item, ...patch } : item
                        ),
                      }));
                    };

                    return (
                      <div
                        key={act.id}
                        className="rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] p-3.5 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span dir="ltr" className="text-xs font-mono text-slate-400 tabular-nums">
                              #{idx + 1}
                            </span>
                            <select
                              value={act.type}
                              onChange={(e) => {
                                const replacement = createDefaultActionForType(
                                  e.target.value as EventActionType,
                                  contents
                                );
                                updateActiveEvent((ev) => ({
                                  ...ev,
                                  actions: ev.actions.map((item, i) =>
                                    i === idx ? { ...replacement, id: item.id } : item
                                  ),
                                }));
                              }}
                              className="px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] text-slate-900 dark:text-slate-100"
                            >
                              {(['rewards', 'progression', 'world_feedback'] as const).map((cat) => (
                                <optgroup
                                  key={cat}
                                  label={t(`events.actionCat.${cat}` as Parameters<typeof t>[0])}
                                >
                                  {EVENT_ACTION_CATALOG.filter((a) => a.group === cat).map(
                                    (a) => (
                                      <option key={a.type} value={a.type}>
                                        {t(`events.action.${a.type}` as Parameters<typeof t>[0])}
                                      </option>
                                    )
                                  )}
                                </optgroup>
                              ))}
                            </select>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {actDesc?.runtimeSupport === 'game_runtime_dependent'
                                ? t('events.support.gameShort')
                                : t('events.support.sandboxShort')}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() =>
                                updateActiveEvent((ev) => {
                                  const next = [...ev.actions];
                                  const [m] = next.splice(idx, 1);
                                  next.splice(idx - 1, 0, m);
                                  return { ...ev, actions: next };
                                })
                              }
                              className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] disabled:opacity-35"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === activeEvent.actions.length - 1}
                              onClick={() =>
                                updateActiveEvent((ev) => {
                                  const next = [...ev.actions];
                                  const [m] = next.splice(idx, 1);
                                  next.splice(idx + 1, 0, m);
                                  return { ...ev, actions: next };
                                })
                              }
                              className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] disabled:opacity-35"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveEvent((ev) => ({
                                  ...ev,
                                  actions: ev.actions.filter((_, i) => i !== idx),
                                }))
                              }
                              className="p-1.5 rounded text-red-500 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {actDesc?.targetKind &&
                            actDesc.targetKind !== 'none' &&
                            act.type !== 'give_multiple_items' && (
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                  {t('events.field.actionTarget')}
                                </label>
                                {actDesc.targetKind === 'flag' ||
                                actDesc.targetKind === 'achievement' ? (
                                  <input
                                    dir="ltr"
                                    type="text"
                                    value={act.targetId ?? ''}
                                    onChange={(e) => updateAct({ targetId: e.target.value })}
                                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] font-mono"
                                  />
                                ) : (
                                  renderTargetPicker(
                                    act.targetId ?? '',
                                    (nextId) => updateAct({ targetId: nextId }),
                                    getAllowedCategoriesForAction(actDesc.targetKind),
                                    t('events.placeholder.selectTarget')
                                  )
                                )}
                              </div>
                            )}

                          {actDesc?.usesQuantity && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                  {t('events.field.quantity')}
                                </label>
                                <input
                                  dir="ltr"
                                  type="number"
                                  min={1}
                                  value={act.quantity ?? 1}
                                  onChange={(e) =>
                                    updateAct({ quantity: Math.max(1, Number(e.target.value) || 1) })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] font-mono tabular-nums"
                                />
                              </div>

                              {(act.type === 'give_item' ||
                                act.type === 'give_weapon' ||
                                act.type === 'add_to_inventory') && (
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                    {t('events.field.durability')}
                                  </label>
                                  <input
                                    dir="ltr"
                                    type="number"
                                    min={1}
                                    placeholder={t('events.placeholder.optional')}
                                    value={act.durability ?? ''}
                                    onChange={(e) =>
                                      updateAct({
                                        durability: e.target.value
                                          ? Math.max(1, Number(e.target.value) || 1)
                                          : undefined,
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] font-mono tabular-nums"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {actDesc?.usesAmount && (
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                {t('events.field.amount')}
                              </label>
                              <input
                                dir="ltr"
                                type="number"
                                value={act.amount ?? 0}
                                onChange={(e) => updateAct({ amount: Number(e.target.value) || 0 })}
                                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] font-mono tabular-nums"
                              />
                            </div>
                          )}

                          {(act.type === 'give_weapon' ||
                            act.type === 'give_item' ||
                            act.type === 'add_to_inventory' ||
                            act.type === 'equip_reward') && (
                            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 pt-4 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(act.equipAutomatically)}
                                onChange={(e) =>
                                  updateAct({ equipAutomatically: e.target.checked })
                                }
                              />
                              <span>{t('events.field.equipAutomatically')}</span>
                            </label>
                          )}

                          {act.type === 'set_world_flag' && (
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                {t('events.field.flagValue')}
                              </label>
                              <input
                                dir="ltr"
                                type="text"
                                value={String(act.flagValue ?? true)}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const parsed =
                                    raw === 'true'
                                      ? true
                                      : raw === 'false'
                                        ? false
                                        : raw !== '' && Number.isFinite(Number(raw))
                                          ? Number(raw)
                                          : raw;
                                  updateAct({ flagValue: parsed });
                                }}
                                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] font-mono"
                              />
                            </div>
                          )}

                          {act.type === 'apply_status_effect' && (
                            <div className="grid grid-cols-2 gap-2 md:col-span-2">
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                  {t('events.field.statusEffect')}
                                </label>
                                <select
                                  dir="ltr"
                                  value={act.statusEffect ?? 'regeneration'}
                                  onChange={(e) =>
                                    updateAct({
                                      statusEffect: e.target.value as ModEventAction['statusEffect'],
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] font-mono"
                                >
                                  {STATUS_EFFECT_OPTIONS.map((fx) => (
                                    <option key={fx} value={fx}>
                                      {fx}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                  {t('events.field.durationSeconds')}
                                </label>
                                <input
                                  dir="ltr"
                                  type="number"
                                  min={1}
                                  value={act.durationSeconds ?? 10}
                                  onChange={(e) =>
                                    updateAct({
                                      durationSeconds: Math.max(1, Number(e.target.value) || 1),
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] font-mono tabular-nums"
                                />
                              </div>
                            </div>
                          )}

                          {actDesc?.usesPosition && (
                            <div className="md:col-span-2 grid grid-cols-3 gap-2">
                              {(['x', 'y', 'z'] as const).map((axis) => (
                                <label key={axis} className="block">
                                  <span className="text-[10px] font-mono uppercase text-slate-500">
                                    {t('events.field.spawnPosAxis', { axis: axis.toUpperCase() })}
                                  </span>
                                  <input
                                    dir="ltr"
                                    type="number"
                                    step="0.5"
                                    value={act.position?.[axis] ?? 0}
                                    onChange={(e) =>
                                      updateAct({
                                        position: {
                                          x: act.position?.x ?? 0,
                                          y: act.position?.y ?? 0,
                                          z: act.position?.z ?? 0,
                                          [axis]: Number(e.target.value) || 0,
                                        },
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] font-mono tabular-nums"
                                  />
                                </label>
                              ))}
                            </div>
                          )}

                          {act.type === 'show_notification' && (
                            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                  {t('events.field.messageEn')}
                                </label>
                                <input
                                  type="text"
                                  value={act.message ?? ''}
                                  onChange={(e) =>
                                    updateAct({
                                      message: e.target.value,
                                      messageTranslations: {
                                        ...act.messageTranslations,
                                        en: e.target.value,
                                      },
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                  {t('events.field.messageAr')}
                                </label>
                                <input
                                  dir="rtl"
                                  type="text"
                                  value={act.messageTranslations?.ar ?? ''}
                                  onChange={(e) =>
                                    updateAct({
                                      messageTranslations: {
                                        ...act.messageTranslations,
                                        ar: e.target.value,
                                      },
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823]"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {act.type === 'give_multiple_items' && (
                          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                {t('events.field.bundleItems')}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateAct({
                                    bundleItems: [
                                      ...(act.bundleItems ?? []),
                                      {
                                        id: `bi_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                                        itemId: contents.items[0]?.id || 'woa:items/healing_herb',
                                        quantity: 1,
                                      },
                                    ],
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] text-[11px] font-medium"
                              >
                                <Plus className="w-3 h-3" />
                                {t('events.addBundleItemBtn')}
                              </button>
                            </div>
                            {(act.bundleItems ?? []).map((bi, bIdx) => (
                              <div
                                key={bi.id}
                                className="grid grid-cols-[1fr_90px_auto] gap-2 items-start"
                              >
                                {renderTargetPicker(
                                  bi.itemId,
                                  (nextId) =>
                                    updateAct({
                                      bundleItems: (act.bundleItems ?? []).map((entry, j) =>
                                        j === bIdx ? { ...entry, itemId: nextId } : entry
                                      ),
                                    }),
                                  ['item', 'weapon', 'armor'],
                                  t('events.placeholder.selectTarget')
                                )}
                                <input
                                  dir="ltr"
                                  type="number"
                                  min={1}
                                  value={bi.quantity}
                                  onChange={(e) =>
                                    updateAct({
                                      bundleItems: (act.bundleItems ?? []).map((entry, j) =>
                                        j === bIdx
                                          ? {
                                              ...entry,
                                              quantity: Math.max(1, Number(e.target.value) || 1),
                                            }
                                          : entry
                                      ),
                                    })
                                  }
                                  className="px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] font-mono tabular-nums"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateAct({
                                      bundleItems: (act.bundleItems ?? []).filter(
                                        (_, j) => j !== bIdx
                                      ),
                                    })
                                  }
                                  className="p-1.5 rounded text-red-500 hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section 5: Execution Limits, Cooldown & Persistence */}
            <section
              ref={stageRefs.execution}
              onFocus={() => setActiveStage('execution')}
              className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-4"
            >
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('events.section.execution')}
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.scope')}
                  </label>
                  <select
                    value={activeEvent.execution.scope}
                    onChange={(e) => {
                      const scope = e.target.value as EventExecutionScope;
                      updateActiveEvent((ev) => ({
                        ...ev,
                        execution: {
                          ...ev.execution,
                          scope,
                          cooldownSeconds:
                            scope === 'repeatable_cooldown' && ev.execution.cooldownSeconds <= 0
                              ? 10
                              : ev.execution.cooldownSeconds,
                        },
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  >
                    {EVENT_EXECUTION_SCOPES.map((sc) => (
                      <option key={sc} value={sc}>
                        {t(`events.scope.${sc}` as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.maxExecutions')}
                  </label>
                  <input
                    dir="ltr"
                    type="number"
                    min={1}
                    placeholder={t('events.placeholder.unlimited')}
                    value={activeEvent.execution.maxExecutions ?? ''}
                    onChange={(e) =>
                      updateActiveEvent((ev) => ({
                        ...ev,
                        execution: {
                          ...ev.execution,
                          maxExecutions: e.target.value
                            ? Math.max(1, Number(e.target.value) || 1)
                            : null,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.cooldownSeconds')}
                  </label>
                  <input
                    dir="ltr"
                    type="number"
                    min={0}
                    value={activeEvent.execution.cooldownSeconds}
                    onChange={(e) =>
                      updateActiveEvent((ev) => ({
                        ...ev,
                        execution: {
                          ...ev.execution,
                          cooldownSeconds: Math.max(0, Number(e.target.value) || 0),
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('events.field.resetBehavior')}
                  </label>
                  <select
                    value={activeEvent.execution.resetBehavior}
                    onChange={(e) =>
                      updateActiveEvent((ev) => ({
                        ...ev,
                        execution: {
                          ...ev.execution,
                          resetBehavior: e.target.value as EventResetBehavior,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
                  >
                    {EVENT_RESET_BEHAVIORS.map((rb) => (
                      <option key={rb} value={rb}>
                        {t(`events.reset.${rb}` as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeEvent.execution.persistentState}
                  onChange={(e) =>
                    updateActiveEvent((ev) => ({
                      ...ev,
                      execution: { ...ev.execution, persistentState: e.target.checked },
                    }))
                  }
                />
                <span>{t('events.field.persistentState')}</span>
              </label>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
