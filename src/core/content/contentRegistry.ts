import { CURRENT_MOD_CONTENT_SCHEMA_VERSION } from '@/src/core/api/woaModApiSpec';
import {
  buildLocalizedExportMap,
  type LocalizedTextMap,
  mergeLocalizedField,
  t,
} from '@/src/i18n';
import {
  AnimationConfigEntry,
  ArmorDefinition,
  ArmorSlot,
  AudioConfigEntry,
  BehaviorGraphDefinition,
  BuildingCategory,
  BuildingDefinition,
  ContentKind,
  ContentValidationIssue,
  CraftingRecipeDefinition,
  CraftingStationType,
  DialogueTreeDefinition,
  ExtendedConfigKind,
  ItemCategory,
  ItemDefinition,
  ItemRarity,
  LootDropEntry,
  LootTableDefinition,
  MaterialConfigEntry,
  ModAsset,
  ModContentDatabase,
  ModFileNode,
  ModManifest,
  ModProject,
  MonsterAttackBehavior,
  MonsterDefinition,
  NpcBehaviorType,
  NpcDefinition,
  PrefabDefinition,
  ProceduralRuleDefinition,
  QuestDefinition,
  QuestObjectiveType,
  SdkConfigKind,
  SpawnDefinition,
  VisualLogicGraphDefinition,
  WeaponDefinition,
  WoAContentBase,
  WorldMapDefinition,
  WorldObjectDefinition,
} from '@/src/types/mod';

export const CONTENT_FILE_PATHS: Record<ContentKind, string> = {
  item: 'data/items.json',
  weapon: 'data/weapons.json',
  armor: 'data/armor.json',
  npc: 'data/npcs.json',
  monster: 'data/monsters.json',
  quest: 'data/quests.json',
  recipe: 'data/recipes.json',
  building: 'data/buildings.json',
  spawn: 'data/spawns.json',
};

export const EXTENDED_CONFIG_FILE_PATHS: Record<ExtendedConfigKind, string> = {
  animation: 'data/animations.json',
  audio: 'data/audio.json',
  material: 'data/materials.json',
  loot_table: 'data/loot_tables.json',
  dialogue: 'data/dialogues.json',
  world_object: 'data/world_objects.json',
};

export const SDK_CONFIG_FILE_PATHS: Record<SdkConfigKind, string> = {
  prefab: 'data/prefabs.json',
  ai_behavior: 'data/ai_behaviors.json',
  world_map: 'data/worlds.json',
  procedural_rule: 'data/procedural.json',
  logic_graph: 'data/logic_graphs.json',
};

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  item: 'Items',
  weapon: 'Weapons',
  armor: 'Armor',
  npc: 'Characters / NPCs',
  monster: 'Creatures / Monsters',
  quest: 'Quests',
  recipe: 'Crafting',
  building: 'Buildings',
  spawn: 'Spawns',
};

export function getContentKindLabel(kind: ContentKind): string {
  return t(`content.kind.${kind}`);
}

export const ITEM_RARITIES: { id: ItemRarity; label: string }[] = [
  { id: 'common', label: 'Common' },
  { id: 'uncommon', label: 'Uncommon' },
  { id: 'rare', label: 'Rare' },
  { id: 'epic', label: 'Epic' },
  { id: 'legendary', label: 'Legendary' },
  { id: 'relic', label: 'Relic' },
];

export function getItemRarities(): { id: ItemRarity; label: string }[] {
  return ITEM_RARITIES.map((r) => ({ id: r.id, label: t(`content.rarity.${r.id}`) }));
}

export const ITEM_CATEGORIES: { id: ItemCategory; label: string }[] = [
  { id: 'consumable', label: 'Consumable' },
  { id: 'material', label: 'Material' },
  { id: 'tool', label: 'Tool' },
  { id: 'quest', label: 'Quest Item' },
  { id: 'key', label: 'Key' },
  { id: 'misc', label: 'Miscellaneous' },
];

export function getItemCategories(): { id: ItemCategory; label: string }[] {
  return ITEM_CATEGORIES.map((c) => ({ id: c.id, label: t(`content.itemCat.${c.id}`) }));
}

export const ARMOR_SLOTS: { id: ArmorSlot; label: string }[] = [
  { id: 'head', label: 'Head / Helm' },
  { id: 'chest', label: 'Chest / Cuirass' },
  { id: 'legs', label: 'Legs / Greaves' },
  { id: 'feet', label: 'Feet / Boots' },
  { id: 'hands', label: 'Hands / Gauntlets' },
  { id: 'back', label: 'Back / Cloak' },
  { id: 'shield', label: 'Off-Hand / Shield' },
];

export function getArmorSlots(): { id: ArmorSlot; label: string }[] {
  return ARMOR_SLOTS.map((s) => ({ id: s.id, label: t(`content.armorSlot.${s.id}`) }));
}

export const NPC_BEHAVIOR_TYPES: { id: NpcBehaviorType; label: string }[] = [
  { id: 'friendly', label: 'Friendly Wanderer' },
  { id: 'merchant', label: 'Merchant / Vendor' },
  { id: 'quest_giver', label: 'Quest Giver' },
  { id: 'guard', label: 'Town Guard / Sentinel' },
  { id: 'companion', label: 'Companion' },
  { id: 'neutral', label: 'Neutral Bystander' },
];

export function getNpcBehaviorTypes(): { id: NpcBehaviorType; label: string }[] {
  return NPC_BEHAVIOR_TYPES.map((b) => ({ id: b.id, label: t(`content.npcBehavior.${b.id}`) }));
}

export const MONSTER_ATTACK_BEHAVIORS: { id: MonsterAttackBehavior; label: string }[] = [
  { id: 'melee', label: 'Melee Striker' },
  { id: 'ranged', label: 'Ranged Skirmisher' },
  { id: 'ambush', label: 'Stealth Ambush' },
  { id: 'charge', label: 'Heavy Charge' },
  { id: 'caster', label: 'Arcane Caster' },
  { id: 'swarm', label: 'Pack / Swarm' },
];

export function getMonsterAttackBehaviors(): { id: MonsterAttackBehavior; label: string }[] {
  return MONSTER_ATTACK_BEHAVIORS.map((b) => ({
    id: b.id,
    label: t(`content.monsterBehavior.${b.id}`),
  }));
}

export const QUEST_OBJECTIVE_TYPES: { id: QuestObjectiveType; label: string }[] = [
  { id: 'kill', label: 'Kill Target' },
  { id: 'collect', label: 'Collect Item' },
  { id: 'talk', label: 'Talk to NPC' },
  { id: 'reach_location', label: 'Reach Location' },
];

export function getQuestObjectiveTypes(): { id: QuestObjectiveType; label: string }[] {
  return QUEST_OBJECTIVE_TYPES.map((q) => ({
    id: q.id,
    label: t(`content.questObj.${q.id}`),
  }));
}

export const CRAFTING_STATIONS: { id: CraftingStationType; label: string }[] = [
  { id: 'workbench', label: 'Workbench' },
  { id: 'forge', label: 'Anvil & Forge' },
  { id: 'alchemy_table', label: 'Alchemy Table' },
  { id: 'arcane_loom', label: 'Arcane Loom' },
  { id: 'campfire', label: 'Campfire' },
  { id: 'inventory', label: 'Hand Crafting (Inventory)' },
];

export function getCraftingStations(): { id: CraftingStationType; label: string }[] {
  return CRAFTING_STATIONS.map((s) => ({ id: s.id, label: t(`content.station.${s.id}`) }));
}

export const BUILDING_CATEGORIES: { id: BuildingCategory; label: string }[] = [
  { id: 'house', label: 'Dwelling / House' },
  { id: 'outpost', label: 'Frontier Outpost' },
  { id: 'workshop', label: 'Workshop / Forge' },
  { id: 'shrine', label: 'Shrine / Monument' },
  { id: 'fortification', label: 'Fortification / Wall' },
  { id: 'decoration', label: 'Structure Prop' },
];

export function getBuildingCategories(): { id: BuildingCategory; label: string }[] {
  return BUILDING_CATEGORIES.map((c) => ({
    id: c.id,
    label: t(`content.buildingCat.${c.id}`),
  }));
}

export const WEAPON_ANIMATIONS: string[] = [
  'swing_one_handed',
  'swing_two_handed',
  'thrust_spear',
  'bow_draw_release',
  'staff_channel',
  'dagger_flurry',
  'heavy_slam',
];

export const WOA_BIOMES: string[] = [
  'skyreach_highlands',
  'sunstone_steppe',
  'emerald_canopy',
  'ashen_caldera',
  'frostspire_peaks',
  'sunken_ruins',
  'frontier_plains',
];

export function createEmptyContentDatabase(): ModContentDatabase {
  return {
    items: [],
    weapons: [],
    armor: [],
    npcs: [],
    monsters: [],
    quests: [],
    recipes: [],
    buildings: [],
    spawns: [],
    animations: [],
    audioCues: [],
    materials: [],
    lootTables: [],
    dialogues: [],
    worldObjects: [],
    prefabs: [],
    aiBehaviors: [],
    worldMaps: [],
    proceduralRules: [],
    visualLogicGraphs: [],
  };
}

export function suggestObjectSlug(name: string, fallback = 'new_object'): string {
  const clean = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!clean) return fallback;
  return /^[0-9]/.test(clean) ? `obj_${clean}` : clean;
}

export function formatNamespacedId(modId: string, objectIdOrName: string): string {
  const slug = suggestObjectSlug(objectIdOrName, 'object');
  return `${modId}:${slug}`;
}

export function extractObjectPart(fullId: string): string {
  const idx = fullId.indexOf(':');
  return idx >= 0 ? fullId.slice(idx + 1) : fullId;
}

export function ensureUniqueId(
  modId: string,
  baseSlug: string,
  existingIds: Set<string>
): string {
  let candidate = `${modId}:${suggestObjectSlug(baseSlug, 'entry')}`;
  if (!existingIds.has(candidate)) return candidate;
  let counter = 2;
  while (existingIds.has(`${candidate}_${counter}`)) {
    counter++;
  }
  return `${candidate}_${counter}`;
}

export function collectAllContentIds(db: ModContentDatabase): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (entries: WoAContentBase[]) => {
    for (const entry of entries) {
      const key = entry.id.trim();
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(entry.uid);
      map.set(key, list);
    }
  };
  add(db.items);
  add(db.weapons);
  add(db.armor);
  add(db.npcs);
  add(db.monsters);
  add(db.quests);
  add(db.recipes);
  add(db.buildings);
  add(db.spawns);
  add(db.animations ?? []);
  add(db.audioCues ?? []);
  add(db.materials ?? []);
  add(db.lootTables ?? []);
  add(db.dialogues ?? []);
  add(db.worldObjects ?? []);
  add(db.prefabs ?? []);
  add(db.aiBehaviors ?? []);
  add(db.worldMaps ?? []);
  add(db.proceduralRules ?? []);
  add(db.visualLogicGraphs ?? []);
  return map;
}

export const NAMESPACED_ID_REGEX =
  /^([a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*):([a-z][a-z0-9_]*)$/;

export function validateNamespacedId(
  id: string,
  expectedModId: string,
  idIndex?: Map<string, string[]>,
  currentUid?: string
): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const trimmed = id.trim();

  if (!trimmed) {
    issues.push({
      field: 'id',
      level: 'error',
      message: t('val.idRequired'),
    });
    return issues;
  }

  const match = NAMESPACED_ID_REGEX.exec(trimmed);
  if (!match) {
    issues.push({
      field: 'id',
      level: 'error',
      message: t('val.idFormat', { modId: expectedModId }),
    });
    return issues;
  }

  const namespace = match[1];
  if (namespace !== expectedModId) {
    issues.push({
      field: 'id',
      level: 'error',
      message: t('val.idNamespaceMismatch', { namespace, expectedModId }),
    });
  }

  if (idIndex && currentUid) {
    const owners = idIndex.get(trimmed) ?? [];
    if (owners.length > 1) {
      issues.push({
        field: 'id',
        level: 'error',
        message: t('val.idDuplicate', { id: trimmed }),
      });
    }
  }

  return issues;
}

function validateBaseFields(
  entry: WoAContentBase,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateNamespacedId(entry.id, expectedModId, idIndex, entry.uid);

  if (!entry.name.trim()) {
    issues.push({
      field: 'name',
      level: 'error',
      message: t('val.nameRequired'),
    });
  }

  if (!entry.description.trim()) {
    issues.push({
      field: 'description',
      level: 'error',
      message: t('val.descriptionRequired'),
    });
  }

  return issues;
}

function validateLootTable(
  loot: LootDropEntry[],
  fieldPrefix = 'loot'
): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  loot.forEach((row, index) => {
    if (!row.itemId.trim()) {
      issues.push({
        field: `${fieldPrefix}.${index}.itemId`,
        level: 'error',
        message: t('val.lootItemRequired', { index: index + 1 }),
      });
    } else if (!NAMESPACED_ID_REGEX.test(row.itemId.trim())) {
      issues.push({
        field: `${fieldPrefix}.${index}.itemId`,
        level: 'error',
        message: t('val.lootItemFormat', { index: index + 1, id: row.itemId }),
      });
    }
    if (row.minCount < 1 || row.maxCount < row.minCount) {
      issues.push({
        field: `${fieldPrefix}.${index}.count`,
        level: 'error',
        message: t('val.lootCountRange', { index: index + 1 }),
      });
    }
    if (row.chance <= 0 || row.chance > 100) {
      issues.push({
        field: `${fieldPrefix}.${index}.chance`,
        level: 'error',
        message: t('val.lootChanceRange', { index: index + 1 }),
      });
    }
  });
  return issues;
}

export function validateItem(
  item: ItemDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(item, expectedModId, idIndex);

  if (!item.icon.trim()) {
    issues.push({
      field: 'icon',
      level: 'error',
      message: t('val.iconRequired'),
    });
  }
  if (!Number.isFinite(item.stackSize) || item.stackSize < 1 || item.stackSize > 9999) {
    issues.push({
      field: 'stackSize',
      level: 'error',
      message: t('val.stackSizeRange'),
    });
  }
  if (!Number.isFinite(item.weight) || item.weight < 0) {
    issues.push({
      field: 'weight',
      level: 'error',
      message: t('val.weightNonNegative'),
    });
  }
  if (!Number.isFinite(item.value) || item.value < 0) {
    issues.push({
      field: 'value',
      level: 'error',
      message: t('val.valueNonNegative'),
    });
  }
  if (!item.rarity) {
    issues.push({
      field: 'rarity',
      level: 'error',
      message: t('val.rarityRequired'),
    });
  }
  if (!item.category) {
    issues.push({
      field: 'category',
      level: 'error',
      message: t('val.itemCatRequired'),
    });
  }

  return issues;
}

export function validateWeapon(
  weapon: WeaponDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(weapon, expectedModId, idIndex);

  if (!Number.isFinite(weapon.damage) || weapon.damage <= 0) {
    issues.push({
      field: 'damage',
      level: 'error',
      message: t('val.weaponDamagePos'),
    });
  }
  if (!Number.isFinite(weapon.attackSpeed) || weapon.attackSpeed <= 0) {
    issues.push({
      field: 'attackSpeed',
      level: 'error',
      message: t('val.weaponSpeedPos'),
    });
  }
  if (!Number.isFinite(weapon.range) || weapon.range <= 0) {
    issues.push({
      field: 'range',
      level: 'error',
      message: t('val.weaponRangePos'),
    });
  }
  if (!Number.isFinite(weapon.durability) || weapon.durability < 1) {
    issues.push({
      field: 'durability',
      level: 'error',
      message: t('val.durabilityMin'),
    });
  }
  if (
    !Number.isFinite(weapon.criticalChance) ||
    weapon.criticalChance < 0 ||
    weapon.criticalChance > 100
  ) {
    issues.push({
      field: 'criticalChance',
      level: 'error',
      message: t('val.critRange'),
    });
  }
  if (weapon.projectile.enabled) {
    if (!weapon.projectile.projectileId.trim()) {
      issues.push({
        field: 'projectile.projectileId',
        level: 'error',
        message: t('val.projIdRequired'),
      });
    } else if (!NAMESPACED_ID_REGEX.test(weapon.projectile.projectileId.trim())) {
      issues.push({
        field: 'projectile.projectileId',
        level: 'error',
        message: t('val.projIdFormat'),
      });
    }
    if (!Number.isFinite(weapon.projectile.speed) || weapon.projectile.speed <= 0) {
      issues.push({
        field: 'projectile.speed',
        level: 'error',
        message: t('val.projSpeedPos'),
      });
    }
  }
  if (!weapon.animation.trim()) {
    issues.push({
      field: 'animation',
      level: 'error',
      message: t('val.animKeyRequired'),
    });
  }
  if (!weapon.sound.trim()) {
    issues.push({
      field: 'sound',
      level: 'error',
      message: t('val.weaponSoundRequired'),
    });
  }
  if (!weapon.model.trim()) {
    issues.push({
      field: 'model',
      level: 'error',
      message: t('val.model3dRequired'),
    });
  }
  if (!weapon.icon.trim()) {
    issues.push({
      field: 'icon',
      level: 'error',
      message: t('val.weaponIconRequired'),
    });
  }

  return issues;
}

export function validateArmor(
  armor: ArmorDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(armor, expectedModId, idIndex);

  if (!Number.isFinite(armor.defense) || armor.defense < 0) {
    issues.push({
      field: 'defense',
      level: 'error',
      message: t('val.armorDefenseNonNeg'),
    });
  }
  if (!Number.isFinite(armor.durability) || armor.durability < 1) {
    issues.push({
      field: 'durability',
      level: 'error',
      message: t('val.durabilityMin'),
    });
  }
  if (!Number.isFinite(armor.weight) || armor.weight < 0) {
    issues.push({
      field: 'weight',
      level: 'error',
      message: t('val.weightNonNegative'),
    });
  }
  if (!armor.slot) {
    issues.push({
      field: 'slot',
      level: 'error',
      message: t('val.armorSlotRequired'),
    });
  }
  if (!armor.model.trim()) {
    issues.push({
      field: 'model',
      level: 'error',
      message: t('val.model3dRequired'),
    });
  }
  if (!armor.icon.trim()) {
    issues.push({
      field: 'icon',
      level: 'error',
      message: t('val.armorIconRequired'),
    });
  }

  return issues;
}

export function validateNpc(
  npc: NpcDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(npc, expectedModId, idIndex);

  if (!npc.model.trim()) {
    issues.push({
      field: 'model',
      level: 'error',
      message: t('val.npcModelRequired'),
    });
  }
  if (!Number.isFinite(npc.health) || npc.health <= 0) {
    issues.push({
      field: 'health',
      level: 'error',
      message: t('val.healthPos'),
    });
  }
  if (!Number.isFinite(npc.movementSpeed) || npc.movementSpeed < 0) {
    issues.push({
      field: 'movementSpeed',
      level: 'error',
      message: t('val.moveSpeedNonNeg'),
    });
  }
  if (!npc.faction.trim()) {
    issues.push({
      field: 'faction',
      level: 'error',
      message: t('val.factionRequired'),
    });
  }
  npc.dialogue.forEach((line, idx) => {
    if (!line.text.trim()) {
      issues.push({
        field: `dialogue.${idx}.text`,
        level: 'error',
        message: t('val.dialogueLineEmpty', { index: idx + 1 }),
      });
    }
  });
  npc.questReferences.forEach((questId, idx) => {
    if (!questId.trim()) {
      issues.push({
        field: `questReferences.${idx}`,
        level: 'error',
        message: t('val.questRefEmpty', { index: idx + 1 }),
      });
    } else if (!NAMESPACED_ID_REGEX.test(questId.trim())) {
      issues.push({
        field: `questReferences.${idx}`,
        level: 'error',
        message: t('val.questRefFormat', { id: questId }),
      });
    }
  });
  issues.push(...validateLootTable(npc.loot));

  return issues;
}

export function validateMonster(
  monster: MonsterDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(monster, expectedModId, idIndex);

  if (!Number.isFinite(monster.health) || monster.health <= 0) {
    issues.push({
      field: 'health',
      level: 'error',
      message: t('val.monsterHealthPos'),
    });
  }
  if (!Number.isFinite(monster.damage) || monster.damage < 0) {
    issues.push({
      field: 'damage',
      level: 'error',
      message: t('val.valueNonNegative'),
    });
  }
  if (!Number.isFinite(monster.speed) || monster.speed <= 0) {
    issues.push({
      field: 'speed',
      level: 'error',
      message: t('val.monsterSpeedPos'),
    });
  }
  if (!Number.isFinite(monster.detectionRange) || monster.detectionRange <= 0) {
    issues.push({
      field: 'detectionRange',
      level: 'error',
      message: t('val.detectionRangePos'),
    });
  }
  if (monster.spawnRules.biomes.length === 0) {
    issues.push({
      field: 'spawnRules.biomes',
      level: 'error',
      message: t('val.monsterBiomeRequired'),
    });
  }
  if (
    monster.spawnRules.minGroupSize < 1 ||
    monster.spawnRules.maxGroupSize < monster.spawnRules.minGroupSize
  ) {
    issues.push({
      field: 'spawnRules.groupSize',
      level: 'error',
      message: t('val.groupSizeRange'),
    });
  }
  if (!Number.isFinite(monster.spawnRules.spawnWeight) || monster.spawnRules.spawnWeight <= 0) {
    issues.push({
      field: 'spawnRules.spawnWeight',
      level: 'error',
      message: t('val.spawnWeightPos'),
    });
  }
  issues.push(...validateLootTable(monster.loot));

  return issues;
}

export function validateQuest(
  quest: QuestDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(quest, expectedModId, idIndex);

  if (quest.objectives.length === 0) {
    issues.push({
      field: 'objectives',
      level: 'error',
      message: t('val.questObjRequired'),
    });
  }

  quest.objectives.forEach((obj, idx) => {
    if (!obj.summary.trim()) {
      issues.push({
        field: `objectives.${idx}.summary`,
        level: 'error',
        message: t('val.objSummaryRequired', { index: idx + 1 }),
      });
    }
    if (!obj.targetId.trim()) {
      issues.push({
        field: `objectives.${idx}.targetId`,
        level: 'error',
        message: t('val.objTargetRequired', { index: idx + 1 }),
      });
    }
    if (obj.type === 'kill' || obj.type === 'collect') {
      if (!Number.isFinite(obj.requiredCount) || obj.requiredCount < 1) {
        issues.push({
          field: `objectives.${idx}.requiredCount`,
          level: 'error',
          message: t('val.objCountMin', { index: idx + 1 }),
        });
      }
    }
    if (obj.type === 'reach_location' && (!obj.location || obj.location.radius <= 0)) {
      issues.push({
        field: `objectives.${idx}.location`,
        level: 'error',
        message: t('val.objRadiusPos', { index: idx + 1 }),
      });
    }
  });

  if (quest.rewards.xp < 0 || quest.rewards.gold < 0) {
    issues.push({
      field: 'rewards',
      level: 'error',
      message: t('val.rewardsNonNeg'),
    });
  }

  quest.rewards.items.forEach((ri, idx) => {
    if (!ri.itemId.trim() || !NAMESPACED_ID_REGEX.test(ri.itemId.trim())) {
      issues.push({
        field: `rewards.items.${idx}`,
        level: 'error',
        message: t('val.rewardItemFormat', { index: idx + 1 }),
      });
    }
    if (ri.quantity < 1) {
      issues.push({
        field: `rewards.items.${idx}`,
        level: 'error',
        message: t('val.rewardItemQty', { index: idx + 1 }),
      });
    }
  });

  quest.dialogue.forEach((d, idx) => {
    if (!d.text.trim()) {
      issues.push({
        field: `dialogue.${idx}`,
        level: 'error',
        message: t('val.questDialogueEmpty', { index: idx + 1 }),
      });
    }
  });

  quest.chain.prerequisiteQuestIds.forEach((pid, idx) => {
    if (pid.trim() === quest.id.trim()) {
      issues.push({
        field: 'chain',
        level: 'error',
        message: t('val.questSelfPrereq'),
      });
    } else if (!NAMESPACED_ID_REGEX.test(pid.trim())) {
      issues.push({
        field: `chain.prereq.${idx}`,
        level: 'error',
        message: t('val.questPrereqFormat', { id: pid }),
      });
    }
  });

  if (quest.chain.nextQuestId.trim()) {
    if (quest.chain.nextQuestId.trim() === quest.id.trim()) {
      issues.push({
        field: 'chain.nextQuestId',
        level: 'error',
        message: t('val.questSelfNext'),
      });
    } else if (!NAMESPACED_ID_REGEX.test(quest.chain.nextQuestId.trim())) {
      issues.push({
        field: 'chain.nextQuestId',
        level: 'error',
        message: t('val.questNextFormat'),
      });
    }
  }

  return issues;
}

export function validateRecipe(
  recipe: CraftingRecipeDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(recipe, expectedModId, idIndex);

  if (!recipe.outputItemId.trim() || !NAMESPACED_ID_REGEX.test(recipe.outputItemId.trim())) {
    issues.push({
      field: 'outputItemId',
      level: 'error',
      message: t('val.outputItemFormat'),
    });
  }
  if (!Number.isFinite(recipe.outputQuantity) || recipe.outputQuantity < 1) {
    issues.push({
      field: 'outputQuantity',
      level: 'error',
      message: t('val.outputQtyMin'),
    });
  }
  if (!Number.isFinite(recipe.craftTimeSeconds) || recipe.craftTimeSeconds < 0) {
    issues.push({
      field: 'craftTimeSeconds',
      level: 'error',
      message: t('val.craftTimeNonNeg'),
    });
  }
  if (recipe.ingredients.length === 0) {
    issues.push({
      field: 'ingredients',
      level: 'error',
      message: t('val.recipeIngredientRequired'),
    });
  }
  recipe.ingredients.forEach((ing, idx) => {
    if (!ing.itemId.trim() || !NAMESPACED_ID_REGEX.test(ing.itemId.trim())) {
      issues.push({
        field: `ingredients.${idx}`,
        level: 'error',
        message: t('val.ingredientIdFormat', { index: idx + 1 }),
      });
    }
    if (!Number.isFinite(ing.quantity) || ing.quantity < 1) {
      issues.push({
        field: `ingredients.${idx}`,
        level: 'error',
        message: t('val.ingredientQtyMin', { index: idx + 1 }),
      });
    }
  });

  return issues;
}

export function validateBuilding(
  building: BuildingDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(building, expectedModId, idIndex);

  if (!building.model.trim()) {
    issues.push({
      field: 'model',
      level: 'error',
      message: t('val.buildingModelRequired'),
    });
  }
  if (
    building.footprint.width <= 0 ||
    building.footprint.height <= 0 ||
    building.footprint.depth <= 0
  ) {
    issues.push({
      field: 'footprint',
      level: 'error',
      message: t('val.footprintPos'),
    });
  }
  building.materials.forEach((mat, idx) => {
    if (!mat.materialName.trim()) {
      issues.push({
        field: `materials.${idx}`,
        level: 'error',
        message: t('val.buildingMatName', { index: idx + 1 }),
      });
    }
    if (mat.quantity < 1) {
      issues.push({
        field: `materials.${idx}`,
        level: 'error',
        message: t('val.buildingMatQty', { index: idx + 1 }),
      });
    }
  });
  if (
    building.collision.enabled &&
    (building.collision.width <= 0 ||
      building.collision.height <= 0 ||
      building.collision.depth <= 0)
  ) {
    issues.push({
      field: 'collision',
      level: 'error',
      message: t('val.collisionDimPos'),
    });
  }

  return issues;
}

export function validateSpawn(
  spawn: SpawnDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(spawn, expectedModId, idIndex);

  if (!spawn.entityId.trim() || !NAMESPACED_ID_REGEX.test(spawn.entityId.trim())) {
    issues.push({
      field: 'entityId',
      level: 'error',
      message: t('val.spawnEntityFormat'),
    });
  }
  if (spawn.spawnPoints.length === 0) {
    issues.push({
      field: 'spawnPoints',
      level: 'error',
      message: t('val.spawnPointRequired'),
    });
  }
  if (spawn.biomes.length === 0) {
    issues.push({
      field: 'biomes',
      level: 'error',
      message: t('val.spawnBiomeRequired'),
    });
  }
  if (
    spawn.conditions.minPlayerLevel < 1 ||
    spawn.conditions.maxPlayerLevel < spawn.conditions.minPlayerLevel
  ) {
    issues.push({
      field: 'conditions.level',
      level: 'error',
      message: t('val.spawnLevelRange'),
    });
  }
  if (
    spawn.population.maxPopulation < 1 ||
    spawn.population.groupMin < 1 ||
    spawn.population.groupMax < spawn.population.groupMin
  ) {
    issues.push({
      field: 'population',
      level: 'error',
      message: t('val.spawnPopRange'),
    });
  }
  if (spawn.respawn.enabled && spawn.respawn.delaySeconds < 0) {
    issues.push({
      field: 'respawn',
      level: 'error',
      message: t('val.respawnDelayNonNeg'),
    });
  }

  return issues;
}

export const ANIMATION_TARGET_TYPES = ['weapon', 'character', 'npc', 'creature', 'prop'] as const;
export const AUDIO_BUS_TYPES = ['sfx', 'ambience', 'music', 'ui'] as const;
export const MATERIAL_SHADER_PROFILES = [
  'pbr_standard',
  'foliage_wind',
  'crystal_emissive',
  'water_surface',
  'stone_weathered',
] as const;
export const WORLD_OBJECT_KINDS = [
  'shrine',
  'chest',
  'portal',
  'door',
  'harvest_node',
  'prop',
  'trigger_zone',
] as const;

export const EXTENDED_KIND_LABELS: Record<ExtendedConfigKind, string> = {
  animation: 'Animations',
  audio: 'Audio Cues',
  material: 'Materials',
  loot_table: 'Loot Tables',
  dialogue: 'Dialogue Trees',
  world_object: 'World Objects',
};

export function getExtendedKindLabel(kind: ExtendedConfigKind): string {
  return t(`content.kind.${kind}`);
}

export function validateAnimationConfig(
  anim: AnimationConfigEntry,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(anim, expectedModId, idIndex);
  if (!anim.clipName.trim()) {
    issues.push({
      field: 'clipName',
      level: 'error',
      message: t('val.animClipRequired'),
    });
  }
  if (!Number.isFinite(anim.speed) || anim.speed <= 0) {
    issues.push({
      field: 'speed',
      level: 'error',
      message: t('val.playbackSpeedPos'),
    });
  }
  if (!Number.isFinite(anim.blendSeconds) || anim.blendSeconds < 0) {
    issues.push({
      field: 'blendSeconds',
      level: 'error',
      message: t('val.blendNonNeg'),
    });
  }
  if (!Number.isFinite(anim.hitFrameNormalized) || anim.hitFrameNormalized < 0 || anim.hitFrameNormalized > 1) {
    issues.push({
      field: 'hitFrameNormalized',
      level: 'error',
      message: t('val.hitFrameRange'),
    });
  }
  if (anim.soundCueId.trim() && !NAMESPACED_ID_REGEX.test(anim.soundCueId.trim())) {
    issues.push({
      field: 'soundCueId',
      level: 'error',
      message: t('val.soundCueFormat'),
    });
  }
  return issues;
}

export function validateAudioConfig(
  cue: AudioConfigEntry,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(cue, expectedModId, idIndex);
  if (!cue.assetPath.trim()) {
    issues.push({
      field: 'assetPath',
      level: 'error',
      message: t('val.audioPathRequired'),
    });
  }
  if (!Number.isFinite(cue.volume) || cue.volume < 0 || cue.volume > 2) {
    issues.push({
      field: 'volume',
      level: 'error',
      message: t('val.volumeRange'),
    });
  }
  if (!Number.isFinite(cue.pitchMin) || cue.pitchMin <= 0 || cue.pitchMax < cue.pitchMin) {
    issues.push({
      field: 'pitch',
      level: 'error',
      message: t('val.pitchRange'),
    });
  }
  return issues;
}

export function validateMaterialConfig(
  mat: MaterialConfigEntry,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(mat, expectedModId, idIndex);
  if (!Number.isFinite(mat.metallic) || mat.metallic < 0 || mat.metallic > 1) {
    issues.push({
      field: 'metallic',
      level: 'error',
      message: t('val.metallicRange'),
    });
  }
  if (!Number.isFinite(mat.roughness) || mat.roughness < 0 || mat.roughness > 1) {
    issues.push({
      field: 'roughness',
      level: 'error',
      message: t('val.roughnessRange'),
    });
  }
  if (!Number.isFinite(mat.emissiveIntensity) || mat.emissiveIntensity < 0) {
    issues.push({
      field: 'emissiveIntensity',
      level: 'error',
      message: t('val.emissiveNonNeg'),
    });
  }
  return issues;
}

export function validateLootTableConfig(
  table: LootTableDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(table, expectedModId, idIndex);
  if (table.rollsMin < 1 || table.rollsMax < table.rollsMin) {
    issues.push({
      field: 'rolls',
      level: 'error',
      message: t('val.rollsRange'),
    });
  }
  if (table.entries.length === 0) {
    issues.push({
      field: 'loot',
      level: 'error',
      message: t('val.lootRowRequired'),
    });
  }
  issues.push(...validateLootTable(table.entries));
  return issues;
}

export function validateDialogueTreeConfig(
  tree: DialogueTreeDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(tree, expectedModId, idIndex);
  if (!tree.npcId.trim() || !NAMESPACED_ID_REGEX.test(tree.npcId.trim())) {
    issues.push({
      field: 'npcId',
      level: 'error',
      message: t('val.ownerNpcFormat'),
    });
  }
  if (tree.nodes.length === 0) {
    issues.push({
      field: 'nodes',
      level: 'error',
      message: t('val.dialogueNodeRequired'),
    });
    return issues;
  }
  const nodeIds = new Set(tree.nodes.map((n) => n.id.trim()).filter(Boolean));
  if (!tree.rootNodeId.trim() || !nodeIds.has(tree.rootNodeId.trim())) {
    issues.push({
      field: 'rootNodeId',
      level: 'error',
      message: t('val.rootNodeInvalid', { rootNodeId: tree.rootNodeId }),
    });
  }
  tree.nodes.forEach((node, idx) => {
    if (!node.id.trim()) {
      issues.push({
        field: `nodes.${idx}.id`,
        level: 'error',
        message: t('val.nodeIdRequired', { index: idx + 1 }),
      });
    }
    if (!node.text.trim()) {
      issues.push({
        field: `nodes.${idx}.text`,
        level: 'error',
        message: t('val.nodeTextRequired', { nodeId: node.id || idx + 1 }),
      });
    }
    node.choices.forEach((ch, cIdx) => {
      if (!ch.label.trim()) {
        issues.push({
          field: `nodes.${idx}.choices.${cIdx}`,
          level: 'error',
          message: t('val.choiceLabelRequired', {
            choiceIndex: cIdx + 1,
            nodeId: node.id,
          }),
        });
      }
      if (ch.nextNodeId.trim() && !nodeIds.has(ch.nextNodeId.trim())) {
        issues.push({
          field: `nodes.${idx}.choices.${cIdx}`,
          level: 'error',
          message: t('val.choiceTargetUnknown', {
            label: ch.label || cIdx + 1,
            target: ch.nextNodeId,
          }),
        });
      }
    });
  });
  return issues;
}

export function validateWorldObjectConfig(
  wo: WorldObjectDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(wo, expectedModId, idIndex);
  if (!wo.model.trim()) {
    issues.push({
      field: 'model',
      level: 'error',
      message: t('val.worldObjModelRequired'),
    });
  }
  if (!Number.isFinite(wo.scale) || wo.scale <= 0) {
    issues.push({
      field: 'scale',
      level: 'error',
      message: t('val.worldObjScalePos'),
    });
  }
  if (!wo.interactionPrompt.trim()) {
    issues.push({
      field: 'interactionPrompt',
      level: 'error',
      message: t('val.worldObjPromptRequired'),
    });
  }
  return issues;
}

export function validatePrefabConfig(
  prefab: PrefabDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(prefab, expectedModId, idIndex);
  if (!prefab.nodes || prefab.nodes.length === 0) {
    issues.push({
      field: 'nodes',
      level: 'error',
      message: 'Prefab must contain at least one 3D node.',
    });
  }
  return issues;
}

export function validateBehaviorGraphConfig(
  graph: BehaviorGraphDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(graph, expectedModId, idIndex);
  if (!graph.nodes || graph.nodes.length === 0) {
    issues.push({
      field: 'nodes',
      level: 'error',
      message: 'Behavior graph must contain at least a Start node.',
    });
  }
  return issues;
}

export function validateWorldMapConfig(
  worldMap: WorldMapDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(worldMap, expectedModId, idIndex);
  if (
    !Number.isFinite(worldMap.sizeMeters?.width) ||
    worldMap.sizeMeters.width <= 0 ||
    !Number.isFinite(worldMap.sizeMeters?.depth) ||
    worldMap.sizeMeters.depth <= 0
  ) {
    issues.push({
      field: 'sizeMeters',
      level: 'error',
      message: 'World map width and depth must be positive numbers.',
    });
  }
  if (!Number.isFinite(worldMap.gridSize) || worldMap.gridSize <= 0) {
    issues.push({
      field: 'gridSize',
      level: 'error',
      message: 'Grid snap size must be greater than zero.',
    });
  }
  return issues;
}

export function validateProceduralRuleConfig(
  rule: ProceduralRuleDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(rule, expectedModId, idIndex);
  if (!Number.isFinite(rule.density) || rule.density < 1 || rule.density > 400) {
    issues.push({
      field: 'density',
      level: 'error',
      message: 'Procedural object density count must be between 1 and 400.',
    });
  }
  if (!Number.isFinite(rule.minSpacingMeters) || rule.minSpacingMeters < 0) {
    issues.push({
      field: 'minSpacingMeters',
      level: 'error',
      message: 'Minimum spacing cannot be negative.',
    });
  }
  if (rule.minAltitude > rule.maxAltitude) {
    issues.push({
      field: 'altitude',
      level: 'error',
      message: 'Minimum altitude cannot exceed maximum altitude.',
    });
  }
  return issues;
}

export function validateVisualLogicGraphConfig(
  graph: VisualLogicGraphDefinition,
  expectedModId: string,
  idIndex?: Map<string, string[]>
): ContentValidationIssue[] {
  const issues = validateBaseFields(graph, expectedModId, idIndex);
  if (!graph.nodes || graph.nodes.length === 0) {
    issues.push({
      field: 'nodes',
      level: 'error',
      message: 'Visual logic graph must contain at least one event or action node.',
    });
  }
  return issues;
}

export interface ContentValidationSummary {
  byUid: Map<string, ContentValidationIssue[]>;
  byKind: Record<ContentKind, { errors: number; warns: number }>;
  totalErrors: number;
  totalWarns: number;
}

export function validateAllContents(
  db: ModContentDatabase,
  modId: string
): ContentValidationSummary {
  const idIndex = collectAllContentIds(db);
  const byUid = new Map<string, ContentValidationIssue[]>();
  const byKind: Record<ContentKind, { errors: number; warns: number }> = {
    item: { errors: 0, warns: 0 },
    weapon: { errors: 0, warns: 0 },
    armor: { errors: 0, warns: 0 },
    npc: { errors: 0, warns: 0 },
    monster: { errors: 0, warns: 0 },
    quest: { errors: 0, warns: 0 },
    recipe: { errors: 0, warns: 0 },
    building: { errors: 0, warns: 0 },
    spawn: { errors: 0, warns: 0 },
  };

  let totalErrors = 0;
  let totalWarns = 0;

  const record = (kind: ContentKind, uid: string, issues: ContentValidationIssue[]) => {
    byUid.set(uid, issues);
    for (const issue of issues) {
      if (issue.level === 'error') {
        byKind[kind].errors++;
        totalErrors++;
      } else {
        byKind[kind].warns++;
        totalWarns++;
      }
    }
  };

  db.items.forEach((e) => record('item', e.uid, validateItem(e, modId, idIndex)));
  db.weapons.forEach((e) => record('weapon', e.uid, validateWeapon(e, modId, idIndex)));
  db.armor.forEach((e) => record('armor', e.uid, validateArmor(e, modId, idIndex)));
  db.npcs.forEach((e) => record('npc', e.uid, validateNpc(e, modId, idIndex)));
  db.monsters.forEach((e) => record('monster', e.uid, validateMonster(e, modId, idIndex)));
  db.quests.forEach((e) => record('quest', e.uid, validateQuest(e, modId, idIndex)));
  db.recipes.forEach((e) => record('recipe', e.uid, validateRecipe(e, modId, idIndex)));
  db.buildings.forEach((e) => record('building', e.uid, validateBuilding(e, modId, idIndex)));
  db.spawns.forEach((e) => record('spawn', e.uid, validateSpawn(e, modId, idIndex)));

  return { byUid, byKind, totalErrors, totalWarns };
}

export function serializeContentEntryForExport<T extends WoAContentBase>(
  entry: T
): Omit<T, 'uid'> & {
  localized?: {
    name?: LocalizedTextMap;
    description?: LocalizedTextMap;
    interactionPrompt?: LocalizedTextMap;
  };
} {
  const { uid: _uid, ...rest } = entry as T & Record<string, unknown>;
  const cloned: Record<string, unknown> = { ...rest };

  const localizedName = buildLocalizedExportMap(entry.name, entry.translations?.name);
  const localizedDesc = buildLocalizedExportMap(
    entry.description,
    entry.translations?.description
  );
  const localizedBlock: Record<string, LocalizedTextMap> = {};
  if (localizedName) localizedBlock.name = localizedName;
  if (localizedDesc) localizedBlock.description = localizedDesc;

  if (typeof cloned.interactionPrompt === 'string') {
    const promptMap = buildLocalizedExportMap(
      cloned.interactionPrompt,
      cloned.promptTranslations as LocalizedTextMap | undefined
    );
    if (promptMap) localizedBlock.interactionPrompt = promptMap;
  }

  if (Array.isArray(cloned.dialogue)) {
    cloned.dialogue = cloned.dialogue.map((line: Record<string, unknown>) => {
      if (typeof line?.text !== 'string') return line;
      const textMap = buildLocalizedExportMap(
        line.text,
        line.textTranslations as LocalizedTextMap | undefined
      );
      return textMap ? { ...line, localized: { text: textMap } } : line;
    });
  }

  if (Array.isArray(cloned.objectives)) {
    cloned.objectives = cloned.objectives.map((obj: Record<string, unknown>) => {
      if (typeof obj?.summary !== 'string') return obj;
      const summaryMap = buildLocalizedExportMap(
        obj.summary,
        obj.summaryTranslations as LocalizedTextMap | undefined
      );
      return summaryMap ? { ...obj, localized: { summary: summaryMap } } : obj;
    });
  }

  if (Array.isArray(cloned.interactiveObjects)) {
    cloned.interactiveObjects = cloned.interactiveObjects.map(
      (io: Record<string, unknown>) => {
        if (typeof io?.interactionPrompt !== 'string') return io;
        const pMap = buildLocalizedExportMap(
          io.interactionPrompt,
          io.promptTranslations as LocalizedTextMap | undefined
        );
        return pMap ? { ...io, localized: { interactionPrompt: pMap } } : io;
      }
    );
  }

  if (Array.isArray(cloned.nodes)) {
    cloned.nodes = cloned.nodes.map((node: Record<string, unknown>) => {
      if (typeof node?.text !== 'string') return node;
      const textMap = buildLocalizedExportMap(
        node.text,
        node.textTranslations as LocalizedTextMap | undefined
      );
      const nextChoices = Array.isArray(node.choices)
        ? node.choices.map((ch: Record<string, unknown>) => {
            if (typeof ch?.label !== 'string') return ch;
            const labelMap = buildLocalizedExportMap(
              ch.label,
              ch.labelTranslations as LocalizedTextMap | undefined
            );
            return labelMap ? { ...ch, localized: { label: labelMap } } : ch;
          })
        : node.choices;
      return {
        ...node,
        ...(textMap ? { localized: { text: textMap } } : {}),
        choices: nextChoices,
      };
    });
  }

  if (Object.keys(localizedBlock).length > 0) {
    cloned.localized = localizedBlock;
  }

  return cloned as Omit<T, 'uid'> & {
    localized?: {
      name?: LocalizedTextMap;
      description?: LocalizedTextMap;
      interactionPrompt?: LocalizedTextMap;
    };
  };
}

type ContentArrayMap = {
  item: ModContentDatabase['items'];
  weapon: ModContentDatabase['weapons'];
  armor: ModContentDatabase['armor'];
  npc: ModContentDatabase['npcs'];
  monster: ModContentDatabase['monsters'];
  quest: ModContentDatabase['quests'];
  recipe: ModContentDatabase['recipes'];
  building: ModContentDatabase['buildings'];
  spawn: ModContentDatabase['spawns'];
};

export function serializeContentFile<K extends ContentKind>(
  kind: K,
  modId: string,
  entries: ContentArrayMap[K]
): string {
  return JSON.stringify(
    {
      $schema: 'woa.content.v1',
      schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      modId,
      contentType: kind,
      entries: entries.map((e) => serializeContentEntryForExport(e)),
    },
    null,
    2
  );
}

export function serializeExtendedConfigFile<T extends WoAContentBase>(
  kind: ExtendedConfigKind,
  modId: string,
  entries: T[]
): string {
  return JSON.stringify(
    {
      $schema: `woa.${kind}.v1`,
      schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      modId,
      contentType: kind,
      entries: entries.map((e) => serializeContentEntryForExport(e)),
    },
    null,
    2
  );
}

export function serializeSdkConfigFile<T extends WoAContentBase>(
  kind: SdkConfigKind,
  modId: string,
  entries: T[]
): string {
  return JSON.stringify(
    {
      $schema: `woa.${kind}.v1`,
      schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      modId,
      contentType: kind,
      entries: entries.map((e) => serializeContentEntryForExport(e)),
    },
    null,
    2
  );
}

export function serializeLoadOrderFile(manifest: ModManifest): string {
  return JSON.stringify(
    {
      $schema: 'woa.load_order.v1',
      modId: manifest.modId,
      priority: manifest.loadOrder?.priority ?? 100,
      loadAfter: manifest.loadOrder?.loadAfter ?? ['woa.core'],
      loadBefore: manifest.loadOrder?.loadBefore ?? [],
      dependencies: manifest.dependencies ?? [],
    },
    null,
    2
  );
}

export function buildStandardRegistryJson(
  manifest: ModManifest,
  contents: ModContentDatabase,
  assets: ModAsset[]
): string {
  const animations = contents.animations ?? [];
  const audioCues = contents.audioCues ?? [];
  const materials = contents.materials ?? [];
  const lootTables = contents.lootTables ?? [];
  const dialogues = contents.dialogues ?? [];
  const worldObjects = contents.worldObjects ?? [];
  const prefabs = contents.prefabs ?? [];
  const aiBehaviors = contents.aiBehaviors ?? [];
  const worldMaps = contents.worldMaps ?? [];
  const proceduralRules = contents.proceduralRules ?? [];
  const visualLogicGraphs = contents.visualLogicGraphs ?? [];

  const allEntries = [
    ...contents.items.map((e) => ({
      id: e.id,
      type: 'item',
      displayName: e.name,
      category: e.category,
      rarity: e.rarity,
      dataFile: CONTENT_FILE_PATHS.item,
    })),
    ...contents.weapons.map((e) => ({
      id: e.id,
      type: 'weapon',
      displayName: e.name,
      modelAsset: e.model,
      dataFile: CONTENT_FILE_PATHS.weapon,
    })),
    ...contents.armor.map((e) => ({
      id: e.id,
      type: 'armor',
      displayName: e.name,
      slot: e.slot,
      modelAsset: e.model,
      dataFile: CONTENT_FILE_PATHS.armor,
    })),
    ...contents.npcs.map((e) => ({
      id: e.id,
      type: 'npc',
      displayName: e.name,
      behaviorType: e.behaviorType,
      modelAsset: e.model,
      dataFile: CONTENT_FILE_PATHS.npc,
    })),
    ...contents.monsters.map((e) => ({
      id: e.id,
      type: 'monster',
      displayName: e.name,
      attackBehavior: e.attackBehavior,
      modelAsset: e.model,
      dataFile: CONTENT_FILE_PATHS.monster,
    })),
    ...contents.quests.map((e) => ({
      id: e.id,
      type: 'quest',
      displayName: e.name,
      questType: e.questType,
      dataFile: CONTENT_FILE_PATHS.quest,
    })),
    ...contents.recipes.map((e) => ({
      id: e.id,
      type: 'recipe',
      displayName: e.name,
      station: e.station,
      outputItemId: e.outputItemId,
      dataFile: CONTENT_FILE_PATHS.recipe,
    })),
    ...contents.buildings.map((e) => ({
      id: e.id,
      type: 'building',
      displayName: e.name,
      category: e.category,
      modelAsset: e.model,
      dataFile: CONTENT_FILE_PATHS.building,
    })),
    ...contents.spawns.map((e) => ({
      id: e.id,
      type: 'spawn',
      displayName: e.name,
      entityId: e.entityId,
      dataFile: CONTENT_FILE_PATHS.spawn,
    })),
    ...worldObjects.map((e) => ({
      id: e.id,
      type: 'world_object',
      displayName: e.name,
      objectType: e.objectType,
      modelAsset: e.model,
      dataFile: EXTENDED_CONFIG_FILE_PATHS.world_object,
    })),
    ...lootTables.map((e) => ({
      id: e.id,
      type: 'loot_table',
      displayName: e.name,
      dataFile: EXTENDED_CONFIG_FILE_PATHS.loot_table,
    })),
    ...dialogues.map((e) => ({
      id: e.id,
      type: 'dialogue',
      displayName: e.name,
      npcId: e.npcId,
      dataFile: EXTENDED_CONFIG_FILE_PATHS.dialogue,
    })),
    ...animations.map((e) => ({
      id: e.id,
      type: 'animation',
      displayName: e.name,
      clipName: e.clipName,
      dataFile: EXTENDED_CONFIG_FILE_PATHS.animation,
    })),
    ...audioCues.map((e) => ({
      id: e.id,
      type: 'audio',
      displayName: e.name,
      bus: e.bus,
      dataFile: EXTENDED_CONFIG_FILE_PATHS.audio,
    })),
    ...materials.map((e) => ({
      id: e.id,
      type: 'material',
      displayName: e.name,
      shaderProfile: e.shaderProfile,
      dataFile: EXTENDED_CONFIG_FILE_PATHS.material,
    })),
    ...prefabs.map((e) => ({
      id: e.id,
      type: 'prefab',
      displayName: e.name,
      category: e.category,
      dataFile: SDK_CONFIG_FILE_PATHS.prefab,
    })),
    ...aiBehaviors.map((e) => ({
      id: e.id,
      type: 'ai_behavior',
      displayName: e.name,
      targetType: e.targetType,
      dataFile: SDK_CONFIG_FILE_PATHS.ai_behavior,
    })),
    ...worldMaps.map((e) => ({
      id: e.id,
      type: 'world_map',
      displayName: e.name,
      biome: e.defaultBiome,
      dataFile: SDK_CONFIG_FILE_PATHS.world_map,
    })),
    ...proceduralRules.map((e) => ({
      id: e.id,
      type: 'procedural_rule',
      displayName: e.name,
      biomes: e.biomes,
      dataFile: SDK_CONFIG_FILE_PATHS.procedural_rule,
    })),
    ...visualLogicGraphs.map((e) => ({
      id: e.id,
      type: 'logic_graph',
      displayName: e.name,
      dataFile: SDK_CONFIG_FILE_PATHS.logic_graph,
    })),
  ];

  const referencedModels = new Set(
    allEntries
      .map((entry) => ('modelAsset' in entry && typeof entry.modelAsset === 'string' ? entry.modelAsset : ''))
      .filter(Boolean)
  );
  const standaloneAssetEntries = assets
    .filter((a) => !referencedModels.has(a.path))
    .map((a) => ({
      id: `${manifest.modId}:${a.id}`,
      type: 'asset',
      displayName: a.name,
      category: a.modCategory ?? a.type,
      modelAsset: a.path,
      enabled: true,
    }));

  return JSON.stringify(
    {
      schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      format: 'woa.registry.v1',
      modApiSchema: 'woa.mod-api.v1',
      modId: manifest.modId,
      categories: manifest.categories,
      counts: {
        items: contents.items.length,
        weapons: contents.weapons.length,
        armor: contents.armor.length,
        npcs: contents.npcs.length,
        monsters: contents.monsters.length,
        quests: contents.quests.length,
        recipes: contents.recipes.length,
        buildings: contents.buildings.length,
        spawns: contents.spawns.length,
        worldObjects: worldObjects.length,
        lootTables: lootTables.length,
        dialogues: dialogues.length,
        animations: animations.length,
        audioCues: audioCues.length,
        materials: materials.length,
        prefabs: prefabs.length,
        aiBehaviors: aiBehaviors.length,
        worldMaps: worldMaps.length,
        proceduralRules: proceduralRules.length,
        visualLogicGraphs: visualLogicGraphs.length,
        assets: assets.length,
      },
      dataFiles: {
        ...CONTENT_FILE_PATHS,
        ...EXTENDED_CONFIG_FILE_PATHS,
        ...SDK_CONFIG_FILE_PATHS,
        loadOrder: 'data/load_order.json',
      },
      entries: [...allEntries, ...standaloneAssetEntries],
    },
    null,
    2
  );
}

function hydrateEntriesFromJson<T extends WoAContentBase>(
  rawContent: string | undefined,
  prefix: string
): T[] {
  if (!rawContent) return [];
  try {
    const parsed = JSON.parse(rawContent) as {
      entries?: (Partial<T> & {
        localized?: {
          name?: LocalizedTextMap;
          description?: LocalizedTextMap;
          interactionPrompt?: LocalizedTextMap;
        };
      })[];
    };
    if (!Array.isArray(parsed.entries)) return [];
    return parsed.entries.map((item, idx) => {
      const nameMerged = mergeLocalizedField(
        item.name,
        item.translations?.name ?? item.localized?.name
      );
      const descMerged = mergeLocalizedField(
        item.description,
        item.translations?.description ?? item.localized?.description
      );
      const translations =
        nameMerged.translations || descMerged.translations
          ? {
              ...(nameMerged.translations ? { name: nameMerged.translations } : {}),
              ...(descMerged.translations ? { description: descMerged.translations } : {}),
            }
          : item.translations;

      const hydrated: Record<string, unknown> = {
        ...item,
        name: nameMerged.value,
        description: descMerged.value,
        ...(translations ? { translations } : {}),
        uid: item.uid || `${prefix}_${idx}_${Date.now().toString(36)}`,
      };

      if (typeof hydrated.interactionPrompt === 'string' && item.localized?.interactionPrompt) {
        const promptMerged = mergeLocalizedField(
          hydrated.interactionPrompt,
          (hydrated.promptTranslations as LocalizedTextMap | undefined) ??
            item.localized.interactionPrompt
        );
        hydrated.interactionPrompt = promptMerged.value;
        if (promptMerged.translations) hydrated.promptTranslations = promptMerged.translations;
      }

      if (Array.isArray(hydrated.dialogue)) {
        hydrated.dialogue = hydrated.dialogue.map((line: Record<string, unknown>) => {
          const locText = (line?.localized as { text?: LocalizedTextMap } | undefined)?.text;
          if (!locText && !line?.textTranslations) return line;
          const m = mergeLocalizedField(
            line.text as string | undefined,
            (line.textTranslations as LocalizedTextMap | undefined) ?? locText
          );
          return {
            ...line,
            text: m.value,
            ...(m.translations ? { textTranslations: m.translations } : {}),
          };
        });
      }

      if (Array.isArray(hydrated.objectives)) {
        hydrated.objectives = hydrated.objectives.map((obj: Record<string, unknown>) => {
          const locSum = (obj?.localized as { summary?: LocalizedTextMap } | undefined)?.summary;
          if (!locSum && !obj?.summaryTranslations) return obj;
          const m = mergeLocalizedField(
            obj.summary as string | undefined,
            (obj.summaryTranslations as LocalizedTextMap | undefined) ?? locSum
          );
          return {
            ...obj,
            summary: m.value,
            ...(m.translations ? { summaryTranslations: m.translations } : {}),
          };
        });
      }

      if (Array.isArray(hydrated.interactiveObjects)) {
        hydrated.interactiveObjects = hydrated.interactiveObjects.map(
          (io: Record<string, unknown>) => {
            const locPrompt = (
              io?.localized as { interactionPrompt?: LocalizedTextMap } | undefined
            )?.interactionPrompt;
            if (!locPrompt && !io?.promptTranslations) return io;
            const m = mergeLocalizedField(
              io.interactionPrompt as string | undefined,
              (io.promptTranslations as LocalizedTextMap | undefined) ?? locPrompt
            );
            return {
              ...io,
              interactionPrompt: m.value,
              ...(m.translations ? { promptTranslations: m.translations } : {}),
            };
          }
        );
      }

      if (Array.isArray(hydrated.nodes)) {
        hydrated.nodes = hydrated.nodes.map((node: Record<string, unknown>) => {
          const locText = (node?.localized as { text?: LocalizedTextMap } | undefined)?.text;
          const mText =
            locText || node?.textTranslations
              ? mergeLocalizedField(
                  node.text as string | undefined,
                  (node.textTranslations as LocalizedTextMap | undefined) ?? locText
                )
              : null;
          const nextChoices = Array.isArray(node.choices)
            ? node.choices.map((ch: Record<string, unknown>) => {
                const locLabel = (ch?.localized as { label?: LocalizedTextMap } | undefined)?.label;
                if (!locLabel && !ch?.labelTranslations) return ch;
                const mLabel = mergeLocalizedField(
                  ch.label as string | undefined,
                  (ch.labelTranslations as LocalizedTextMap | undefined) ?? locLabel
                );
                return {
                  ...ch,
                  label: mLabel.value,
                  ...(mLabel.translations ? { labelTranslations: mLabel.translations } : {}),
                };
              })
            : node.choices;
          return {
            ...node,
            ...(mText
              ? {
                  text: mText.value,
                  ...(mText.translations ? { textTranslations: mText.translations } : {}),
                }
              : {}),
            choices: nextChoices,
          };
        });
      }

      return hydrated as T;
    });
  } catch {
    return [];
  }
}

export function resolveProjectContents(project: ModProject): ModContentDatabase {
  const byPath = new Map(project.files.map((f) => [f.path, f.content]));
  if (project.contents) {
    return {
      items: project.contents.items ?? [],
      weapons: project.contents.weapons ?? [],
      armor: project.contents.armor ?? [],
      npcs: project.contents.npcs ?? [],
      monsters: project.contents.monsters ?? [],
      quests:
        project.contents.quests ??
        hydrateEntriesFromJson<QuestDefinition>(byPath.get(CONTENT_FILE_PATHS.quest), 'quest'),
      recipes:
        project.contents.recipes ??
        hydrateEntriesFromJson<CraftingRecipeDefinition>(byPath.get(CONTENT_FILE_PATHS.recipe), 'recipe'),
      buildings:
        project.contents.buildings ??
        hydrateEntriesFromJson<BuildingDefinition>(byPath.get(CONTENT_FILE_PATHS.building), 'building'),
      spawns:
        project.contents.spawns ??
        hydrateEntriesFromJson<SpawnDefinition>(byPath.get(CONTENT_FILE_PATHS.spawn), 'spawn'),
      animations:
        project.contents.animations ??
        hydrateEntriesFromJson<AnimationConfigEntry>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.animation), 'anim'),
      audioCues:
        project.contents.audioCues ??
        hydrateEntriesFromJson<AudioConfigEntry>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.audio), 'audio'),
      materials:
        project.contents.materials ??
        hydrateEntriesFromJson<MaterialConfigEntry>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.material), 'mat'),
      lootTables:
        project.contents.lootTables ??
        hydrateEntriesFromJson<LootTableDefinition>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.loot_table), 'loot'),
      dialogues:
        project.contents.dialogues ??
        hydrateEntriesFromJson<DialogueTreeDefinition>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.dialogue), 'dlg'),
      worldObjects:
        project.contents.worldObjects ??
        hydrateEntriesFromJson<WorldObjectDefinition>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.world_object), 'wobj'),
      prefabs:
        project.contents.prefabs ??
        hydrateEntriesFromJson<PrefabDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.prefab), 'prefab'),
      aiBehaviors:
        project.contents.aiBehaviors ??
        hydrateEntriesFromJson<BehaviorGraphDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.ai_behavior), 'aibeh'),
      worldMaps:
        project.contents.worldMaps ??
        hydrateEntriesFromJson<WorldMapDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.world_map), 'wmap'),
      proceduralRules:
        project.contents.proceduralRules ??
        hydrateEntriesFromJson<ProceduralRuleDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.procedural_rule), 'proc'),
      visualLogicGraphs:
        project.contents.visualLogicGraphs ??
        hydrateEntriesFromJson<VisualLogicGraphDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.logic_graph), 'logic'),
    };
  }

  return {
    items: hydrateEntriesFromJson<ItemDefinition>(byPath.get(CONTENT_FILE_PATHS.item), 'item'),
    weapons: hydrateEntriesFromJson<WeaponDefinition>(byPath.get(CONTENT_FILE_PATHS.weapon), 'weapon'),
    armor: hydrateEntriesFromJson<ArmorDefinition>(byPath.get(CONTENT_FILE_PATHS.armor), 'armor'),
    npcs: hydrateEntriesFromJson<NpcDefinition>(byPath.get(CONTENT_FILE_PATHS.npc), 'npc'),
    monsters: hydrateEntriesFromJson<MonsterDefinition>(
      byPath.get(CONTENT_FILE_PATHS.monster) ?? byPath.get('data/creatures.json'),
      'monster'
    ),
    quests: hydrateEntriesFromJson<QuestDefinition>(byPath.get(CONTENT_FILE_PATHS.quest), 'quest'),
    recipes: hydrateEntriesFromJson<CraftingRecipeDefinition>(byPath.get(CONTENT_FILE_PATHS.recipe), 'recipe'),
    buildings: hydrateEntriesFromJson<BuildingDefinition>(byPath.get(CONTENT_FILE_PATHS.building), 'building'),
    spawns: hydrateEntriesFromJson<SpawnDefinition>(byPath.get(CONTENT_FILE_PATHS.spawn), 'spawn'),
    animations: hydrateEntriesFromJson<AnimationConfigEntry>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.animation), 'anim'),
    audioCues: hydrateEntriesFromJson<AudioConfigEntry>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.audio), 'audio'),
    materials: hydrateEntriesFromJson<MaterialConfigEntry>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.material), 'mat'),
    lootTables: hydrateEntriesFromJson<LootTableDefinition>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.loot_table), 'loot'),
    dialogues: hydrateEntriesFromJson<DialogueTreeDefinition>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.dialogue), 'dlg'),
    worldObjects: hydrateEntriesFromJson<WorldObjectDefinition>(byPath.get(EXTENDED_CONFIG_FILE_PATHS.world_object), 'wobj'),
    prefabs: hydrateEntriesFromJson<PrefabDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.prefab), 'prefab'),
    aiBehaviors: hydrateEntriesFromJson<BehaviorGraphDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.ai_behavior), 'aibeh'),
    worldMaps: hydrateEntriesFromJson<WorldMapDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.world_map), 'wmap'),
    proceduralRules: hydrateEntriesFromJson<ProceduralRuleDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.procedural_rule), 'proc'),
    visualLogicGraphs: hydrateEntriesFromJson<VisualLogicGraphDefinition>(byPath.get(SDK_CONFIG_FILE_PATHS.logic_graph), 'logic'),
  };
}

export function syncContentFilesInProject(
  project: ModProject,
  contents: ModContentDatabase
): ModProject {
  const now = new Date().toISOString();
  const modId = project.manifest.modId;
  const normalizedContents: ModContentDatabase = {
    ...contents,
    animations: contents.animations ?? [],
    audioCues: contents.audioCues ?? [],
    materials: contents.materials ?? [],
    lootTables: contents.lootTables ?? [],
    dialogues: contents.dialogues ?? [],
    worldObjects: contents.worldObjects ?? [],
    prefabs: contents.prefabs ?? [],
    aiBehaviors: contents.aiBehaviors ?? [],
    worldMaps: contents.worldMaps ?? [],
    proceduralRules: contents.proceduralRules ?? [],
    visualLogicGraphs: contents.visualLogicGraphs ?? [],
  };

  const filePayloadMap = new Map<string, string>([
    [CONTENT_FILE_PATHS.item, serializeContentFile('item', modId, normalizedContents.items)],
    [CONTENT_FILE_PATHS.weapon, serializeContentFile('weapon', modId, normalizedContents.weapons)],
    [CONTENT_FILE_PATHS.armor, serializeContentFile('armor', modId, normalizedContents.armor)],
    [CONTENT_FILE_PATHS.npc, serializeContentFile('npc', modId, normalizedContents.npcs)],
    [CONTENT_FILE_PATHS.monster, serializeContentFile('monster', modId, normalizedContents.monsters)],
    [CONTENT_FILE_PATHS.quest, serializeContentFile('quest', modId, normalizedContents.quests)],
    [CONTENT_FILE_PATHS.recipe, serializeContentFile('recipe', modId, normalizedContents.recipes)],
    [CONTENT_FILE_PATHS.building, serializeContentFile('building', modId, normalizedContents.buildings)],
    [CONTENT_FILE_PATHS.spawn, serializeContentFile('spawn', modId, normalizedContents.spawns)],
    [
      EXTENDED_CONFIG_FILE_PATHS.animation,
      serializeExtendedConfigFile('animation', modId, normalizedContents.animations ?? []),
    ],
    [
      EXTENDED_CONFIG_FILE_PATHS.audio,
      serializeExtendedConfigFile('audio', modId, normalizedContents.audioCues ?? []),
    ],
    [
      EXTENDED_CONFIG_FILE_PATHS.material,
      serializeExtendedConfigFile('material', modId, normalizedContents.materials ?? []),
    ],
    [
      EXTENDED_CONFIG_FILE_PATHS.loot_table,
      serializeExtendedConfigFile('loot_table', modId, normalizedContents.lootTables ?? []),
    ],
    [
      EXTENDED_CONFIG_FILE_PATHS.dialogue,
      serializeExtendedConfigFile('dialogue', modId, normalizedContents.dialogues ?? []),
    ],
    [
      EXTENDED_CONFIG_FILE_PATHS.world_object,
      serializeExtendedConfigFile('world_object', modId, normalizedContents.worldObjects ?? []),
    ],
    [
      SDK_CONFIG_FILE_PATHS.prefab,
      serializeSdkConfigFile('prefab', modId, normalizedContents.prefabs ?? []),
    ],
    [
      SDK_CONFIG_FILE_PATHS.ai_behavior,
      serializeSdkConfigFile('ai_behavior', modId, normalizedContents.aiBehaviors ?? []),
    ],
    [
      SDK_CONFIG_FILE_PATHS.world_map,
      serializeSdkConfigFile('world_map', modId, normalizedContents.worldMaps ?? []),
    ],
    [
      SDK_CONFIG_FILE_PATHS.procedural_rule,
      serializeSdkConfigFile('procedural_rule', modId, normalizedContents.proceduralRules ?? []),
    ],
    [
      SDK_CONFIG_FILE_PATHS.logic_graph,
      serializeSdkConfigFile('logic_graph', modId, normalizedContents.visualLogicGraphs ?? []),
    ],
    ['data/load_order.json', serializeLoadOrderFile(project.manifest)],
    [
      'data/registry.json',
      buildStandardRegistryJson(project.manifest, normalizedContents, project.assets),
    ],
  ]);

  const nextFiles: ModFileNode[] = project.files.map((f) => {
    const replacement = filePayloadMap.get(f.path);
    if (replacement !== undefined) {
      filePayloadMap.delete(f.path);
      return { ...f, content: replacement, updatedAt: now };
    }
    return f;
  });

  for (const [path, content] of filePayloadMap.entries()) {
    const name = path.split('/').pop() ?? path;
    nextFiles.push({
      id: `file_${path.replace(/[^a-z0-9]/gi, '_')}`,
      name,
      path,
      parentPath: 'data',
      type: 'data',
      content,
      updatedAt: now,
    });
  }

  return {
    ...project,
    contents: normalizedContents,
    files: nextFiles,
  };
}

export function createDefaultItem(
  modId: string,
  existingIds: Set<string>,
  defaultIcon = ''
): ItemDefinition {
  const now = new Date().toISOString();
  return {
    uid: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_item', existingIds),
    name: 'New Item',
    description: 'Custom item crafted for World of Adventure.',
    icon: defaultIcon || 'assets/textures/item_icon.png',
    stackSize: 20,
    weight: 0.5,
    value: 25,
    rarity: 'common',
    category: 'misc',
    updatedAt: now,
  };
}

export function createDefaultWeapon(
  modId: string,
  existingIds: Set<string>,
  defaultModel = '',
  defaultIcon = '',
  defaultSound = ''
): WeaponDefinition {
  const now = new Date().toISOString();
  return {
    uid: `weapon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_weapon', existingIds),
    name: 'New Weapon',
    description: 'Custom weapon forged for World of Adventure combat.',
    damage: 18,
    attackSpeed: 1.2,
    range: 2.2,
    durability: 180,
    criticalChance: 10,
    projectile: {
      enabled: false,
      projectileId: `${modId}:energy_bolt`,
      speed: 24,
      gravity: 0.1,
      spreadDegrees: 1.5,
      pierceCount: 0,
    },
    animation: 'swing_one_handed',
    sound: defaultSound || 'woa:sfx/weapon_swing',
    model: defaultModel || 'assets/models/weapon.glb',
    icon: defaultIcon || 'assets/textures/weapon_icon.png',
    updatedAt: now,
  };
}

export function createDefaultArmor(
  modId: string,
  existingIds: Set<string>,
  defaultModel = '',
  defaultIcon = ''
): ArmorDefinition {
  const now = new Date().toISOString();
  return {
    uid: `armor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_armor', existingIds),
    name: 'New Armor',
    description: 'Protective gear designed for frontier expeditions.',
    defense: 12,
    durability: 220,
    weight: 4.5,
    slot: 'chest',
    model: defaultModel || 'assets/models/armor.glb',
    icon: defaultIcon || 'assets/textures/armor_icon.png',
    updatedAt: now,
  };
}

export function createDefaultNpc(
  modId: string,
  existingIds: Set<string>,
  defaultModel = ''
): NpcDefinition {
  const now = new Date().toISOString();
  return {
    uid: `npc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_npc', existingIds),
    name: 'New Character',
    description: 'Friendly NPC inhabitant for towns and outposts.',
    model: defaultModel || 'assets/models/npc.glb',
    health: 120,
    movementSpeed: 3.4,
    behaviorType: 'friendly',
    dialogue: [
      {
        id: `dlg_${Date.now()}`,
        speakerMood: 'friendly',
        text: 'Safe travels across the frontier, adventurer.',
      },
    ],
    faction: 'woa:factions/frontier_guild',
    loot: [],
    questReferences: [],
    updatedAt: now,
  };
}

export function createDefaultMonster(
  modId: string,
  existingIds: Set<string>,
  defaultModel = ''
): MonsterDefinition {
  const now = new Date().toISOString();
  return {
    uid: `monster_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_creature', existingIds),
    name: 'New Creature',
    description: 'Hostile creature prowling the untamed regions.',
    model: defaultModel || 'assets/models/creature.glb',
    health: 160,
    damage: 14,
    speed: 4.2,
    detectionRange: 14,
    attackBehavior: 'melee',
    loot: [],
    spawnRules: {
      biomes: ['frontier_plains'],
      timeOfDay: 'any',
      minGroupSize: 1,
      maxGroupSize: 3,
      spawnWeight: 10,
      minAltitude: 0,
    },
    updatedAt: now,
  };
}

export function createDefaultQuest(
  modId: string,
  existingIds: Set<string>,
  defaultNpcId = '',
  defaultItemId = ''
): QuestDefinition {
  const now = new Date().toISOString();
  return {
    uid: `quest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_quest', existingIds),
    name: 'New Quest',
    description: 'Adventure task assigned in World of Adventure.',
    questType: 'side',
    chapterOrRegion: 'Frontier Highlands',
    recommendedLevel: 5,
    giverNpcId: defaultNpcId || `${modId}:npc_giver`,
    repeatable: false,
    objectives: [
      {
        id: `obj_${Date.now()}`,
        type: 'collect',
        summary: 'Gather supplies from the frontier',
        targetId: defaultItemId || `${modId}:new_item`,
        requiredCount: 3,
        consumeOnComplete: true,
      },
    ],
    rewards: {
      xp: 250,
      gold: 75,
      reputationFaction: 'woa:factions/frontier_guild',
      reputationAmount: 25,
      items: [],
    },
    dialogue: [
      {
        id: `qdlg_${Date.now()}`,
        stage: 'offer',
        speakerNpcId: defaultNpcId || `${modId}:npc_giver`,
        text: 'Can you help us recover the lost expedition cache?',
      },
    ],
    chain: {
      prerequisiteQuestIds: [],
      nextQuestId: '',
    },
    updatedAt: now,
  };
}

export function createDefaultRecipe(
  modId: string,
  existingIds: Set<string>,
  defaultOutputId = '',
  defaultIngredientId = ''
): CraftingRecipeDefinition {
  const now = new Date().toISOString();
  return {
    uid: `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_recipe', existingIds),
    name: 'New Crafting Recipe',
    description: 'Standard crafting schematic for World of Adventure stations.',
    station: 'workbench',
    craftTimeSeconds: 3.0,
    outputItemId: defaultOutputId || `${modId}:crafted_item`,
    outputQuantity: 1,
    ingredients: [
      {
        id: `ing_${Date.now()}`,
        itemId: defaultIngredientId || `${modId}:raw_material`,
        quantity: 2,
      },
    ],
    unlockedByDefault: true,
    updatedAt: now,
  };
}

export function createDefaultBuilding(
  modId: string,
  existingIds: Set<string>,
  defaultModel = ''
): BuildingDefinition {
  const now = new Date().toISOString();
  return {
    uid: `building_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_building', existingIds),
    name: 'New Structure',
    description: 'Constructible architectural blueprint for settlements.',
    category: 'outpost',
    model: defaultModel || 'assets/models/structure.glb',
    footprint: { width: 6, height: 4.5, depth: 6 },
    pieces: [
      {
        id: `piece_${Date.now()}`,
        name: 'Foundation Plinth',
        model: defaultModel || 'assets/models/structure.glb',
        position: { x: 0, y: 0, z: 0 },
        rotationDeg: { x: 0, y: 0, z: 0 },
        scale: 1,
      },
    ],
    materials: [
      {
        id: `bmat_${Date.now()}`,
        materialName: 'Cut Timber / Stone',
        itemId: 'woa:materials/stone_block',
        quantity: 12,
      },
    ],
    placementPoints: [
      {
        id: `pp_${Date.now()}`,
        name: 'Primary Ground Anchor',
        pointType: 'ground_anchor',
        position: { x: 0, y: 0, z: 0 },
        facingDeg: 0,
      },
    ],
    collision: {
      enabled: true,
      shape: 'box',
      width: 6,
      height: 4.5,
      depth: 6,
      offsetY: 2.25,
    },
    doors: [],
    windows: [],
    interactiveObjects: [],
    updatedAt: now,
  };
}

export function createDefaultSpawn(
  modId: string,
  existingIds: Set<string>,
  defaultEntityId = ''
): SpawnDefinition {
  const now = new Date().toISOString();
  return {
    uid: `spawn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_spawn', existingIds),
    name: 'New Spawn Rule',
    description: 'Regional entity spawn zone and population policy.',
    entityId: defaultEntityId || `${modId}:new_creature`,
    spawnPoints: [
      {
        id: `sp_${Date.now()}`,
        label: 'Ridge Patrol Point',
        x: 0,
        y: 0,
        z: 0,
        radius: 12,
        yawDeg: 0,
      },
    ],
    conditions: {
      minPlayerLevel: 1,
      maxPlayerLevel: 50,
      weather: 'any',
      requiredQuestId: '',
      minLightLevel: 0,
      maxLightLevel: 15,
    },
    biomes: ['frontier_plains'],
    timeOfDay: 'any',
    population: {
      maxPopulation: 8,
      maxPerChunk: 3,
      groupMin: 1,
      groupMax: 3,
    },
    respawn: {
      enabled: true,
      delaySeconds: 180,
      requirePlayerAway: true,
      minPlayerDistance: 48,
    },
    updatedAt: now,
  };
}

export function createSampleContentDatabase(
  modId: string,
  now: string
): ModContentDatabase {
  return {
    items: [
      {
        uid: 'sample_item_aether_shard',
        id: `${modId}:aether_shard`,
        name: 'Aether Shard',
        description:
          'Crystallized sky-metal fragment harvested from high-altitude waystones.',
        icon: 'woa:textures/icons/aether_shard.png',
        stackSize: 50,
        weight: 0.25,
        value: 85,
        rarity: 'rare',
        category: 'material',
        updatedAt: now,
      },
      {
        uid: 'sample_item_sky_elixir',
        id: `${modId}:sky_tonic`,
        name: 'Skyreach Tonic',
        description:
          'Restores stamina and grants brief cold resistance on exposed mountain ridges.',
        icon: 'woa:textures/icons/tonic_blue.png',
        stackSize: 12,
        weight: 0.4,
        value: 40,
        rarity: 'uncommon',
        category: 'consumable',
        updatedAt: now,
      },
    ],
    weapons: [
      {
        uid: 'sample_weapon_relic_broadsword',
        id: `${modId}:relic_broadsword`,
        name: 'Relic Broadsword',
        description:
          'Ancient astral-forged blade channeling concentrated resonance waves on heavy swings.',
        damage: 34,
        attackSpeed: 1.15,
        range: 2.6,
        durability: 320,
        criticalChance: 16,
        projectile: {
          enabled: true,
          projectileId: `${modId}:astral_crescent`,
          speed: 22,
          gravity: 0,
          spreadDegrees: 1.0,
          pierceCount: 2,
        },
        animation: 'swing_two_handed',
        sound: 'woa:sfx/sword_resonance',
        model: 'assets/models/relic_broadsword.woa3d',
        icon: 'woa:textures/icons/relic_broadsword.png',
        updatedAt: now,
      },
    ],
    armor: [
      {
        uid: 'sample_armor_skyguard_cuirass',
        id: `${modId}:skyguard_cuirass`,
        name: 'Skyguard Cuirass',
        description:
          'Lightweight tempered breastplate inlaid with wind-warding silver filigree.',
        defense: 26,
        durability: 380,
        weight: 6.2,
        slot: 'chest',
        model: 'woa:models/armor/skyguard_cuirass.glb',
        icon: 'woa:textures/icons/skyguard_cuirass.png',
        updatedAt: now,
      },
    ],
    npcs: [
      {
        uid: 'sample_npc_warden_kael',
        id: `${modId}:warden_kael`,
        name: 'Warden Kael',
        description:
          'Veteran Skyreach Cartographer stationed near ancient frontier waystones.',
        model: 'woa:models/npc/warden_kael.glb',
        health: 220,
        movementSpeed: 3.0,
        behaviorType: 'quest_giver',
        dialogue: [
          {
            id: 'dlg_kael_1',
            speakerMood: 'friendly',
            text: 'The upper ridges are stirring again. Keep your blade sharp.',
          },
          {
            id: 'dlg_kael_2',
            speakerMood: 'quest',
            text: 'Bring me three Aether Shards and I can calibrate your beacon.',
            condition: 'quest.skyreach_calibration == active',
          },
        ],
        faction: 'woa:factions/skyreach_wardens',
        loot: [
          {
            id: 'loot_kael_1',
            itemId: `${modId}:sky_tonic`,
            minCount: 1,
            maxCount: 2,
            chance: 100,
          },
        ],
        questReferences: [`${modId}:skyreach_calibration`],
        updatedAt: now,
      },
    ],
    monsters: [
      {
        uid: 'sample_monster_clockwork_sentinel',
        id: `${modId}:clockwork_sentinel`,
        name: 'Clockwork Sentinel',
        description:
          'Automated brass-and-slate guardian programmed to patrol shattered astral shrines.',
        model: 'woa:models/monsters/clockwork_sentinel.glb',
        health: 340,
        damage: 24,
        speed: 3.6,
        detectionRange: 18,
        attackBehavior: 'charge',
        loot: [
          {
            id: 'loot_sent_1',
            itemId: `${modId}:aether_shard`,
            minCount: 1,
            maxCount: 3,
            chance: 85,
          },
        ],
        spawnRules: {
          biomes: ['skyreach_highlands', 'frostspire_peaks'],
          timeOfDay: 'any',
          minGroupSize: 1,
          maxGroupSize: 2,
          spawnWeight: 12,
          minAltitude: 120,
        },
        updatedAt: now,
      },
    ],
    quests: [
      {
        uid: 'sample_quest_skyreach_calibration',
        id: `${modId}:skyreach_calibration`,
        name: 'Waystone Calibration',
        description:
          'Aid Warden Kael by clearing the ridge sentinels and gathering pure Aether Shards to reignite the beacon.',
        questType: 'main',
        chapterOrRegion: 'Skyreach Highlands',
        recommendedLevel: 12,
        giverNpcId: `${modId}:warden_kael`,
        repeatable: false,
        objectives: [
          {
            id: 'obj_q1_reach',
            type: 'reach_location',
            summary: 'Ascend to the High Ridge Waystone',
            targetId: `${modId}:ridge_waystone_plaza`,
            requiredCount: 1,
            location: { x: 140, y: 128, z: -65, radius: 14 },
          },
          {
            id: 'obj_q1_kill',
            type: 'kill',
            summary: 'Disable Clockwork Sentinels',
            targetId: `${modId}:clockwork_sentinel`,
            requiredCount: 2,
          },
          {
            id: 'obj_q1_collect',
            type: 'collect',
            summary: 'Recover Aether Shards',
            targetId: `${modId}:aether_shard`,
            requiredCount: 3,
            consumeOnComplete: true,
          },
          {
            id: 'obj_q1_talk',
            type: 'talk',
            summary: 'Return to Warden Kael',
            targetId: `${modId}:warden_kael`,
            requiredCount: 1,
          },
        ],
        rewards: {
          xp: 1250,
          gold: 300,
          reputationFaction: 'woa:factions/skyreach_wardens',
          reputationAmount: 100,
          items: [
            {
              id: 'rew_q1_sword',
              itemId: `${modId}:relic_broadsword`,
              quantity: 1,
            },
          ],
        },
        dialogue: [
          {
            id: 'qdlg_1',
            stage: 'offer',
            speakerNpcId: `${modId}:warden_kael`,
            text: 'The ridge beacon went dark at dawn. Clear the sentinels and bring me three Aether Shards.',
          },
          {
            id: 'qdlg_2',
            stage: 'in_progress',
            speakerNpcId: `${modId}:warden_kael`,
            text: 'Watch out for their charge attacks near the precipice.',
          },
          {
            id: 'qdlg_3',
            stage: 'complete',
            speakerNpcId: `${modId}:warden_kael`,
            text: 'The beacon resonates again. Take this Relic Broadsword with our gratitude.',
          },
        ],
        chain: {
          prerequisiteQuestIds: [],
          nextQuestId: `${modId}:echoes_of_the_spire`,
        },
        updatedAt: now,
      },
      {
        uid: 'sample_quest_echoes_of_the_spire',
        id: `${modId}:echoes_of_the_spire`,
        name: 'Echoes of the Spire',
        description:
          'Follow the calibrated waystone resonance to the upper spire archway and clear the sentinel vanguard.',
        questType: 'main',
        chapterOrRegion: 'Skyreach Highlands',
        recommendedLevel: 14,
        giverNpcId: `${modId}:warden_kael`,
        repeatable: false,
        objectives: [
          {
            id: 'obj_q2_reach',
            type: 'reach_location',
            summary: 'Survey the Upper Spire Archway',
            targetId: `${modId}:skyreach_waystone_shrine`,
            requiredCount: 1,
            location: { x: 158, y: 131, z: -74, radius: 14 },
          },
          {
            id: 'obj_q2_kill',
            type: 'kill',
            summary: 'Disable Spire Clockwork Sentinels',
            targetId: `${modId}:clockwork_sentinel`,
            requiredCount: 3,
          },
          {
            id: 'obj_q2_talk',
            type: 'talk',
            summary: 'Report to Warden Kael',
            targetId: `${modId}:warden_kael`,
            requiredCount: 1,
          },
        ],
        rewards: {
          xp: 1650,
          gold: 420,
          reputationFaction: 'woa:factions/skyreach_wardens',
          reputationAmount: 150,
          items: [
            {
              id: 'rew_q2_cuirass',
              itemId: `${modId}:skyguard_cuirass`,
              quantity: 1,
            },
            {
              id: 'rew_q2_tonic',
              itemId: `${modId}:sky_tonic`,
              quantity: 2,
            },
          ],
        },
        dialogue: [
          {
            id: 'q2dlg_1',
            stage: 'offer',
            speakerNpcId: `${modId}:warden_kael`,
            text: 'The calibrated beacon points toward a second resonance echo near the upper spire. Pack Skyreach Tonics and scout ahead.',
          },
          {
            id: 'q2dlg_2',
            stage: 'in_progress',
            speakerNpcId: `${modId}:warden_kael`,
            text: 'Watch the shattered archway—heavy Clockwork Sentinels still patrol that ridge.',
          },
          {
            id: 'q2dlg_3',
            stage: 'complete',
            speakerNpcId: `${modId}:warden_kael`,
            text: 'The spire echoes have settled. Take this Skyguard Cuirass for the high-altitude trails ahead.',
          },
        ],
        chain: {
          prerequisiteQuestIds: [`${modId}:skyreach_calibration`],
          nextQuestId: '',
        },
        updatedAt: now,
      },
    ],
    recipes: [
      {
        uid: 'sample_recipe_sky_tonic',
        id: `${modId}:craft_sky_tonic`,
        name: 'Brew Skyreach Tonic',
        description: 'Refine raw Aether Shard dust into an invigorating high-altitude elixir.',
        station: 'alchemy_table',
        craftTimeSeconds: 4.5,
        outputItemId: `${modId}:sky_tonic`,
        outputQuantity: 2,
        ingredients: [
          {
            id: 'ing_aether',
            itemId: `${modId}:aether_shard`,
            quantity: 1,
          },
          {
            id: 'ing_flask',
            itemId: 'woa:glass_vial',
            quantity: 2,
          },
        ],
        unlockedByDefault: true,
        updatedAt: now,
      },
    ],
    buildings: [
      {
        uid: 'sample_building_beacon_shrine',
        id: `${modId}:skyreach_waystone_shrine`,
        name: 'Skyreach Waystone Shrine',
        description:
          'Elevated stone sanctum housing an activated beacon core and supply cache.',
        category: 'shrine',
        model: 'assets/models/skyreach_waystone.woa3d',
        footprint: { width: 8, height: 6, depth: 8 },
        pieces: [
          {
            id: 'bp_main',
            name: 'Central Obelisk Pedestal',
            model: 'assets/models/skyreach_waystone.woa3d',
            position: { x: 0, y: 0, z: 0 },
            rotationDeg: { x: 0, y: 0, z: 0 },
            scale: 1.2,
          },
          {
            id: 'bp_crate',
            name: 'Expedition Cache',
            model: 'assets/models/expedition_crate.woa3d',
            position: { x: 2.4, y: 0, z: 1.5 },
            rotationDeg: { x: 0, y: 28, z: 0 },
            scale: 1,
          },
        ],
        materials: [
          {
            id: 'bm_stone',
            materialName: 'Skyreach Slate',
            itemId: 'woa:materials/cut_slate',
            quantity: 24,
          },
          {
            id: 'bm_aether',
            materialName: 'Aether Shard',
            itemId: `${modId}:aether_shard`,
            quantity: 4,
          },
        ],
        placementPoints: [
          {
            id: 'pp_base',
            name: 'Ridge Anchor',
            pointType: 'ground_anchor',
            position: { x: 0, y: 0, z: 0 },
            facingDeg: 0,
          },
          {
            id: 'pp_roof',
            name: 'Apex Beacon Socket',
            pointType: 'roof_mount',
            position: { x: 0, y: 5.5, z: 0 },
            facingDeg: 0,
          },
        ],
        collision: {
          enabled: true,
          shape: 'box',
          width: 7.5,
          height: 5.8,
          depth: 7.5,
          offsetY: 2.9,
        },
        doors: [
          {
            id: 'door_shrine_gate',
            name: 'North Sanctum Gate',
            model: 'woa:models/iron_gate.glb',
            position: { x: 0, y: 0, z: 3.8 },
            rotationYDeg: 0,
            locked: false,
            keyItemId: '',
          },
        ],
        windows: [
          {
            id: 'win_east_slit',
            name: 'East Astral Lancet',
            model: 'woa:models/lancet_window.glb',
            position: { x: 3.8, y: 2.2, z: 0 },
            width: 0.9,
            height: 1.8,
            destructible: false,
          },
        ],
        interactiveObjects: [
          {
            id: 'io_beacon',
            name: 'Waystone Beacon Core',
            objectType: 'beacon',
            targetId: `${modId}:skyreach_calibration`,
            position: { x: 0, y: 1.2, z: 0 },
            interactionPrompt: 'Attune Skyreach Waystone',
          },
        ],
        updatedAt: now,
      },
    ],
    spawns: [
      {
        uid: 'sample_spawn_sentinel_patrol',
        id: `${modId}:sentinel_ridge_patrol`,
        name: 'Sentinel Ridge Patrol',
        description:
          'Spawns Clockwork Sentinels guarding high-elevation Skyreach shrines.',
        entityId: `${modId}:clockwork_sentinel`,
        spawnPoints: [
          {
            id: 'sp_ridge_1',
            label: 'North Shrine Approach',
            x: 132,
            y: 126,
            z: -58,
            radius: 16,
            yawDeg: 45,
          },
          {
            id: 'sp_ridge_2',
            label: 'Shattered Archway',
            x: 158,
            y: 131,
            z: -74,
            radius: 14,
            yawDeg: 210,
          },
        ],
        conditions: {
          minPlayerLevel: 8,
          maxPlayerLevel: 60,
          weather: 'any',
          requiredQuestId: '',
          minLightLevel: 0,
          maxLightLevel: 15,
        },
        biomes: ['skyreach_highlands', 'frostspire_peaks'],
        timeOfDay: 'any',
        population: {
          maxPopulation: 6,
          maxPerChunk: 2,
          groupMin: 1,
          groupMax: 2,
        },
        respawn: {
          enabled: true,
          delaySeconds: 240,
          requirePlayerAway: true,
          minPlayerDistance: 64,
        },
        updatedAt: now,
      },
    ],
    animations: [
      {
        uid: 'sample_anim_broadsword',
        id: `${modId}:anim_astral_slash`,
        name: 'Astral Broadsword Slash',
        description: 'Two-handed arc swing with mid-swing projectile release trigger.',
        targetType: 'weapon',
        clipName: 'swing_two_handed',
        speed: 1.15,
        blendSeconds: 0.12,
        loop: false,
        hitFrameNormalized: 0.45,
        soundCueId: `${modId}:sfx_astral_slash`,
        updatedAt: now,
      },
    ],
    audioCues: [
      {
        uid: 'sample_audio_slash',
        id: `${modId}:sfx_astral_slash`,
        name: 'Astral Slash Resonance',
        description: 'Metallic resonance sweep played when swinging the Relic Broadsword.',
        bus: 'sfx',
        assetPath: 'woa:sfx/sword_resonance',
        volume: 0.85,
        pitchMin: 0.94,
        pitchMax: 1.08,
        spatial: true,
        maxDistanceMeters: 24,
        loop: false,
        updatedAt: now,
      },
    ],
    materials: [
      {
        uid: 'sample_mat_aether',
        id: `${modId}:mat_aether_slate`,
        name: 'Aether Infused Slate',
        description: 'PBR stone surface with glowing sky-crystal vein emissives.',
        shaderProfile: 'crystal_emissive',
        albedoTexture: 'woa:textures/stone_slate_albedo.png',
        normalTexture: 'woa:textures/stone_slate_normal.png',
        baseColor: '#334155',
        metallic: 0.42,
        roughness: 0.24,
        emissiveColor: '#38BDF8',
        emissiveIntensity: 0.45,
        uvTiling: { x: 1, y: 1 },
        doubleSided: false,
        updatedAt: now,
      },
    ],
    lootTables: [
      {
        uid: 'sample_loot_waystone_cache',
        id: `${modId}:loot_waystone_cache`,
        name: 'Waystone Expedition Cache',
        description: 'Standard supply chest drop table found beside Skyreach shrines.',
        rollsMin: 1,
        rollsMax: 3,
        guaranteeOne: true,
        entries: [
          {
            id: 'lt_entry_1',
            itemId: `${modId}:aether_shard`,
            minCount: 1,
            maxCount: 3,
            chance: 85,
          },
          {
            id: 'lt_entry_2',
            itemId: `${modId}:sky_tonic`,
            minCount: 1,
            maxCount: 2,
            chance: 65,
          },
        ],
        updatedAt: now,
      },
    ],
    dialogues: [
      {
        uid: 'sample_dlg_warden_kael',
        id: `${modId}:dialogue_warden_kael`,
        name: 'Warden Kael Conversation',
        description: 'Interactive dialogue tree for calibrating the High Ridge Waystone.',
        npcId: `${modId}:warden_kael`,
        rootNodeId: 'node_intro',
        nodes: [
          {
            id: 'node_intro',
            speakerName: 'Warden Kael',
            speakerNpcId: `${modId}:warden_kael`,
            mood: 'quest',
            text: 'The ridge beacon went dark at dawn. Will you clear the sentinels and gather Aether Shards?',
            condition: '',
            questTriggerId: '',
            choices: [
              { id: 'ch_accept', label: 'I will restore the beacon.', nextNodeId: 'node_accept' },
              { id: 'ch_lore', label: 'Tell me about the sentinels.', nextNodeId: 'node_lore' },
            ],
          },
          {
            id: 'node_accept',
            speakerName: 'Warden Kael',
            speakerNpcId: `${modId}:warden_kael`,
            mood: 'friendly',
            text: 'Thank you. Bring three shards back here once the ridge is safe.',
            condition: '',
            questTriggerId: `${modId}:skyreach_calibration`,
            choices: [],
          },
          {
            id: 'node_lore',
            speakerName: 'Warden Kael',
            speakerNpcId: `${modId}:warden_kael`,
            mood: 'neutral',
            text: 'Old brass constructs left to guard the skyway. Strike after their charge attack.',
            condition: '',
            questTriggerId: '',
            choices: [
              { id: 'ch_back', label: 'Got it, I will help.', nextNodeId: 'node_accept' },
            ],
          },
        ],
        updatedAt: now,
      },
    ],
    worldObjects: [
      {
        uid: 'sample_wobj_waystone',
        id: `${modId}:world_ridge_waystone`,
        name: 'High Ridge Waystone Shrine',
        description: 'Interactive shrine anchor placed atop the northern Skyreach ridge.',
        objectType: 'shrine',
        model: 'assets/models/skyreach_waystone.woa3d',
        materialConfigId: `${modId}:mat_aether_slate`,
        audioCueId: `${modId}:sfx_astral_slash`,
        lootTableId: `${modId}:loot_waystone_cache`,
        questId: `${modId}:skyreach_calibration`,
        biome: 'skyreach_highlands',
        position: { x: 140, y: 128, z: -65 },
        rotationDeg: { x: 0, y: 24, z: 0 },
        scale: 1,
        collisionEnabled: true,
        interactionPrompt: 'Attune Skyreach Waystone',
        respawnSeconds: 0,
        updatedAt: now,
      },
    ],
  };
}

export function createDefaultAnimation(modId: string, existingIds: Set<string>): AnimationConfigEntry {
  const now = new Date().toISOString();
  return {
    uid: `anim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_animation', existingIds),
    name: 'New Animation',
    description: 'Data-driven animation clip and timing trigger configuration.',
    targetType: 'weapon',
    clipName: 'swing_one_handed',
    speed: 1.0,
    blendSeconds: 0.15,
    loop: false,
    hitFrameNormalized: 0.5,
    soundCueId: '',
    updatedAt: now,
  };
}

export function createDefaultAudioCue(
  modId: string,
  existingIds: Set<string>,
  defaultAssetPath = ''
): AudioConfigEntry {
  const now = new Date().toISOString();
  return {
    uid: `audio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_sound_cue', existingIds),
    name: 'New Audio Cue',
    description: 'Spatial or UI audio cue mapped to an imported sound file.',
    bus: 'sfx',
    assetPath: defaultAssetPath || 'woa:sfx/weapon_swing',
    volume: 0.85,
    pitchMin: 0.95,
    pitchMax: 1.05,
    spatial: true,
    maxDistanceMeters: 24,
    loop: false,
    updatedAt: now,
  };
}

export function createDefaultMaterial(
  modId: string,
  existingIds: Set<string>,
  defaultTexture = ''
): MaterialConfigEntry {
  const now = new Date().toISOString();
  return {
    uid: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_material', existingIds),
    name: 'New Material',
    description: 'PBR material preset compatible with Windows and Android renderers.',
    shaderProfile: 'pbr_standard',
    albedoTexture: defaultTexture,
    normalTexture: '',
    baseColor: '#64748B',
    metallic: 0.25,
    roughness: 0.55,
    emissiveColor: '#38BDF8',
    emissiveIntensity: 0,
    uvTiling: { x: 1, y: 1 },
    doubleSided: false,
    updatedAt: now,
  };
}

export function createDefaultLootTable(
  modId: string,
  existingIds: Set<string>,
  defaultItemId = ''
): LootTableDefinition {
  const now = new Date().toISOString();
  return {
    uid: `loot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_loot_table', existingIds),
    name: 'New Loot Table',
    description: 'Weighted item drop pool for creatures, NPCs, and world containers.',
    rollsMin: 1,
    rollsMax: 2,
    guaranteeOne: true,
    entries: [
      {
        id: `drop_${Date.now()}`,
        itemId: defaultItemId || `${modId}:new_item`,
        minCount: 1,
        maxCount: 2,
        chance: 60,
      },
    ],
    updatedAt: now,
  };
}

export function createDefaultDialogueTree(
  modId: string,
  existingIds: Set<string>,
  defaultNpcId = ''
): DialogueTreeDefinition {
  const now = new Date().toISOString();
  return {
    uid: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_dialogue_tree', existingIds),
    name: 'New Dialogue Tree',
    description: 'Branching conversation graph for an NPC.',
    npcId: defaultNpcId || `${modId}:npc_id`,
    rootNodeId: 'node_root',
    nodes: [
      {
        id: 'node_root',
        speakerName: 'NPC Speaker',
        speakerNpcId: defaultNpcId || `${modId}:npc_id`,
        mood: 'friendly',
        text: 'Greetings, traveler. What brings you out here?',
        condition: '',
        questTriggerId: '',
        choices: [
          { id: 'c_bye', label: 'Just passing through.', nextNodeId: '' },
        ],
      },
    ],
    updatedAt: now,
  };
}

export function createDefaultWorldObject(
  modId: string,
  existingIds: Set<string>,
  defaultModel = ''
): WorldObjectDefinition {
  const now = new Date().toISOString();
  return {
    uid: `wobj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_world_object', existingIds),
    name: 'New World Object',
    description: 'Interactive world prop, shrine, chest, or trigger.',
    objectType: 'shrine',
    model: defaultModel || 'assets/models/beacon.woa3d',
    materialConfigId: '',
    audioCueId: '',
    lootTableId: '',
    questId: '',
    biome: 'frontier_plains',
    position: { x: 0, y: 0, z: 0 },
    rotationDeg: { x: 0, y: 0, z: 0 },
    scale: 1,
    collisionEnabled: true,
    interactionPrompt: 'Inspect',
    respawnSeconds: 0,
    updatedAt: now,
  };
}

export function createDefaultPrefab(
  modId: string,
  existingIds: Set<string>,
  defaultModel = ''
): PrefabDefinition {
  const now = new Date().toISOString();
  return {
    uid: `prefab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_prefab', existingIds),
    name: 'New Prefab',
    description: 'Reusable hierarchical 3D prefab blueprint.',
    category: 'custom',
    tags: ['reusable'],
    nodes: [
      {
        id: 'pf_root',
        name: 'Root Prop',
        parentId: null,
        type: 'Group',
        modelPath: defaultModel || undefined,
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        properties: {
          color: '#64748B',
          roughness: 0.5,
          metalness: 0.25,
        },
      },
    ],
    materials: [],
    textures: [],
    animations: [],
    references: {
      assetPaths: defaultModel ? [defaultModel] : [],
      contentIds: [],
    },
    instanceCount: 0,
    updatedAt: now,
  };
}

export function createDefaultBehaviorGraph(
  modId: string,
  existingIds: Set<string>
): BehaviorGraphDefinition {
  const now = new Date().toISOString();
  return {
    uid: `aibeh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'new_ai_behavior', existingIds),
    name: 'Frontier Patrol AI',
    description: 'Visual behavior graph controlling creature/NPC patrol, aggro, and combat.',
    targetType: 'creature',
    tickIntervalSeconds: 0.5,
    nodes: [
      {
        id: 'n_start',
        kind: 'start',
        title: 'Start Tick',
        position: { x: 80, y: 120 },
      },
      {
        id: 'n_cond_sight',
        kind: 'condition',
        title: 'Player Within Aggro?',
        conditionType: 'player_in_range',
        conditionValue: 16,
        position: { x: 320, y: 120 },
      },
      {
        id: 'n_act_attack',
        kind: 'action',
        title: 'Engage & Attack',
        actionType: 'attack',
        position: { x: 600, y: 60 },
      },
      {
        id: 'n_act_patrol',
        kind: 'action',
        title: 'Patrol Territory',
        actionType: 'patrol',
        position: { x: 600, y: 200 },
      },
    ],
    edges: [
      { id: 'e_1', fromNodeId: 'n_start', fromPort: 'out', toNodeId: 'n_cond_sight', toPort: 'in' },
      { id: 'e_2', fromNodeId: 'n_cond_sight', fromPort: 'true', toNodeId: 'n_act_attack', toPort: 'in', label: 'true' },
      { id: 'e_3', fromNodeId: 'n_cond_sight', fromPort: 'false', toNodeId: 'n_act_patrol', toPort: 'in', label: 'false' },
    ],
    updatedAt: now,
  };
}

export function createDefaultWorldMap(
  modId: string,
  existingIds: Set<string>
): WorldMapDefinition {
  const now = new Date().toISOString();
  return {
    uid: `wmap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'frontier_region', existingIds),
    name: 'Frontier Sector',
    description: 'Top-down world map layout and procedural placement canvas.',
    regionName: 'Frontier Plains',
    sizeMeters: { width: 512, depth: 512 },
    gridSize: 16,
    snapToGrid: true,
    waterLevelY: 2,
    defaultBiome: 'frontier_plains',
    layers: [
      { id: 'layer_terrain', name: 'Terrain & Water', visible: true, locked: false, color: '#38BDF8' },
      { id: 'layer_structures', name: 'Structures & Prefabs', visible: true, locked: false, color: '#F59E0B' },
      { id: 'layer_entities', name: 'NPCs & Spawns', visible: true, locked: false, color: '#10B981' },
    ],
    objects: [
      {
        id: 'wz_coast',
        name: 'Southern Cove',
        kind: 'water_zone',
        refId: '',
        layerId: 'layer_terrain',
        biome: 'coastal',
        position: { x: 0, y: 0, z: 160 },
        rotationYDeg: 0,
        scale: 1,
        radius: 64,
      },
    ],
    updatedAt: now,
  };
}

export function createDefaultProceduralRule(
  modId: string,
  existingIds: Set<string>
): ProceduralRuleDefinition {
  const now = new Date().toISOString();
  return {
    uid: `proc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'scatter_rule', existingIds),
    name: 'Highland Scatter Rule',
    description: 'Deterministic seeded procedural placement filter.',
    seed: 1337,
    targetWorldMapId: '',
    objectKind: 'tree',
    targetRefId: 'woa:props/frontier_pine',
    biomes: ['frontier_plains'],
    biomeWeights: { frontier_plains: 1 },
    density: 28,
    minAltitude: 5,
    maxAltitude: 180,
    maxSlopeDeg: 35,
    minSpacingMeters: 24,
    avoidWater: true,
    waterMarginMeters: 8,
    scaleMin: 0.85,
    scaleMax: 1.25,
    updatedAt: now,
  };
}

export function createDefaultVisualLogicGraph(
  modId: string,
  existingIds: Set<string>
): VisualLogicGraphDefinition {
  const now = new Date().toISOString();
  return {
    uid: `logic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    id: ensureUniqueId(modId, 'world_event_logic', existingIds),
    name: 'Beacon Activation Logic',
    description: 'Event-driven visual game logic graph without arbitrary code execution.',
    triggerEvent: 'on_interact',
    enabled: true,
    variables: {
      beaconAttuned: false,
      waveCount: 0,
    },
    nodes: [
      {
        id: 'lg_evt',
        kind: 'event',
        title: 'On Player Interact',
        opCode: 'on_interact',
        params: {},
        position: { x: 80, y: 110 },
      },
      {
        id: 'lg_var',
        kind: 'condition',
        title: 'Check Not Attuned',
        opCode: 'compare_var',
        params: { varName: 'beaconAttuned', operator: '==', value: false },
        position: { x: 340, y: 110 },
      },
      {
        id: 'lg_act',
        kind: 'variable',
        title: 'Set beaconAttuned = true',
        opCode: 'set_var',
        params: { varName: 'beaconAttuned', mode: 'set', value: true },
        position: { x: 610, y: 110 },
      },
    ],
    edges: [
      { id: 'le_1', fromNodeId: 'lg_evt', fromPort: 'exec', toNodeId: 'lg_var', toPort: 'exec' },
      { id: 'le_2', fromNodeId: 'lg_var', fromPort: 'true', toNodeId: 'lg_act', toPort: 'exec' },
    ],
    updatedAt: now,
  };
}
