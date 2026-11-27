import { CURRENT_MOD_CONTENT_SCHEMA_VERSION } from '@/src/core/api/woaModApiSpec';
import { serializeWoa3dAsset } from '@/src/core/assets/assetPipeline';
import {
  createEmptyContentDatabase,
  syncContentFilesInProject,
} from '@/src/core/content/contentRegistry';
import { t } from '@/src/i18n';
import {
  ModAsset,
  ModCategory,
  ModContentDatabase,
  ModFileNode,
  ModProject,
  ModTemplateId,
} from '@/src/types/mod';

export interface ModTemplateDefinition {
  id: ModTemplateId;
  label: string;
  tagline: string;
  description: string;
  recommendedCategories: ModCategory[];
}

export const MOD_TEMPLATES: ModTemplateDefinition[] = [
  {
    id: 'blank',
    label: 'Blank Standard',
    tagline: 'Clean starter structure',
    description:
      'Minimal scaffold with a single 3D placeholder asset, localization, and core manifest.',
    recommendedCategories: ['Items'],
  },
  {
    id: 'weapon-pack',
    label: 'Weapon Pack',
    tagline: 'Blade, crafting recipe & animation',
    description:
      'Includes a custom 3D sword, weapon stats, swing animation & audio cue configs, and forge recipe.',
    recommendedCategories: ['Weapons', 'Items', 'Audio'],
  },
  {
    id: 'quest-npc',
    label: 'Quest & NPC Story',
    tagline: 'NPC, dialogue tree, quest & reward',
    description:
      'Starter quest-giver NPC with a branching dialogue tree, multi-step quest, and reward item.',
    recommendedCategories: ['Quests', 'Entities', 'Items'],
  },
  {
    id: 'building-dungeon',
    label: 'Building Expansion',
    tagline: 'Structure, world object & loot',
    description:
      'Buildable outpost prefab with placement sockets, PBR material preset, interactive shrine, and loot table.',
    recommendedCategories: ['Blocks', 'Items'],
  },
  {
    id: 'biome-creature',
    label: 'Biome & Creature Pack',
    tagline: 'Monster, spawn rule & loot drops',
    description:
      'Custom sentinel creature with AI combat stats, biome spawn rule, and weighted loot drops.',
    recommendedCategories: ['Biomes', 'Entities', 'Items'],
  },
  {
    id: 'character-mod',
    label: 'Character Mod',
    tagline: 'Playable hero gear, animations & AI logic',
    description:
      'Character armor cuirass, idle/walk animation config, and reusable character prefab.',
    recommendedCategories: ['Entities', 'Items'],
  },
  {
    id: 'npc-mod',
    label: 'NPC Mod',
    tagline: 'Villager NPC, dialogue graph & patrol AI',
    description:
      'Includes an interactive NPC with bilingual dialogue nodes, patrol AI behavior graph, and town outpost.',
    recommendedCategories: ['Entities', 'Quests'],
  },
  {
    id: 'quest-mod',
    label: 'Quest Mod',
    tagline: 'Multi-branch quest chain & event logic',
    description:
      'Adventure quest arc with optional objectives, visual event logic graph, and expedition rewards.',
    recommendedCategories: ['Quests', 'Items'],
  },
  {
    id: 'item-mod',
    label: 'Item & Loot Mod',
    tagline: 'Consumables, workbench recipe & weighted drops',
    description:
      'Pack of frontier items with rarity progression, crafting recipe, and biome-weighted loot table.',
    recommendedCategories: ['Items'],
  },
  {
    id: 'audio-mod',
    label: 'Audio Mod',
    tagline: 'Spatial SFX, biome ambience & fade curves',
    description:
      'Data-driven spatial audio cues with fade envelopes, distance attenuation, and trigger events.',
    recommendedCategories: ['Audio'],
  },
  {
    id: 'complete-mod',
    label: 'Complete SDK Mod',
    tagline: 'Full showcase: World, Prefabs, AI, Logic & Combat',
    description:
      'End-to-end starter SDK project with weapons, items, NPCs, creatures, prefabs, world map, procedural rules, AI & logic graphs.',
    recommendedCategories: ['Weapons', 'Items', 'Entities', 'Biomes', 'Quests', 'Blocks', 'Audio'],
  },
];

export function getLocalizedModTemplates(): ModTemplateDefinition[] {
  return MOD_TEMPLATES.map((tpl) => ({
    ...tpl,
    label: t(`tpl.${tpl.id}.label` as Parameters<typeof t>[0]),
    tagline: t(`tpl.${tpl.id}.tagline` as Parameters<typeof t>[0]),
    description: t(`tpl.${tpl.id}.description` as Parameters<typeof t>[0]),
  }));
}

export function applyTemplateToProject(
  project: ModProject,
  templateId: ModTemplateId
): ModProject {
  if (templateId === 'blank') {
    return project;
  }

  const modId = project.manifest.modId;
  const now = project.manifest.createdAt;
  const db: ModContentDatabase = createEmptyContentDatabase();
  const extraAssets: ModAsset[] = [];
  const extraFiles: ModFileNode[] = [];

  const registerModelAsset = (
    id: string,
    name: string,
    fileName: string,
    preset: ModAsset['preset'],
    modCategory: ModAsset['modCategory'],
    color: string,
    accentColor: string,
    triangles = 1200
  ): ModAsset => {
    const asset: ModAsset = {
      id,
      name,
      path: `assets/models/${fileName}`,
      type: '3d-model',
      modCategory,
      preset,
      format: 'WOA3D',
      sizeBytes: 18500,
      triangleEstimate: triangles,
      pivotMode: 'bottom-center',
      collision: { shape: 'box', scale: 1, offsetY: 0 },
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: {
        color,
        accentColor,
        roughness: 0.32,
        metalness: 0.72,
        emissiveIntensity: 0.35,
        wireframe: false,
      },
      metadata: { lodLevels: 2, castShadows: true },
      createdAt: now,
    };
    extraAssets.push(asset);
    extraFiles.push({
      id: `file_${id}`,
      name: fileName,
      path: asset.path,
      parentPath: 'assets/models',
      type: 'asset-3d',
      assetId: id,
      content: serializeWoa3dAsset({
        ...asset,
        schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      }),
      updatedAt: now,
    });
    return asset;
  };

  if (templateId === 'weapon-pack') {
    const blade = registerModelAsset(
      `asset_${Date.now()}_blade`,
      'Sunsteel Greatsword',
      'sunsteel_greatsword.woa3d',
      'relic-sword',
      'Weapon',
      '#64748B',
      '#F59E0B',
      1420
    );
    db.items.push({
      uid: 'tpl_item_ingot',
      id: `${modId}:sunsteel_ingot`,
      name: 'Sunsteel Ingot',
      description: 'Refined solar alloy forged for masterwork blades.',
      icon: 'woa:icons/ingot_gold.png',
      stackSize: 64,
      weight: 0.8,
      value: 95,
      rarity: 'rare',
      category: 'material',
      updatedAt: now,
    });
    db.weapons.push({
      uid: 'tpl_wpn_greatsword',
      id: `${modId}:sunsteel_greatsword`,
      name: 'Sunsteel Greatsword',
      description: 'Heavy radiant blade that cleaves armored foes with ember arcs.',
      damage: 42,
      attackSpeed: 1.1,
      range: 2.7,
      durability: 420,
      criticalChance: 14,
      projectile: {
        enabled: false,
        projectileId: '',
        speed: 20,
        gravity: 0,
        spreadDegrees: 0,
        pierceCount: 0,
      },
      animation: 'swing_two_handed',
      sound: 'woa:audio/sword_heavy_swing.ogg',
      model: blade.path,
      icon: 'woa:icons/sword_gold.png',
      updatedAt: now,
    });
    db.recipes.push({
      uid: 'tpl_rec_greatsword',
      id: `${modId}:craft_sunsteel_greatsword`,
      name: 'Forge Sunsteel Greatsword',
      description: 'Smelt Sunsteel Ingots into a radiant greatsword.',
      station: 'forge',
      craftTimeSeconds: 6,
      outputItemId: `${modId}:sunsteel_greatsword`,
      outputQuantity: 1,
      ingredients: [{ id: 'ing_1', itemId: `${modId}:sunsteel_ingot`, quantity: 4 }],
      unlockedByDefault: true,
      updatedAt: now,
    });
    db.animations = [
      {
        uid: 'tpl_anim_cleave',
        id: `${modId}:anim_sunsteel_cleave`,
        name: 'Sunsteel Heavy Cleave',
        description: 'Two-handed arc swing with timed hit window.',
        targetType: 'weapon',
        clipName: 'swing_two_handed',
        speed: 1.05,
        blendSeconds: 0.14,
        loop: false,
        hitFrameNormalized: 0.52,
        soundCueId: `${modId}:sfx_sunsteel_swing`,
        updatedAt: now,
      },
    ];
    db.audioCues = [
      {
        uid: 'tpl_sfx_swing',
        id: `${modId}:sfx_sunsteel_swing`,
        name: 'Sunsteel Swing Cue',
        description: 'Metallic cleave whoosh sound event.',
        bus: 'sfx',
        assetPath: 'woa:audio/sword_heavy_swing.ogg',
        volume: 0.9,
        pitchMin: 0.94,
        pitchMax: 1.06,
        spatial: true,
        maxDistanceMeters: 22,
        loop: false,
        updatedAt: now,
      },
    ];
  } else if (templateId === 'quest-npc') {
    const npcModelAsset = registerModelAsset(
      `asset_${Date.now()}_npc_lyra`,
      'Archivist Lyra Model',
      'archivist_lyra.woa3d',
      'beacon-pedestal',
      'NPC',
      '#3B4A62',
      '#F59E0B',
      1180
    );
    db.items.push({
      uid: 'tpl_item_seal',
      id: `${modId}:cartographer_seal`,
      name: 'Cartographer Seal',
      description: 'Stamped brass insignia awarded to frontier scouts.',
      icon: 'woa:icons/quest_seal.png',
      stackSize: 10,
      weight: 0.2,
      value: 150,
      rarity: 'uncommon',
      category: 'quest',
      updatedAt: now,
    });
    db.npcs.push({
      uid: 'tpl_npc_elder',
      id: `${modId}:archivist_lyra`,
      name: 'Archivist Lyra',
      description: 'Chronicler seeking lost wayfarer markers across the frontier.',
      model: npcModelAsset.path,
      health: 180,
      movementSpeed: 3.1,
      behaviorType: 'quest_giver',
      dialogue: [
        {
          id: 'dlg_1',
          speakerMood: 'quest',
          text: 'The northern ridge beacons have fallen silent. Could you inspect them?',
        },
      ],
      faction: 'wayfarers',
      loot: [],
      questReferences: [`${modId}:survey_the_ridge`],
      updatedAt: now,
    });
    db.quests.push({
      uid: 'tpl_quest_ridge',
      id: `${modId}:survey_the_ridge`,
      name: 'Survey the Ridge',
      description: 'Locate the frontier beacon and recover the Cartographer Seal.',
      questType: 'main',
      chapterOrRegion: 'Frontier Plains',
      recommendedLevel: 3,
      giverNpcId: `${modId}:archivist_lyra`,
      repeatable: false,
      objectives: [
        {
          id: 'obj_1',
          type: 'talk',
          summary: 'Speak with Archivist Lyra',
          targetId: `${modId}:archivist_lyra`,
          requiredCount: 1,
        },
        {
          id: 'obj_2',
          type: 'collect',
          summary: 'Deliver Cartographer Seal',
          targetId: `${modId}:cartographer_seal`,
          requiredCount: 1,
          consumeOnComplete: false,
        },
      ],
      rewards: {
        xp: 350,
        gold: 120,
        reputationFaction: 'wayfarers',
        reputationAmount: 100,
        items: [{ id: 'rew_1', itemId: `${modId}:cartographer_seal`, quantity: 1 }],
      },
      dialogue: [
        {
          id: 'q_offer',
          stage: 'offer',
          speakerNpcId: `${modId}:archivist_lyra`,
          text: 'Bring word from the ridge beacon and I will grant you our guild seal.',
        },
        {
          id: 'q_done',
          stage: 'complete',
          speakerNpcId: `${modId}:archivist_lyra`,
          text: 'Fine work, scout. Keep the Cartographer Seal as proof of service.',
        },
      ],
      chain: { prerequisiteQuestIds: [], nextQuestId: '' },
      updatedAt: now,
    });
    db.dialogues = [
      {
        uid: 'tpl_dlg_tree_lyra',
        id: `${modId}:dialogue_archivist_lyra`,
        name: 'Archivist Lyra Conversation',
        description: 'Branching introductory conversation with Archivist Lyra.',
        npcId: `${modId}:archivist_lyra`,
        rootNodeId: 'node_start',
        nodes: [
          {
            id: 'node_start',
            speakerName: 'Archivist Lyra',
            speakerNpcId: `${modId}:archivist_lyra`,
            mood: 'quest',
            text: 'Welcome to the archive outpost. Ready for a ridge survey contract?',
            choices: [
              { id: 'c_yes', label: 'Tell me what needs surveying.', nextNodeId: 'node_quest' },
              { id: 'c_no', label: 'Maybe later.', nextNodeId: '' },
            ],
          },
          {
            id: 'node_quest',
            speakerName: 'Archivist Lyra',
            speakerNpcId: `${modId}:archivist_lyra`,
            mood: 'friendly',
            text: 'Head north past the stone bridge and inspect the old beacon plinth.',
            questTriggerId: `${modId}:survey_the_ridge`,
            choices: [],
          },
        ],
        updatedAt: now,
      },
    ];
  } else if (templateId === 'building-dungeon') {
    const outpostAsset = registerModelAsset(
      `asset_${Date.now()}_outpost`,
      'Stone Watchpost',
      'stone_watchpost.woa3d',
      'frontier-crate',
      'Building',
      '#64748B',
      '#38BDF8',
      940
    );
    db.items.push({
      uid: 'tpl_item_stone',
      id: `${modId}:hewn_granite`,
      name: 'Hewn Granite Block',
      description: 'Dressed masonry block used for frontier watchposts.',
      icon: 'woa:icons/stone_block.png',
      stackSize: 99,
      weight: 2.0,
      value: 14,
      rarity: 'common',
      category: 'material',
      updatedAt: now,
    });
    db.buildings.push({
      uid: 'tpl_bld_watchpost',
      id: `${modId}:frontier_watchpost`,
      name: 'Frontier Watchpost',
      description: 'Compact fortified stone shelter with storage beacon.',
      category: 'outpost',
      model: outpostAsset.path,
      footprint: { width: 6, height: 4, depth: 6 },
      pieces: [
        {
          id: 'pc_base',
          name: 'Foundation Plinth',
          model: outpostAsset.path,
          position: { x: 0, y: 0, z: 0 },
          rotationDeg: { x: 0, y: 0, z: 0 },
          scale: 1,
        },
      ],
      materials: [
        {
          id: 'mat_1',
          materialName: 'Hewn Granite Block',
          itemId: `${modId}:hewn_granite`,
          quantity: 12,
        },
      ],
      placementPoints: [
        {
          id: 'pp_anchor',
          name: 'Ground Anchor',
          pointType: 'ground_anchor',
          position: { x: 0, y: 0, z: 0 },
          facingDeg: 0,
        },
      ],
      collision: {
        enabled: true,
        shape: 'box',
        width: 6,
        height: 4,
        depth: 6,
        offsetY: 2,
      },
      doors: [],
      windows: [],
      interactiveObjects: [
        {
          id: 'io_cache',
          name: 'Supply Locker',
          objectType: 'chest',
          targetId: `${modId}:loot_watchpost_chest`,
          position: { x: 1.5, y: 0, z: 1.2 },
          interactionPrompt: 'Open Supply Locker',
        },
      ],
      updatedAt: now,
    });
    db.materials = [
      {
        uid: 'tpl_mat_granite',
        id: `${modId}:mat_weathered_granite`,
        name: 'Weathered Frontier Granite',
        description: 'Rough masonry material preset for stone structures.',
        shaderProfile: 'stone_weathered',
        albedoTexture: '',
        normalTexture: '',
        baseColor: '#64748B',
        metallic: 0.1,
        roughness: 0.82,
        emissiveColor: '#38BDF8',
        emissiveIntensity: 0,
        uvTiling: { x: 2, y: 2 },
        doubleSided: false,
        updatedAt: now,
      },
    ];
    db.lootTables = [
      {
        uid: 'tpl_loot_chest',
        id: `${modId}:loot_watchpost_chest`,
        name: 'Watchpost Supply Chest',
        description: 'Standard supply chest drop table for watchpost rooms.',
        rollsMin: 1,
        rollsMax: 2,
        guaranteeOne: true,
        entries: [
          {
            id: 'drop_1',
            itemId: `${modId}:hewn_granite`,
            minCount: 2,
            maxCount: 6,
            chance: 100,
          },
        ],
        updatedAt: now,
      },
    ];
    const chestAsset = registerModelAsset(
      `asset_${Date.now()}_watchpost_chest`,
      'Watchpost Supply Chest Model',
      'watchpost_chest.woa3d',
      'frontier-crate',
      'Decoration',
      '#7C5A3B',
      '#94A3B8',
      640
    );
    db.worldObjects = [
      {
        uid: 'tpl_wobj_chest',
        id: `${modId}:watchpost_supply_chest`,
        name: 'Watchpost Supply Chest',
        description: 'Interactive chest placed outside frontier watchposts.',
        objectType: 'chest',
        model: chestAsset.path,
        materialConfigId: `${modId}:mat_weathered_granite`,
        audioCueId: '',
        lootTableId: `${modId}:loot_watchpost_chest`,
        questId: '',
        biome: 'frontier_plains',
        position: { x: 4, y: 0, z: 2 },
        rotationDeg: { x: 0, y: 90, z: 0 },
        scale: 1,
        collisionEnabled: true,
        interactionPrompt: 'Loot Watchpost Chest',
        respawnSeconds: 300,
        updatedAt: now,
      },
    ];
  } else if (templateId === 'biome-creature') {
    const sentinelAsset = registerModelAsset(
      `asset_${Date.now()}_stalker`,
      'Frostspire Sentinel',
      'frostspire_sentinel.woa3d',
      'clockwork-sentinel',
      'Monster',
      '#475569',
      '#38BDF8',
      2140
    );
    db.items.push({
      uid: 'tpl_item_core',
      id: `${modId}:frost_core`,
      name: 'Frost Core',
      description: 'Crystalline power cell harvested from Frostspire Sentinels.',
      icon: 'woa:icons/crystal_blue.png',
      stackSize: 20,
      weight: 0.6,
      value: 110,
      rarity: 'rare',
      category: 'material',
      updatedAt: now,
    });
    db.monsters.push({
      uid: 'tpl_mob_sentinel',
      id: `${modId}:frostspire_sentinel`,
      name: 'Frostspire Sentinel',
      description: 'Armored construct patrolling high alpine ridges.',
      model: sentinelAsset.path,
      health: 260,
      damage: 24,
      speed: 3.4,
      detectionRange: 18,
      attackBehavior: 'charge',
      loot: [
        {
          id: 'loot_core',
          itemId: `${modId}:frost_core`,
          minCount: 1,
          maxCount: 2,
          chance: 65,
        },
      ],
      spawnRules: {
        biomes: ['frostspire_peaks'],
        timeOfDay: 'any',
        minGroupSize: 1,
        maxGroupSize: 2,
        spawnWeight: 18,
        minAltitude: 60,
      },
      updatedAt: now,
    });
    db.spawns.push({
      uid: 'tpl_spn_sentinel',
      id: `${modId}:spawn_frostspire_sentinel`,
      name: 'Frostspire Ridge Patrol',
      description: 'Biome spawn rule placing Sentinels along alpine ridges.',
      entityId: `${modId}:frostspire_sentinel`,
      spawnPoints: [
        { id: 'sp_1', label: 'Ridge Overlook', x: 120, y: 88, z: -40, radius: 18, yawDeg: 45 },
      ],
      conditions: {
        minPlayerLevel: 4,
        maxPlayerLevel: 40,
        weather: 'any',
        requiredQuestId: '',
        minLightLevel: 0,
        maxLightLevel: 15,
      },
      biomes: ['frostspire_peaks'],
      timeOfDay: 'any',
      population: { maxPopulation: 6, maxPerChunk: 2, groupMin: 1, groupMax: 2 },
      respawn: {
        enabled: true,
        delaySeconds: 180,
        requirePlayerAway: true,
        minPlayerDistance: 45,
      },
      updatedAt: now,
    });
  } else if (templateId === 'character-mod') {
    const heroAsset = registerModelAsset(
      `asset_${Date.now()}_hero_armor`,
      'Vanguard Armor Set',
      'vanguard_armor.woa3d',
      'beacon-pedestal',
      'Character',
      '#1E293B',
      '#10B981',
      1480
    );
    db.armor.push({
      uid: 'tpl_arm_vanguard',
      id: `${modId}:vanguard_cuirass`,
      name: 'Vanguard Cuirass',
      description: 'Reinforced expedition chestplate engineered for highland scouts.',
      defense: 24,
      durability: 360,
      weight: 5.5,
      slot: 'chest',
      model: heroAsset.path,
      icon: 'woa:icons/armor_chest.png',
      updatedAt: now,
    });
    db.animations = [
      {
        uid: 'tpl_anim_idle',
        id: `${modId}:hero_idle_stance`,
        name: 'Vanguard Idle Stance',
        description: 'Ready stance loop with breathing motion.',
        targetType: 'character',
        clipName: 'idle',
        speed: 1.0,
        blendSeconds: 0.2,
        loop: true,
        hitFrameNormalized: 0.5,
        soundCueId: '',
        updatedAt: now,
      },
    ];
    db.prefabs = [
      {
        uid: 'tpl_prefab_camp',
        id: `${modId}:vanguard_camp_loadout`,
        name: 'Vanguard Loadout Stand',
        description: 'Reusable armor rack prefab for camp outposts.',
        category: 'custom',
        tags: ['character', 'armor'],
        nodes: [
          {
            id: 'arm_stand',
            name: 'Armor Stand',
            parentId: null,
            type: 'Group',
            modelPath: heroAsset.path,
            animationId: `${modId}:hero_idle_stance`,
            transform: {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            },
            properties: {
              color: '#1E293B',
              roughness: 0.4,
              metalness: 0.65,
            },
          },
        ],
        materials: [],
        textures: [],
        animations: [`${modId}:hero_idle_stance`],
        references: { assetPaths: [heroAsset.path], contentIds: [`${modId}:vanguard_cuirass`] },
        instanceCount: 0,
        updatedAt: now,
      },
    ];
  } else if (templateId === 'npc-mod') {
    const merchantAsset = registerModelAsset(
      `asset_${Date.now()}_merchant`,
      'Outpost Quartermaster',
      'outpost_quartermaster.woa3d',
      'beacon-pedestal',
      'NPC',
      '#475569',
      '#38BDF8',
      1240
    );
    db.npcs.push({
      uid: 'tpl_npc_merchant',
      id: `${modId}:quartermaster_orin`,
      name: 'Quartermaster Orin',
      description: 'Frontier caravan trader supplying rations and maps.',
      model: merchantAsset.path,
      health: 200,
      movementSpeed: 2.8,
      behaviorType: 'merchant',
      dialogue: [{ id: 'dlg_orin_1', speakerMood: 'friendly', text: 'Need supplies before heading past the ridge?' }],
      faction: 'wayfarers',
      loot: [],
      questReferences: [],
      aiBehaviorGraphId: `${modId}:merchant_day_cycle`,
      updatedAt: now,
    });
    db.aiBehaviors = [
      {
        uid: 'tpl_ai_npc_town',
        id: `${modId}:merchant_day_cycle`,
        name: 'Merchant Day Schedule',
        description: 'Patrols booth during day and greets nearby players.',
        targetType: 'npc',
        tickIntervalSeconds: 0.5,
        nodes: [
          { id: 's1', kind: 'start', title: 'Start Tick', position: { x: 60, y: 100 } },
          { id: 'c1', kind: 'condition', title: 'Player Nearby?', conditionType: 'player_in_range', conditionValue: 6, position: { x: 280, y: 100 } },
          { id: 'a1', kind: 'action', title: 'Wave & Offer Trade', actionType: 'speak', actionParam: 'Need supplies?', position: { x: 540, y: 50 } },
          { id: 'a2', kind: 'action', title: 'Idle At Stall', actionType: 'patrol', position: { x: 540, y: 170 } },
        ],
        edges: [
          { id: 'e1', fromNodeId: 's1', fromPort: 'out', toNodeId: 'c1', toPort: 'in' },
          { id: 'e2', fromNodeId: 'c1', fromPort: 'true', toNodeId: 'a1', toPort: 'in', label: 'true' },
          { id: 'e3', fromNodeId: 'c1', fromPort: 'false', toNodeId: 'a2', toPort: 'in', label: 'false' },
        ],
        updatedAt: now,
      },
    ];
  } else if (templateId === 'quest-mod') {
    db.items.push({
      uid: 'tpl_item_relic_map',
      id: `${modId}:expedition_ledger`,
      name: 'Expedition Ledger',
      description: 'Waterproof brass-bound journal tracking lost frontier camps.',
      icon: 'woa:icons/quest_seal.png',
      stackSize: 5,
      weight: 0.3,
      value: 180,
      rarity: 'rare',
      category: 'quest',
      updatedAt: now,
    });
    db.quests.push({
      uid: 'tpl_quest_chronicle',
      id: `${modId}:lost_ledger_trail`,
      name: 'The Lost Ledger Trail',
      description: 'Recover the Expedition Ledger and choose whether to return or archive it.',
      questType: 'side',
      chapterOrRegion: 'Sunstone Steppe',
      recommendedLevel: 6,
      giverNpcId: 'woa:npc_guide',
      repeatable: false,
      objectives: [
        { id: 'obj_collect_ledger', type: 'collect', summary: 'Recover the Expedition Ledger', targetId: `${modId}:expedition_ledger`, requiredCount: 1 },
      ],
      endings: [
        { id: 'end_archive', label: 'Archive with Scholars', rewardXpBonus: 150, rewardGoldBonus: 50 },
      ],
      rewards: {
        xp: 450,
        gold: 160,
        reputationFaction: 'wayfarers',
        reputationAmount: 90,
        items: [{ id: 'rew_ledger', itemId: `${modId}:expedition_ledger`, quantity: 1 }],
      },
      dialogue: [{ id: 'qd_offer', stage: 'offer', speakerNpcId: 'woa:npc_guide', text: 'Track down the lost ledger before the sandstorm hits.' }],
      chain: { prerequisiteQuestIds: [], nextQuestId: '' },
      updatedAt: now,
    });
    db.visualLogicGraphs = [
      {
        uid: 'tpl_lg_quest',
        id: `${modId}:ledger_quest_logic`,
        name: 'Ledger Discovery Logic',
        description: 'Advances quest stage when player interacts with ledger cache.',
        triggerEvent: 'on_interact',
        enabled: true,
        variables: { ledgerFound: false },
        nodes: [
          { id: 'evt1', kind: 'event', title: 'On Interact Cache', opCode: 'on_interact', params: {}, position: { x: 70, y: 100 } },
          { id: 'act1', kind: 'variable', title: 'Set ledgerFound = true', opCode: 'set_var', params: { varName: 'ledgerFound', mode: 'set', value: true }, position: { x: 350, y: 100 } },
        ],
        edges: [{ id: 'le1', fromNodeId: 'evt1', fromPort: 'exec', toNodeId: 'act1', toPort: 'exec' }],
        updatedAt: now,
      },
    ];
  } else if (templateId === 'item-mod') {
    db.items.push(
      {
        uid: 'tpl_item_herb',
        id: `${modId}:sunleaf_herb`,
        name: 'Sunleaf Herb',
        description: 'Aromatic alpine leaf prized by frontier apothecaries.',
        icon: 'woa:icons/herb_green.png',
        stackSize: 50,
        weight: 0.1,
        value: 18,
        rarity: 'common',
        category: 'material',
        updatedAt: now,
      },
      {
        uid: 'tpl_item_salve',
        id: `${modId}:sunleaf_salve`,
        name: 'Sunleaf Salve',
        description: 'Restores health steadily during rugged expeditions.',
        icon: 'woa:icons/potion_amber.png',
        stackSize: 16,
        weight: 0.25,
        value: 55,
        rarity: 'uncommon',
        category: 'consumable',
        updatedAt: now,
      }
    );
    db.recipes.push({
      uid: 'tpl_rec_salve',
      id: `${modId}:craft_sunleaf_salve`,
      name: 'Craft Sunleaf Salve',
      description: 'Steep two Sunleaf Herbs over a campfire.',
      station: 'campfire',
      craftTimeSeconds: 2.5,
      outputItemId: `${modId}:sunleaf_salve`,
      outputQuantity: 1,
      ingredients: [{ id: 'ing_herb', itemId: `${modId}:sunleaf_herb`, quantity: 2 }],
      unlockedByDefault: true,
      updatedAt: now,
    });
    db.lootTables = [
      {
        uid: 'tpl_lt_forage',
        id: `${modId}:forage_sunleaf_pool`,
        name: 'Sunleaf Foraging Pool',
        description: 'Weighted drop table for herbalist caches.',
        rollsMin: 1,
        rollsMax: 3,
        guaranteeOne: true,
        entries: [
          { id: 'd_herb', itemId: `${modId}:sunleaf_herb`, minCount: 1, maxCount: 3, chance: 100, weight: 80, guaranteed: true },
          { id: 'd_salve', itemId: `${modId}:sunleaf_salve`, minCount: 1, maxCount: 1, chance: 35, weight: 25 },
        ],
        updatedAt: now,
      },
    ];
  } else if (templateId === 'audio-mod') {
    db.audioCues = [
      {
        uid: 'tpl_aud_wind',
        id: `${modId}:amb_alpine_gale`,
        name: 'Alpine Ridge Ambience',
        description: 'Looping high-altitude wind ambience with gentle fade curves.',
        bus: 'ambience',
        assetPath: 'woa:audio/wind_ridge_loop.ogg',
        volume: 0.72,
        pitchMin: 0.96,
        pitchMax: 1.04,
        spatial: false,
        maxDistanceMeters: 80,
        minDistanceMeters: 4,
        fadeInSeconds: 1.5,
        fadeOutSeconds: 2.0,
        trigger: 'ambient',
        loop: true,
        updatedAt: now,
      },
      {
        uid: 'tpl_aud_chime',
        id: `${modId}:sfx_waystone_chime`,
        name: 'Waystone Attune Chime',
        description: 'Harmonic stone chime played on beacon activation.',
        bus: 'sfx',
        assetPath: 'woa:audio/waystone_chime.ogg',
        volume: 0.95,
        pitchMin: 0.98,
        pitchMax: 1.03,
        spatial: true,
        maxDistanceMeters: 30,
        minDistanceMeters: 2,
        fadeInSeconds: 0.02,
        fadeOutSeconds: 0.4,
        trigger: 'interact',
        loop: false,
        updatedAt: now,
      },
    ];
  } else if (templateId === 'complete-mod') {
    const blade = registerModelAsset(
      `asset_${Date.now()}_sdk_blade`,
      'Aetherfang Saber',
      'aetherfang_saber.woa3d',
      'relic-sword',
      'Weapon',
      '#334155',
      '#38BDF8',
      1520
    );
    const tower = registerModelAsset(
      `asset_${Date.now()}_sdk_tower`,
      'Signal Beacon Tower',
      'signal_beacon_tower.woa3d',
      'beacon-pedestal',
      'Building',
      '#475569',
      '#F59E0B',
      1120
    );
    const sentinel = registerModelAsset(
      `asset_${Date.now()}_sdk_mob`,
      'Ironbound Stalker',
      'ironbound_stalker.woa3d',
      'clockwork-sentinel',
      'Monster',
      '#3F3F46',
      '#EF4444',
      1890
    );
    const captainModel = registerModelAsset(
      `asset_${Date.now()}_sdk_npc`,
      'Captain Soren Model',
      'captain_soren.woa3d',
      'beacon-pedestal',
      'NPC',
      '#3B4A62',
      '#F59E0B',
      1180
    );
    db.items.push({
      uid: 'tpl_c_item',
      id: `${modId}:starlight_ore`,
      name: 'Starlight Ore',
      description: 'Luminiferous ore mined near ridge shrines.',
      icon: 'woa:icons/ore_blue.png',
      stackSize: 64,
      weight: 0.7,
      value: 80,
      rarity: 'rare',
      category: 'material',
      updatedAt: now,
    });
    db.weapons.push({
      uid: 'tpl_c_wpn',
      id: `${modId}:aetherfang_saber`,
      name: 'Aetherfang Saber',
      description: 'Balanced shock-blade with crisp dash recovery.',
      weaponType: 'sword',
      damage: 36,
      attackSpeed: 1.35,
      range: 2.5,
      cooldownSeconds: 0.7,
      staminaCost: 14,
      knockback: 2.4,
      durability: 380,
      criticalChance: 15,
      projectile: { enabled: false, projectileId: '', speed: 20, gravity: 0, spreadDegrees: 0, pierceCount: 0 },
      animation: 'swing_one_handed',
      sound: 'woa:audio/sword_swing.ogg',
      model: blade.path,
      icon: 'woa:icons/saber.png',
      updatedAt: now,
    });
    db.npcs.push({
      uid: 'tpl_c_npc',
      id: `${modId}:captain_soren`,
      name: 'Captain Soren',
      description: 'Expedition commander stationed at the signal beacon.',
      model: captainModel.path,
      health: 260,
      movementSpeed: 3.0,
      behaviorType: 'quest_giver',
      dialogue: [{ id: 'd1', speakerMood: 'quest', text: 'Scout the eastern pines and secure the beacon.' }],
      faction: 'wayfarers',
      loot: [],
      questReferences: [`${modId}:relight_east_beacon`],
      updatedAt: now,
    });
    db.monsters.push({
      uid: 'tpl_c_mob',
      id: `${modId}:ironbound_stalker`,
      name: 'Ironbound Stalker',
      description: 'Clockwork hunter guarding derelict watchtowers.',
      model: sentinel.path,
      health: 240,
      damage: 22,
      speed: 4.1,
      detectionRange: 18,
      patrolRadius: 16,
      aggroRadius: 18,
      fleeHealthPercent: 10,
      attackBehavior: 'charge',
      aiBehaviorGraphId: `${modId}:stalker_behavior`,
      loot: [{ id: 'l1', itemId: `${modId}:starlight_ore`, minCount: 1, maxCount: 2, chance: 75 }],
      spawnRules: { biomes: ['frontier_plains'], timeOfDay: 'any', minGroupSize: 1, maxGroupSize: 2, spawnWeight: 12, minAltitude: 0 },
      updatedAt: now,
    });
    db.quests.push({
      uid: 'tpl_c_quest',
      id: `${modId}:relight_east_beacon`,
      name: 'Relight the East Beacon',
      description: 'Gather Starlight Ore and clear Ironbound Stalkers near the signal tower.',
      questType: 'main',
      chapterOrRegion: 'Frontier Plains',
      recommendedLevel: 8,
      giverNpcId: `${modId}:captain_soren`,
      repeatable: false,
      objectives: [{ id: 'o1', type: 'collect', summary: 'Gather Starlight Ore', targetId: `${modId}:starlight_ore`, requiredCount: 3 }],
      rewards: { xp: 600, gold: 220, reputationFaction: 'wayfarers', reputationAmount: 100, items: [] },
      dialogue: [{ id: 'qd1', stage: 'offer', speakerNpcId: `${modId}:captain_soren`, text: 'Bring three Starlight Ore shards to power the tower.' }],
      chain: { prerequisiteQuestIds: [], nextQuestId: '' },
      updatedAt: now,
    });
    db.buildings.push({
      uid: 'tpl_c_bld',
      id: `${modId}:signal_beacon_tower`,
      name: 'Signal Beacon Tower',
      description: 'Modular watchtower with supply chest and anchor socket.',
      category: 'outpost',
      model: tower.path,
      footprint: { width: 8, height: 8, depth: 8 },
      pieces: [{ id: 'p1', name: 'Base Tower', model: tower.path, position: { x: 0, y: 0, z: 0 }, rotationDeg: { x: 0, y: 0, z: 0 }, scale: 1 }],
      materials: [{ id: 'm1', materialName: 'Starlight Stone', itemId: `${modId}:starlight_ore`, quantity: 4 }],
      placementPoints: [{ id: 'pp1', name: 'Base Anchor', pointType: 'ground_anchor', position: { x: 0, y: 0, z: 0 }, facingDeg: 0 }],
      collision: { enabled: true, shape: 'box', width: 8, height: 8, depth: 8, offsetY: 4 },
      doors: [],
      windows: [],
      interactiveObjects: [],
      updatedAt: now,
    });
    db.prefabs = [
      {
        uid: 'tpl_c_prefab',
        id: `${modId}:beacon_camp_prefab`,
        name: 'Signal Camp Prefab',
        description: 'Combined tower + camp brazier prefab ready for world placement.',
        category: 'camp',
        tags: ['camp', 'beacon'],
        nodes: [
          {
            id: 'node_tower',
            name: 'Signal Tower',
            parentId: null,
            type: 'Group',
            modelPath: tower.path,
            transform: {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            },
            properties: {
              color: '#475569',
              roughness: 0.65,
              metalness: 0.3,
            },
          },
        ],
        materials: [],
        textures: [],
        animations: [],
        references: { assetPaths: [tower.path], contentIds: [`${modId}:signal_beacon_tower`] },
        instanceCount: 1,
        updatedAt: now,
      },
    ];
    db.aiBehaviors = [
      {
        uid: 'tpl_c_ai',
        id: `${modId}:stalker_behavior`,
        name: 'Stalker Hunt AI',
        description: 'Patrols ridge, chases intruders in aggro radius, retreats on critical HP.',
        targetType: 'creature',
        tickIntervalSeconds: 0.4,
        nodes: [
          { id: 's1', kind: 'start', title: 'Start Tick', position: { x: 60, y: 120 } },
          { id: 'c1', kind: 'condition', title: 'HP <= Flee %?', conditionType: 'health_below', conditionValue: 15, position: { x: 270, y: 60 } },
          { id: 'c2', kind: 'condition', title: 'Player In Aggro?', conditionType: 'player_in_range', conditionValue: 18, position: { x: 270, y: 200 } },
          { id: 'a1', kind: 'action', title: 'Flee To Cover', actionType: 'flee', position: { x: 540, y: 40 } },
          { id: 'a2', kind: 'action', title: 'Charge Attack', actionType: 'attack', position: { x: 540, y: 160 } },
          { id: 'a3', kind: 'action', title: 'Patrol Perimeter', actionType: 'patrol', position: { x: 540, y: 270 } },
        ],
        edges: [
          { id: 'e1', fromNodeId: 's1', fromPort: 'out', toNodeId: 'c1', toPort: 'in' },
          { id: 'e2', fromNodeId: 'c1', fromPort: 'true', toNodeId: 'a1', toPort: 'in', label: 'true' },
          { id: 'e3', fromNodeId: 'c1', fromPort: 'false', toNodeId: 'c2', toPort: 'in', label: 'false' },
          { id: 'e4', fromNodeId: 'c2', fromPort: 'true', toNodeId: 'a2', toPort: 'in', label: 'true' },
          { id: 'e5', fromNodeId: 'c2', fromPort: 'false', toNodeId: 'a3', toPort: 'in', label: 'false' },
        ],
        updatedAt: now,
      },
    ];
    db.worldMaps = [
      {
        uid: 'tpl_c_wmap',
        id: `${modId}:eastern_reach_map`,
        name: 'Eastern Reach Sector',
        description: 'Top-down world layout with coastal water exclusion and signal camp.',
        regionName: 'Eastern Reach',
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
            id: 'plc_camp_1',
            name: 'Signal Camp #1',
            kind: 'prefab',
            refId: `${modId}:beacon_camp_prefab`,
            layerId: 'layer_structures',
            biome: 'frontier_plains',
            position: { x: 32, y: 12, z: -48 },
            rotationYDeg: 0,
            scale: 1,
            radius: 6,
          },
          {
            id: 'wz_bay',
            name: 'East Estuary',
            kind: 'water_zone',
            refId: '',
            layerId: 'layer_terrain',
            biome: 'coastal',
            position: { x: 0, y: 0, z: 180 },
            rotationYDeg: 0,
            scale: 1,
            radius: 68,
          },
        ],
        updatedAt: now,
      },
    ];
    db.proceduralRules = [
      {
        uid: 'tpl_c_proc',
        id: `${modId}:pine_grove_rule`,
        name: 'Frontier Pine Scatter',
        description: 'Seeded pine placement avoiding water and steep cliffs.',
        seed: 4040,
        targetWorldMapId: `${modId}:eastern_reach_map`,
        objectKind: 'tree',
        targetRefId: 'woa:props/frontier_pine',
        biomes: ['frontier_plains'],
        biomeWeights: { frontier_plains: 1 },
        density: 24,
        minAltitude: 6,
        maxAltitude: 160,
        maxSlopeDeg: 32,
        minSpacingMeters: 28,
        avoidWater: true,
        waterMarginMeters: 8,
        scaleMin: 0.85,
        scaleMax: 1.2,
        updatedAt: now,
      },
    ];
    db.visualLogicGraphs = [
      {
        uid: 'tpl_c_lg',
        id: `${modId}:beacon_power_logic`,
        name: 'Beacon Power Sequence',
        description: 'Ignites signal beacon when player brings Starlight Ore.',
        triggerEvent: 'on_interact',
        enabled: true,
        variables: { beaconLit: false },
        nodes: [
          { id: 'e1', kind: 'event', title: 'On Beacon Interact', opCode: 'on_interact', params: {}, position: { x: 60, y: 100 } },
          { id: 'c1', kind: 'condition', title: 'Not Already Lit?', opCode: 'compare_var', params: { varName: 'beaconLit', operator: '==', value: false }, position: { x: 310, y: 100 } },
          { id: 'a1', kind: 'variable', title: 'Set beaconLit = true', opCode: 'set_var', params: { varName: 'beaconLit', mode: 'set', value: true }, position: { x: 580, y: 100 } },
        ],
        edges: [
          { id: 'l1', fromNodeId: 'e1', fromPort: 'exec', toNodeId: 'c1', toPort: 'exec' },
          { id: 'l2', fromNodeId: 'c1', fromPort: 'true', toNodeId: 'a1', toPort: 'exec' },
        ],
        updatedAt: now,
      },
    ];
  }

  const enriched: ModProject = {
    ...project,
    assets: [...project.assets, ...extraAssets],
    files: [...project.files, ...extraFiles],
    contents: db,
  };
  return syncContentFilesInProject(enriched, db);
}
