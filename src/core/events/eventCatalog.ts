import {
  EventActionType,
  EventConditionField,
  EventConditionOperator,
  EventExecutionScope,
  EventResetBehavior,
  EventRuntimeSupportLevel,
  EventTargetMode,
  EventTemplatePresetId,
  EventTriggerCategory,
  EventTriggerType,
  ModContentDatabase,
  ModEventAction,
  ModEventConditionGroup,
  ModEventDefinition,
  ModEventTriggerConfig,
} from '@/src/types/content';

export type EventTargetSubject =
  | 'none'
  | 'item'
  | 'weapon'
  | 'equip_item'
  | 'npc'
  | 'dialogue'
  | 'dialogue_choice'
  | 'entity'
  | 'animal'
  | 'monster'
  | 'boss'
  | 'entity_and_weapon'
  | 'block'
  | 'world_object'
  | 'resource'
  | 'tree'
  | 'ore'
  | 'container'
  | 'building'
  | 'quest'
  | 'recipe'
  | 'area'
  | 'coordinates'
  | 'level';

export interface EventTriggerDescriptor {
  type: EventTriggerType;
  category: EventTriggerCategory;
  defaultTargetMode: EventTargetMode;
  supportedTargetModes: EventTargetMode[];
  targetSubject: EventTargetSubject;
  runtimeSupport: EventRuntimeSupportLevel;
  defaultTargetCategory?: string;
}

export const EVENT_TRIGGER_CATALOG: EventTriggerDescriptor[] = [
  // A. World and Player Events
  {
    type: 'on_new_world_created',
    category: 'world_player',
    defaultTargetMode: 'any',
    supportedTargetModes: ['any'],
    targetSubject: 'none',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_player_first_spawn',
    category: 'world_player',
    defaultTargetMode: 'any',
    supportedTargetModes: ['any'],
    targetSubject: 'none',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_player_respawn',
    category: 'world_player',
    defaultTargetMode: 'any',
    supportedTargetModes: ['any'],
    targetSubject: 'none',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_world_loaded',
    category: 'world_player',
    defaultTargetMode: 'any',
    supportedTargetModes: ['any'],
    targetSubject: 'none',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_player_enter_area',
    category: 'world_player',
    defaultTargetMode: 'area',
    supportedTargetModes: ['area'],
    targetSubject: 'area',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_player_reach_coordinates',
    category: 'world_player',
    defaultTargetMode: 'coordinates',
    supportedTargetModes: ['coordinates'],
    targetSubject: 'coordinates',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_player_level_reached',
    category: 'world_player',
    defaultTargetMode: 'threshold',
    supportedTargetModes: ['threshold'],
    targetSubject: 'level',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_player_item_collected',
    category: 'world_player',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'item',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_player_inventory_changed',
    category: 'world_player',
    defaultTargetMode: 'any',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'item',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_player_item_equipped',
    category: 'world_player',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'equip_item',
    runtimeSupport: 'sandbox_and_game',
  },

  // B. NPC and Dialogue Events
  {
    type: 'on_npc_talk',
    category: 'npc_dialogue',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'npc',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_dialogue_started',
    category: 'npc_dialogue',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'dialogue',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_dialogue_completed',
    category: 'npc_dialogue',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'dialogue',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_dialogue_choice_selected',
    category: 'npc_dialogue',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['specific_id', 'any'],
    targetSubject: 'dialogue_choice',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_npc_interaction',
    category: 'npc_dialogue',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'npc',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_npc_quest_completed',
    category: 'npc_dialogue',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'npc',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_npc_reputation_changed',
    category: 'npc_dialogue',
    defaultTargetMode: 'any',
    supportedTargetModes: ['any', 'specific_id'],
    targetSubject: 'npc',
    runtimeSupport: 'game_runtime_dependent',
  },

  // C. Combat Events
  {
    type: 'on_animal_killed',
    category: 'combat',
    defaultTargetMode: 'category',
    supportedTargetModes: ['category', 'specific_id', 'mod_namespace', 'any'],
    targetSubject: 'animal',
    runtimeSupport: 'sandbox_and_game',
    defaultTargetCategory: 'animal',
  },
  {
    type: 'on_monster_killed',
    category: 'combat',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'monster',
    runtimeSupport: 'sandbox_and_game',
    defaultTargetCategory: 'monster',
  },
  {
    type: 'on_enemy_killed',
    category: 'combat',
    defaultTargetMode: 'category',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'entity',
    runtimeSupport: 'sandbox_and_game',
    defaultTargetCategory: 'enemy',
  },
  {
    type: 'on_boss_killed',
    category: 'combat',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'boss',
    runtimeSupport: 'sandbox_and_game',
    defaultTargetCategory: 'boss',
  },
  {
    type: 'on_player_damaged',
    category: 'combat',
    defaultTargetMode: 'any',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'entity',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_entity_killed',
    category: 'combat',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'entity',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_entity_killed_by_weapon',
    category: 'combat',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['specific_id', 'category', 'any'],
    targetSubject: 'entity_and_weapon',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_player_combat_victory',
    category: 'combat',
    defaultTargetMode: 'any',
    supportedTargetModes: ['any', 'specific_id', 'category'],
    targetSubject: 'entity',
    runtimeSupport: 'sandbox_and_game',
  },

  // D. World Destruction & Gathering Events
  {
    type: 'on_block_broken',
    category: 'destruction_gathering',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'block',
    runtimeSupport: 'game_runtime_dependent',
  },
  {
    type: 'on_object_destroyed',
    category: 'destruction_gathering',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'world_object',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_resource_gathered',
    category: 'destruction_gathering',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'resource',
    runtimeSupport: 'game_runtime_dependent',
  },
  {
    type: 'on_tree_chopped',
    category: 'destruction_gathering',
    defaultTargetMode: 'category',
    supportedTargetModes: ['any', 'specific_id', 'category'],
    targetSubject: 'tree',
    runtimeSupport: 'game_runtime_dependent',
    defaultTargetCategory: 'tree',
  },
  {
    type: 'on_ore_mined',
    category: 'destruction_gathering',
    defaultTargetMode: 'category',
    supportedTargetModes: ['any', 'specific_id', 'category'],
    targetSubject: 'ore',
    runtimeSupport: 'game_runtime_dependent',
    defaultTargetCategory: 'ore',
  },
  {
    type: 'on_container_destroyed',
    category: 'destruction_gathering',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'container',
    runtimeSupport: 'sandbox_and_game',
    defaultTargetCategory: 'chest',
  },
  {
    type: 'on_structure_destroyed',
    category: 'destruction_gathering',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'category', 'mod_namespace'],
    targetSubject: 'building',
    runtimeSupport: 'game_runtime_dependent',
  },
  {
    type: 'on_item_dropped',
    category: 'destruction_gathering',
    defaultTargetMode: 'any',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'item',
    runtimeSupport: 'sandbox_and_game',
  },

  // E. Quest & Crafting Events
  {
    type: 'on_quest_started',
    category: 'quest_crafting',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'quest',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_quest_completed',
    category: 'quest_crafting',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'quest',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_quest_failed',
    category: 'quest_crafting',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'quest',
    runtimeSupport: 'game_runtime_dependent',
  },
  {
    type: 'on_item_crafted',
    category: 'quest_crafting',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'item',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_recipe_completed',
    category: 'quest_crafting',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'recipe',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_building_placed',
    category: 'quest_crafting',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'building',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    type: 'on_structure_completed',
    category: 'quest_crafting',
    defaultTargetMode: 'specific_id',
    supportedTargetModes: ['any', 'specific_id', 'mod_namespace'],
    targetSubject: 'building',
    runtimeSupport: 'game_runtime_dependent',
  },
];

export const EVENT_TRIGGER_BY_TYPE = new Map<EventTriggerType, EventTriggerDescriptor>(
  EVENT_TRIGGER_CATALOG.map((d) => [d.type, d])
);

export interface EventConditionDescriptor {
  field: EventConditionField;
  operators: EventConditionOperator[];
  defaultOperator: EventConditionOperator;
  valueType: 'number' | 'string' | 'boolean' | 'id' | 'coords';
  needsTargetId?: boolean;
  runtimeSupport: EventRuntimeSupportLevel;
  unsupportedReasonKey?: string;
}

export const EVENT_CONDITION_CATALOG: EventConditionDescriptor[] = [
  {
    field: 'player_level',
    operators: ['>=', '>', '==', '!=', '<=', '<'],
    defaultOperator: '>=',
    valueType: 'number',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'player_has_item',
    operators: ['contains', '==', '>='],
    defaultOperator: 'contains',
    valueType: 'number',
    needsTargetId: true,
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'player_missing_item',
    operators: ['==', '!='],
    defaultOperator: '==',
    valueType: 'boolean',
    needsTargetId: true,
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'npc_id',
    operators: ['==', '!='],
    defaultOperator: '==',
    valueType: 'id',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'entity_id',
    operators: ['==', '!='],
    defaultOperator: '==',
    valueType: 'id',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'entity_category',
    operators: ['==', '!='],
    defaultOperator: '==',
    valueType: 'string',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'weapon_used',
    operators: ['==', '!='],
    defaultOperator: '==',
    valueType: 'id',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'biome',
    operators: ['==', '!=', 'contains'],
    defaultOperator: '==',
    valueType: 'string',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'world_coordinates',
    operators: ['in_radius'],
    defaultOperator: 'in_radius',
    valueType: 'coords',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'time_of_day',
    operators: ['==', '!='],
    defaultOperator: '==',
    valueType: 'string',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'weather',
    operators: ['==', '!='],
    defaultOperator: '==',
    valueType: 'string',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'quest_state',
    operators: ['==', '!='],
    defaultOperator: '==',
    valueType: 'string',
    needsTargetId: true,
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'world_flag',
    operators: ['==', '!=', '>', '>=', '<', '<='],
    defaultOperator: '==',
    valueType: 'string',
    needsTargetId: true,
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'player_health_percent',
    operators: ['<=', '<', '>=', '>', '=='],
    defaultOperator: '<=',
    valueType: 'number',
    runtimeSupport: 'sandbox_and_game',
  },
  {
    field: 'multiplayer_authority',
    operators: ['==', '!='],
    defaultOperator: '==',
    valueType: 'string',
    runtimeSupport: 'unsupported',
    unsupportedReasonKey: 'events.unsupported.multiplayerAuthority',
  },
];

export const EVENT_CONDITION_BY_FIELD = new Map<
  EventConditionField,
  EventConditionDescriptor
>(EVENT_CONDITION_CATALOG.map((d) => [d.field, d]));

export interface EventActionDescriptor {
  type: EventActionType;
  group: 'rewards' | 'progression' | 'world_feedback';
  runtimeSupport: EventRuntimeSupportLevel;
  targetKind?: 'item' | 'weapon' | 'equip' | 'quest' | 'recipe' | 'sound' | 'entity' | 'dialogue' | 'faction' | 'achievement' | 'flag' | 'none';
  usesQuantity?: boolean;
  usesAmount?: boolean;
  usesDurability?: boolean;
  usesPosition?: boolean;
}

export const EVENT_ACTION_CATALOG: EventActionDescriptor[] = [
  {
    type: 'give_item',
    group: 'rewards',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'item',
    usesQuantity: true,
    usesDurability: true,
  },
  {
    type: 'give_weapon',
    group: 'rewards',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'weapon',
    usesQuantity: true,
    usesDurability: true,
  },
  {
    type: 'give_multiple_items',
    group: 'rewards',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'item',
  },
  {
    type: 'add_to_inventory',
    group: 'rewards',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'equip',
    usesQuantity: true,
    usesDurability: true,
  },
  {
    type: 'drop_reward_in_world',
    group: 'rewards',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'equip',
    usesQuantity: true,
    usesPosition: true,
  },
  {
    type: 'equip_reward',
    group: 'rewards',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'equip',
    usesDurability: true,
  },
  {
    type: 'give_xp',
    group: 'progression',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'none',
    usesAmount: true,
  },
  {
    type: 'give_currency',
    group: 'progression',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'none',
    usesAmount: true,
  },
  {
    type: 'give_reputation',
    group: 'progression',
    runtimeSupport: 'game_runtime_dependent',
    targetKind: 'faction',
    usesAmount: true,
  },
  {
    type: 'unlock_achievement',
    group: 'progression',
    runtimeSupport: 'game_runtime_dependent',
    targetKind: 'achievement',
  },
  {
    type: 'unlock_recipe',
    group: 'progression',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'recipe',
  },
  {
    type: 'start_quest',
    group: 'progression',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'quest',
  },
  {
    type: 'complete_quest',
    group: 'progression',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'quest',
  },
  {
    type: 'set_world_flag',
    group: 'world_feedback',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'flag',
  },
  {
    type: 'show_notification',
    group: 'world_feedback',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'none',
  },
  {
    type: 'play_sound',
    group: 'world_feedback',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'sound',
  },
  {
    type: 'spawn_entity',
    group: 'world_feedback',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'entity',
    usesQuantity: true,
    usesPosition: true,
  },
  {
    type: 'spawn_pickup_item',
    group: 'world_feedback',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'equip',
    usesQuantity: true,
    usesPosition: true,
  },
  {
    type: 'start_dialogue',
    group: 'world_feedback',
    runtimeSupport: 'sandbox_and_game',
    targetKind: 'dialogue',
  },
  {
    type: 'apply_status_effect',
    group: 'world_feedback',
    runtimeSupport: 'game_runtime_dependent',
    targetKind: 'none',
  },
];

export const EVENT_ACTION_BY_TYPE = new Map<EventActionType, EventActionDescriptor>(
  EVENT_ACTION_CATALOG.map((d) => [d.type, d])
);

export const EVENT_EXECUTION_SCOPES: EventExecutionScope[] = [
  'once_per_world',
  'once_per_player',
  'once_per_player_per_world',
  'once_per_event_trigger',
  'repeatable',
  'repeatable_cooldown',
];

export const EVENT_RESET_BEHAVIORS: EventResetBehavior[] = [
  'never',
  'on_world_reset',
  'on_player_respawn',
  'on_quest_reset',
  'manual',
];

export const BUILTIN_TRIGGER_CATEGORY_OPTIONS: {
  id: string;
  labelEn: string;
  labelAr: string;
}[] = [
  { id: 'animal', labelEn: 'Animals / Wildlife', labelAr: 'الحيوانات / الحياة البرية' },
  { id: 'monster', labelEn: 'Monsters', labelAr: 'الوحوش' },
  { id: 'enemy', labelEn: 'Hostile Enemies', labelAr: 'الأعداء المعادون' },
  { id: 'boss', labelEn: 'Bosses', labelAr: 'الزعماء' },
  { id: 'npc', labelEn: 'NPCs / Characters', labelAr: 'الشخصيات غير القابلة للعب' },
  { id: 'tree', labelEn: 'Trees', labelAr: 'الأشجار' },
  { id: 'ore', labelEn: 'Ore Veins / Minerals', labelAr: 'خامات التعدين / المعادن' },
  { id: 'chest', labelEn: 'Containers / Chests', labelAr: 'الصناديق والحاويات' },
  { id: 'shrine', labelEn: 'Shrines & Relics', labelAr: 'المزارات والآثار' },
  { id: 'harvest_node', labelEn: 'Harvest Nodes', labelAr: 'نقاط الجمع' },
  { id: 'prop', labelEn: 'World Props & Objects', labelAr: 'مجسمات وكائنات العالم' },
  { id: 'building', labelEn: 'Buildings & Structures', labelAr: 'المباني والمنشآت' },
];

export const BUILTIN_GAME_TARGETS: {
  id: string;
  kind: 'item' | 'weapon' | 'block' | 'world_object' | 'entity' | 'quest' | 'recipe' | 'sound' | 'faction';
  labelEn: string;
  labelAr: string;
}[] = [
  { id: 'woa:weapons/iron_sword', kind: 'weapon', labelEn: 'Iron Sword (Base Game)', labelAr: 'سيف حديدي (اللعبة الأساسية)' },
  { id: 'woa:weapons/oak_bow', kind: 'weapon', labelEn: 'Oak Bow (Base Game)', labelAr: 'قوس البلوط (اللعبة الأساسية)' },
  { id: 'woa:items/healing_herb', kind: 'item', labelEn: 'Healing Herb (Base Game)', labelAr: 'عشبة شفاء (اللعبة الأساسية)' },
  { id: 'woa:items/raw_hide', kind: 'item', labelEn: 'Raw Hide (Base Game)', labelAr: 'جلد خام (اللعبة الأساسية)' },
  { id: 'woa:items/iron_ore', kind: 'item', labelEn: 'Iron Ore (Base Game)', labelAr: 'خام الحديد (اللعبة الأساسية)' },
  { id: 'woa:items/timber_log', kind: 'item', labelEn: 'Timber Log (Base Game)', labelAr: 'جذع خشب (اللعبة الأساسية)' },
  { id: 'woa:items/relic_shard', kind: 'item', labelEn: 'Relic Shard (Base Game)', labelAr: 'شظية أثرية (اللعبة الأساسية)' },
  { id: 'woa:blocks/stone_crate', kind: 'block', labelEn: 'Stone Crate Block (Base Game)', labelAr: 'كتلة صندوق حجري (اللعبة الأساسية)' },
  { id: 'woa:blocks/oak_trunk', kind: 'block', labelEn: 'Oak Tree Trunk (Base Game)', labelAr: 'جذع شجرة بلوط (اللعبة الأساسية)' },
  { id: 'woa:blocks/iron_vein', kind: 'block', labelEn: 'Iron Ore Vein (Base Game)', labelAr: 'عرق خام الحديد (اللعبة الأساسية)' },
  { id: 'woa:objects/wooden_barrel', kind: 'world_object', labelEn: 'Wooden Barrel (Base Game)', labelAr: 'برميل خشبي (اللعبة الأساسية)' },
  { id: 'woa:objects/supply_crate', kind: 'world_object', labelEn: 'Supply Crate (Base Game)', labelAr: 'صندوق إمدادات (اللعبة الأساسية)' },
  { id: 'woa:creatures/wild_boar', kind: 'entity', labelEn: 'Wild Boar (Animal)', labelAr: 'خنزير بري (حيوان)' },
  { id: 'woa:creatures/frontier_wolf', kind: 'entity', labelEn: 'Frontier Wolf (Animal)', labelAr: 'ذئب الحدود (حيوان)' },
  { id: 'woa:creatures/shadow_stalker', kind: 'entity', labelEn: 'Shadow Stalker (Monster)', labelAr: 'متتبع الظلال (وحش)' },
  { id: 'woa:factions/frontier_guild', kind: 'faction', labelEn: 'Frontier Guild', labelAr: 'نقابة الحدود' },
  { id: 'woa:sfx/reward_chime', kind: 'sound', labelEn: 'Reward Chime SFX', labelAr: 'صوت استلام المكافأة' },
  { id: 'woa:sfx/quest_complete', kind: 'sound', labelEn: 'Quest Complete SFX', labelAr: 'صوت إتمام المهمة' },
];

export const EVENT_TEMPLATE_IDS: EventTemplatePresetId[] = [
  'starter_sword',
  'npc_reward',
  'monster_loot',
  'animal_loot',
  'destruction_reward',
];

function nextId(modId: string, baseSlug: string, existingIds: Set<string>): string {
  const clean = baseSlug.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'custom_event';
  let candidate = `${modId}:${clean}`;
  if (!existingIds.has(candidate)) {
    existingIds.add(candidate);
    return candidate;
  }
  let n = 2;
  while (existingIds.has(`${candidate}_${n}`)) n++;
  const finalId = `${candidate}_${n}`;
  existingIds.add(finalId);
  return finalId;
}

export function createEventFromTemplate(
  preset: EventTemplatePresetId,
  modId: string,
  existingIds: Set<string>,
  db?: ModContentDatabase
): ModEventDefinition {
  const now = new Date().toISOString();
  const uid = `event_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const firstWeaponId = db?.weapons[0]?.id || 'woa:weapons/iron_sword';
  const firstItemId = db?.items[0]?.id || 'woa:items/healing_herb';
  const firstNpcId = db?.npcs[0]?.id || '';
  const firstDialogue = db?.dialogues?.[0];
  const firstDialogueChoice = firstDialogue?.nodes.flatMap((n) => n.choices)[0]?.id || 'choice_accept';
  const firstMonsterId = db?.monsters[0]?.id || 'woa:creatures/shadow_stalker';
  const firstWorldObjectId = db?.worldObjects?.[0]?.id || 'woa:objects/supply_crate';

  if (preset === 'starter_sword') {
    const id = nextId(modId, 'starter_sword_grant', existingIds);
    return {
      uid,
      id,
      name: 'Starter Sword Grant',
      description: 'Grants the player a starting weapon when creating a new world.',
      translations: {
        name: { en: 'Starter Sword Grant', ar: 'منحة سيف البداية' },
        description: {
          en: 'Grants the player a starting weapon when creating a new world.',
          ar: 'يمنح اللاعب سلاح بداية عند إنشاء عالم جديد.',
        },
      },
      enabled: true,
      category: 'world_player',
      templatePreset: 'starter_sword',
      trigger: {
        type: 'on_new_world_created',
        targetMode: 'any',
      },
      conditionCombinator: 'and',
      conditionGroups: [],
      actions: [
        {
          id: `act_${Date.now()}_1`,
          type: 'give_weapon',
          targetId: firstWeaponId,
          quantity: 1,
          equipAutomatically: true,
        },
        {
          id: `act_${Date.now()}_2`,
          type: 'show_notification',
          message: 'Starter weapon equipped for your new adventure!',
          messageTranslations: {
            en: 'Starter weapon equipped for your new adventure!',
            ar: 'تم تجهيز سلاح البداية لمغامرتك الجديدة!',
          },
        },
      ],
      execution: {
        scope: 'once_per_player_per_world',
        maxExecutions: null,
        cooldownSeconds: 0,
        persistentState: true,
        resetBehavior: 'on_world_reset',
      },
      updatedAt: now,
    };
  }

  if (preset === 'npc_reward') {
    const id = nextId(modId, 'npc_dialogue_reward', existingIds);
    const condGroups: ModEventConditionGroup[] = firstNpcId
      ? [
          {
            id: `grp_${Date.now()}`,
            logic: 'and',
            rules: [
              {
                id: `cond_${Date.now()}`,
                field: 'npc_id',
                operator: '==',
                value: firstNpcId,
              },
            ],
          },
        ]
      : [];
    return {
      uid,
      id,
      name: 'NPC Dialogue Choice Reward',
      description: 'Grants a reward when the player selects a specific dialogue choice with an NPC.',
      translations: {
        name: { en: 'NPC Dialogue Choice Reward', ar: 'مكافأة اختيار حوار الشخصية' },
        description: {
          en: 'Grants a reward when the player selects a specific dialogue choice with an NPC.',
          ar: 'يمنح مكافأة عند اختيار اللاعب لرد حوار محدد مع الشخصية.',
        },
      },
      enabled: true,
      category: 'npc_dialogue',
      templatePreset: 'npc_reward',
      trigger: {
        type: 'on_dialogue_choice_selected',
        targetMode: 'specific_id',
        targetId: firstDialogue?.id || firstNpcId,
        secondaryTargetId: firstDialogueChoice,
      },
      conditionCombinator: 'and',
      conditionGroups: condGroups,
      actions: [
        {
          id: `act_${Date.now()}_1`,
          type: 'give_item',
          targetId: firstItemId,
          quantity: 1,
        },
      ],
      execution: {
        scope: 'once_per_player',
        maxExecutions: null,
        cooldownSeconds: 0,
        persistentState: true,
        resetBehavior: 'never',
      },
      updatedAt: now,
    };
  }

  if (preset === 'monster_loot') {
    const id = nextId(modId, 'monster_kill_reward', existingIds);
    return {
      uid,
      id,
      name: 'Monster Kill Reward',
      description: 'Grants an item or drops loot in the world whenever the target monster is defeated.',
      translations: {
        name: { en: 'Monster Kill Reward', ar: 'مكافأة القضاء على وحش' },
        description: {
          en: 'Grants an item or drops loot in the world whenever the target monster is defeated.',
          ar: 'يمنح عنصراً أو يُسقط غنيمة في العالم عند القضاء على الوحش المستهدف.',
        },
      },
      enabled: true,
      category: 'combat',
      templatePreset: 'monster_loot',
      trigger: {
        type: 'on_monster_killed',
        targetMode: 'specific_id',
        targetId: firstMonsterId,
        targetCategory: 'monster',
      },
      conditionCombinator: 'and',
      conditionGroups: [],
      actions: [
        {
          id: `act_${Date.now()}_1`,
          type: 'give_item',
          targetId: firstItemId,
          quantity: 1,
        },
        {
          id: `act_${Date.now()}_2`,
          type: 'give_xp',
          amount: 45,
        },
      ],
      execution: {
        scope: 'once_per_event_trigger',
        maxExecutions: null,
        cooldownSeconds: 0,
        persistentState: false,
        resetBehavior: 'never',
      },
      updatedAt: now,
    };
  }

  if (preset === 'animal_loot') {
    const id = nextId(modId, 'animal_harvest_reward', existingIds);
    return {
      uid,
      id,
      name: 'Animal Harvest Reward',
      description: 'Drops or grants configured resource rewards whenever any animal is hunted.',
      translations: {
        name: { en: 'Animal Harvest Reward', ar: 'مكافأة صيد الحيوانات' },
        description: {
          en: 'Drops or grants configured resource rewards whenever any animal is hunted.',
          ar: 'يُسقط أو يمنح موارد مخصصة عند صيد أي حيوان.',
        },
      },
      enabled: true,
      category: 'combat',
      templatePreset: 'animal_loot',
      trigger: {
        type: 'on_animal_killed',
        targetMode: 'category',
        targetCategory: 'animal',
      },
      conditionCombinator: 'and',
      conditionGroups: [],
      actions: [
        {
          id: `act_${Date.now()}_1`,
          type: 'give_item',
          targetId: db?.items[0]?.id || 'woa:items/raw_hide',
          quantity: 2,
        },
      ],
      execution: {
        scope: 'once_per_event_trigger',
        maxExecutions: null,
        cooldownSeconds: 0,
        persistentState: false,
        resetBehavior: 'never',
      },
      updatedAt: now,
    };
  }

  // destruction_reward
  const id = nextId(modId, 'object_destruction_reward', existingIds);
  return {
    uid,
    id,
    name: 'Object Destruction Reward',
    description: 'Grants a reward when a configured world object or destructible prop is broken.',
    translations: {
      name: { en: 'Object Destruction Reward', ar: 'مكافأة تدمير كائن' },
      description: {
        en: 'Grants a reward when a configured world object or destructible prop is broken.',
        ar: 'يمنح مكافأة عند تدمير الكائن أو المجسم العالمي المحدد.',
      },
    },
    enabled: true,
    category: 'destruction_gathering',
    templatePreset: 'destruction_reward',
    trigger: {
      type: 'on_object_destroyed',
      targetMode: 'specific_id',
      targetId: firstWorldObjectId,
    },
    conditionCombinator: 'and',
    conditionGroups: [],
    actions: [
      {
        id: `act_${Date.now()}_1`,
        type: 'give_item',
        targetId: firstItemId,
        quantity: 1,
      },
    ],
    execution: {
      scope: 'once_per_event_trigger',
      maxExecutions: null,
      cooldownSeconds: 0,
      persistentState: false,
      resetBehavior: 'never',
    },
    updatedAt: now,
  };
}

export function createDefaultActionForType(
  type: EventActionType,
  db?: ModContentDatabase
): ModEventAction {
  const desc = EVENT_ACTION_CATALOG.find((a) => a.type === type);
  const firstItem = db?.items[0]?.id || 'woa:items/healing_herb';
  const firstWeapon = db?.weapons[0]?.id || 'woa:weapons/iron_sword';
  const firstQuest = db?.quests[0]?.id || '';
  const firstRecipe = db?.recipes[0]?.id || '';
  const firstDialogue = db?.dialogues?.[0]?.id || '';
  const firstEntity = db?.monsters[0]?.id || db?.npcs[0]?.id || '';
  const firstSound = db?.audioCues?.[0]?.id || 'woa:sfx/reward_chime';

  return {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    ...(desc?.targetKind === 'item' ? { targetId: firstItem } : {}),
    ...(desc?.targetKind === 'weapon' ? { targetId: firstWeapon } : {}),
    ...(desc?.targetKind === 'equip' ? { targetId: firstWeapon || firstItem } : {}),
    ...(desc?.targetKind === 'quest' ? { targetId: firstQuest } : {}),
    ...(desc?.targetKind === 'recipe' ? { targetId: firstRecipe } : {}),
    ...(desc?.targetKind === 'dialogue' ? { targetId: firstDialogue } : {}),
    ...(desc?.targetKind === 'entity' ? { targetId: firstEntity } : {}),
    ...(desc?.targetKind === 'sound' ? { targetId: firstSound } : {}),
    ...(desc?.targetKind === 'faction' ? { targetId: 'woa:factions/frontier_guild' } : {}),
    ...(desc?.targetKind === 'flag' ? { targetId: 'custom_flag', flagValue: true } : {}),
    ...(desc?.targetKind === 'achievement' ? { targetId: 'achievement_first_steps' } : {}),
    ...(desc?.usesQuantity ? { quantity: 1 } : {}),
    ...(desc?.usesAmount ? { amount: type === 'give_xp' ? 50 : 25 } : {}),
    ...(desc?.usesPosition ? { position: { x: 0, y: 0, z: 0 } } : {}),
    ...(type === 'give_multiple_items'
      ? {
          bundleItems: [
            {
              id: `bi_${Date.now()}`,
              itemId: firstItem,
              quantity: 1,
            },
          ],
        }
      : {}),
    ...(type === 'show_notification'
      ? {
          message: 'Reward received!',
          messageTranslations: { en: 'Reward received!', ar: 'تم استلام المكافأة!' },
        }
      : {}),
    ...(type === 'apply_status_effect'
      ? { statusEffect: 'regeneration', durationSeconds: 10 }
      : {}),
  };
}

export function createDefaultTriggerConfig(
  type: EventTriggerType,
  db?: ModContentDatabase
): ModEventTriggerConfig {
  const desc = EVENT_TRIGGER_BY_TYPE.get(type);
  const mode = desc?.defaultTargetMode ?? 'any';
  let targetId = '';
  let secondaryTargetId = '';

  if (mode === 'specific_id' && db) {
    switch (desc?.targetSubject) {
      case 'item':
        targetId = db.items[0]?.id || '';
        break;
      case 'weapon':
        targetId = db.weapons[0]?.id || '';
        break;
      case 'equip_item':
        targetId = db.weapons[0]?.id || db.armor[0]?.id || db.items[0]?.id || '';
        break;
      case 'npc':
        targetId = db.npcs[0]?.id || '';
        break;
      case 'dialogue':
        targetId = db.dialogues?.[0]?.id || '';
        break;
      case 'dialogue_choice':
        targetId = db.dialogues?.[0]?.id || db.npcs[0]?.id || '';
        secondaryTargetId =
          db.dialogues?.[0]?.nodes.flatMap((n) => n.choices)[0]?.id || '';
        break;
      case 'monster':
      case 'boss':
      case 'entity':
        targetId = db.monsters[0]?.id || db.npcs[0]?.id || '';
        break;
      case 'entity_and_weapon':
        targetId = db.monsters[0]?.id || '';
        secondaryTargetId = db.weapons[0]?.id || '';
        break;
      case 'world_object':
      case 'container':
        targetId = db.worldObjects?.[0]?.id || '';
        break;
      case 'quest':
        targetId = db.quests[0]?.id || '';
        break;
      case 'recipe':
        targetId = db.recipes[0]?.id || '';
        break;
      case 'building':
        targetId = db.buildings[0]?.id || '';
        break;
      default:
        break;
    }
  }

  return {
    type,
    targetMode: mode,
    ...(targetId ? { targetId } : {}),
    ...(secondaryTargetId ? { secondaryTargetId } : {}),
    ...(desc?.defaultTargetCategory ? { targetCategory: desc.defaultTargetCategory } : {}),
    ...(mode === 'area' || mode === 'coordinates'
      ? { area: { x: 0, y: 0, z: 0, radius: 12, label: 'Trigger Zone' } }
      : {}),
    ...(mode === 'threshold' ? { threshold: 5 } : {}),
  };
}
