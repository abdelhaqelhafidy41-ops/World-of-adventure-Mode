import type { LocalizedTextMap } from '@/src/i18n/types';

export type ContentKind =
  | 'item'
  | 'weapon'
  | 'armor'
  | 'npc'
  | 'monster'
  | 'quest'
  | 'recipe'
  | 'building'
  | 'spawn';

export type ItemRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'relic';

export type ItemCategory =
  | 'consumable'
  | 'material'
  | 'quest'
  | 'tool'
  | 'key'
  | 'misc';

export type ArmorSlot =
  | 'head'
  | 'chest'
  | 'legs'
  | 'feet'
  | 'hands'
  | 'back'
  | 'shield';

export type NpcBehaviorType =
  | 'friendly'
  | 'merchant'
  | 'quest_giver'
  | 'guard'
  | 'companion'
  | 'neutral';

export type MonsterAttackBehavior =
  | 'melee'
  | 'ranged'
  | 'ambush'
  | 'charge'
  | 'caster'
  | 'swarm';

export type SpawnTimeOfDay = 'any' | 'day' | 'night' | 'dawn' | 'dusk';

export interface ProjectileSettings {
  enabled: boolean;
  projectileId: string;
  speed: number;
  gravity: number;
  spreadDegrees: number;
  pierceCount: number;
}

export type WeaponSubtype =
  | 'melee'
  | 'sword'
  | 'axe'
  | 'spear'
  | 'dagger'
  | 'bow'
  | 'staff'
  | 'shield';

export interface LootDropEntry {
  id: string;
  itemId: string;
  minCount: number;
  maxCount: number;
  chance: number; // percentage 0..100
  weight?: number;
  guaranteed?: boolean;
  rarityFilter?: ItemRarity;
  conditionBiome?: string;
  minPlayerLevel?: number;
  conditionWeather?: WeatherCondition;
}

export interface NpcDialogueLine {
  id: string;
  speakerMood: 'neutral' | 'friendly' | 'urgent' | 'trade' | 'quest';
  text: string;
  textTranslations?: LocalizedTextMap;
  condition?: string;
}

export interface MonsterSpawnRules {
  biomes: string[];
  timeOfDay: 'any' | 'day' | 'night';
  minGroupSize: number;
  maxGroupSize: number;
  spawnWeight: number;
  minAltitude: number;
}

export interface WoAContentBase {
  uid: string;
  id: string; // standardized "modId:objectId"
  name: string;
  description: string;
  translations?: {
    name?: LocalizedTextMap;
    description?: LocalizedTextMap;
  };
  updatedAt: string;
}

export type SpawnPositionMode =
  | 'absolute'
  | 'relative_world_spawn'
  | 'relative_reference'
  | 'random_area';

export type SpawnTerrainAlignment = 'exact_y' | 'conform_terrain' | 'flatten';
export type SpawnNpcBehaviorMode = 'stationary' | 'patrol';
export type WorldSpawnContentKind =
  | 'item'
  | 'weapon'
  | 'armor'
  | 'npc'
  | 'monster'
  | 'building'
  | 'world_object';

export interface SpawnVec3 {
  x: number;
  y: number;
  z: number;
}

export interface SpawnLocationArea {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  minDistance: number;
  maxInstances: number;
  deterministicSeedOffset?: number;
}

export interface SpawnLocationConditions {
  onNewWorld: boolean;
  onWorldLoadIfUnspawned: boolean;
  onChunkLoad: boolean;
  onPlayerEnterArea: boolean;
  enterAreaRadius: number;
  timeOfDay: SpawnTimeOfDay;
  weather: WeatherCondition;
  biomes: string[];
  regionOrDimension?: string;
  requiredQuestId?: string;
  worldCondition?: string;
  minPlayerDistance?: number;
  maxPlayerDistance?: number;
  preventDuplicateOnChunkReload: boolean;
}

export interface ContentSpawnLocation {
  spawnId: string;
  label: string;
  enabled: boolean;
  quantity: number;
  position: SpawnVec3;
  rotation: SpawnVec3;
  scale: SpawnVec3;
  area?: SpawnLocationArea;
  conditions: SpawnLocationConditions;
}

export interface ContentSpawnBehavior {
  npcBehavior?: SpawnNpcBehaviorMode;
  uniquePersistent?: boolean;
  dialogueAvailable?: boolean;
  maxActiveInstances?: number;
  respawnEnabled?: boolean;
  respawnDelaySeconds?: number;
  groupBehavior?: 'solo' | 'pack' | 'territorial';
  pickupAvailable?: boolean;
  visualFloat?: boolean;
  visualRotate?: boolean;
  terrainAlignment?: SpawnTerrainAlignment;
  validateCollisionOverlap?: boolean;
  footprintRadius?: number;
}

export interface ContentSpawnConfig {
  enabled: boolean;
  mode: SpawnPositionMode;
  referenceObjectId?: string;
  behavior?: ContentSpawnBehavior;
  locations: ContentSpawnLocation[];
}

export interface ItemDefinition extends WoAContentBase {
  icon: string;
  stackSize: number;
  weight: number;
  value: number;
  rarity: ItemRarity;
  category: ItemCategory;
  spawnConfig?: ContentSpawnConfig;
}

export interface WeaponChargeAttackConfig {
  enabled: boolean;
  multiplier: number;
  chargeSeconds: number;
}

export interface WeaponDefinition extends WoAContentBase {
  damage: number;
  attackSpeed: number;
  range: number;
  durability: number;
  criticalChance: number;
  projectile: ProjectileSettings;
  animation: string;
  sound: string;
  model: string;
  icon: string;
  weaponType?: WeaponSubtype;
  cooldownSeconds?: number;
  staminaCost?: number;
  knockback?: number;
  critMultiplier?: number;
  reloadSeconds?: number;
  ammoItemId?: string;
  chargeAttack?: WeaponChargeAttackConfig;
  spawnConfig?: ContentSpawnConfig;
}

export interface ArmorDefinition extends WoAContentBase {
  defense: number;
  durability: number;
  weight: number;
  slot: ArmorSlot;
  model: string;
  icon: string;
  spawnConfig?: ContentSpawnConfig;
}

export interface NpcDefinition extends WoAContentBase {
  model: string;
  health: number;
  movementSpeed: number;
  behaviorType: NpcBehaviorType;
  dialogue: NpcDialogueLine[];
  faction: string;
  loot: LootDropEntry[];
  questReferences: string[];
  aiBehaviorGraphId?: string;
  dialogueTreeId?: string;
  spawnConfig?: ContentSpawnConfig;
}

export interface MonsterSpecialAbility {
  id: string;
  name: string;
  cooldownSeconds: number;
  range: number;
  damageMultiplier: number;
  effect?: 'bleed' | 'burn' | 'frost' | 'stun' | 'knockback';
}

export interface MonsterDefinition extends WoAContentBase {
  model: string;
  health: number;
  damage: number;
  speed: number;
  detectionRange: number;
  attackBehavior: MonsterAttackBehavior;
  loot: LootDropEntry[];
  spawnRules: MonsterSpawnRules;
  aiBehaviorGraphId?: string;
  patrolRadius?: number;
  aggroRadius?: number;
  fleeHealthPercent?: number;
  lootTableId?: string;
  abilities?: MonsterSpecialAbility[];
  spawnConfig?: ContentSpawnConfig;
}

// ============================================================================
// ADVANCED CONTENT EDITORS: QUESTS, CRAFTING, BUILDINGS, SPAWNS
// ============================================================================

export type QuestType = 'main' | 'side';
export type QuestObjectiveType = 'kill' | 'collect' | 'talk' | 'reach_location';

export interface QuestObjective {
  id: string;
  type: QuestObjectiveType;
  summary: string;
  summaryTranslations?: LocalizedTextMap;
  targetId: string; // creature ID, item ID, NPC ID, or location ID
  requiredCount: number;
  consumeOnComplete?: boolean;
  optional?: boolean;
  failCondition?: string;
  location?: {
    x: number;
    y: number;
    z: number;
    radius: number;
  };
}

export interface QuestRewardItem {
  id: string;
  itemId: string;
  quantity: number;
}

export interface QuestDialogueStage {
  id: string;
  stage: 'offer' | 'in_progress' | 'complete';
  speakerNpcId: string;
  text: string;
  textTranslations?: LocalizedTextMap;
}

export interface QuestEndingBranch {
  id: string;
  label: string;
  labelTranslations?: LocalizedTextMap;
  rewardXpBonus?: number;
  rewardGoldBonus?: number;
  unlocksQuestId?: string;
}

export interface QuestDefinition extends WoAContentBase {
  questType: QuestType;
  chapterOrRegion: string;
  recommendedLevel: number;
  giverNpcId: string;
  repeatable: boolean;
  objectives: QuestObjective[];
  rewards: {
    xp: number;
    gold: number;
    reputationFaction: string;
    reputationAmount: number;
    items: QuestRewardItem[];
  };
  dialogue: QuestDialogueStage[];
  chain: {
    prerequisiteQuestIds: string[];
    nextQuestId: string;
  };
  failConditions?: string[];
  endings?: QuestEndingBranch[];
  graphPosition?: { x: number; y: number };
}

export type CraftingStationType =
  | 'workbench'
  | 'forge'
  | 'alchemy_table'
  | 'arcane_loom'
  | 'campfire'
  | 'inventory';

export interface CraftingIngredient {
  id: string;
  itemId: string;
  quantity: number;
}

export interface CraftingRecipeDefinition extends WoAContentBase {
  station: CraftingStationType;
  craftTimeSeconds: number;
  outputItemId: string;
  outputQuantity: number;
  ingredients: CraftingIngredient[];
  unlockedByDefault: boolean;
}

export type BuildingCategory =
  | 'house'
  | 'outpost'
  | 'workshop'
  | 'shrine'
  | 'fortification'
  | 'decoration';

export interface BuildingPiece {
  id: string;
  name: string;
  model: string;
  position: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
  scale: number;
}

export interface BuildingMaterialRequirement {
  id: string;
  materialName: string;
  itemId: string;
  quantity: number;
}

export interface BuildingPlacementPoint {
  id: string;
  name: string;
  pointType: 'ground_anchor' | 'snap_socket' | 'wall_mount' | 'roof_mount';
  position: { x: number; y: number; z: number };
  facingDeg: number;
}

export interface BuildingDoorEntry {
  id: string;
  name: string;
  model: string;
  position: { x: number; y: number; z: number };
  rotationYDeg: number;
  locked: boolean;
  keyItemId: string;
}

export interface BuildingWindowEntry {
  id: string;
  name: string;
  model: string;
  position: { x: number; y: number; z: number };
  width: number;
  height: number;
  destructible: boolean;
}

export interface BuildingInteractiveObject {
  id: string;
  name: string;
  objectType: 'chest' | 'crafting_station' | 'bed' | 'lever' | 'portal' | 'beacon';
  targetId: string;
  position: { x: number; y: number; z: number };
  interactionPrompt: string;
  promptTranslations?: LocalizedTextMap;
}

export interface BuildingDefinition extends WoAContentBase {
  category: BuildingCategory;
  model: string;
  footprint: { width: number; height: number; depth: number };
  pieces: BuildingPiece[];
  materials: BuildingMaterialRequirement[];
  placementPoints: BuildingPlacementPoint[];
  collision: {
    enabled: boolean;
    shape: 'box' | 'compound' | 'mesh';
    width: number;
    height: number;
    depth: number;
    offsetY: number;
  };
  doors: BuildingDoorEntry[];
  windows: BuildingWindowEntry[];
  interactiveObjects: BuildingInteractiveObject[];
  linkedPrefabId?: string;
  spawnConfig?: ContentSpawnConfig;
}

export type WeatherCondition = 'any' | 'clear' | 'rain' | 'storm';

export interface SpawnPointEntry {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  yawDeg: number;
}

export interface SpawnDefinition extends WoAContentBase {
  entityId: string; // monster or NPC ID
  spawnPoints: SpawnPointEntry[];
  conditions: {
    minPlayerLevel: number;
    maxPlayerLevel: number;
    weather: WeatherCondition;
    requiredQuestId: string;
    minLightLevel: number;
    maxLightLevel: number;
  };
  biomes: string[];
  timeOfDay: SpawnTimeOfDay;
  population: {
    maxPopulation: number;
    maxPerChunk: number;
    groupMin: number;
    groupMax: number;
  };
  respawn: {
    enabled: boolean;
    delaySeconds: number;
    requirePlayerAway: boolean;
    minPlayerDistance: number;
  };
}

export type ExtendedConfigKind =
  | 'animation'
  | 'audio'
  | 'material'
  | 'loot_table'
  | 'dialogue'
  | 'world_object';

export type SdkConfigKind =
  | 'prefab'
  | 'ai_behavior'
  | 'world_map'
  | 'procedural_rule'
  | 'logic_graph'
  | 'event';

export type AnimationTargetType = 'weapon' | 'character' | 'npc' | 'creature' | 'prop';

export type AnimationStatePreset =
  | 'idle'
  | 'walk'
  | 'run'
  | 'attack'
  | 'interact'
  | 'sit'
  | 'sleep';

export interface AnimationKeyframe {
  id: string;
  timeNormalized: number; // 0..1
  targetNodeName?: string;
  position: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export interface AnimationTimelineEvent {
  id: string;
  timeNormalized: number; // 0..1
  eventType: 'hit' | 'sound' | 'particle' | 'footstep' | 'custom';
  payload: string;
}

export interface AnimationConfigEntry extends WoAContentBase {
  targetType: AnimationTargetType;
  clipName: string;
  speed: number;
  blendSeconds: number;
  loop: boolean;
  hitFrameNormalized: number; // 0..1 trigger point for melee/cast events
  soundCueId: string;
  durationSeconds?: number;
  statePreset?: AnimationStatePreset;
  keyframes?: AnimationKeyframe[];
  events?: AnimationTimelineEvent[];
}

export type AudioBusType = 'sfx' | 'ambience' | 'music' | 'ui';
export type AudioTriggerType =
  | 'manual'
  | 'attack'
  | 'hit'
  | 'interact'
  | 'ambient'
  | 'quest';

export interface AudioConfigEntry extends WoAContentBase {
  bus: AudioBusType;
  assetPath: string;
  volume: number; // 0..2
  pitchMin: number;
  pitchMax: number;
  spatial: boolean;
  maxDistanceMeters: number;
  loop: boolean;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  minDistanceMeters?: number;
  trigger?: AudioTriggerType;
}

export type MaterialShaderProfile =
  | 'pbr_standard'
  | 'foliage_wind'
  | 'crystal_emissive'
  | 'water_surface'
  | 'stone_weathered';

export type MaterialAlphaMode = 'opaque' | 'blend' | 'cutoff';

export interface MaterialConfigEntry extends WoAContentBase {
  shaderProfile: MaterialShaderProfile;
  albedoTexture: string;
  normalTexture: string;
  aoTexture?: string;
  aoIntensity?: number; // 0..2
  normalScale?: number; // 0..2
  baseColor: string;
  metallic: number; // 0..1
  roughness: number; // 0..1
  emissiveColor: string;
  emissiveIntensity: number; // 0..3
  opacity?: number; // 0..1
  transparent?: boolean;
  alphaMode?: MaterialAlphaMode;
  alphaCutoff?: number; // 0..1
  uvTiling: { x: number; y: number };
  uvOffset?: { x: number; y: number };
  doubleSided: boolean;
}

export interface LootTableDefinition extends WoAContentBase {
  rollsMin: number;
  rollsMax: number;
  guaranteeOne: boolean;
  entries: LootDropEntry[];
}

export interface DialogueChoice {
  id: string;
  label: string;
  labelTranslations?: LocalizedTextMap;
  nextNodeId: string;
  condition?: string;
  requiredItemId?: string;
  reputationMin?: number;
}

export interface DialogueTreeNode {
  id: string;
  speakerName: string;
  speakerNpcId: string;
  mood: 'neutral' | 'friendly' | 'urgent' | 'trade' | 'quest';
  text: string;
  textTranslations?: LocalizedTextMap;
  condition?: string;
  questTriggerId?: string;
  choices: DialogueChoice[];
  position?: { x: number; y: number };
}

export interface DialogueTreeDefinition extends WoAContentBase {
  npcId: string;
  rootNodeId: string;
  nodes: DialogueTreeNode[];
}

export type WorldObjectKind =
  | 'shrine'
  | 'chest'
  | 'portal'
  | 'door'
  | 'harvest_node'
  | 'prop'
  | 'trigger_zone';

export interface WorldObjectDefinition extends WoAContentBase {
  objectType: WorldObjectKind;
  model: string;
  materialConfigId: string;
  audioCueId: string;
  lootTableId: string;
  questId: string;
  biome: string;
  position: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
  scale: number;
  collisionEnabled: boolean;
  interactionPrompt: string;
  promptTranslations?: LocalizedTextMap;
  respawnSeconds: number;
  spawnConfig?: ContentSpawnConfig;
}

// ============================================================================
// MOD SDK SYSTEMS: PREFABS, AI BEHAVIOR GRAPHS, WORLDS, PROCEDURAL, LOGIC
// ============================================================================

export type PrefabCategory =
  | 'house'
  | 'tree'
  | 'cart'
  | 'gate'
  | 'camp'
  | 'npc_setup'
  | 'decoration'
  | 'weapon_display'
  | 'furniture'
  | 'custom';

export interface PrefabNodeItem {
  id: string;
  name: string;
  parentId: string | null;
  type: 'Group' | 'Mesh' | 'Object3D' | 'PrefabRef';
  modelPath?: string;
  materialConfigId?: string;
  texturePath?: string;
  animationId?: string;
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  };
  properties?: Record<string, string | number | boolean>;
}

export interface PrefabDefinition extends WoAContentBase {
  category: PrefabCategory;
  sourceAssetId?: string;
  sourceBuildingId?: string;
  tags: string[];
  nodes: PrefabNodeItem[];
  materials: string[];
  textures: string[];
  animations: string[];
  references: {
    assetPaths: string[];
    contentIds: string[];
  };
  instanceCount?: number;
}

export type BehaviorNodeKind =
  | 'start'
  | 'condition'
  | 'sequence'
  | 'selector'
  | 'action';

export type BehaviorConditionType =
  | 'player_in_range'
  | 'health_below'
  | 'time_of_day'
  | 'has_target'
  | 'random_chance';

export type BehaviorActionType =
  | 'idle'
  | 'patrol'
  | 'chase'
  | 'attack'
  | 'flee'
  | 'speak'
  | 'cast_ability'
  | 'call_allies'
  | 'return_home';

export interface BehaviorGraphNode {
  id: string;
  kind: BehaviorNodeKind;
  title: string;
  position: { x: number; y: number };
  conditionType?: BehaviorConditionType;
  conditionValue?: string | number;
  actionType?: BehaviorActionType;
  actionParam?: string;
  cooldownSeconds?: number;
}

export interface BehaviorGraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPort: 'out' | 'true' | 'false';
  toPort: 'in';
  label?: string;
}

export interface BehaviorGraphDefinition extends WoAContentBase {
  targetType: 'npc' | 'creature' | 'companion' | 'boss';
  tickIntervalSeconds: number;
  nodes: BehaviorGraphNode[];
  edges: BehaviorGraphEdge[];
}

export type WorldPlacedEntityKind =
  | 'tree'
  | 'rock'
  | 'building'
  | 'prefab'
  | 'npc'
  | 'spawn'
  | 'village'
  | 'cave'
  | 'ruin'
  | 'bandit_camp'
  | 'resource'
  | 'water_zone';

export interface WorldMapLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
}

export interface WorldPlacedObject {
  id: string;
  name: string;
  kind: WorldPlacedEntityKind;
  refId: string; // prefab id, building id, npc id, spawn id, or world_object id
  layerId: string;
  biome: string;
  position: { x: number; y: number; z: number };
  rotationYDeg: number;
  scale: number;
  radius: number;
  locked?: boolean;
  hidden?: boolean;
  generatedByRuleId?: string;
}

export interface WorldMapDefinition extends WoAContentBase {
  regionName: string;
  sizeMeters: { width: number; depth: number };
  gridSize: number;
  snapToGrid: boolean;
  waterLevelY: number;
  defaultBiome: string;
  layers: WorldMapLayer[];
  objects: WorldPlacedObject[];
}

export interface ProceduralRuleDefinition extends WoAContentBase {
  seed: number;
  targetWorldMapId: string;
  objectKind: Exclude<WorldPlacedEntityKind, 'water_zone'>;
  targetRefId: string; // prefabId, worldObjectId, buildingId, or spawnId
  biomes: string[];
  biomeWeights: Record<string, number>;
  density: number; // count per region run
  minAltitude: number;
  maxAltitude: number;
  maxSlopeDeg: number;
  minSpacingMeters: number;
  avoidWater: boolean;
  waterMarginMeters: number;
  scaleMin: number;
  scaleMax: number;
}

export type VisualLogicNodeKind =
  | 'event'
  | 'condition'
  | 'action'
  | 'variable'
  | 'timer'
  | 'counter';

export interface VisualLogicNode {
  id: string;
  kind: VisualLogicNodeKind;
  title: string;
  position: { x: number; y: number };
  opCode: string; // e.g., 'on_enter_zone', 'compare_var', 'spawn_entity', 'give_item', 'play_sound', 'trigger_quest', 'set_var'
  params: Record<string, string | number | boolean>;
}

export interface VisualLogicEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPort: 'exec' | 'true' | 'false' | 'complete' | 'value';
  toPort: 'exec' | 'input';
}

export interface VisualLogicGraphDefinition extends WoAContentBase {
  triggerEvent: string;
  enabled: boolean;
  variables: Record<string, string | number | boolean>;
  nodes: VisualLogicNode[];
  edges: VisualLogicEdge[];
}

// ============================================================================
// EVENTS, TRIGGERS, CONDITIONS & REWARDS SYSTEM
// ============================================================================

export type EventRuntimeSupportLevel =
  | 'sandbox_and_game'
  | 'game_runtime_dependent'
  | 'unsupported';

export type EventTriggerCategory =
  | 'world_player'
  | 'npc_dialogue'
  | 'combat'
  | 'destruction_gathering'
  | 'quest_crafting';

export type EventTriggerType =
  // A. World and Player Events
  | 'on_new_world_created'
  | 'on_player_first_spawn'
  | 'on_player_respawn'
  | 'on_world_loaded'
  | 'on_player_enter_area'
  | 'on_player_reach_coordinates'
  | 'on_player_level_reached'
  | 'on_player_item_collected'
  | 'on_player_inventory_changed'
  | 'on_player_item_equipped'
  // B. NPC and Dialogue Events
  | 'on_npc_talk'
  | 'on_dialogue_started'
  | 'on_dialogue_completed'
  | 'on_dialogue_choice_selected'
  | 'on_npc_interaction'
  | 'on_npc_quest_completed'
  | 'on_npc_reputation_changed'
  // C. Combat Events
  | 'on_animal_killed'
  | 'on_monster_killed'
  | 'on_enemy_killed'
  | 'on_boss_killed'
  | 'on_player_damaged'
  | 'on_entity_killed'
  | 'on_entity_killed_by_weapon'
  | 'on_player_combat_victory'
  // D. World Destruction & Gathering Events
  | 'on_block_broken'
  | 'on_object_destroyed'
  | 'on_resource_gathered'
  | 'on_tree_chopped'
  | 'on_ore_mined'
  | 'on_container_destroyed'
  | 'on_structure_destroyed'
  | 'on_item_dropped'
  // E. Quest & Crafting Events
  | 'on_quest_started'
  | 'on_quest_completed'
  | 'on_quest_failed'
  | 'on_item_crafted'
  | 'on_recipe_completed'
  | 'on_building_placed'
  | 'on_structure_completed';

export type EventTargetMode =
  | 'any'
  | 'specific_id'
  | 'category'
  | 'mod_namespace'
  | 'area'
  | 'coordinates'
  | 'threshold';

export interface ModEventTriggerArea {
  x: number;
  y: number;
  z: number;
  radius: number;
  label?: string;
}

export interface ModEventTriggerConfig {
  type: EventTriggerType;
  targetMode: EventTargetMode;
  targetId?: string;
  secondaryTargetId?: string;
  targetCategory?: string;
  targetModId?: string;
  area?: ModEventTriggerArea;
  threshold?: number;
}

export type EventConditionField =
  | 'player_level'
  | 'player_has_item'
  | 'player_missing_item'
  | 'npc_id'
  | 'entity_id'
  | 'entity_category'
  | 'weapon_used'
  | 'biome'
  | 'world_coordinates'
  | 'time_of_day'
  | 'weather'
  | 'quest_state'
  | 'world_flag'
  | 'player_health_percent'
  | 'multiplayer_authority';

export type EventConditionOperator =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'in_radius';

export interface ModEventConditionRule {
  id: string;
  field: EventConditionField;
  operator: EventConditionOperator;
  targetId?: string;
  value: string | number | boolean;
  area?: ModEventTriggerArea;
}

export interface ModEventConditionGroup {
  id: string;
  logic: 'and' | 'or';
  rules: ModEventConditionRule[];
}

export type EventActionType =
  // Item & Weapon Rewards
  | 'give_item'
  | 'give_weapon'
  | 'give_multiple_items'
  | 'add_to_inventory'
  | 'drop_reward_in_world'
  | 'equip_reward'
  // Progression, World & Feedback Actions
  | 'give_xp'
  | 'give_currency'
  | 'give_reputation'
  | 'unlock_achievement'
  | 'unlock_recipe'
  | 'start_quest'
  | 'complete_quest'
  | 'set_world_flag'
  | 'show_notification'
  | 'play_sound'
  | 'spawn_entity'
  | 'spawn_pickup_item'
  | 'start_dialogue'
  | 'apply_status_effect';

export interface ModEventRewardBundleItem {
  id: string;
  itemId: string;
  quantity: number;
  durability?: number;
}

export interface ModEventAction {
  id: string;
  type: EventActionType;
  targetId?: string;
  secondaryTargetId?: string;
  quantity?: number;
  durability?: number;
  amount?: number;
  equipAutomatically?: boolean;
  flagValue?: string | number | boolean;
  message?: string;
  messageTranslations?: LocalizedTextMap;
  position?: SpawnVec3;
  bundleItems?: ModEventRewardBundleItem[];
  statusEffect?: 'bleed' | 'burn' | 'frost' | 'stun' | 'knockback' | 'regeneration' | 'haste' | 'shield';
  durationSeconds?: number;
}

export type EventExecutionScope =
  | 'once_per_world'
  | 'once_per_player'
  | 'once_per_player_per_world'
  | 'once_per_event_trigger'
  | 'repeatable'
  | 'repeatable_cooldown';

export type EventResetBehavior =
  | 'never'
  | 'on_world_reset'
  | 'on_player_respawn'
  | 'on_quest_reset'
  | 'manual';

export interface ModEventExecutionConfig {
  scope: EventExecutionScope;
  maxExecutions?: number | null;
  cooldownSeconds: number;
  persistentState: boolean;
  resetBehavior: EventResetBehavior;
}

export type EventTemplatePresetId =
  | 'starter_sword'
  | 'npc_reward'
  | 'monster_loot'
  | 'animal_loot'
  | 'destruction_reward';

export interface ModEventDefinition extends WoAContentBase {
  enabled: boolean;
  category?: EventTriggerCategory;
  templatePreset?: EventTemplatePresetId;
  trigger: ModEventTriggerConfig;
  conditionCombinator: 'and' | 'or';
  conditionGroups: ModEventConditionGroup[];
  actions: ModEventAction[];
  execution: ModEventExecutionConfig;
}

export interface ModContentDatabase {
  items: ItemDefinition[];
  weapons: WeaponDefinition[];
  armor: ArmorDefinition[];
  npcs: NpcDefinition[];
  monsters: MonsterDefinition[];
  quests: QuestDefinition[];
  recipes: CraftingRecipeDefinition[];
  buildings: BuildingDefinition[];
  spawns: SpawnDefinition[];
  animations?: AnimationConfigEntry[];
  audioCues?: AudioConfigEntry[];
  materials?: MaterialConfigEntry[];
  lootTables?: LootTableDefinition[];
  dialogues?: DialogueTreeDefinition[];
  worldObjects?: WorldObjectDefinition[];
  prefabs?: PrefabDefinition[];
  aiBehaviors?: BehaviorGraphDefinition[];
  worldMaps?: WorldMapDefinition[];
  proceduralRules?: ProceduralRuleDefinition[];
  visualLogicGraphs?: VisualLogicGraphDefinition[];
  events?: ModEventDefinition[];
}

export interface ContentValidationIssue {
  field: string;
  level: 'error' | 'warn';
  message: string;
}
