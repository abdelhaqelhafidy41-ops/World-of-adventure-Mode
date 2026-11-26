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

export interface ItemDefinition extends WoAContentBase {
  icon: string;
  stackSize: number;
  weight: number;
  value: number;
  rarity: ItemRarity;
  category: ItemCategory;
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
}

export interface ArmorDefinition extends WoAContentBase {
  defense: number;
  durability: number;
  weight: number;
  slot: ArmorSlot;
  model: string;
  icon: string;
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
  | 'logic_graph';

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
}

export interface ContentValidationIssue {
  field: string;
  level: 'error' | 'warn';
  message: string;
}
