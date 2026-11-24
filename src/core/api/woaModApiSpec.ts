import { t } from '@/src/i18n';
import { ModCompatibilityInfo, ModManifest, TargetPlatform } from '@/src/types/mod';

export const WOA_MOD_API_SCHEMA = 'woa.mod-api.v1';
export const WOA_MOD_API_VERSION = '1.0.0';
export const WOA_PACKAGE_FORMAT_VERSION = 2;
export const WOA_COMPATIBLE_PACKAGE_FORMATS = [1, 2];

export interface ModApiSchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ModApiDomainSpec {
  id: string;
  title: string;
  file: string;
  schemaId: string;
  sinceApiVersion: string;
  summary: string;
  fields: ModApiSchemaField[];
  exampleJson: string;
}

export interface PackageCompatibilityRule {
  formatVersion: number;
  label: string;
  gameVersions: string;
  supportedFiles: string[];
  migrationBehavior: string;
}

export const WOA_COMPATIBILITY_MATRIX: PackageCompatibilityRule[] = [
  {
    formatVersion: 1,
    label: '.woamod Format v1 (Legacy Manifest)',
    gameVersions: '1.7.x – 1.9.x',
    supportedFiles: [
      'mod.json / mod.manifest.json',
      'data/items.json, data/weapons.json, data/armor.json, data/npcs.json, data/monsters.json',
      'localization/en.json',
      'assets/models/*, assets/textures/*, assets/sounds/*',
    ],
    migrationBehavior:
      'Automatically upgraded on load by WoA 1.8+ / 2.0: missing extended registries (lootTables, dialogues, worldObjects, animations, audio, materials) initialize empty without breaking existing IDs.',
  },
  {
    formatVersion: 2,
    label: '.woamod Format v2 (Data-Driven Mod API v1)',
    gameVersions: '1.8.x – 2.0+',
    supportedFiles: [
      'mod.json ($schema: woa.mod.v1) + compatibility.json',
      'All core content registries + data/characters.json + data/creatures.json',
      'data/animations.json, data/audio.json, data/materials.json, data/loot_tables.json, data/dialogues.json, data/world_objects.json, data/load_order.json',
      'localization/<locale>.json (multi-language)',
    ],
    migrationBehavior:
      'Preserves all v1 directory paths and manifest keys while embedding explicit compatibility metadata, deterministic load order rules, and declarative engine bindings.',
  },
];

export const WOA_MOD_API_DOMAINS: ModApiDomainSpec[] = [
  {
    id: 'manifest',
    title: 'Manifest & Load Order',
    file: 'mod.json / data/load_order.json',
    schemaId: 'woa.mod.v1',
    sinceApiVersion: '1.0.0',
    summary:
      'Top-level declarative metadata, version bounds, dependency constraints, and deterministic module load ordering. No native binaries or DLLs permitted for standard mods.',
    fields: [
      { name: 'modId', type: 'string (reverse-domain)', required: true, description: 'Unique namespace prefix for all registered IDs (e.g. com.studio.skyreach).' },
      { name: 'version', type: 'string (SemVer)', required: true, description: 'Semantic version used for dependency constraint resolution.' },
      { name: 'modApiVersion', type: 'string', required: true, description: 'Mod API contract version targeting e.g. "1.0.0".' },
      { name: 'packageFormatVersion', type: 'number', required: true, description: 'Archive layout version (2 for current .woamod, backward-compatible with 1).' },
      { name: 'compatibility.requiresNativeCode', type: 'boolean (false)', required: true, description: 'Always false for standard data-driven mods across Windows and Android.' },
      { name: 'loadOrder', type: '{ priority, loadAfter[], loadBefore[] }', required: false, description: 'Deterministic override ordering relative to core or companion mods.' },
    ],
    exampleJson: JSON.stringify(
      {
        $schema: 'woa.mod.v1',
        packageFormatVersion: 2,
        modApiSchema: 'woa.mod-api.v1',
        modApiVersion: '1.0.0',
        modId: 'com.adventureforge.skyreach_relics',
        version: '1.2.0',
        compatibility: {
          executionMode: 'data-driven',
          requiresNativeCode: false,
          minGameVersion: '1.8.0',
          maxGameVersion: '2.0.x',
          compatiblePackageFormats: [1, 2],
        },
        loadOrder: {
          priority: 100,
          loadAfter: ['woa.core'],
          loadBefore: [],
        },
      },
      null,
      2
    ),
  },
  {
    id: 'entities_gear',
    title: 'Items, Weapons, Armor, NPCs & Creatures',
    file: 'data/items.json · weapons.json · armor.json · npcs.json · monsters.json',
    schemaId: 'woa.content.v1',
    sinceApiVersion: '1.0.0',
    summary:
      'Every content record uses namespaced "modId:object_id" identifiers resolved by the World of Adventure data registry at boot without native scripting.',
    fields: [
      { name: 'id', type: 'string (modId:object_id)', required: true, description: 'Cross-mod unique content identifier.' },
      { name: 'name / description', type: 'string', required: true, description: 'Fallback display text (overridable via localization/<locale>.json).' },
      { name: 'model / icon / sound', type: 'asset path or woa:*', required: true, description: 'Verified relative archive asset path under assets/ or engine built-in URI.' },
      { name: 'loot', type: 'LootDropEntry[]', required: false, description: 'Inline probabilistic drops or reference to data/loot_tables.json.' },
    ],
    exampleJson: JSON.stringify(
      {
        $schema: 'woa.content.v1',
        contentType: 'weapon',
        entries: [
          {
            id: 'com.adventureforge.skyreach_relics:relic_broadsword',
            name: 'Relic Broadsword',
            damage: 34,
            attackSpeed: 1.15,
            range: 2.6,
            animation: 'swing_two_handed',
            sound: 'woa:sfx/sword_resonance',
            model: 'assets/models/relic_broadsword.woa3d',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'quests_dialogue',
    title: 'Quests, Branches & Dialogue Trees',
    file: 'data/quests.json · data/dialogues.json',
    schemaId: 'woa.dialogue.v1',
    sinceApiVersion: '1.0.0',
    summary:
      'Declarative quest state machines (kill, collect, talk, reach_location) linked cleanly to directed acyclic quest chains and branching NPC dialogue trees.',
    fields: [
      { name: 'chain.prerequisiteQuestIds', type: 'string[]', required: false, description: 'Quests that must reach Completed state before offer.' },
      { name: 'chain.nextQuestId', type: 'string', required: false, description: 'Optional follow-up quest unlocked immediately upon completion.' },
      { name: 'nodes[].choices', type: 'DialogueChoice[]', required: false, description: 'Data-driven player dialogue branches with optional state condition expressions.' },
      { name: 'nodes[].questTriggerId', type: 'string', required: false, description: 'Declarative quest start/advance hook fired when entering the node.' },
    ],
    exampleJson: JSON.stringify(
      {
        $schema: 'woa.dialogue.v1',
        entries: [
          {
            id: 'com.adventureforge.skyreach_relics:warden_kael_tree',
            npcId: 'com.adventureforge.skyreach_relics:warden_kael',
            rootNodeId: 'node_greeting',
            nodes: [
              {
                id: 'node_greeting',
                speakerName: 'Warden Kael',
                mood: 'quest',
                text: 'The ridge beacon went dark at dawn. Will you help?',
                choices: [
                  { id: 'c1', label: 'I will recalibrate it.', nextNodeId: 'node_accept' },
                ],
              },
            ],
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'world_loot_spawns',
    title: 'World Objects, Loot Tables, Buildings & Spawns',
    file: 'data/world_objects.json · loot_tables.json · buildings.json · spawns.json',
    schemaId: 'woa.world.v1',
    sinceApiVersion: '1.0.0',
    summary:
      'Data-driven placement of interactive shrines, chests, portals, doors, harvest nodes, modular buildings, weighted loot tables, and regional spawn rules.',
    fields: [
      { name: 'objectType', type: 'shrine | chest | portal | door | harvest_node | prop | trigger_zone', required: true, description: 'Engine interaction handler bound declaratively.' },
      { name: 'lootTableId', type: 'string (modId:loot_id)', required: false, description: 'Shared weighted drop table from data/loot_tables.json.' },
      { name: 'biomes / timeOfDay', type: 'string[] / enum', required: true, description: 'Region and day/night filters enforced by the world streaming scheduler.' },
    ],
    exampleJson: JSON.stringify(
      {
        $schema: 'woa.world_object.v1',
        entries: [
          {
            id: 'com.adventureforge.skyreach_relics:ridge_waystone_shrine',
            objectType: 'shrine',
            model: 'assets/models/skyreach_waystone.woa3d',
            biome: 'skyreach_highlands',
            interactionPrompt: 'Attune Waystone',
            collisionEnabled: true,
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'presentation',
    title: 'Animations, Audio Cues, Materials & Localization',
    file: 'data/animations.json · audio.json · materials.json · localization/*.json',
    schemaId: 'woa.presentation.v1',
    sinceApiVersion: '1.0.0',
    summary:
      'Cross-platform PBR material presets, spatial audio cues, animation timing/hit-frame triggers, and multi-locale string tables loaded dynamically by the engine.',
    fields: [
      { name: 'animations[].hitFrameNormalized', type: 'number (0..1)', required: true, description: 'Normalized timeline trigger for weapon damage/sound events.' },
      { name: 'audioCues[].bus', type: 'sfx | ambience | music | ui', required: true, description: 'Mixer bus routing and spatial attenuation distance.' },
      { name: 'materials[].shaderProfile', type: 'pbr_standard | crystal_emissive | ...', required: true, description: 'Platform-safe shader preset compatible with Windows & Android.' },
      { name: 'localization/<locale>.json', type: 'Record<string, string>', required: true, description: 'Key-value localized string map resolved by key fallback to "en".' },
    ],
    exampleJson: JSON.stringify(
      {
        $schema: 'woa.audio.v1',
        entries: [
          {
            id: 'com.adventureforge.skyreach_relics:sfx_waystone_chime',
            bus: 'sfx',
            assetPath: 'assets/sounds/waystone_chime.wav',
            volume: 0.85,
            spatial: true,
            maxDistanceMeters: 28,
          },
        ],
      },
      null,
      2
    ),
  },
];

export function buildModCompatibilityInfo(
  manifest: ModManifest,
  targetPlatform: TargetPlatform
): ModCompatibilityInfo {
  return {
    modApiSchema: WOA_MOD_API_SCHEMA,
    modApiVersion: manifest.modApiVersion || WOA_MOD_API_VERSION,
    packageFormatVersion: manifest.packageFormatVersion || WOA_PACKAGE_FORMAT_VERSION,
    compatiblePackageFormats: [...WOA_COMPATIBLE_PACKAGE_FORMATS],
    supportedGameVersion: manifest.supportedGameVersion,
    minGameVersion: manifest.minGameVersion || '1.8.0',
    maxGameVersion: manifest.maxGameVersion || '2.0.x',
    executionModel: 'data-driven',
    requiresNativeCode: false,
    backwardCompatible: true,
    targetPlatforms:
      targetPlatform === 'universal'
        ? manifest.targetPlatforms
        : [targetPlatform],
  };
}

export function getWoaCompatibilityMatrix(): PackageCompatibilityRule[] {
  return WOA_COMPATIBILITY_MATRIX.map((rule) =>
    rule.formatVersion === 1
      ? {
          ...rule,
          label: t('apiSpec.compat.v1.label'),
          migrationBehavior: t('apiSpec.compat.v1.migration'),
        }
      : {
          ...rule,
          label: t('apiSpec.compat.v2.label'),
          migrationBehavior: t('apiSpec.compat.v2.migration'),
        }
  );
}

const FIELD_DESC_KEY_BY_NAME: Record<string, Parameters<typeof t>[0]> = {
  modId: 'apiSpec.field.modId',
  version: 'apiSpec.field.version',
  modApiVersion: 'apiSpec.field.modApiVersion',
  packageFormatVersion: 'apiSpec.field.packageFormatVersion',
  'compatibility.requiresNativeCode': 'apiSpec.field.requiresNative',
  loadOrder: 'apiSpec.field.loadOrder',
  id: 'apiSpec.field.id',
  'name / description': 'apiSpec.field.nameDesc',
  'model / icon / sound': 'apiSpec.field.assetRefs',
  loot: 'apiSpec.field.loot',
  'chain.prerequisiteQuestIds': 'apiSpec.field.prereqQuests',
  'chain.nextQuestId': 'apiSpec.field.nextQuest',
  'nodes[].choices': 'apiSpec.field.choices',
  'nodes[].questTriggerId': 'apiSpec.field.questTrigger',
  objectType: 'apiSpec.field.objectType',
  lootTableId: 'apiSpec.field.lootTableId',
  'biomes / timeOfDay': 'apiSpec.field.biomesTime',
  'animations[].hitFrameNormalized': 'apiSpec.field.hitFrame',
  'audioCues[].bus': 'apiSpec.field.audioBus',
  'materials[].shaderProfile': 'apiSpec.field.shaderProfile',
  'localization/<locale>.json': 'apiSpec.field.locTable',
};

export function getWoaModApiDomains(): ModApiDomainSpec[] {
  return WOA_MOD_API_DOMAINS.map((domain) => ({
    ...domain,
    title: t(`apiSpec.domain.${domain.id}.title` as Parameters<typeof t>[0]),
    summary: t(`apiSpec.domain.${domain.id}.summary` as Parameters<typeof t>[0]),
    fields: domain.fields.map((f) => ({
      ...f,
      description: FIELD_DESC_KEY_BY_NAME[f.name]
        ? t(FIELD_DESC_KEY_BY_NAME[f.name])
        : f.description,
    })),
  }));
}

export function buildModApiSpecJson(): string {
  return JSON.stringify(
    {
      $schema: 'https://worldofadventure.dev/schemas/mod-api.v1.json',
      apiSchema: WOA_MOD_API_SCHEMA,
      apiVersion: WOA_MOD_API_VERSION,
      packageFormatVersion: WOA_PACKAGE_FORMAT_VERSION,
      compatiblePackageFormats: WOA_COMPATIBLE_PACKAGE_FORMATS,
      executionModel: 'data-driven',
      requiresNativeCode: false,
      domains: WOA_MOD_API_DOMAINS.map((d) => ({
        id: d.id,
        title: d.title,
        file: d.file,
        schemaId: d.schemaId,
        sinceApiVersion: d.sinceApiVersion,
        fields: d.fields,
      })),
      compatibilityMatrix: WOA_COMPATIBILITY_MATRIX,
    },
    null,
    2
  );
}
