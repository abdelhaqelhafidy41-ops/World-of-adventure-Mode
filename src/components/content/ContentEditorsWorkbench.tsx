import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Box,
  Building2,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  FileText,
  Hammer,
  MapPin,
  Package,
  Plus,
  ScrollText,
  Search,
  Shield,
  Skull,
  Sword,
  Trash2,
  Users,
} from 'lucide-react';
import {
  BuildingEditorForm,
  CraftingEditorForm,
  QuestEditorForm,
  SpawnEditorForm,
} from '@/src/components/content/AdvancedContentForms';
import {
  AnimationConfigForm,
  AudioConfigForm,
  type ConfigPatchOptions,
  DialogueTreeConfigForm,
  LootTableConfigForm,
  MaterialConfigForm,
  WorldObjectConfigForm,
} from '@/src/components/content/ExtendedConfigForms';
import {
  AssetReferenceField,
  DialogueListEditor,
  FieldShell,
  findFieldError,
  LocalizedTextField,
  LootTableEditor,
  NamespacedIdField,
  ReferenceListEditor,
  WOA_BIOMES,
} from '@/src/components/content/ContentFieldControls';
import { WorldSpawnConfigSection } from '@/src/components/content/WorldSpawnConfigSection';
import { type TranslationKey, useI18n } from '@/src/i18n';
import {
  ARMOR_SLOTS,
  CONTENT_FILE_PATHS,
  EXTENDED_CONFIG_FILE_PATHS,
  cloneSpawnConfig,
  collectAllContentIds,
  createDefaultAnimation,
  createDefaultArmor,
  createDefaultAudioCue,
  createDefaultBuilding,
  createDefaultDialogueTree,
  createDefaultItem,
  createDefaultLootTable,
  createDefaultMaterial,
  createDefaultMonster,
  createDefaultNpc,
  createDefaultQuest,
  createDefaultRecipe,
  createDefaultSpawn,
  createDefaultWeapon,
  createDefaultWorldObject,
  ensureUniqueId,
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  MONSTER_ATTACK_BEHAVIORS,
  NPC_BEHAVIOR_TYPES,
  serializeContentFile,
  serializeExtendedConfigFile,
  validateAllContents,
  validateAnimationConfig,
  validateAudioConfig,
  validateDialogueTreeConfig,
  validateLootTableConfig,
  validateMaterialConfig,
  validateWorldObjectConfig,
  WEAPON_ANIMATIONS,
} from '@/src/core/content/contentRegistry';
import {
  AnimationConfigEntry,
  ArmorDefinition,
  ArmorSlot,
  AudioConfigEntry,
  BuildingDefinition,
  ContentKind,
  ContentSpawnConfig,
  ContentValidationIssue,
  CraftingRecipeDefinition,
  DialogueTreeDefinition,
  ExtendedConfigKind,
  ItemCategory,
  ItemDefinition,
  ItemRarity,
  LootTableDefinition,
  MaterialConfigEntry,
  ModAsset,
  ModContentDatabase,
  MonsterAttackBehavior,
  MonsterDefinition,
  NpcBehaviorType,
  NpcDefinition,
  QuestDefinition,
  SpawnDefinition,
  WeaponDefinition,
  WoAContentBase,
  WorldObjectDefinition,
  WorldSpawnContentKind,
} from '@/src/types/mod';

export type AnyWorkbenchKind = ContentKind | ExtendedConfigKind;

interface ContentEditorsWorkbenchProps {
  modId: string;
  contents: ModContentDatabase;
  assets: ModAsset[];
  activeKind?: AnyWorkbenchKind;
  focusTarget?: { kind: AnyWorkbenchKind; uid: string; token: number } | null;
  onChangeKind?: (kind: AnyWorkbenchKind) => void;
  onUpdateContents: (next: ModContentDatabase, opts?: ConfigPatchOptions) => void;
  onPreviewAssetIn3D?: (assetId: string) => void;
}

const KIND_TABS: {
  id: AnyWorkbenchKind;
  group: 'core' | 'config';
  icon: React.ReactNode;
}[] = [
  { id: 'item', group: 'core', icon: <Package className="w-3.5 h-3.5" /> },
  { id: 'weapon', group: 'core', icon: <Sword className="w-3.5 h-3.5" /> },
  { id: 'armor', group: 'core', icon: <Shield className="w-3.5 h-3.5" /> },
  { id: 'npc', group: 'core', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'monster', group: 'core', icon: <Skull className="w-3.5 h-3.5" /> },
  { id: 'quest', group: 'core', icon: <ScrollText className="w-3.5 h-3.5" /> },
  { id: 'recipe', group: 'core', icon: <Hammer className="w-3.5 h-3.5" /> },
  { id: 'building', group: 'core', icon: <Building2 className="w-3.5 h-3.5" /> },
  { id: 'spawn', group: 'core', icon: <MapPin className="w-3.5 h-3.5" /> },
  { id: 'world_object', group: 'config', icon: <Box className="w-3.5 h-3.5" /> },
  { id: 'dialogue', group: 'config', icon: <ScrollText className="w-3.5 h-3.5" /> },
  { id: 'loot_table', group: 'config', icon: <Package className="w-3.5 h-3.5" /> },
  { id: 'animation', group: 'config', icon: <Hammer className="w-3.5 h-3.5" /> },
  { id: 'audio', group: 'config', icon: <Shield className="w-3.5 h-3.5" /> },
  { id: 'material', group: 'config', icon: <Box className="w-3.5 h-3.5" /> },
];

export const ContentEditorsWorkbench: React.FC<ContentEditorsWorkbenchProps> = ({
  modId,
  contents,
  assets,
  activeKind: controlledKind,
  focusTarget,
  onChangeKind,
  onUpdateContents,
  onPreviewAssetIn3D,
}) => {
  const { t, language } = useI18n();
  const [internalKind, setInternalKind] = useState<AnyWorkbenchKind>('item');
  const activeKind = controlledKind ?? internalKind;
  const setActiveKind = (k: AnyWorkbenchKind) => {
    setInternalKind(k);
    onChangeKind?.(k);
    setSelectedUid(null);
  };

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectJson, setInspectJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  React.useEffect(() => {
    if (focusTarget) {
      setInternalKind(focusTarget.kind);
      onChangeKind?.(focusTarget.kind);
      setSelectedUid(focusTarget.uid);
    }
  }, [focusTarget]);

  const idIndexMap = useMemo(() => collectAllContentIds(contents), [contents]);

  const validation = useMemo(() => {
    const base = validateAllContents(contents, modId);
    const addExt = (
      kind: ExtendedConfigKind,
      entries: WoAContentBase[],
      fn: (e: never) => ContentValidationIssue[]
    ) => {
      for (const e of entries) {
        const issues = fn(e as never);
        base.byUid.set(e.uid, issues);
        for (const i of issues) {
          if (i.level === 'error') base.totalErrors++;
          else base.totalWarns++;
        }
      }
      void kind;
    };
    addExt('animation', contents.animations ?? [], (e) =>
      validateAnimationConfig(e, modId, idIndexMap)
    );
    addExt('audio', contents.audioCues ?? [], (e) =>
      validateAudioConfig(e, modId, idIndexMap)
    );
    addExt('material', contents.materials ?? [], (e) =>
      validateMaterialConfig(e, modId, idIndexMap)
    );
    addExt('loot_table', contents.lootTables ?? [], (e) =>
      validateLootTableConfig(e, modId, idIndexMap)
    );
    addExt('dialogue', contents.dialogues ?? [], (e) =>
      validateDialogueTreeConfig(e, modId, idIndexMap)
    );
    addExt('world_object', contents.worldObjects ?? [], (e) =>
      validateWorldObjectConfig(e, modId, idIndexMap)
    );
    return base;
  }, [contents, modId, idIndexMap]);

  const allIdSet = useMemo(() => new Set(idIndexMap.keys()), [idIndexMap]);

  const availableLootItemIds = useMemo(
    () => [
      ...contents.items.map((i) => i.id),
      ...contents.weapons.map((w) => w.id),
      ...contents.armor.map((a) => a.id),
    ],
    [contents.items, contents.weapons, contents.armor]
  );

  const activeList = useMemo((): WoAContentBase[] => {
    switch (activeKind) {
      case 'item':
        return contents.items;
      case 'weapon':
        return contents.weapons;
      case 'armor':
        return contents.armor;
      case 'npc':
        return contents.npcs;
      case 'monster':
        return contents.monsters;
      case 'quest':
        return contents.quests;
      case 'recipe':
        return contents.recipes;
      case 'building':
        return contents.buildings;
      case 'spawn':
        return contents.spawns;
      case 'animation':
        return contents.animations ?? [];
      case 'audio':
        return contents.audioCues ?? [];
      case 'material':
        return contents.materials ?? [];
      case 'loot_table':
        return contents.lootTables ?? [];
      case 'dialogue':
        return contents.dialogues ?? [];
      case 'world_object':
        return contents.worldObjects ?? [];
    }
  }, [activeKind, contents]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter(
      (entry) =>
        entry.name.toLowerCase().includes(q) ||
        (entry.translations?.name?.en ?? '').toLowerCase().includes(q) ||
        (entry.translations?.name?.ar ?? '').toLowerCase().includes(q) ||
        entry.id.toLowerCase().includes(q)
    );
  }, [activeList, searchQuery]);

  const activeEntry =
    activeList.find((e) => e.uid === selectedUid) ?? activeList[0] ?? null;

  const activeIssues: ContentValidationIssue[] = activeEntry
    ? validation.byUid.get(activeEntry.uid) ?? []
    : [];

  const getCountForKind = (kind: AnyWorkbenchKind): number => {
    switch (kind) {
      case 'item':
        return contents.items.length;
      case 'weapon':
        return contents.weapons.length;
      case 'armor':
        return contents.armor.length;
      case 'npc':
        return contents.npcs.length;
      case 'monster':
        return contents.monsters.length;
      case 'quest':
        return contents.quests.length;
      case 'recipe':
        return contents.recipes.length;
      case 'building':
        return contents.buildings.length;
      case 'spawn':
        return contents.spawns.length;
      case 'animation':
        return contents.animations?.length ?? 0;
      case 'audio':
        return contents.audioCues?.length ?? 0;
      case 'material':
        return contents.materials?.length ?? 0;
      case 'loot_table':
        return contents.lootTables?.length ?? 0;
      case 'dialogue':
        return contents.dialogues?.length ?? 0;
      case 'world_object':
        return contents.worldObjects?.length ?? 0;
    }
  };

  const getErrorsForKind = (kind: AnyWorkbenchKind): number => {
    if (kind in validation.byKind) {
      return validation.byKind[kind as ContentKind].errors;
    }
    const list =
      kind === 'animation'
        ? contents.animations ?? []
        : kind === 'audio'
          ? contents.audioCues ?? []
          : kind === 'material'
            ? contents.materials ?? []
            : kind === 'loot_table'
              ? contents.lootTables ?? []
              : kind === 'dialogue'
                ? contents.dialogues ?? []
                : contents.worldObjects ?? [];
    return list.reduce(
      (sum, e) =>
        sum +
        (validation.byUid.get(e.uid)?.filter((i) => i.level === 'error').length ?? 0),
      0
    );
  };

  const firstModelPath =
    assets.find((a) => a.type === '3d-model')?.path ?? '';
  const firstTexturePath =
    assets.find((a) => a.type === 'texture')?.path ?? '';
  const firstAudioPath =
    assets.find((a) => a.type === 'audio')?.path ?? '';

  const handleCreateEntry = () => {
    const now = new Date().toISOString();
    if (activeKind === 'item') {
      const created = createDefaultItem(modId, allIdSet, firstTexturePath);
      created.updatedAt = now;
      onUpdateContents({ ...contents, items: [...contents.items, created] });
      setSelectedUid(created.uid);
    } else if (activeKind === 'weapon') {
      const created = createDefaultWeapon(
        modId,
        allIdSet,
        firstModelPath,
        firstTexturePath,
        firstAudioPath
      );
      created.updatedAt = now;
      onUpdateContents({ ...contents, weapons: [...contents.weapons, created] });
      setSelectedUid(created.uid);
    } else if (activeKind === 'armor') {
      const created = createDefaultArmor(
        modId,
        allIdSet,
        firstModelPath,
        firstTexturePath
      );
      created.updatedAt = now;
      onUpdateContents({ ...contents, armor: [...contents.armor, created] });
      setSelectedUid(created.uid);
    } else if (activeKind === 'npc') {
      const created = createDefaultNpc(modId, allIdSet, firstModelPath);
      created.updatedAt = now;
      onUpdateContents({ ...contents, npcs: [...contents.npcs, created] });
      setSelectedUid(created.uid);
    } else if (activeKind === 'monster') {
      const created = createDefaultMonster(modId, allIdSet, firstModelPath);
      created.updatedAt = now;
      onUpdateContents({
        ...contents,
        monsters: [...contents.monsters, created],
      });
      setSelectedUid(created.uid);
    } else if (activeKind === 'quest') {
      const created = createDefaultQuest(
        modId,
        allIdSet,
        contents.npcs[0]?.id,
        contents.items[0]?.id
      );
      created.updatedAt = now;
      onUpdateContents({ ...contents, quests: [...contents.quests, created] });
      setSelectedUid(created.uid);
    } else if (activeKind === 'recipe') {
      const created = createDefaultRecipe(
        modId,
        allIdSet,
        availableLootItemIds[0],
        contents.items[0]?.id
      );
      created.updatedAt = now;
      onUpdateContents({ ...contents, recipes: [...contents.recipes, created] });
      setSelectedUid(created.uid);
    } else if (activeKind === 'building') {
      const created = createDefaultBuilding(modId, allIdSet, firstModelPath);
      created.updatedAt = now;
      onUpdateContents({
        ...contents,
        buildings: [...contents.buildings, created],
      });
      setSelectedUid(created.uid);
    } else if (activeKind === 'spawn') {
      const created = createDefaultSpawn(
        modId,
        allIdSet,
        contents.monsters[0]?.id ?? contents.npcs[0]?.id
      );
      created.updatedAt = now;
      onUpdateContents({ ...contents, spawns: [...contents.spawns, created] });
      setSelectedUid(created.uid);
    } else if (activeKind === 'animation') {
      const created = createDefaultAnimation(modId, allIdSet);
      created.updatedAt = now;
      onUpdateContents({
        ...contents,
        animations: [...(contents.animations ?? []), created],
      });
      setSelectedUid(created.uid);
    } else if (activeKind === 'audio') {
      const created = createDefaultAudioCue(modId, allIdSet, firstAudioPath);
      created.updatedAt = now;
      onUpdateContents({
        ...contents,
        audioCues: [...(contents.audioCues ?? []), created],
      });
      setSelectedUid(created.uid);
    } else if (activeKind === 'material') {
      const created = createDefaultMaterial(modId, allIdSet, firstTexturePath);
      created.updatedAt = now;
      onUpdateContents({
        ...contents,
        materials: [...(contents.materials ?? []), created],
      });
      setSelectedUid(created.uid);
    } else if (activeKind === 'loot_table') {
      const created = createDefaultLootTable(
        modId,
        allIdSet,
        availableLootItemIds[0]
      );
      created.updatedAt = now;
      onUpdateContents({
        ...contents,
        lootTables: [...(contents.lootTables ?? []), created],
      });
      setSelectedUid(created.uid);
    } else if (activeKind === 'dialogue') {
      const created = createDefaultDialogueTree(
        modId,
        allIdSet,
        contents.npcs[0]?.id
      );
      created.updatedAt = now;
      onUpdateContents({
        ...contents,
        dialogues: [...(contents.dialogues ?? []), created],
      });
      setSelectedUid(created.uid);
    } else {
      const created = createDefaultWorldObject(modId, allIdSet, firstModelPath);
      created.updatedAt = now;
      onUpdateContents({
        ...contents,
        worldObjects: [...(contents.worldObjects ?? []), created],
      });
      setSelectedUid(created.uid);
    }
  };

  const cloneTranslations = (tr?: WoAContentBase['translations']) =>
    tr
      ? {
          name: tr.name ? { ...tr.name } : undefined,
          description: tr.description ? { ...tr.description } : undefined,
        }
      : undefined;

  const handleDuplicateEntry = (uid: string) => {
    const now = new Date().toISOString();
    const nextUid = `${activeKind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const copySuffix = t('app.duplicateSuffix');

    if (activeKind === 'item') {
      const src = contents.items.find((e) => e.uid === uid);
      if (!src) return;
      const clone: ItemDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        spawnConfig: cloneSpawnConfig(src.spawnConfig),
        updatedAt: now,
      };
      onUpdateContents({ ...contents, items: [...contents.items, clone] });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'weapon') {
      const src = contents.weapons.find((e) => e.uid === uid);
      if (!src) return;
      const clone: WeaponDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        projectile: { ...src.projectile },
        spawnConfig: cloneSpawnConfig(src.spawnConfig),
        updatedAt: now,
      };
      onUpdateContents({ ...contents, weapons: [...contents.weapons, clone] });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'armor') {
      const src = contents.armor.find((e) => e.uid === uid);
      if (!src) return;
      const clone: ArmorDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        spawnConfig: cloneSpawnConfig(src.spawnConfig),
        updatedAt: now,
      };
      onUpdateContents({ ...contents, armor: [...contents.armor, clone] });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'npc') {
      const src = contents.npcs.find((e) => e.uid === uid);
      if (!src) return;
      const clone: NpcDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        dialogue: src.dialogue.map((d) => ({
          ...d,
          textTranslations: d.textTranslations ? { ...d.textTranslations } : undefined,
        })),
        loot: src.loot.map((l) => ({ ...l })),
        questReferences: [...src.questReferences],
        spawnConfig: cloneSpawnConfig(src.spawnConfig),
        updatedAt: now,
      };
      onUpdateContents({ ...contents, npcs: [...contents.npcs, clone] });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'monster') {
      const src = contents.monsters.find((e) => e.uid === uid);
      if (!src) return;
      const clone: MonsterDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        loot: src.loot.map((l) => ({ ...l })),
        spawnRules: {
          ...src.spawnRules,
          biomes: [...src.spawnRules.biomes],
        },
        spawnConfig: cloneSpawnConfig(src.spawnConfig),
        updatedAt: now,
      };
      onUpdateContents({
        ...contents,
        monsters: [...contents.monsters, clone],
      });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'quest') {
      const src = contents.quests.find((e) => e.uid === uid);
      if (!src) return;
      const clone: QuestDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        objectives: src.objectives.map((o) => ({
          ...o,
          summaryTranslations: o.summaryTranslations ? { ...o.summaryTranslations } : undefined,
          location: o.location ? { ...o.location } : undefined,
        })),
        rewards: {
          ...src.rewards,
          items: src.rewards.items.map((ri) => ({ ...ri })),
        },
        dialogue: src.dialogue.map((d) => ({
          ...d,
          textTranslations: d.textTranslations ? { ...d.textTranslations } : undefined,
        })),
        chain: {
          ...src.chain,
          prerequisiteQuestIds: [...src.chain.prerequisiteQuestIds],
        },
        updatedAt: now,
      };
      onUpdateContents({ ...contents, quests: [...contents.quests, clone] });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'recipe') {
      const src = contents.recipes.find((e) => e.uid === uid);
      if (!src) return;
      const clone: CraftingRecipeDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        ingredients: src.ingredients.map((i) => ({ ...i })),
        updatedAt: now,
      };
      onUpdateContents({ ...contents, recipes: [...contents.recipes, clone] });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'building') {
      const src = contents.buildings.find((e) => e.uid === uid);
      if (!src) return;
      const clone: BuildingDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        footprint: { ...src.footprint },
        pieces: src.pieces.map((p) => ({
          ...p,
          position: { ...p.position },
          rotationDeg: { ...p.rotationDeg },
        })),
        materials: src.materials.map((m) => ({ ...m })),
        placementPoints: src.placementPoints.map((pp) => ({
          ...pp,
          position: { ...pp.position },
        })),
        collision: { ...src.collision },
        doors: src.doors.map((d) => ({ ...d, position: { ...d.position } })),
        windows: src.windows.map((w) => ({ ...w, position: { ...w.position } })),
        interactiveObjects: src.interactiveObjects.map((io) => ({
          ...io,
          promptTranslations: io.promptTranslations ? { ...io.promptTranslations } : undefined,
          position: { ...io.position },
        })),
        spawnConfig: cloneSpawnConfig(src.spawnConfig),
        updatedAt: now,
      };
      onUpdateContents({
        ...contents,
        buildings: [...contents.buildings, clone],
      });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'spawn') {
      const src = contents.spawns.find((e) => e.uid === uid);
      if (!src) return;
      const clone: SpawnDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        spawnPoints: src.spawnPoints.map((sp) => ({ ...sp })),
        conditions: { ...src.conditions },
        biomes: [...src.biomes],
        population: { ...src.population },
        respawn: { ...src.respawn },
        updatedAt: now,
      };
      onUpdateContents({ ...contents, spawns: [...contents.spawns, clone] });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'animation') {
      const src = (contents.animations ?? []).find((e) => e.uid === uid);
      if (!src) return;
      const clone: AnimationConfigEntry = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        updatedAt: now,
      };
      onUpdateContents({
        ...contents,
        animations: [...(contents.animations ?? []), clone],
      });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'audio') {
      const src = (contents.audioCues ?? []).find((e) => e.uid === uid);
      if (!src) return;
      const clone: AudioConfigEntry = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        updatedAt: now,
      };
      onUpdateContents({
        ...contents,
        audioCues: [...(contents.audioCues ?? []), clone],
      });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'material') {
      const src = (contents.materials ?? []).find((e) => e.uid === uid);
      if (!src) return;
      const clone: MaterialConfigEntry = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        uvTiling: { ...src.uvTiling },
        updatedAt: now,
      };
      onUpdateContents({
        ...contents,
        materials: [...(contents.materials ?? []), clone],
      });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'loot_table') {
      const src = (contents.lootTables ?? []).find((e) => e.uid === uid);
      if (!src) return;
      const clone: LootTableDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        entries: src.entries.map((d) => ({ ...d })),
        updatedAt: now,
      };
      onUpdateContents({
        ...contents,
        lootTables: [...(contents.lootTables ?? []), clone],
      });
      setSelectedUid(clone.uid);
    } else if (activeKind === 'dialogue') {
      const src = (contents.dialogues ?? []).find((e) => e.uid === uid);
      if (!src) return;
      const clone: DialogueTreeDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        nodes: src.nodes.map((n) => ({
          ...n,
          textTranslations: n.textTranslations ? { ...n.textTranslations } : undefined,
          choices: n.choices.map((c) => ({
            ...c,
            labelTranslations: c.labelTranslations ? { ...c.labelTranslations } : undefined,
          })),
        })),
        updatedAt: now,
      };
      onUpdateContents({
        ...contents,
        dialogues: [...(contents.dialogues ?? []), clone],
      });
      setSelectedUid(clone.uid);
    } else {
      const src = (contents.worldObjects ?? []).find((e) => e.uid === uid);
      if (!src) return;
      const clone: WorldObjectDefinition = {
        ...src,
        uid: nextUid,
        id: ensureUniqueId(modId, `${src.name}_copy`, allIdSet),
        name: `${src.name} ${copySuffix}`,
        translations: cloneTranslations(src.translations),
        promptTranslations: src.promptTranslations ? { ...src.promptTranslations } : undefined,
        position: { ...src.position },
        rotationDeg: { ...src.rotationDeg },
        spawnConfig: cloneSpawnConfig(src.spawnConfig),
        updatedAt: now,
      };
      onUpdateContents({
        ...contents,
        worldObjects: [...(contents.worldObjects ?? []), clone],
      });
      setSelectedUid(clone.uid);
    }
  };

  const handleDeleteEntry = (uid: string) => {
    if (activeKind === 'item') {
      onUpdateContents({
        ...contents,
        items: contents.items.filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'weapon') {
      onUpdateContents({
        ...contents,
        weapons: contents.weapons.filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'armor') {
      onUpdateContents({
        ...contents,
        armor: contents.armor.filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'npc') {
      onUpdateContents({
        ...contents,
        npcs: contents.npcs.filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'monster') {
      onUpdateContents({
        ...contents,
        monsters: contents.monsters.filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'quest') {
      onUpdateContents({
        ...contents,
        quests: contents.quests.filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'recipe') {
      onUpdateContents({
        ...contents,
        recipes: contents.recipes.filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'building') {
      onUpdateContents({
        ...contents,
        buildings: contents.buildings.filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'spawn') {
      onUpdateContents({
        ...contents,
        spawns: contents.spawns.filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'animation') {
      onUpdateContents({
        ...contents,
        animations: (contents.animations ?? []).filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'audio') {
      onUpdateContents({
        ...contents,
        audioCues: (contents.audioCues ?? []).filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'material') {
      onUpdateContents({
        ...contents,
        materials: (contents.materials ?? []).filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'loot_table') {
      onUpdateContents({
        ...contents,
        lootTables: (contents.lootTables ?? []).filter((e) => e.uid !== uid),
      });
    } else if (activeKind === 'dialogue') {
      onUpdateContents({
        ...contents,
        dialogues: (contents.dialogues ?? []).filter((e) => e.uid !== uid),
      });
    } else {
      onUpdateContents({
        ...contents,
        worldObjects: (contents.worldObjects ?? []).filter((e) => e.uid !== uid),
      });
    }
    if (selectedUid === uid) setSelectedUid(null);
  };

  const patchItem = (uid: string, patch: Partial<ItemDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      items: contents.items.map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchWeapon = (uid: string, patch: Partial<WeaponDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      weapons: contents.weapons.map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchArmor = (uid: string, patch: Partial<ArmorDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      armor: contents.armor.map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchNpc = (uid: string, patch: Partial<NpcDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      npcs: contents.npcs.map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchMonster = (uid: string, patch: Partial<MonsterDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      monsters: contents.monsters.map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchQuest = (uid: string, patch: Partial<QuestDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      quests: contents.quests.map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchRecipe = (uid: string, patch: Partial<CraftingRecipeDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      recipes: contents.recipes.map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchBuilding = (uid: string, patch: Partial<BuildingDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      buildings: contents.buildings.map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchSpawn = (uid: string, patch: Partial<SpawnDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      spawns: contents.spawns.map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchAnimation = (
    uid: string,
    patch: Partial<AnimationConfigEntry>,
    opts?: ConfigPatchOptions
  ) => {
    const now = new Date().toISOString();
    onUpdateContents(
      {
        ...contents,
        animations: (contents.animations ?? []).map((e) =>
          e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
        ),
      },
      opts
    );
  };

  const patchAudioCue = (
    uid: string,
    patch: Partial<AudioConfigEntry>,
    opts?: ConfigPatchOptions
  ) => {
    const now = new Date().toISOString();
    onUpdateContents(
      {
        ...contents,
        audioCues: (contents.audioCues ?? []).map((e) =>
          e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
        ),
      },
      opts
    );
  };

  const patchMaterial = (
    uid: string,
    patch: Partial<MaterialConfigEntry>,
    opts?: ConfigPatchOptions
  ) => {
    const now = new Date().toISOString();
    onUpdateContents(
      {
        ...contents,
        materials: (contents.materials ?? []).map((e) =>
          e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
        ),
      },
      opts
    );
  };

  const patchLootTable = (uid: string, patch: Partial<LootTableDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      lootTables: (contents.lootTables ?? []).map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchDialogueTree = (
    uid: string,
    patch: Partial<DialogueTreeDefinition>,
    opts?: ConfigPatchOptions
  ) => {
    const now = new Date().toISOString();
    onUpdateContents(
      {
        ...contents,
        dialogues: (contents.dialogues ?? []).map((e) =>
          e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
        ),
      },
      opts
    );
  };

  const patchWorldObject = (uid: string, patch: Partial<WorldObjectDefinition>) => {
    const now = new Date().toISOString();
    onUpdateContents({
      ...contents,
      worldObjects: (contents.worldObjects ?? []).map((e) =>
        e.uid === uid ? { ...e, ...patch, updatedAt: now } : e
      ),
    });
  };

  const patchActiveBase = (
    uid: string,
    patch: Partial<{
      id: string;
      name: string;
      description: string;
      translations: WoAContentBase['translations'];
    }>
  ) => {
    if (activeKind === 'item') patchItem(uid, patch);
    else if (activeKind === 'weapon') patchWeapon(uid, patch);
    else if (activeKind === 'armor') patchArmor(uid, patch);
    else if (activeKind === 'npc') patchNpc(uid, patch);
    else if (activeKind === 'monster') patchMonster(uid, patch);
    else if (activeKind === 'quest') patchQuest(uid, patch);
    else if (activeKind === 'recipe') patchRecipe(uid, patch);
    else if (activeKind === 'building') patchBuilding(uid, patch);
    else if (activeKind === 'spawn') patchSpawn(uid, patch);
    else if (activeKind === 'animation') patchAnimation(uid, patch);
    else if (activeKind === 'audio') patchAudioCue(uid, patch);
    else if (activeKind === 'material') patchMaterial(uid, patch);
    else if (activeKind === 'loot_table') patchLootTable(uid, patch);
    else if (activeKind === 'dialogue') patchDialogueTree(uid, patch);
    else patchWorldObject(uid, patch);
  };

  const activeDataFilePath =
    activeKind in CONTENT_FILE_PATHS
      ? CONTENT_FILE_PATHS[activeKind as ContentKind]
      : EXTENDED_CONFIG_FILE_PATHS[activeKind as ExtendedConfigKind];

  const standardizedFileJson = useMemo(() => {
    switch (activeKind) {
      case 'item':
        return serializeContentFile('item', modId, contents.items);
      case 'weapon':
        return serializeContentFile('weapon', modId, contents.weapons);
      case 'armor':
        return serializeContentFile('armor', modId, contents.armor);
      case 'npc':
        return serializeContentFile('npc', modId, contents.npcs);
      case 'monster':
        return serializeContentFile('monster', modId, contents.monsters);
      case 'quest':
        return serializeContentFile('quest', modId, contents.quests);
      case 'recipe':
        return serializeContentFile('recipe', modId, contents.recipes);
      case 'building':
        return serializeContentFile('building', modId, contents.buildings);
      case 'spawn':
        return serializeContentFile('spawn', modId, contents.spawns);
      case 'animation':
        return serializeExtendedConfigFile('animation', modId, contents.animations ?? []);
      case 'audio':
        return serializeExtendedConfigFile('audio', modId, contents.audioCues ?? []);
      case 'material':
        return serializeExtendedConfigFile('material', modId, contents.materials ?? []);
      case 'loot_table':
        return serializeExtendedConfigFile('loot_table', modId, contents.lootTables ?? []);
      case 'dialogue':
        return serializeExtendedConfigFile('dialogue', modId, contents.dialogues ?? []);
      case 'world_object':
        return serializeExtendedConfigFile('world_object', modId, contents.worldObjects ?? []);
    }
  }, [activeKind, contents, modId]);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(standardizedFileJson);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1500);
    } catch {
      // clipboard fallback
    }
  };

  const activeKindLabel = t(`content.kind.${activeKind}` as TranslationKey);
  const activeSingularLabel = t(`content.singular.${activeKind}` as TranslationKey);

  const findMatchedModelAssetId = (modelPath: string | undefined): string | null => {
    if (!modelPath) return null;
    const match = assets.find((a) => a.type === '3d-model' && a.path === modelPath);
    return match?.id ?? null;
  };

  const renderNumberInput = (
    value: number,
    onChange: (n: number) => void,
    opts: { min?: number; max?: number; step?: number; error?: string | null }
  ) => (
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

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-[#0B0F17] overflow-hidden">
      {/* Category Switcher Strip */}
      <div className="shrink-0 px-3 py-1.5 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {KIND_TABS.map((tab, idx) => {
            const count = getCountForKind(tab.id);
            const errs = getErrorsForKind(tab.id);
            const active = activeKind === tab.id;
            const prevGroup = idx > 0 ? KIND_TABS[idx - 1].group : tab.group;
            const tabLabel = t(`content.kind.${tab.id}` as TranslationKey);
            return (
              <React.Fragment key={tab.id}>
                {prevGroup !== tab.group && (
                  <span className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-1 shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => setActiveKind(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5'
                  }`}
                >
                  {tab.icon}
                  <span>{tabLabel}</span>
                  <span
                    dir="ltr"
                    className={`font-mono text-[11px] tabular-nums ${
                      active ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    ({count})
                  </span>
                  {errs > 0 && (
                    <AlertCircle
                      className={`w-3.5 h-3.5 ${
                        active ? 'text-amber-200' : 'text-red-500'
                      }`}
                    />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="hidden 2xl:flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
          <span dir="ltr">{activeDataFilePath}</span>
          <span aria-hidden="true">·</span>
          <span
            className={
              validation.totalErrors > 0
                ? 'text-red-500 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }
          >
            {validation.totalErrors > 0
              ? t('content.validationErrorsCount', { count: validation.totalErrors })
              : t('content.allSchemasValid')}
          </span>
        </div>
      </div>

      {/* Master-Detail Content Workbench */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar List of Content Definitions */}
        <div className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-e border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] flex flex-col max-h-56 md:max-h-none">
          <div className="p-2.5 border-b border-slate-200 dark:border-white/10 space-y-2 shrink-0">
            <button
              type="button"
              onClick={handleCreateEntry}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('content.newBtn', { singular: activeSingularLabel })}
            </button>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('content.searchPlaceholder', { kind: activeKindLabel })}
                className="w-full ps-7 pe-2 py-1 text-xs rounded border border-slate-200 bg-slate-50 text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredList.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {activeList.length === 0
                  ? t('content.emptyCategory', { kind: activeKindLabel })
                  : t('content.noMatchingEntries')}
              </div>
            ) : (
              filteredList.map((entry) => {
                const selected = activeEntry?.uid === entry.uid;
                const entryIssues = validation.byUid.get(entry.uid) ?? [];
                const errCount = entryIssues.filter((i) => i.level === 'error').length;
                const entryDisplayName =
                  entry.translations?.name?.[language]?.trim() ||
                  entry.name.trim() ||
                  t('content.untitled');

                return (
                  <div
                    key={entry.uid}
                    onClick={() => setSelectedUid(entry.uid)}
                    className={`group rounded border p-2 cursor-pointer transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-600/10'
                        : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0E131D] hover:border-slate-300 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div
                          dir="auto"
                          className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate"
                        >
                          {entryDisplayName}
                        </div>
                        <div
                          dir="ltr"
                          className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5 text-start"
                        >
                          {entry.id || t('content.missingId')}
                        </div>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        {errCount > 0 ? (
                          <span
                            dir="ltr"
                            title={t('content.issueBadgeTooltip', { count: errCount })}
                            className="inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums text-red-500"
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            {errCount}
                          </span>
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                      </div>
                    </div>

                    <div
                      className={`mt-1.5 pt-1.5 border-t border-slate-200/70 dark:border-white/5 items-center justify-end gap-1 ${
                        selected ? 'flex' : 'hidden group-hover:flex'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleDuplicateEntry(entry.uid)}
                        title={t('content.duplicateTooltip')}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(entry.uid)}
                        title={t('content.deleteTooltip')}
                        className="p-1 rounded text-slate-500 hover:text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail Editor */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {!activeEntry ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="max-w-sm space-y-3">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {t('content.noSelectionTitle', { singular: activeSingularLabel })}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t('content.noSelectionDesc', {
                    singular: activeSingularLabel,
                    file: activeDataFilePath,
                  })}
                </p>
                <button
                  type="button"
                  onClick={handleCreateEntry}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('content.createFirstBtn', { singular: activeSingularLabel })}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Entry Header */}
              <div className="h-11 shrink-0 px-4 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    dir="auto"
                    className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
                  >
                    {activeEntry.translations?.name?.[language]?.trim() ||
                      activeEntry.name ||
                      t('content.untitled')}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span
                    dir="ltr"
                    className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate"
                  >
                    {activeEntry.id}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onPreviewAssetIn3D &&
                    'model' in activeEntry &&
                    typeof activeEntry.model === 'string' &&
                    findMatchedModelAssetId(activeEntry.model) && (
                      <button
                        type="button"
                        onClick={() => {
                          const modelPath =
                            'model' in activeEntry &&
                            typeof activeEntry.model === 'string'
                              ? activeEntry.model
                              : '';
                          const id = findMatchedModelAssetId(modelPath);
                          if (id) onPreviewAssetIn3D(id);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300 hover:bg-blue-500/20 whitespace-nowrap"
                      >
                        <Box className="w-3.5 h-3.5" />
                        {t('content.previewIn3D')}
                      </button>
                    )}

                  <div className="flex items-center p-0.5 rounded bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => setInspectJson(false)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                        !inspectJson
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-white/10 dark:text-white'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                      {t('content.formTab')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectJson(true)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                        inspectJson
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-white/10 dark:text-white'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      <Code2 className="w-3 h-3" />
                      {t('content.standardJsonTab')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Editor Body */}
              {inspectJson ? (
                <div className="flex-1 min-h-0 flex flex-col p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div
                      dir="ltr"
                      className="text-xs text-slate-600 dark:text-slate-300 font-mono"
                    >
                      {t('content.schemaNamespaceBadge', { path: activeDataFilePath })}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopyJson()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      {copiedJson ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          {t('content.copied')}
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          {t('content.copyJson')}
                        </>
                      )}
                    </button>
                  </div>
                  <pre
                    dir="ltr"
                    className="flex-1 overflow-auto p-4 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed text-start"
                  >
                    {standardizedFileJson}
                  </pre>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 lg:p-6">
                  <div className="max-w-3xl space-y-6">
                    {/* Validation Banner */}
                    {activeIssues.length > 0 ? (
                      <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>
                            {t('content.issuesBanner', { count: activeIssues.length })}
                          </span>
                        </div>
                        <ul className="list-disc ps-5 text-[11px] text-red-700 dark:text-red-300 space-y-0.5">
                          {activeIssues.map((issue, i) => (
                            <li key={`${issue.field}_${i}`}>{issue.message}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="px-3 py-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          {t('content.validSchemaBanner', {
                            singular: activeSingularLabel,
                          })}
                        </span>
                      </div>
                    )}

                    {/* Common Core Identity Section */}
                    <section className="space-y-4">
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
                        {t('content.identityMultilingual')}
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <NamespacedIdField
                          value={activeEntry.id}
                          modId={modId}
                          objectName={activeEntry.name}
                          error={findFieldError(activeIssues, 'id')}
                          onChange={(id) => patchActiveBase(activeEntry.uid, { id })}
                        />

                        <LocalizedTextField
                          label={t('content.displayNameLabel')}
                          required
                          value={activeEntry.name}
                          translations={activeEntry.translations?.name}
                          error={findFieldError(activeIssues, 'name')}
                          onChange={(name, nameTranslations) =>
                            patchActiveBase(activeEntry.uid, {
                              name,
                              translations: {
                                ...(activeEntry.translations ?? {}),
                                name: nameTranslations,
                              },
                            })
                          }
                        />
                      </div>

                      <LocalizedTextField
                        label={t('content.descriptionLabel')}
                        required
                        multiline
                        rows={2}
                        value={activeEntry.description}
                        translations={activeEntry.translations?.description}
                        error={findFieldError(activeIssues, 'description')}
                        onChange={(description, descTranslations) =>
                          patchActiveBase(activeEntry.uid, {
                            description,
                            translations: {
                              ...(activeEntry.translations ?? {}),
                              description: descTranslations,
                            },
                          })
                        }
                      />
                    </section>

                    {/* 1. ITEMS EDITOR */}
                    {activeKind === 'item' && (() => {
                      const item = activeEntry as ItemDefinition;
                      return (
                        <>
                          <section className="space-y-4">
                            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
                              {t('form.itemStats')}
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <FieldShell
                                label={t('form.category')}
                                required
                                error={findFieldError(activeIssues, 'category')}
                              >
                                <select
                                  value={item.category}
                                  onChange={(e) =>
                                    patchItem(item.uid, {
                                      category: e.target.value as ItemCategory,
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {ITEM_CATEGORIES.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {t(`content.itemCat.${c.id}` as TranslationKey)}
                                    </option>
                                  ))}
                                </select>
                              </FieldShell>

                              <FieldShell
                                label={t('form.rarity')}
                                required
                                error={findFieldError(activeIssues, 'rarity')}
                              >
                                <select
                                  value={item.rarity}
                                  onChange={(e) =>
                                    patchItem(item.uid, {
                                      rarity: e.target.value as ItemRarity,
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {ITEM_RARITIES.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {t(`content.rarity.${r.id}` as TranslationKey)}
                                    </option>
                                  ))}
                                </select>
                              </FieldShell>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <FieldShell
                                label={t('form.stackSize')}
                                required
                                error={findFieldError(activeIssues, 'stackSize')}
                              >
                                {renderNumberInput(
                                  item.stackSize,
                                  (v) => patchItem(item.uid, { stackSize: Math.round(v) }),
                                  {
                                    min: 1,
                                    max: 9999,
                                    step: 1,
                                    error: findFieldError(activeIssues, 'stackSize'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.weight')}
                                required
                                error={findFieldError(activeIssues, 'weight')}
                              >
                                {renderNumberInput(
                                  item.weight,
                                  (v) => patchItem(item.uid, { weight: v }),
                                  {
                                    min: 0,
                                    step: 0.1,
                                    error: findFieldError(activeIssues, 'weight'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.value')}
                                required
                                error={findFieldError(activeIssues, 'value')}
                              >
                                {renderNumberInput(
                                  item.value,
                                  (v) => patchItem(item.uid, { value: Math.round(v) }),
                                  {
                                    min: 0,
                                    step: 1,
                                    error: findFieldError(activeIssues, 'value'),
                                  }
                                )}
                              </FieldShell>
                            </div>
                          </section>

                          <section className="space-y-4">
                            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
                              {t('content.assetsSectionMedia')}
                            </h3>
                            <AssetReferenceField
                              label={t('form.iconAsset')}
                              required
                              value={item.icon}
                              assetType="texture"
                              assets={assets}
                              placeholder="assets/textures/item_icon.png"
                              error={findFieldError(activeIssues, 'icon')}
                              onChange={(icon) => patchItem(item.uid, { icon })}
                            />
                          </section>
                        </>
                      );
                    })()}

                    {/* 2. WEAPONS EDITOR */}
                    {activeKind === 'weapon' && (() => {
                      const weapon = activeEntry as WeaponDefinition;
                      return (
                        <>
                          <section className="space-y-4">
                            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
                              {t('form.weaponStats')}
                            </h3>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              <FieldShell
                                label={t('form.damage')}
                                required
                                error={findFieldError(activeIssues, 'damage')}
                              >
                                {renderNumberInput(
                                  weapon.damage,
                                  (v) => patchWeapon(weapon.uid, { damage: v }),
                                  {
                                    min: 0.1,
                                    step: 1,
                                    error: findFieldError(activeIssues, 'damage'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.attackSpeed')}
                                required
                                error={findFieldError(activeIssues, 'attackSpeed')}
                              >
                                {renderNumberInput(
                                  weapon.attackSpeed,
                                  (v) => patchWeapon(weapon.uid, { attackSpeed: v }),
                                  {
                                    min: 0.1,
                                    step: 0.05,
                                    error: findFieldError(activeIssues, 'attackSpeed'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.range')}
                                required
                                error={findFieldError(activeIssues, 'range')}
                              >
                                {renderNumberInput(
                                  weapon.range,
                                  (v) => patchWeapon(weapon.uid, { range: v }),
                                  {
                                    min: 0.2,
                                    step: 0.1,
                                    error: findFieldError(activeIssues, 'range'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.durability')}
                                required
                                error={findFieldError(activeIssues, 'durability')}
                              >
                                {renderNumberInput(
                                  weapon.durability,
                                  (v) =>
                                    patchWeapon(weapon.uid, {
                                      durability: Math.round(v),
                                    }),
                                  {
                                    min: 1,
                                    step: 10,
                                    error: findFieldError(activeIssues, 'durability'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.critChance')}
                                required
                                error={findFieldError(activeIssues, 'criticalChance')}
                              >
                                {renderNumberInput(
                                  weapon.criticalChance,
                                  (v) => patchWeapon(weapon.uid, { criticalChance: v }),
                                  {
                                    min: 0,
                                    max: 100,
                                    step: 1,
                                    error: findFieldError(
                                      activeIssues,
                                      'criticalChance'
                                    ),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.attackAnim')}
                                required
                                error={findFieldError(activeIssues, 'animation')}
                              >
                                <select
                                  dir="ltr"
                                  value={weapon.animation}
                                  onChange={(e) =>
                                    patchWeapon(weapon.uid, {
                                      animation: e.target.value,
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {WEAPON_ANIMATIONS.map((anim) => (
                                    <option key={anim} value={anim}>
                                      {anim}
                                    </option>
                                  ))}
                                </select>
                              </FieldShell>
                            </div>
                          </section>

                          <section className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
                              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {t('form.projectileSettings')}
                              </h3>
                              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={weapon.projectile.enabled}
                                  onChange={(e) =>
                                    patchWeapon(weapon.uid, {
                                      projectile: {
                                        ...weapon.projectile,
                                        enabled: e.target.checked,
                                      },
                                    })
                                  }
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                {t('form.projectileEnabled')}
                              </label>
                            </div>

                            {weapon.projectile.enabled && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-3 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520]">
                                <div className="sm:col-span-2 lg:col-span-3">
                                  <FieldShell
                                    label={t('form.projectileId')}
                                    required
                                    error={findFieldError(
                                      activeIssues,
                                      'projectile.projectileId'
                                    )}
                                  >
                                    <input
                                      type="text"
                                      dir="ltr"
                                      value={weapon.projectile.projectileId}
                                      onChange={(e) =>
                                        patchWeapon(weapon.uid, {
                                          projectile: {
                                            ...weapon.projectile,
                                            projectileId: e.target.value,
                                          },
                                        })
                                      }
                                      placeholder={`${modId}:projectile_bolt`}
                                      className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </FieldShell>
                                </div>

                                <FieldShell
                                  label={t('form.projectileSpeed')}
                                  required
                                  error={findFieldError(
                                    activeIssues,
                                    'projectile.speed'
                                  )}
                                >
                                  {renderNumberInput(
                                    weapon.projectile.speed,
                                    (v) =>
                                      patchWeapon(weapon.uid, {
                                        projectile: { ...weapon.projectile, speed: v },
                                      }),
                                    { min: 0.5, step: 1 }
                                  )}
                                </FieldShell>

                                <FieldShell label={t('form.projectileGravity')}>
                                  {renderNumberInput(
                                    weapon.projectile.gravity,
                                    (v) =>
                                      patchWeapon(weapon.uid, {
                                        projectile: { ...weapon.projectile, gravity: v },
                                      }),
                                    { min: 0, step: 0.05 }
                                  )}
                                </FieldShell>

                                <FieldShell label={t('form.projectileSpread')}>
                                  {renderNumberInput(
                                    weapon.projectile.spreadDegrees,
                                    (v) =>
                                      patchWeapon(weapon.uid, {
                                        projectile: {
                                          ...weapon.projectile,
                                          spreadDegrees: v,
                                        },
                                      }),
                                    { min: 0, max: 45, step: 0.5 }
                                  )}
                                </FieldShell>

                                <FieldShell label={t('form.projectilePierce')}>
                                  {renderNumberInput(
                                    weapon.projectile.pierceCount,
                                    (v) =>
                                      patchWeapon(weapon.uid, {
                                        projectile: {
                                          ...weapon.projectile,
                                          pierceCount: Math.max(0, Math.round(v)),
                                        },
                                      }),
                                    { min: 0, step: 1 }
                                  )}
                                </FieldShell>
                              </div>
                            )}
                          </section>

                          <section className="space-y-4">
                            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
                              {t('content.assetsSectionWeapon')}
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <AssetReferenceField
                                label={t('form.model3d')}
                                required
                                value={weapon.model}
                                assetType="3d-model"
                                assets={assets}
                                placeholder="assets/models/weapon.glb"
                                error={findFieldError(activeIssues, 'model')}
                                onChange={(model) => patchWeapon(weapon.uid, { model })}
                                onPreviewModel={onPreviewAssetIn3D}
                              />

                              <AssetReferenceField
                                label={t('form.iconAsset')}
                                required
                                value={weapon.icon}
                                assetType="texture"
                                assets={assets}
                                placeholder="assets/textures/weapon_icon.png"
                                error={findFieldError(activeIssues, 'icon')}
                                onChange={(icon) => patchWeapon(weapon.uid, { icon })}
                              />

                              <div className="sm:col-span-2">
                                <AssetReferenceField
                                  label={t('form.weaponSound')}
                                  required
                                  value={weapon.sound}
                                  assetType="audio"
                                  assets={assets}
                                  placeholder="assets/audio/sword_swing.wav or woa:sfx/weapon_swing"
                                  error={findFieldError(activeIssues, 'sound')}
                                  onChange={(sound) => patchWeapon(weapon.uid, { sound })}
                                />
                              </div>
                            </div>
                          </section>
                        </>
                      );
                    })()}

                    {/* 3. ARMOR EDITOR */}
                    {activeKind === 'armor' && (() => {
                      const armor = activeEntry as ArmorDefinition;
                      return (
                        <>
                          <section className="space-y-4">
                            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
                              {t('form.armorStats')}
                            </h3>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                              <FieldShell
                                label={t('form.equipSlot')}
                                required
                                error={findFieldError(activeIssues, 'slot')}
                              >
                                <select
                                  value={armor.slot}
                                  onChange={(e) =>
                                    patchArmor(armor.uid, {
                                      slot: e.target.value as ArmorSlot,
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {ARMOR_SLOTS.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {t(`content.armorSlot.${s.id}` as TranslationKey)}
                                    </option>
                                  ))}
                                </select>
                              </FieldShell>

                              <FieldShell
                                label={t('form.defense')}
                                required
                                error={findFieldError(activeIssues, 'defense')}
                              >
                                {renderNumberInput(
                                  armor.defense,
                                  (v) => patchArmor(armor.uid, { defense: v }),
                                  {
                                    min: 0,
                                    step: 1,
                                    error: findFieldError(activeIssues, 'defense'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.durability')}
                                required
                                error={findFieldError(activeIssues, 'durability')}
                              >
                                {renderNumberInput(
                                  armor.durability,
                                  (v) =>
                                    patchArmor(armor.uid, {
                                      durability: Math.round(v),
                                    }),
                                  {
                                    min: 1,
                                    step: 10,
                                    error: findFieldError(activeIssues, 'durability'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.weight')}
                                required
                                error={findFieldError(activeIssues, 'weight')}
                              >
                                {renderNumberInput(
                                  armor.weight,
                                  (v) => patchArmor(armor.uid, { weight: v }),
                                  {
                                    min: 0,
                                    step: 0.25,
                                    error: findFieldError(activeIssues, 'weight'),
                                  }
                                )}
                              </FieldShell>
                            </div>
                          </section>

                          <section className="space-y-4">
                            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
                              {t('content.assetsSectionArmor')}
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <AssetReferenceField
                                label={t('form.model3d')}
                                required
                                value={armor.model}
                                assetType="3d-model"
                                assets={assets}
                                placeholder="assets/models/armor.glb"
                                error={findFieldError(activeIssues, 'model')}
                                onChange={(model) => patchArmor(armor.uid, { model })}
                                onPreviewModel={onPreviewAssetIn3D}
                              />

                              <AssetReferenceField
                                label={t('form.iconAsset')}
                                required
                                value={armor.icon}
                                assetType="texture"
                                assets={assets}
                                placeholder="assets/textures/armor_icon.png"
                                error={findFieldError(activeIssues, 'icon')}
                                onChange={(icon) => patchArmor(armor.uid, { icon })}
                              />
                            </div>
                          </section>
                        </>
                      );
                    })()}

                    {/* 4. CHARACTERS / NPCS EDITOR */}
                    {activeKind === 'npc' && (() => {
                      const npc = activeEntry as NpcDefinition;
                      return (
                        <>
                          <section className="space-y-4">
                            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
                              {t('form.npcConfig')}
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <AssetReferenceField
                                label={t('form.model3d')}
                                required
                                value={npc.model}
                                assetType="3d-model"
                                assets={assets}
                                placeholder="assets/models/npc.glb"
                                error={findFieldError(activeIssues, 'model')}
                                onChange={(model) => patchNpc(npc.uid, { model })}
                                onPreviewModel={onPreviewAssetIn3D}
                              />

                              <FieldShell
                                label={t('form.faction')}
                                required
                                error={findFieldError(activeIssues, 'faction')}
                              >
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={npc.faction}
                                  onChange={(e) =>
                                    patchNpc(npc.uid, { faction: e.target.value })
                                  }
                                  placeholder="woa:factions/frontier_guild"
                                  className={`w-full px-2.5 py-1.5 text-xs font-mono rounded border bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 ${
                                    findFieldError(activeIssues, 'faction')
                                      ? 'border-red-500 focus:ring-red-500'
                                      : 'border-slate-300 dark:border-white/10 focus:ring-blue-500'
                                  }`}
                                />
                              </FieldShell>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <FieldShell
                                label={t('form.health')}
                                required
                                error={findFieldError(activeIssues, 'health')}
                              >
                                {renderNumberInput(
                                  npc.health,
                                  (v) => patchNpc(npc.uid, { health: v }),
                                  {
                                    min: 1,
                                    step: 10,
                                    error: findFieldError(activeIssues, 'health'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.moveSpeed')}
                                required
                                error={findFieldError(activeIssues, 'movementSpeed')}
                              >
                                {renderNumberInput(
                                  npc.movementSpeed,
                                  (v) => patchNpc(npc.uid, { movementSpeed: v }),
                                  {
                                    min: 0,
                                    step: 0.2,
                                    error: findFieldError(
                                      activeIssues,
                                      'movementSpeed'
                                    ),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell label={t('form.behaviorType')} required>
                                <select
                                  value={npc.behaviorType}
                                  onChange={(e) =>
                                    patchNpc(npc.uid, {
                                      behaviorType: e.target.value as NpcBehaviorType,
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {NPC_BEHAVIOR_TYPES.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {t(`content.npcBehavior.${b.id}` as TranslationKey)}
                                    </option>
                                  ))}
                                </select>
                              </FieldShell>
                            </div>
                          </section>

                          <section className="pt-2 border-t border-slate-200 dark:border-white/10">
                            <DialogueListEditor
                              lines={npc.dialogue}
                              issues={activeIssues}
                              onChange={(dialogue) => patchNpc(npc.uid, { dialogue })}
                            />
                          </section>

                          <section className="pt-2 border-t border-slate-200 dark:border-white/10">
                            <ReferenceListEditor
                              label={t('form.questRefList')}
                              values={npc.questReferences}
                              placeholder={`${modId}:main_quest_01`}
                              error={
                                activeIssues.find((i) =>
                                  i.field.startsWith('questReferences.')
                                )?.message ?? null
                              }
                              onChange={(questReferences) =>
                                patchNpc(npc.uid, { questReferences })
                              }
                            />
                          </section>

                          <section className="pt-2 border-t border-slate-200 dark:border-white/10">
                            <LootTableEditor
                              entries={npc.loot}
                              modId={modId}
                              availableItemIds={availableLootItemIds}
                              issues={activeIssues}
                              onChange={(loot) => patchNpc(npc.uid, { loot })}
                            />
                          </section>
                        </>
                      );
                    })()}

                    {/* 5. CREATURES / MONSTERS EDITOR */}
                    {activeKind === 'monster' && (() => {
                      const monster = activeEntry as MonsterDefinition;
                      return (
                        <>
                          <section className="space-y-4">
                            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-white/10 pb-2">
                              {t('form.monsterStats')}
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <AssetReferenceField
                                label={t('content.modelOptional')}
                                value={monster.model}
                                assetType="3d-model"
                                assets={assets}
                                placeholder="assets/models/creature.glb"
                                onChange={(model) => patchMonster(monster.uid, { model })}
                                onPreviewModel={onPreviewAssetIn3D}
                              />

                              <FieldShell label={t('form.attackBehavior')} required>
                                <select
                                  value={monster.attackBehavior}
                                  onChange={(e) =>
                                    patchMonster(monster.uid, {
                                      attackBehavior: e.target
                                        .value as MonsterAttackBehavior,
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {MONSTER_ATTACK_BEHAVIORS.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {t(`content.monsterBehavior.${b.id}` as TranslationKey)}
                                    </option>
                                  ))}
                                </select>
                              </FieldShell>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                              <FieldShell
                                label={t('form.health')}
                                required
                                error={findFieldError(activeIssues, 'health')}
                              >
                                {renderNumberInput(
                                  monster.health,
                                  (v) => patchMonster(monster.uid, { health: v }),
                                  {
                                    min: 1,
                                    step: 10,
                                    error: findFieldError(activeIssues, 'health'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.damage')}
                                required
                                error={findFieldError(activeIssues, 'damage')}
                              >
                                {renderNumberInput(
                                  monster.damage,
                                  (v) => patchMonster(monster.uid, { damage: v }),
                                  {
                                    min: 0,
                                    step: 1,
                                    error: findFieldError(activeIssues, 'damage'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.moveSpeed')}
                                required
                                error={findFieldError(activeIssues, 'speed')}
                              >
                                {renderNumberInput(
                                  monster.speed,
                                  (v) => patchMonster(monster.uid, { speed: v }),
                                  {
                                    min: 0.1,
                                    step: 0.2,
                                    error: findFieldError(activeIssues, 'speed'),
                                  }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.detectionRange')}
                                required
                                error={findFieldError(activeIssues, 'detectionRange')}
                              >
                                {renderNumberInput(
                                  monster.detectionRange,
                                  (v) => patchMonster(monster.uid, { detectionRange: v }),
                                  {
                                    min: 1,
                                    step: 1,
                                    error: findFieldError(
                                      activeIssues,
                                      'detectionRange'
                                    ),
                                  }
                                )}
                              </FieldShell>
                            </div>
                          </section>

                          <section className="space-y-4 pt-2 border-t border-slate-200 dark:border-white/10">
                            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {t('form.spawnRules')}
                            </h3>

                            <ReferenceListEditor
                              label={t('form.monsterSpawnBiomes')}
                              values={monster.spawnRules.biomes}
                              placeholder={t('content.customBiomePlaceholder')}
                              presets={WOA_BIOMES}
                              presetLabelPrefix="content.biome."
                              error={findFieldError(activeIssues, 'spawnRules.biomes')}
                              onChange={(biomes) =>
                                patchMonster(monster.uid, {
                                  spawnRules: { ...monster.spawnRules, biomes },
                                })
                              }
                            />

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                              <FieldShell label={t('form.timeOfDay')} required>
                                <select
                                  value={monster.spawnRules.timeOfDay}
                                  onChange={(e) =>
                                    patchMonster(monster.uid, {
                                      spawnRules: {
                                        ...monster.spawnRules,
                                        timeOfDay: e.target.value as
                                          | 'any'
                                          | 'day'
                                          | 'night',
                                      },
                                    })
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="any">{t('content.timeAny')}</option>
                                  <option value="day">{t('content.timeDay')}</option>
                                  <option value="night">{t('content.timeNight')}</option>
                                </select>
                              </FieldShell>

                              <FieldShell
                                label={t('form.groupMin')}
                                required
                                error={findFieldError(
                                  activeIssues,
                                  'spawnRules.groupSize'
                                )}
                              >
                                {renderNumberInput(
                                  monster.spawnRules.minGroupSize,
                                  (v) =>
                                    patchMonster(monster.uid, {
                                      spawnRules: {
                                        ...monster.spawnRules,
                                        minGroupSize: Math.max(1, Math.round(v)),
                                      },
                                    }),
                                  { min: 1, step: 1 }
                                )}
                              </FieldShell>

                              <FieldShell label={t('form.groupMax')} required>
                                {renderNumberInput(
                                  monster.spawnRules.maxGroupSize,
                                  (v) =>
                                    patchMonster(monster.uid, {
                                      spawnRules: {
                                        ...monster.spawnRules,
                                        maxGroupSize: Math.max(1, Math.round(v)),
                                      },
                                    }),
                                  { min: 1, step: 1 }
                                )}
                              </FieldShell>

                              <FieldShell
                                label={t('form.spawnWeight')}
                                required
                                error={findFieldError(
                                  activeIssues,
                                  'spawnRules.spawnWeight'
                                )}
                              >
                                {renderNumberInput(
                                  monster.spawnRules.spawnWeight,
                                  (v) =>
                                    patchMonster(monster.uid, {
                                      spawnRules: {
                                        ...monster.spawnRules,
                                        spawnWeight: v,
                                      },
                                    }),
                                  { min: 1, step: 1 }
                                )}
                              </FieldShell>

                              <FieldShell label={t('form.minAltitude')}>
                                {renderNumberInput(
                                  monster.spawnRules.minAltitude,
                                  (v) =>
                                    patchMonster(monster.uid, {
                                      spawnRules: {
                                        ...monster.spawnRules,
                                        minAltitude: v,
                                      },
                                    }),
                                  { step: 10 }
                                )}
                              </FieldShell>
                            </div>
                          </section>

                          <section className="pt-2 border-t border-slate-200 dark:border-white/10">
                            <LootTableEditor
                              entries={monster.loot}
                              modId={modId}
                              availableItemIds={availableLootItemIds}
                              issues={activeIssues}
                              onChange={(loot) => patchMonster(monster.uid, { loot })}
                            />
                          </section>
                        </>
                      );
                    })()}

                    {/* 6. QUEST EDITOR */}
                    {activeKind === 'quest' && (
                      <QuestEditorForm
                        quest={activeEntry as QuestDefinition}
                        modId={modId}
                        contents={contents}
                        issues={activeIssues}
                        onPatch={(patch) => patchQuest(activeEntry.uid, patch)}
                      />
                    )}

                    {/* 7. CRAFTING EDITOR */}
                    {activeKind === 'recipe' && (
                      <CraftingEditorForm
                        recipe={activeEntry as CraftingRecipeDefinition}
                        modId={modId}
                        contents={contents}
                        issues={activeIssues}
                        onPatch={(patch) => patchRecipe(activeEntry.uid, patch)}
                      />
                    )}

                    {/* 8. BUILDING EDITOR */}
                    {activeKind === 'building' && (
                      <BuildingEditorForm
                        building={activeEntry as BuildingDefinition}
                        modId={modId}
                        assets={assets}
                        issues={activeIssues}
                        onPatch={(patch) => patchBuilding(activeEntry.uid, patch)}
                        onPreviewAssetIn3D={onPreviewAssetIn3D}
                      />
                    )}

                    {/* 9. SPAWN EDITOR */}
                    {activeKind === 'spawn' && (
                      <SpawnEditorForm
                        spawn={activeEntry as SpawnDefinition}
                        modId={modId}
                        contents={contents}
                        issues={activeIssues}
                        onPatch={(patch) => patchSpawn(activeEntry.uid, patch)}
                      />
                    )}

                    {/* 10. ANIMATION CONFIG */}
                    {activeKind === 'animation' && (
                      <AnimationConfigForm
                        anim={activeEntry as AnimationConfigEntry}
                        contents={contents}
                        assets={assets}
                        issues={activeIssues}
                        onPatch={(patch, opts) =>
                          patchAnimation(activeEntry.uid, patch, opts)
                        }
                      />
                    )}

                    {/* 11. AUDIO CONFIG */}
                    {activeKind === 'audio' && (
                      <AudioConfigForm
                        cue={activeEntry as AudioConfigEntry}
                        assets={assets}
                        issues={activeIssues}
                        onPatch={(patch, opts) =>
                          patchAudioCue(activeEntry.uid, patch, opts)
                        }
                      />
                    )}

                    {/* 12. MATERIAL CONFIG */}
                    {activeKind === 'material' && (
                      <MaterialConfigForm
                        mat={activeEntry as MaterialConfigEntry}
                        assets={assets}
                        issues={activeIssues}
                        onPatch={(patch, opts) =>
                          patchMaterial(activeEntry.uid, patch, opts)
                        }
                      />
                    )}

                    {/* 13. LOOT TABLE EDITOR */}
                    {activeKind === 'loot_table' && (
                      <LootTableConfigForm
                        table={activeEntry as LootTableDefinition}
                        modId={modId}
                        availableItemIds={availableLootItemIds}
                        issues={activeIssues}
                        onPatch={(patch) => patchLootTable(activeEntry.uid, patch)}
                      />
                    )}

                    {/* 14. DIALOGUE TREE EDITOR */}
                    {activeKind === 'dialogue' && (
                      <DialogueTreeConfigForm
                        tree={activeEntry as DialogueTreeDefinition}
                        modId={modId}
                        contents={contents}
                        issues={activeIssues}
                        onPatch={(patch, opts) =>
                          patchDialogueTree(activeEntry.uid, patch, opts)
                        }
                      />
                    )}

                    {/* 15. WORLD OBJECT EDITOR */}
                    {activeKind === 'world_object' && (
                      <WorldObjectConfigForm
                        worldObject={activeEntry as WorldObjectDefinition}
                        contents={contents}
                        assets={assets}
                        issues={activeIssues}
                        onPatch={(patch) => patchWorldObject(activeEntry.uid, patch)}
                        onPreviewAssetIn3D={onPreviewAssetIn3D}
                      />
                    )}

                    {/* WORLD SPAWNING SECTION (Supported Content Definitions) */}
                    {(activeKind === 'item' ||
                      activeKind === 'weapon' ||
                      activeKind === 'armor' ||
                      activeKind === 'npc' ||
                      activeKind === 'monster' ||
                      activeKind === 'building' ||
                      activeKind === 'world_object') && (
                      <WorldSpawnConfigSection
                        kind={activeKind as WorldSpawnContentKind}
                        entryId={activeEntry.id}
                        entryName={activeEntry.name}
                        modelPath={
                          'model' in activeEntry && typeof activeEntry.model === 'string'
                            ? activeEntry.model
                            : undefined
                        }
                        footprint={
                          activeKind === 'building'
                            ? (activeEntry as BuildingDefinition).footprint
                            : undefined
                        }
                        assets={assets}
                        contents={contents}
                        spawnConfig={
                          'spawnConfig' in activeEntry
                            ? (activeEntry as { spawnConfig?: ContentSpawnConfig }).spawnConfig
                            : undefined
                        }
                        issues={activeIssues}
                        onChange={(spawnConfig) => {
                          if (activeKind === 'item') patchItem(activeEntry.uid, { spawnConfig });
                          else if (activeKind === 'weapon') patchWeapon(activeEntry.uid, { spawnConfig });
                          else if (activeKind === 'armor') patchArmor(activeEntry.uid, { spawnConfig });
                          else if (activeKind === 'npc') patchNpc(activeEntry.uid, { spawnConfig });
                          else if (activeKind === 'monster') patchMonster(activeEntry.uid, { spawnConfig });
                          else if (activeKind === 'building') patchBuilding(activeEntry.uid, { spawnConfig });
                          else patchWorldObject(activeEntry.uid, { spawnConfig });
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
