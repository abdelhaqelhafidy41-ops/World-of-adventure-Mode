import {
  EVENT_ACTION_BY_TYPE,
  EVENT_CONDITION_BY_FIELD,
  EVENT_TRIGGER_BY_TYPE,
} from '@/src/core/events/eventCatalog';
import {
  ContentValidationIssue,
  EventActionType,
  EventConditionOperator,
  EventExecutionScope,
  EventResetBehavior,
  EventTriggerType,
  ModContentDatabase,
  ModEventAction,
  ModEventConditionGroup,
  ModEventConditionRule,
  ModEventDefinition,
  SpawnVec3,
} from '@/src/types/content';

export const EVENT_NAMESPACED_ID_REGEX =
  /^([a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*):([a-z][a-z0-9_]*)$/;

const SCRIPT_INJECTION_PATTERNS: RegExp[] = [
  /<\s*script\b/i,
  /\beval\s*\(/i,
  /\bnew\s+Function\s*\(/i,
  /\bFunction\s*\(/i,
  /javascript\s*:/i,
  /\bimport\s*\(/i,
  /\brequire\s*\(/i,
  /\bprocess\.(env|exit|argv)/i,
  /\bchild_process\b/i,
  /__proto__|constructor\.prototype/i,
];

export function hasDisallowedScriptInjection(raw: string): boolean {
  if (!raw) return false;
  return SCRIPT_INJECTION_PATTERNS.some((re) => re.test(raw));
}

export interface EventExecutionRecord {
  totalCount: number;
  byWorld: Record<string, number>;
  byPlayer: Record<string, number>;
  byPlayerWorld: Record<string, number>;
  byTriggerInstance: Record<string, number>;
  lastExecutedAtSeconds: number | null;
}

export interface SandboxEventLogEntry {
  id: string;
  timestampSeconds: number;
  eventId: string;
  eventName: string;
  triggerType: EventTriggerType;
  status:
    | 'executed'
    | 'blocked_disabled'
    | 'blocked_condition'
    | 'blocked_limit'
    | 'blocked_cooldown'
    | 'rejected_unsupported';
  detail: string;
  rewardsSummary: string[];
}

export interface SandboxEventSimState {
  worldId: string;
  playerId: string;
  nowSeconds: number;
  playerLevel: number;
  playerHealthPercent: number;
  playerCoords: SpawnVec3;
  biome: string;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  weather: 'clear' | 'rain' | 'storm';
  inventory: Record<string, number>;
  itemDurability: Record<string, number>;
  equippedWeaponId: string | null;
  equippedArmorIds: string[];
  xp: number;
  currency: number;
  reputation: Record<string, number>;
  unlockedRecipes: string[];
  unlockedAchievements: string[];
  quests: Record<string, 'not_started' | 'active' | 'completed' | 'failed'>;
  worldFlags: Record<string, string | number | boolean>;
  statusEffects: { effect: string; durationSeconds: number }[];
  droppedRewards: {
    id: string;
    itemId: string;
    quantity: number;
    position: SpawnVec3;
  }[];
  spawnedEntities: {
    id: string;
    entityId: string;
    quantity: number;
    position: SpawnVec3;
  }[];
  activeDialogueId: string | null;
  notifications: string[];
  soundsPlayed: string[];
  execRecords: Record<string, EventExecutionRecord>;
  log: SandboxEventLogEntry[];
}

export interface SandboxDispatchedTrigger {
  type: EventTriggerType;
  targetId?: string;
  secondaryTargetId?: string;
  targetCategory?: string;
  triggerInstanceId?: string;
  weaponUsedId?: string;
  coords?: SpawnVec3;
  level?: number;
  locale?: 'en' | 'ar';
}

export interface DispatchedEventOutcome {
  eventId: string;
  status: SandboxEventLogEntry['status'];
  rewardsSummary: string[];
  detail: string;
}

export function createDefaultEventSimState(
  overrides?: Partial<SandboxEventSimState>
): SandboxEventSimState {
  return {
    worldId: 'world_alpha',
    playerId: 'player_1',
    nowSeconds: 0,
    playerLevel: 1,
    playerHealthPercent: 100,
    playerCoords: { x: 0, y: 0, z: 0 },
    biome: 'frontier_plains',
    timeOfDay: 'day',
    weather: 'clear',
    inventory: {},
    itemDurability: {},
    equippedWeaponId: null,
    equippedArmorIds: [],
    xp: 0,
    currency: 0,
    reputation: {},
    unlockedRecipes: [],
    unlockedAchievements: [],
    quests: {},
    worldFlags: {},
    statusEffects: [],
    droppedRewards: [],
    spawnedEntities: [],
    activeDialogueId: null,
    notifications: [],
    soundsPlayed: [],
    execRecords: {},
    log: [],
    ...overrides,
  };
}

function cloneSimState(state: SandboxEventSimState): SandboxEventSimState {
  return {
    ...state,
    playerCoords: { ...state.playerCoords },
    inventory: { ...state.inventory },
    itemDurability: { ...state.itemDurability },
    equippedArmorIds: [...state.equippedArmorIds],
    reputation: { ...state.reputation },
    unlockedRecipes: [...state.unlockedRecipes],
    unlockedAchievements: [...state.unlockedAchievements],
    quests: { ...state.quests },
    worldFlags: { ...state.worldFlags },
    statusEffects: state.statusEffects.map((s) => ({ ...s })),
    droppedRewards: state.droppedRewards.map((d) => ({ ...d, position: { ...d.position } })),
    spawnedEntities: state.spawnedEntities.map((s) => ({ ...s, position: { ...s.position } })),
    notifications: [...state.notifications],
    soundsPlayed: [...state.soundsPlayed],
    execRecords: Object.fromEntries(
      Object.entries(state.execRecords).map(([k, v]) => [
        k,
        {
          totalCount: v.totalCount,
          byWorld: { ...v.byWorld },
          byPlayer: { ...v.byPlayer },
          byPlayerWorld: { ...v.byPlayerWorld },
          byTriggerInstance: { ...v.byTriggerInstance },
          lastExecutedAtSeconds: v.lastExecutedAtSeconds,
        },
      ])
    ),
    log: [...state.log],
  };
}

function compareValues(
  actual: string | number | boolean,
  op: EventConditionOperator,
  expected: string | number | boolean
): boolean {
  const numActual = typeof actual === 'number' ? actual : Number(actual);
  const numExpected = typeof expected === 'number' ? expected : Number(expected);
  const bothNumeric =
    typeof actual !== 'boolean' &&
    typeof expected !== 'boolean' &&
    `${actual}`.trim() !== '' &&
    `${expected}`.trim() !== '' &&
    Number.isFinite(numActual) &&
    Number.isFinite(numExpected);

  switch (op) {
    case '==':
      return bothNumeric
        ? numActual === numExpected
        : String(actual).toLowerCase() === String(expected).toLowerCase();
    case '!=':
      return bothNumeric
        ? numActual !== numExpected
        : String(actual).toLowerCase() !== String(expected).toLowerCase();
    case '>':
      return bothNumeric && numActual > numExpected;
    case '>=':
      return bothNumeric && numActual >= numExpected;
    case '<':
      return bothNumeric && numActual < numExpected;
    case '<=':
      return bothNumeric && numActual <= numExpected;
    case 'contains':
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    default:
      return false;
  }
}

function evaluateConditionRule(
  rule: ModEventConditionRule,
  state: SandboxEventSimState,
  trigger: SandboxDispatchedTrigger
): { matched: boolean; unsupportedReason?: string } {
  const desc = EVENT_CONDITION_BY_FIELD.get(rule.field);
  if (!desc || desc.runtimeSupport === 'unsupported') {
    return {
      matched: false,
      unsupportedReason:
        'Multiplayer authority checks are unsupported in Mod API v1 and Sandbox.',
    };
  }

  switch (rule.field) {
    case 'player_level': {
      const lvl = trigger.level ?? state.playerLevel;
      return { matched: compareValues(lvl, rule.operator, rule.value) };
    }
    case 'player_health_percent':
      return {
        matched: compareValues(state.playerHealthPercent, rule.operator, rule.value),
      };
    case 'player_has_item': {
      const itemId = (rule.targetId ?? '').trim();
      if (!itemId) return { matched: false };
      const count = state.inventory[itemId] ?? 0;
      const minQty = Number(rule.value);
      if (rule.operator === 'contains') {
        return { matched: count >= (Number.isFinite(minQty) && minQty > 0 ? minQty : 1) };
      }
      return { matched: compareValues(count, rule.operator, Number.isFinite(minQty) ? minQty : 1) };
    }
    case 'player_missing_item': {
      const itemId = (rule.targetId ?? '').trim();
      if (!itemId) return { matched: false };
      const isMissing = (state.inventory[itemId] ?? 0) <= 0;
      const wantMissing = rule.value === true || String(rule.value).toLowerCase() === 'true';
      return {
        matched: rule.operator === '!=' ? isMissing !== wantMissing : isMissing === wantMissing,
      };
    }
    case 'npc_id':
      return {
        matched: compareValues(trigger.targetId ?? '', rule.operator, String(rule.value ?? '')),
      };
    case 'entity_id':
      return {
        matched: compareValues(trigger.targetId ?? '', rule.operator, String(rule.value ?? '')),
      };
    case 'entity_category':
      return {
        matched: compareValues(
          trigger.targetCategory ?? '',
          rule.operator,
          String(rule.value ?? '')
        ),
      };
    case 'weapon_used':
      return {
        matched: compareValues(
          trigger.weaponUsedId ?? state.equippedWeaponId ?? '',
          rule.operator,
          String(rule.value ?? '')
        ),
      };
    case 'biome':
      return { matched: compareValues(state.biome, rule.operator, String(rule.value ?? '')) };
    case 'time_of_day':
      return {
        matched: compareValues(state.timeOfDay, rule.operator, String(rule.value ?? '')),
      };
    case 'weather':
      return {
        matched: compareValues(state.weather, rule.operator, String(rule.value ?? '')),
      };
    case 'quest_state': {
      const qId = (rule.targetId ?? '').trim();
      const qState = state.quests[qId] ?? 'not_started';
      return { matched: compareValues(qState, rule.operator, String(rule.value ?? 'completed')) };
    }
    case 'world_flag': {
      const flagName = (rule.targetId ?? '').trim();
      const flagVal = state.worldFlags[flagName] ?? false;
      return { matched: compareValues(flagVal, rule.operator, rule.value) };
    }
    case 'world_coordinates': {
      const coords = trigger.coords ?? state.playerCoords;
      const area = rule.area;
      if (!area) return { matched: false };
      const dist = Math.hypot(
        coords.x - area.x,
        coords.y - area.y,
        coords.z - area.z
      );
      return { matched: dist <= area.radius };
    }
    default:
      return { matched: false };
  }
}

function evaluateConditionGroups(
  ev: ModEventDefinition,
  state: SandboxEventSimState,
  trigger: SandboxDispatchedTrigger
): { passed: boolean; unsupportedReason?: string } {
  const groups = ev.conditionGroups ?? [];
  if (groups.length === 0) return { passed: true };

  const groupResults: boolean[] = [];
  for (const grp of groups) {
    if (!grp.rules || grp.rules.length === 0) {
      groupResults.push(true);
      continue;
    }
    const ruleResults: boolean[] = [];
    for (const rule of grp.rules) {
      const res = evaluateConditionRule(rule, state, trigger);
      if (res.unsupportedReason) {
        return { passed: false, unsupportedReason: res.unsupportedReason };
      }
      ruleResults.push(res.matched);
    }
    groupResults.push(
      grp.logic === 'or' ? ruleResults.some(Boolean) : ruleResults.every(Boolean)
    );
  }

  return {
    passed:
      ev.conditionCombinator === 'or'
        ? groupResults.some(Boolean)
        : groupResults.every(Boolean),
  };
}

function matchesTriggerTarget(
  ev: ModEventDefinition,
  state: SandboxEventSimState,
  trigger: SandboxDispatchedTrigger
): boolean {
  const cfg = ev.trigger;
  if (cfg.type !== trigger.type) return false;

  switch (cfg.targetMode) {
    case 'any':
      return true;
    case 'specific_id': {
      const wantPrimary = (cfg.targetId ?? '').trim();
      const gotPrimary = (trigger.targetId ?? '').trim();
      if (wantPrimary && gotPrimary !== wantPrimary) return false;
      const wantSecondary = (cfg.secondaryTargetId ?? '').trim();
      if (wantSecondary) {
        const gotSecondary = (
          trigger.secondaryTargetId ??
          trigger.weaponUsedId ??
          ''
        ).trim();
        if (gotSecondary !== wantSecondary) return false;
      }
      return true;
    }
    case 'category': {
      const wantCat = (cfg.targetCategory ?? '').trim().toLowerCase();
      if (!wantCat) return true;
      return (trigger.targetCategory ?? '').trim().toLowerCase() === wantCat;
    }
    case 'mod_namespace': {
      const ns = (cfg.targetModId ?? '').trim();
      if (!ns) return true;
      return (trigger.targetId ?? '').trim().startsWith(`${ns}:`);
    }
    case 'area':
    case 'coordinates': {
      const area = cfg.area;
      if (!area) return false;
      const pos = trigger.coords ?? state.playerCoords;
      const dist = Math.hypot(pos.x - area.x, pos.y - area.y, pos.z - area.z);
      return dist <= area.radius;
    }
    case 'threshold': {
      const minLevel = cfg.threshold ?? 1;
      const level = trigger.level ?? state.playerLevel;
      return level >= minLevel;
    }
    default:
      return false;
  }
}

function checkExecutionEligibility(
  ev: ModEventDefinition,
  state: SandboxEventSimState,
  trigger: SandboxDispatchedTrigger
): { ok: true } | { ok: false; status: 'blocked_limit' | 'blocked_cooldown'; reason: string } {
  const rec = state.execRecords[ev.id] ?? {
    totalCount: 0,
    byWorld: {},
    byPlayer: {},
    byPlayerWorld: {},
    byTriggerInstance: {},
    lastExecutedAtSeconds: null,
  };

  const exec = ev.execution;
  if (exec.maxExecutions != null && exec.maxExecutions > 0 && rec.totalCount >= exec.maxExecutions) {
    return {
      ok: false,
      status: 'blocked_limit',
      reason: `Max execution limit (${exec.maxExecutions}) reached.`,
    };
  }

  switch (exec.scope) {
    case 'once_per_world':
      if ((rec.byWorld[state.worldId] ?? 0) >= 1) {
        return {
          ok: false,
          status: 'blocked_limit',
          reason: `Already triggered in world "${state.worldId}".`,
        };
      }
      break;
    case 'once_per_player':
      if ((rec.byPlayer[state.playerId] ?? 0) >= 1) {
        return {
          ok: false,
          status: 'blocked_limit',
          reason: `Already triggered for player "${state.playerId}".`,
        };
      }
      break;
    case 'once_per_player_per_world': {
      const key = `${state.playerId}::${state.worldId}`;
      if ((rec.byPlayerWorld[key] ?? 0) >= 1) {
        return {
          ok: false,
          status: 'blocked_limit',
          reason: `Already triggered for "${state.playerId}" in "${state.worldId}".`,
        };
      }
      break;
    }
    case 'once_per_event_trigger':
      if (trigger.triggerInstanceId && (rec.byTriggerInstance[trigger.triggerInstanceId] ?? 0) >= 1) {
        return {
          ok: false,
          status: 'blocked_limit',
          reason: `Already triggered for trigger instance "${trigger.triggerInstanceId}".`,
        };
      }
      break;
    case 'repeatable':
    case 'repeatable_cooldown':
      break;
  }

  if (
    exec.cooldownSeconds > 0 &&
    rec.lastExecutedAtSeconds !== null &&
    state.nowSeconds - rec.lastExecutedAtSeconds < exec.cooldownSeconds
  ) {
    const remaining = Math.max(
      0,
      Math.ceil(exec.cooldownSeconds - (state.nowSeconds - rec.lastExecutedAtSeconds))
    );
    return {
      ok: false,
      status: 'blocked_cooldown',
      reason: `Cooldown active (${remaining}s remaining).`,
    };
  }

  return { ok: true };
}

function isWeaponTarget(targetId: string, db?: ModContentDatabase): boolean {
  if (db?.weapons.some((w) => w.id === targetId)) return true;
  return targetId.includes('weapons/') || targetId.includes('sword') || targetId.includes('bow');
}

function applyActionToState(
  action: ModEventAction,
  state: SandboxEventSimState,
  locale: 'en' | 'ar',
  db?: ModContentDatabase
): string {
  const qty = Math.max(1, Math.round(action.quantity ?? 1));
  const targetId = (action.targetId ?? '').trim();

  const grantToInv = (id: string, count: number, durability?: number) => {
    if (!id) return;
    state.inventory[id] = (state.inventory[id] ?? 0) + count;
    if (durability && durability > 0) {
      state.itemDurability[id] = durability;
    }
  };

  switch (action.type) {
    case 'give_item':
    case 'add_to_inventory': {
      grantToInv(targetId, qty, action.durability);
      if (action.equipAutomatically && targetId) {
        if (isWeaponTarget(targetId, db)) {
          state.equippedWeaponId = targetId;
        } else if (!state.equippedArmorIds.includes(targetId)) {
          state.equippedArmorIds.push(targetId);
        }
      }
      return `+${qty}x ${targetId}${action.equipAutomatically ? ' (equipped)' : ''}`;
    }
    case 'give_weapon': {
      grantToInv(targetId, qty, action.durability);
      if (action.equipAutomatically && targetId) {
        state.equippedWeaponId = targetId;
      }
      return `+${qty}x ${targetId}${action.equipAutomatically ? ' (equipped)' : ''}`;
    }
    case 'give_multiple_items': {
      const items = action.bundleItems ?? [];
      const parts: string[] = [];
      for (const bi of items) {
        const bQty = Math.max(1, Math.round(bi.quantity || 1));
        if (!bi.itemId.trim()) continue;
        grantToInv(bi.itemId.trim(), bQty, bi.durability);
        parts.push(`${bQty}x ${bi.itemId.trim()}`);
      }
      return `Bundle: ${parts.join(', ') || 'empty'}`;
    }
    case 'equip_reward': {
      if (targetId) {
        if ((state.inventory[targetId] ?? 0) < 1) {
          grantToInv(targetId, 1, action.durability);
        }
        if (isWeaponTarget(targetId, db)) {
          state.equippedWeaponId = targetId;
        } else if (!state.equippedArmorIds.includes(targetId)) {
          state.equippedArmorIds.push(targetId);
        }
      }
      return `Equipped ${targetId}`;
    }
    case 'drop_reward_in_world':
    case 'spawn_pickup_item': {
      const pos = action.position ?? state.playerCoords;
      state.droppedRewards.push({
        id: `drop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        itemId: targetId,
        quantity: qty,
        position: { ...pos },
      });
      return `Dropped ${qty}x ${targetId} at (${pos.x}, ${pos.y}, ${pos.z})`;
    }
    case 'give_xp': {
      const amount = Math.max(0, Math.round(action.amount ?? 0));
      state.xp += amount;
      return `+${amount} XP`;
    }
    case 'give_currency': {
      const amount = Math.max(0, Math.round(action.amount ?? 0));
      state.currency += amount;
      return `+${amount} Gold`;
    }
    case 'give_reputation': {
      const amount = Math.round(action.amount ?? 0);
      if (targetId) {
        state.reputation[targetId] = (state.reputation[targetId] ?? 0) + amount;
      }
      return `${amount >= 0 ? '+' : ''}${amount} Rep (${targetId})`;
    }
    case 'unlock_achievement': {
      if (targetId && !state.unlockedAchievements.includes(targetId)) {
        state.unlockedAchievements.push(targetId);
      }
      return `Achievement: ${targetId}`;
    }
    case 'unlock_recipe': {
      if (targetId && !state.unlockedRecipes.includes(targetId)) {
        state.unlockedRecipes.push(targetId);
      }
      return `Unlocked recipe: ${targetId}`;
    }
    case 'start_quest': {
      if (targetId) {
        state.quests[targetId] = 'active';
      }
      return `Started quest: ${targetId}`;
    }
    case 'complete_quest': {
      if (targetId) {
        state.quests[targetId] = 'completed';
      }
      return `Completed quest: ${targetId}`;
    }
    case 'set_world_flag': {
      if (targetId) {
        state.worldFlags[targetId] = action.flagValue ?? true;
      }
      return `Flag ${targetId} = ${String(action.flagValue ?? true)}`;
    }
    case 'show_notification': {
      const localized =
        action.messageTranslations?.[locale]?.trim() ||
        action.messageTranslations?.en?.trim() ||
        action.message?.trim() ||
        '';
      if (localized) {
        state.notifications.push(localized);
      }
      return `Notify: "${localized}"`;
    }
    case 'play_sound': {
      if (targetId) {
        state.soundsPlayed.push(targetId);
      }
      return `Sound: ${targetId}`;
    }
    case 'spawn_entity': {
      const pos = action.position ?? state.playerCoords;
      state.spawnedEntities.push({
        id: `spawn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        entityId: targetId,
        quantity: qty,
        position: { ...pos },
      });
      return `Spawned ${qty}x ${targetId} at (${pos.x}, ${pos.y}, ${pos.z})`;
    }
    case 'start_dialogue': {
      if (targetId) {
        state.activeDialogueId = targetId;
      }
      return `Dialogue: ${targetId}`;
    }
    case 'apply_status_effect': {
      const eff = action.statusEffect ?? 'regeneration';
      const dur = Math.max(1, action.durationSeconds ?? 10);
      state.statusEffects.push({ effect: eff, durationSeconds: dur });
      return `Effect: ${eff} (${dur}s)`;
    }
  }
}

export function dispatchSandboxEvent(
  events: ModEventDefinition[],
  state: SandboxEventSimState,
  trigger: SandboxDispatchedTrigger,
  db?: ModContentDatabase
): { nextState: SandboxEventSimState; outcomes: DispatchedEventOutcome[] } {
  const nextState = cloneSimState(state);
  const outcomes: DispatchedEventOutcome[] = [];
  const locale = trigger.locale ?? 'en';

  for (const ev of events) {
    if (ev.trigger.type !== trigger.type) continue;

    if (!ev.enabled) {
      outcomes.push({
        eventId: ev.id,
        status: 'blocked_disabled',
        rewardsSummary: [],
        detail: 'Event is disabled.',
      });
      continue;
    }

    if (!matchesTriggerTarget(ev, nextState, trigger)) {
      continue;
    }

    const condEval = evaluateConditionGroups(ev, nextState, trigger);
    if (condEval.unsupportedReason) {
      const entry: SandboxEventLogEntry = {
        id: `evlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestampSeconds: nextState.nowSeconds,
        eventId: ev.id,
        eventName: ev.name,
        triggerType: trigger.type,
        status: 'rejected_unsupported',
        detail: condEval.unsupportedReason,
        rewardsSummary: [],
      };
      nextState.log.unshift(entry);
      outcomes.push({
        eventId: ev.id,
        status: 'rejected_unsupported',
        rewardsSummary: [],
        detail: condEval.unsupportedReason,
      });
      continue;
    }

    if (!condEval.passed) {
      const entry: SandboxEventLogEntry = {
        id: `evlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestampSeconds: nextState.nowSeconds,
        eventId: ev.id,
        eventName: ev.name,
        triggerType: trigger.type,
        status: 'blocked_condition',
        detail: 'Event conditions were not satisfied.',
        rewardsSummary: [],
      };
      nextState.log.unshift(entry);
      outcomes.push({
        eventId: ev.id,
        status: 'blocked_condition',
        rewardsSummary: [],
        detail: entry.detail,
      });
      continue;
    }

    const elig = checkExecutionEligibility(ev, nextState, trigger);
    if (!elig.ok) {
      const entry: SandboxEventLogEntry = {
        id: `evlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestampSeconds: nextState.nowSeconds,
        eventId: ev.id,
        eventName: ev.name,
        triggerType: trigger.type,
        status: elig.status,
        detail: elig.reason,
        rewardsSummary: [],
      };
      nextState.log.unshift(entry);
      outcomes.push({
        eventId: ev.id,
        status: elig.status,
        rewardsSummary: [],
        detail: elig.reason,
      });
      continue;
    }

    const rewardsSummary: string[] = [];
    for (const action of ev.actions) {
      rewardsSummary.push(applyActionToState(action, nextState, locale, db));
    }

    const prevRec = nextState.execRecords[ev.id] ?? {
      totalCount: 0,
      byWorld: {},
      byPlayer: {},
      byPlayerWorld: {},
      byTriggerInstance: {},
      lastExecutedAtSeconds: null,
    };
    const pwKey = `${nextState.playerId}::${nextState.worldId}`;
    nextState.execRecords[ev.id] = {
      totalCount: prevRec.totalCount + 1,
      byWorld: {
        ...prevRec.byWorld,
        [nextState.worldId]: (prevRec.byWorld[nextState.worldId] ?? 0) + 1,
      },
      byPlayer: {
        ...prevRec.byPlayer,
        [nextState.playerId]: (prevRec.byPlayer[nextState.playerId] ?? 0) + 1,
      },
      byPlayerWorld: {
        ...prevRec.byPlayerWorld,
        [pwKey]: (prevRec.byPlayerWorld[pwKey] ?? 0) + 1,
      },
      byTriggerInstance: trigger.triggerInstanceId
        ? {
            ...prevRec.byTriggerInstance,
            [trigger.triggerInstanceId]:
              (prevRec.byTriggerInstance[trigger.triggerInstanceId] ?? 0) + 1,
          }
        : prevRec.byTriggerInstance,
      lastExecutedAtSeconds: nextState.nowSeconds,
    };

    const entry: SandboxEventLogEntry = {
      id: `evlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestampSeconds: nextState.nowSeconds,
      eventId: ev.id,
      eventName: ev.name,
      triggerType: trigger.type,
      status: 'executed',
      detail: `Executed ${ev.actions.length} action(s).`,
      rewardsSummary,
    };
    nextState.log.unshift(entry);
    if (nextState.log.length > 80) nextState.log.length = 80;

    outcomes.push({
      eventId: ev.id,
      status: 'executed',
      rewardsSummary,
      detail: entry.detail,
    });
  }

  return { nextState, outcomes };
}

export function resetSandboxEventStates(
  events: ModEventDefinition[],
  state: SandboxEventSimState,
  reason: EventResetBehavior,
  forceAll = false
): SandboxEventSimState {
  const nextState = cloneSimState(state);
  if (forceAll) {
    nextState.execRecords = {};
    return nextState;
  }

  for (const ev of events) {
    if (ev.execution.resetBehavior === 'never') continue;
    if (ev.execution.resetBehavior === reason || reason === 'manual') {
      delete nextState.execRecords[ev.id];
    }
  }
  return nextState;
}

// ============================================================================
// VALIDATION & CIRCULAR EVENT CHAIN ANALYSIS
// ============================================================================

export function validateModEventConfig(
  ev: ModEventDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const trimmedId = ev.id.trim();

  if (!trimmedId) {
    issues.push({ field: 'id', level: 'error', message: 'Event ID is required.' });
  } else {
    const match = EVENT_NAMESPACED_ID_REGEX.exec(trimmedId);
    if (!match) {
      issues.push({
        field: 'id',
        level: 'error',
        message: `Event ID must follow "${expectedModId}:event_slug" format.`,
      });
    } else if (match[1] !== expectedModId) {
      issues.push({
        field: 'id',
        level: 'error',
        message: `Event namespace "${match[1]}" must match modId "${expectedModId}".`,
      });
    } else if (idIndex && (idIndex.get(trimmedId)?.length ?? 0) > 1) {
      issues.push({
        field: 'id',
        level: 'error',
        message: `Duplicate content ID "${trimmedId}".`,
      });
    }
  }

  if (!ev.name.trim()) {
    issues.push({ field: 'name', level: 'error', message: 'Event name is required.' });
  }
  if (!ev.description.trim()) {
    issues.push({
      field: 'description',
      level: 'error',
      message: 'Event description is required.',
    });
  }

  if (
    hasDisallowedScriptInjection(ev.name) ||
    hasDisallowedScriptInjection(ev.description) ||
    hasDisallowedScriptInjection(ev.id)
  ) {
    issues.push({
      field: 'security',
      level: 'error',
      message: 'Disallowed script injection payload detected inside event metadata.',
    });
  }

  const trigDesc = EVENT_TRIGGER_BY_TYPE.get(ev.trigger.type);
  if (!trigDesc) {
    issues.push({
      field: 'trigger.type',
      level: 'error',
      message: `Unsupported event trigger "${String(ev.trigger.type)}".`,
    });
  } else {
    if (
      ev.trigger.targetMode === 'specific_id' &&
      trigDesc.targetSubject !== 'none' &&
      !ev.trigger.targetId?.trim()
    ) {
      issues.push({
        field: 'trigger.targetId',
        level: 'error',
        message: 'Trigger requires a specific target ID when Target Mode is "Specific Target".',
      });
    }
    if (
      ev.trigger.targetMode === 'category' &&
      !ev.trigger.targetCategory?.trim()
    ) {
      issues.push({
        field: 'trigger.targetCategory',
        level: 'error',
        message: 'Trigger requires a category when Target Mode is "Category".',
      });
    }
    if (
      ev.trigger.targetMode === 'mod_namespace' &&
      !ev.trigger.targetModId?.trim()
    ) {
      issues.push({
        field: 'trigger.targetModId',
        level: 'error',
        message: 'Trigger requires a target Mod ID when Target Mode is "Mod Namespace".',
      });
    }
    if (ev.trigger.targetMode === 'area' || ev.trigger.targetMode === 'coordinates') {
      const a = ev.trigger.area;
      if (
        !a ||
        !Number.isFinite(a.x) ||
        !Number.isFinite(a.y) ||
        !Number.isFinite(a.z) ||
        !Number.isFinite(a.radius) ||
        a.radius <= 0
      ) {
        issues.push({
          field: 'trigger.area',
          level: 'error',
          message: 'Area/Coordinate trigger requires finite coordinates and radius > 0.',
        });
      }
    }
    if (
      ev.trigger.targetMode === 'threshold' &&
      (!Number.isFinite(ev.trigger.threshold) || (ev.trigger.threshold ?? 0) < 1)
    ) {
      issues.push({
        field: 'trigger.threshold',
        level: 'error',
        message: 'Level threshold trigger must be >= 1.',
      });
    }
  }

  (ev.conditionGroups ?? []).forEach((grp: ModEventConditionGroup, gIdx: number) => {
    (grp.rules ?? []).forEach((rule: ModEventConditionRule, rIdx: number) => {
      const condDesc = EVENT_CONDITION_BY_FIELD.get(rule.field);
      if (!condDesc || condDesc.runtimeSupport === 'unsupported') {
        issues.push({
          field: `conditionGroups.${gIdx}.rules.${rIdx}.field`,
          level: 'error',
          message: `Condition "${rule.field}" is not supported in Mod API v1 or Sandbox.`,
        });
      }
      if (condDesc?.needsTargetId && !rule.targetId?.trim()) {
        issues.push({
          field: `conditionGroups.${gIdx}.rules.${rIdx}.targetId`,
          level: 'error',
          message: `Condition "${rule.field}" requires a target identifier.`,
        });
      }
      if (
        rule.field === 'world_coordinates' &&
        (!rule.area || !Number.isFinite(rule.area.radius) || rule.area.radius <= 0)
      ) {
        issues.push({
          field: `conditionGroups.${gIdx}.rules.${rIdx}.area`,
          level: 'error',
          message: 'Coordinate condition requires a radius > 0.',
        });
      }
      if (
        hasDisallowedScriptInjection(String(rule.value ?? '')) ||
        hasDisallowedScriptInjection(rule.targetId ?? '')
      ) {
        issues.push({
          field: `conditionGroups.${gIdx}.rules.${rIdx}`,
          level: 'error',
          message: 'Disallowed script injection detected inside condition rule.',
        });
      }
    });
  });

  if (!Array.isArray(ev.actions) || ev.actions.length === 0) {
    issues.push({
      field: 'actions',
      level: 'error',
      message: 'Event must define at least one action or reward.',
    });
  }

  (ev.actions ?? []).forEach((act: ModEventAction, idx: number) => {
    const desc = EVENT_ACTION_BY_TYPE.get(act.type);
    if (!desc) {
      issues.push({
        field: `actions.${idx}.type`,
        level: 'error',
        message: `Unsupported action type "${String(act.type)}".`,
      });
      return;
    }

    if (
      desc.targetKind &&
      desc.targetKind !== 'none' &&
      act.type !== 'give_multiple_items' &&
      !act.targetId?.trim()
    ) {
      issues.push({
        field: `actions.${idx}.targetId`,
        level: 'error',
        message: `Action #${idx + 1} (${act.type}) requires a target ID.`,
      });
    }

    if (desc.usesQuantity) {
      if (!Number.isFinite(act.quantity) || (act.quantity ?? 0) < 1) {
        issues.push({
          field: `actions.${idx}.quantity`,
          level: 'error',
          message: `Action #${idx + 1} (${act.type}) quantity must be >= 1.`,
        });
      }
    }

    if (act.durability !== undefined && (!Number.isFinite(act.durability) || act.durability < 1)) {
      issues.push({
        field: `actions.${idx}.durability`,
        level: 'error',
        message: `Action #${idx + 1} durability must be >= 1.`,
      });
    }

    if (desc.usesAmount) {
      if (!Number.isFinite(act.amount)) {
        issues.push({
          field: `actions.${idx}.amount`,
          level: 'error',
          message: `Action #${idx + 1} (${act.type}) requires a numeric amount.`,
        });
      } else if (act.type !== 'give_reputation' && (act.amount ?? 0) <= 0) {
        issues.push({
          field: `actions.${idx}.amount`,
          level: 'error',
          message: `Action #${idx + 1} (${act.type}) amount must be greater than 0.`,
        });
      }
    }

    if (act.type === 'give_multiple_items') {
      if (!act.bundleItems || act.bundleItems.length === 0) {
        issues.push({
          field: `actions.${idx}.bundleItems`,
          level: 'error',
          message: `Bundle action #${idx + 1} must include at least one item.`,
        });
      } else {
        act.bundleItems.forEach((bi, bIdx) => {
          if (!bi.itemId.trim()) {
            issues.push({
              field: `actions.${idx}.bundleItems.${bIdx}.itemId`,
              level: 'error',
              message: `Bundle entry #${bIdx + 1} requires an item ID.`,
            });
          }
          if (!Number.isFinite(bi.quantity) || bi.quantity < 1) {
            issues.push({
              field: `actions.${idx}.bundleItems.${bIdx}.quantity`,
              level: 'error',
              message: `Bundle entry #${bIdx + 1} quantity must be >= 1.`,
            });
          }
        });
      }
    }

    if (act.type === 'show_notification' && !act.message?.trim() && !act.messageTranslations?.ar?.trim()) {
      issues.push({
        field: `actions.${idx}.message`,
        level: 'error',
        message: `Notification action #${idx + 1} requires message text.`,
      });
    }

    if (
      hasDisallowedScriptInjection(act.targetId ?? '') ||
      hasDisallowedScriptInjection(act.message ?? '') ||
      hasDisallowedScriptInjection(act.messageTranslations?.ar ?? '') ||
      hasDisallowedScriptInjection(String(act.flagValue ?? ''))
    ) {
      issues.push({
        field: `actions.${idx}`,
        level: 'error',
        message: `Disallowed script payload detected in action #${idx + 1}.`,
      });
    }
  });

  if (!Number.isFinite(ev.execution.cooldownSeconds) || ev.execution.cooldownSeconds < 0) {
    issues.push({
      field: 'execution.cooldownSeconds',
      level: 'error',
      message: 'Cooldown seconds cannot be negative.',
    });
  }
  if (
    ev.execution.scope === 'repeatable_cooldown' &&
    (!Number.isFinite(ev.execution.cooldownSeconds) || ev.execution.cooldownSeconds <= 0)
  ) {
    issues.push({
      field: 'execution.cooldownSeconds',
      level: 'error',
      message: 'Repeatable with Cooldown scope requires cooldownSeconds > 0.',
    });
  }
  if (
    ev.execution.maxExecutions !== undefined &&
    ev.execution.maxExecutions !== null &&
    (!Number.isFinite(ev.execution.maxExecutions) || ev.execution.maxExecutions < 1)
  ) {
    issues.push({
      field: 'execution.maxExecutions',
      level: 'error',
      message: 'Max executions limit must be >= 1.',
    });
  }

  return issues;
}

export interface EventChainCycleReport {
  cycleIds: string[];
  eventUids: string[];
  reason: string;
}

function eventActionTriggersEvent(action: ModEventAction, candidate: ModEventDefinition): boolean {
  const actTarget = (action.targetId ?? '').trim();
  const trig = candidate.trigger;
  const trigTarget = (trig.targetId ?? '').trim();

  const matchesTarget = (id: string): boolean => {
    if (trig.targetMode === 'any') return true;
    if (trig.targetMode === 'specific_id') return !trigTarget || trigTarget === id;
    if (trig.targetMode === 'mod_namespace') {
      return Boolean(trig.targetModId && id.startsWith(`${trig.targetModId}:`));
    }
    return false;
  };

  switch (action.type) {
    case 'start_quest':
      return trig.type === 'on_quest_started' && matchesTarget(actTarget);
    case 'complete_quest':
      return (
        (trig.type === 'on_quest_completed' || trig.type === 'on_npc_quest_completed') &&
        matchesTarget(actTarget)
      );
    case 'start_dialogue':
      return trig.type === 'on_dialogue_started' && matchesTarget(actTarget);
    case 'give_item':
    case 'give_weapon':
    case 'add_to_inventory':
      return (
        ((trig.type === 'on_player_item_collected' ||
          trig.type === 'on_player_inventory_changed') &&
          matchesTarget(actTarget)) ||
        (Boolean(action.equipAutomatically) &&
          trig.type === 'on_player_item_equipped' &&
          matchesTarget(actTarget))
      );
    case 'give_multiple_items':
      return (
        (trig.type === 'on_player_item_collected' ||
          trig.type === 'on_player_inventory_changed') &&
        (action.bundleItems ?? []).some((bi) => matchesTarget(bi.itemId.trim()))
      );
    case 'equip_reward':
      return trig.type === 'on_player_item_equipped' && matchesTarget(actTarget);
    case 'drop_reward_in_world':
    case 'spawn_pickup_item':
      return (
        (trig.type === 'on_player_item_collected' || trig.type === 'on_item_dropped') &&
        matchesTarget(actTarget)
      );
    case 'spawn_entity':
      return (
        (trig.type === 'on_entity_killed' ||
          trig.type === 'on_monster_killed' ||
          trig.type === 'on_animal_killed') &&
        matchesTarget(actTarget)
      );
    default:
      return false;
  }
}

export function detectEventChainCycles(
  events: ModEventDefinition[]
): EventChainCycleReport[] {
  const active = events.filter((e) => e.enabled && e.id.trim());
  const byId = new Map(active.map((e) => [e.id.trim(), e]));
  const edges = new Map<string, string[]>();

  for (const src of active) {
    const targets: string[] = [];
    for (const dst of active) {
      if (src.actions.some((act) => eventActionTriggersEvent(act, dst))) {
        if (!targets.includes(dst.id.trim())) {
          targets.push(dst.id.trim());
        }
      }
    }
    edges.set(src.id.trim(), targets);
  }

  const cycles: EventChainCycleReport[] = [];
  const seenSignatures = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const isStrictlyBounded = (ev: ModEventDefinition): boolean => {
    const s: EventExecutionScope = ev.execution.scope;
    return (
      s === 'once_per_world' ||
      s === 'once_per_player' ||
      s === 'once_per_player_per_world' ||
      ev.execution.maxExecutions === 1
    );
  };

  const dfs = (nodeId: string, stack: string[]) => {
    if (visiting.has(nodeId)) {
      const startIdx = stack.indexOf(nodeId);
      const cycleIds = [...stack.slice(startIdx), nodeId];
      const loopEvents = cycleIds
        .slice(0, -1)
        .map((id) => byId.get(id))
        .filter((e): e is ModEventDefinition => Boolean(e));

      // Single-use once_* scopes terminate after 1 fire, unless direct self-loop with repeatable scope
      const allBounded = loopEvents.length > 0 && loopEvents.every(isStrictlyBounded);
      if (allBounded && cycleIds.length > 2) return;

      const sig = [...cycleIds.slice(0, -1)].sort().join('|');
      if (seenSignatures.has(sig)) return;
      seenSignatures.add(sig);

      cycles.push({
        cycleIds,
        eventUids: loopEvents.map((e) => e.uid),
        reason:
          cycleIds.length === 2
            ? `Self-triggering event loop detected on "${nodeId}".`
            : `Circular event chain detected: ${cycleIds.join(' -> ')}.`,
      });
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    for (const nextId of edges.get(nodeId) ?? []) {
      dfs(nextId, [...stack, nextId]);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const ev of active) {
    dfs(ev.id.trim(), [ev.id.trim()]);
  }

  return cycles;
}

export interface EventContentRefItem {
  property: string;
  refId: string;
}

export function collectEventReferencedContentIds(
  ev: ModEventDefinition
): EventContentRefItem[] {
  const refs: EventContentRefItem[] = [];
  const push = (property: string, raw?: string) => {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return;
    if (EVENT_NAMESPACED_ID_REGEX.test(trimmed)) {
      refs.push({ property, refId: trimmed });
    }
  };

  if (ev.trigger.targetMode === 'specific_id') {
    push('trigger.targetId', ev.trigger.targetId);
    if (ev.trigger.type === 'on_entity_killed_by_weapon') {
      push('trigger.secondaryTargetId', ev.trigger.secondaryTargetId);
    }
  }

  (ev.conditionGroups ?? []).forEach((grp, gIdx) => {
    (grp.rules ?? []).forEach((rule, rIdx) => {
      if (
        rule.field === 'player_has_item' ||
        rule.field === 'player_missing_item' ||
        rule.field === 'quest_state'
      ) {
        push(`conditionGroups[${gIdx}].rules[${rIdx}].targetId`, rule.targetId);
      }
      if (
        (rule.field === 'npc_id' ||
          rule.field === 'entity_id' ||
          rule.field === 'weapon_used') &&
        typeof rule.value === 'string'
      ) {
        push(`conditionGroups[${gIdx}].rules[${rIdx}].value`, rule.value);
      }
    });
  });

  (ev.actions ?? []).forEach((act: ModEventAction, idx: number) => {
    const desc = EVENT_ACTION_BY_TYPE.get(act.type);
    if (
      desc?.targetKind &&
      desc.targetKind !== 'none' &&
      desc.targetKind !== 'flag' &&
      desc.targetKind !== 'achievement' &&
      act.type !== 'give_multiple_items'
    ) {
      push(`actions[${idx}].targetId`, act.targetId);
    }
    if (act.type === 'give_multiple_items') {
      (act.bundleItems ?? []).forEach((bi, bIdx) => {
        push(`actions[${idx}].bundleItems[${bIdx}].itemId`, bi.itemId);
      });
    }
  });

  return refs;
}

export function remapEventContentIds(
  ev: ModEventDefinition,
  oldPrefix: string,
  newPrefix: string
): ModEventDefinition {
  const remap = (id?: string): string | undefined => {
    if (!id) return id;
    return id.startsWith(oldPrefix) ? `${newPrefix}${id.slice(oldPrefix.length)}` : id;
  };

  return {
    ...ev,
    id: remap(ev.id) ?? ev.id,
    trigger: {
      ...ev.trigger,
      targetId: remap(ev.trigger.targetId),
      secondaryTargetId: remap(ev.trigger.secondaryTargetId),
      targetModId:
        ev.trigger.targetModId && `${ev.trigger.targetModId}:` === oldPrefix
          ? newPrefix.slice(0, -1)
          : ev.trigger.targetModId,
      area: ev.trigger.area ? { ...ev.trigger.area } : undefined,
    },
    conditionGroups: (ev.conditionGroups ?? []).map((grp) => ({
      ...grp,
      rules: grp.rules.map((r) => ({
        ...r,
        targetId: remap(r.targetId),
        value: typeof r.value === 'string' ? (remap(r.value) ?? r.value) : r.value,
        area: r.area ? { ...r.area } : undefined,
      })),
    })),
    actions: (ev.actions ?? []).map((act) => ({
      ...act,
      targetId: remap(act.targetId),
      secondaryTargetId: remap(act.secondaryTargetId),
      position: act.position ? { ...act.position } : undefined,
      bundleItems: act.bundleItems?.map((bi) => ({
        ...bi,
        itemId: remap(bi.itemId) ?? bi.itemId,
      })),
    })),
    execution: { ...ev.execution },
  };
}
