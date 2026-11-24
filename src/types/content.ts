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

export interface LootDropEntry {
  id: string;
  itemId: string;
  minCount: number;
  maxCount: number;
  chance: number; // percentage 0..100
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

export type AnimationTargetType = 'weapon' | 'character' | 'npc' | 'creature' | 'prop';

export interface AnimationConfigEntry extends WoAContentBase {
  targetType: AnimationTargetType;
  clipName: string;
  speed: number;
  blendSeconds: number;
  loop: boolean;
  hitFrameNormalized: number; // 0..1 trigger point for melee/cast events
  soundCueId: string;
}

export type AudioBusType = 'sfx' | 'ambience' | 'music' | 'ui';

export interface AudioConfigEntry extends WoAContentBase {
  bus: AudioBusType;
  assetPath: string;
  volume: number; // 0..2
  pitchMin: number;
  pitchMax: number;
  spatial: boolean;
  maxDistanceMeters: number;
  loop: boolean;
}

export type MaterialShaderProfile =
  | 'pbr_standard'
  | 'foliage_wind'
  | 'crystal_emissive'
  | 'water_surface'
  | 'stone_weathered';

export interface MaterialConfigEntry extends WoAContentBase {
  shaderProfile: MaterialShaderProfile;
  albedoTexture: string;
  normalTexture: string;
  baseColor: string;
  metallic: number; // 0..1
  roughness: number; // 0..1
  emissiveColor: string;
  emissiveIntensity: number; // 0..3
  uvTiling: { x: number; y: number };
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
}

export interface ContentValidationIssue {
  field: string;
  level: 'error' | 'warn';
  message: string;
}
