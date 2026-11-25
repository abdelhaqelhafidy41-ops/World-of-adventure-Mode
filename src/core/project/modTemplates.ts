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
      content: serializeWoa3dAsset(asset),
      updatedAt: now,
    });
    return asset;
  };

  const primaryModel = project.assets[0]?.path ?? 'assets/models/starter.woa3d';

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
      model: primaryModel,
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
    db.worldObjects = [
      {
        uid: 'tpl_wobj_chest',
        id: `${modId}:watchpost_supply_chest`,
        name: 'Watchpost Supply Chest',
        description: 'Interactive chest placed outside frontier watchposts.',
        objectType: 'chest',
        model: primaryModel,
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
  }

  const enriched: ModProject = {
    ...project,
    assets: [...project.assets, ...extraAssets],
    files: [...project.files, ...extraFiles],
    contents: db,
  };
  return syncContentFilesInProject(enriched, db);
}
