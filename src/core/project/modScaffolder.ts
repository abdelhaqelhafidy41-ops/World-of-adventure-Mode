import {
  CURRENT_GAME_VERSION,
  CURRENT_MOD_CONTENT_SCHEMA_VERSION,
  DEFAULT_GAME_VERSION,
  MIN_SUPPORTED_GAME_VERSION,
  SUPPORTED_MOD_CONTENT_SCHEMA_VERSIONS,
  WOA_MOD_API_VERSION,
  WOA_PACKAGE_FORMAT_VERSION,
  compareGameVersionTuples,
  isSupportedContentSchemaVersion,
  parseGameVersion,
  parseSchemaVersionNumber,
  validateMaxGameVersion,
  validateSupportedGameVersion,
  type GameVersionValidationResult,
  type ParsedGameVersion,
} from '@/src/core/api/woaModApiSpec';
import {
  deriveAssetModCategoryFromContext,
  serializeWoa3dAsset,
} from '@/src/core/assets/assetPipeline';
import {
  createEmptyContentDatabase,
  createSampleContentDatabase,
  syncContentFilesInProject,
} from '@/src/core/content/contentRegistry';
import { applyTemplateToProject } from '@/src/core/project/modTemplates';
import { buildLocalizedExportMap, t } from '@/src/i18n';
import {
  AssetPresetKind,
  CreateModInput,
  ModAsset,
  ModCategory,
  ModFileNode,
  ModManifest,
  ModProject,
} from '@/src/types/mod';

export {
  CURRENT_GAME_VERSION,
  CURRENT_MOD_CONTENT_SCHEMA_VERSION,
  MIN_SUPPORTED_GAME_VERSION,
  DEFAULT_GAME_VERSION,
  SUPPORTED_MOD_CONTENT_SCHEMA_VERSIONS,
  parseGameVersion,
  compareGameVersionTuples,
  isSupportedContentSchemaVersion,
  parseSchemaVersionNumber,
  validateMaxGameVersion,
  validateSupportedGameVersion,
  type GameVersionValidationResult,
  type ParsedGameVersion,
};

export const MOD_CATEGORIES: ModCategory[] = [
  'Items',
  'Weapons',
  'Biomes',
  'Entities',
  'Blocks',
  'Quests',
  'Audio',
  'UI',
];

export const SUPPORTED_GAME_VERSIONS: string[] = [
  '1.1.24',
  CURRENT_GAME_VERSION,
  '1.1.26',
  '1.2.0',
  '2.0.0',
];

export function suggestModId(name: string, author = 'creator'): string {
  const cleanAuthor = author
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16) || 'studio';
  const cleanName = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28) || 'new_mod';
  return `com.${cleanAuthor}.${cleanName}`;
}

export function validateModId(modId: string): string | null {
  if (!modId.trim()) return t('val.modIdRequired');
  if (modId.length < 3 || modId.length > 64) {
    return t('val.modIdLength');
  }
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(modId)) {
    return t('val.modIdPattern');
  }
  return null;
}

export function validateSemver(version: string): string | null {
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(version.trim())) {
    return t('val.semverInvalid');
  }
  return null;
}

function pickPrimaryAssetForCategories(categories: ModCategory[]): {
  name: string;
  fileName: string;
  preset: AssetPresetKind;
  color: string;
  accentColor: string;
  roughness: number;
  metalness: number;
  triangles: number;
} {
  if (categories.includes('Weapons')) {
    return {
      name: 'Relic Broadsword',
      fileName: 'relic_broadsword.woa3d',
      preset: 'relic-sword',
      color: '#64748B',
      accentColor: '#F59E0B',
      roughness: 0.28,
      metalness: 0.85,
      triangles: 1420,
    };
  }
  if (categories.includes('Biomes')) {
    return {
      name: 'Aether Crystal Obelisk',
      fileName: 'aether_obelisk.woa3d',
      preset: 'crystal-obelisk',
      color: '#334155',
      accentColor: '#38BDF8',
      roughness: 0.22,
      metalness: 0.35,
      triangles: 980,
    };
  }
  if (categories.includes('Entities')) {
    return {
      name: 'Clockwork Sentinel',
      fileName: 'clockwork_sentinel.woa3d',
      preset: 'clockwork-sentinel',
      color: '#475569',
      accentColor: '#F59E0B',
      roughness: 0.35,
      metalness: 0.78,
      triangles: 2140,
    };
  }
  if (categories.includes('Blocks')) {
    return {
      name: 'Frontier Supply Crate',
      fileName: 'frontier_crate.woa3d',
      preset: 'frontier-crate',
      color: '#78563A',
      accentColor: '#94A3B8',
      roughness: 0.68,
      metalness: 0.25,
      triangles: 640,
    };
  }
  return {
    name: 'Wayfarer Beacon Pedestal',
    fileName: 'wayfarer_beacon.woa3d',
    preset: 'beacon-pedestal',
    color: '#3B4A62',
    accentColor: '#3B82F6',
    roughness: 0.32,
    metalness: 0.65,
    triangles: 1180,
  };
}

export function serializeManifest(manifest: ModManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function createModProject(input: CreateModInput): ModProject {
  const now = new Date().toISOString();
  const modId = input.modId.trim();
  const categories: ModCategory[] =
    input.categories.length > 0 ? input.categories : ['Items'];

  const templateId = input.templateId ?? 'blank';
  const version = input.version.trim() || '0.1.0';
  const nameEn = input.name.trim();
  const descEn =
    input.description.trim() ||
    'Custom modification package for World of Adventure.';
  const nameAr = input.nameAr?.trim() ?? '';
  const descAr = input.descriptionAr?.trim() ?? '';
  const localizedName = buildLocalizedExportMap(nameEn, nameAr ? { ar: nameAr } : undefined);
  const localizedDesc = buildLocalizedExportMap(descEn, descAr ? { ar: descAr } : undefined);

  const resolvedGameVersion =
    input.supportedGameVersion?.trim() || DEFAULT_GAME_VERSION;
  const resolvedMaxGameVersion = input.maxGameVersion?.trim();

  const manifest: ModManifest = {
    modId,
    name: nameEn,
    version,
    author: input.author.trim() || 'Unknown Author',
    description: descEn,
    ...(nameAr || descAr
      ? {
          translations: {
            ...(localizedName ? { name: localizedName } : {}),
            ...(localizedDesc ? { description: localizedDesc } : {}),
          },
        }
      : {}),
    supportedGameVersion: resolvedGameVersion,
    minGameVersion: MIN_SUPPORTED_GAME_VERSION,
    ...(resolvedMaxGameVersion ? { maxGameVersion: resolvedMaxGameVersion } : {}),
    modApiVersion: WOA_MOD_API_VERSION,
    packageFormatVersion: WOA_PACKAGE_FORMAT_VERSION,
    categories,
    entryPoint: 'scripts/main.ts',
    targetPlatforms: input.targetPlatforms ?? ['universal', 'windows', 'android'],
    dependencies: [],
    loadOrder: {
      priority: 100,
      loadAfter: ['woa.core'],
      loadBefore: [],
    },
    changelog: [
      {
        id: 'chg_init',
        version,
        date: now.slice(0, 10),
        summary:
          templateId === 'blank'
            ? 'Initial project scaffold'
            : `Initialized from ${templateId} template`,
      },
    ],
    templateId,
    createdAt: now,
    updatedAt: now,
  };

  const starterSpec = pickPrimaryAssetForCategories(categories);
  const primaryAssetId = `asset_${Date.now()}_primary`;

  const primaryAsset: ModAsset = {
    id: primaryAssetId,
    name: starterSpec.name,
    path: `assets/models/${starterSpec.fileName}`,
    type: '3d-model',
    modCategory: deriveAssetModCategoryFromContext({
      preset: starterSpec.preset,
      modCategories: categories,
    }),
    preset: starterSpec.preset,
    format: 'WOA3D',
    sizeBytes: 24800,
    triangleEstimate: starterSpec.triangles,
    pivotMode: 'bottom-center',
    collision: { shape: 'box', scale: 1, offsetY: 0 },
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: {
      color: starterSpec.color,
      accentColor: starterSpec.accentColor,
      roughness: starterSpec.roughness,
      metalness: starterSpec.metalness,
      emissiveIntensity: 0.35,
      wireframe: false,
    },
    metadata: {
      lodLevels: 3,
      collisionShape: 'convex-hull',
      castShadows: true,
    },
    createdAt: now,
  };

  const registryJson = JSON.stringify(
    {
      schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      modId: manifest.modId,
      categories: manifest.categories,
      entries: [
        {
          id: `${modId}:${starterSpec.fileName.replace('.woa3d', '')}`,
          displayName: starterSpec.name,
          category: categories[0],
          modelAsset: primaryAsset.path,
          enabled: true,
        },
      ],
    },
    null,
    2
  );

  const entryScript = `// World of Adventure Mod Entry Point
// Mod ID: ${manifest.modId}

export interface ModContext {
  registerAsset(path: string): void;
  log(message: string): void;
}

export function onModLoad(ctx: ModContext): void {
  ctx.log('Loaded ${manifest.name} v${manifest.version}');
  ctx.registerAsset('${primaryAsset.path}');
}

export function onModUnload(): void {
  // Release runtime hooks and custom resources
}
`;

  const readmeContent = `# ${manifest.name}

- **Mod ID**: \`${manifest.modId}\`
- **Version**: ${manifest.version}
- **Author**: ${manifest.author}
- **Supported World of Adventure**: ${manifest.supportedGameVersion}
- **Categories**: ${manifest.categories.join(', ')}

## Description

${manifest.description}

## Standard Structure

- \`mod.manifest.json\` — Core mod descriptor and compatibility flags
- \`assets/models/\` — 3D geometry and material definitions
- \`assets/textures/\` — Surface albedo and PBR texture maps
- \`assets/audio/\` — Spatial sound effects and ambience
- \`scripts/main.ts\` — Lifecycle entry hooks
- \`data/registry.json\` — Item, biome, and entity definitions
`;

  const files: ModFileNode[] = [
    {
      id: 'dir_assets',
      name: 'assets',
      path: 'assets',
      parentPath: null,
      type: 'folder',
      updatedAt: now,
    },
    {
      id: 'dir_assets_models',
      name: 'models',
      path: 'assets/models',
      parentPath: 'assets',
      type: 'folder',
      updatedAt: now,
    },
    {
      id: 'dir_assets_textures',
      name: 'textures',
      path: 'assets/textures',
      parentPath: 'assets',
      type: 'folder',
      updatedAt: now,
    },
    {
      id: 'dir_assets_audio',
      name: 'audio',
      path: 'assets/audio',
      parentPath: 'assets',
      type: 'folder',
      updatedAt: now,
    },
    {
      id: 'dir_scripts',
      name: 'scripts',
      path: 'scripts',
      parentPath: null,
      type: 'folder',
      updatedAt: now,
    },
    {
      id: 'dir_data',
      name: 'data',
      path: 'data',
      parentPath: null,
      type: 'folder',
      updatedAt: now,
    },
    {
      id: 'file_manifest',
      name: 'mod.manifest.json',
      path: 'mod.manifest.json',
      parentPath: null,
      type: 'manifest',
      content: serializeManifest(manifest),
      updatedAt: now,
    },
    {
      id: 'file_primary_model',
      name: starterSpec.fileName,
      path: primaryAsset.path,
      parentPath: 'assets/models',
      type: 'asset-3d',
      assetId: primaryAsset.id,
      content: serializeWoa3dAsset({
        ...primaryAsset,
        schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      }),
      updatedAt: now,
    },
    {
      id: 'file_main_script',
      name: 'main.ts',
      path: 'scripts/main.ts',
      parentPath: 'scripts',
      type: 'script',
      content: entryScript,
      updatedAt: now,
    },
    {
      id: 'file_registry',
      name: 'registry.json',
      path: 'data/registry.json',
      parentPath: 'data',
      type: 'data',
      content: registryJson,
      updatedAt: now,
    },
    {
      id: 'dir_localization',
      name: 'localization',
      path: 'localization',
      parentPath: null,
      type: 'folder',
      updatedAt: now,
    },
    {
      id: 'file_localization_en',
      name: 'en.json',
      path: 'localization/en.json',
      parentPath: 'localization',
      type: 'data',
      content: JSON.stringify(
        {
          $schema: 'woa.localization.v1',
          modId: manifest.modId,
          locale: 'en',
          strings: {
            [`mod.${manifest.modId}.name`]: manifest.name,
            [`mod.${manifest.modId}.description`]: manifest.description,
          },
        },
        null,
        2
      ),
      updatedAt: now,
    },
    ...(nameAr || descAr
      ? [
          {
            id: 'file_localization_ar',
            name: 'ar.json',
            path: 'localization/ar.json',
            parentPath: 'localization',
            type: 'data' as const,
            content: JSON.stringify(
              {
                $schema: 'woa.localization.v1',
                modId: manifest.modId,
                locale: 'ar',
                strings: {
                  ...(nameAr ? { [`mod.${manifest.modId}.name`]: nameAr } : {}),
                  ...(descAr
                    ? { [`mod.${manifest.modId}.description`]: descAr }
                    : {}),
                },
              },
              null,
              2
            ),
            updatedAt: now,
          },
        ]
      : []),
    {
      id: 'file_readme',
      name: 'README.md',
      path: 'README.md',
      parentPath: null,
      type: 'doc',
      content: readmeContent,
      updatedAt: now,
    },
  ];

  const baseProject: ModProject = {
    id: manifest.modId,
    manifest,
    files,
    assets: [primaryAsset],
    contents: createEmptyContentDatabase(),
    activeAssetId: primaryAsset.id,
    lastOpenedAt: now,
  };

  const synced = syncContentFilesInProject(baseProject, baseProject.contents!);
  return applyTemplateToProject(synced, templateId);
}

export function createStarterSampleProject(): ModProject {
  const project = createModProject({
    modId: 'com.adventureforge.skyreach_relics',
    name: 'Skyreach Relics',
    version: '1.2.0',
    author: 'AdventureForge',
    description:
      'Adds ancient astral weaponry, beacon shrines, and frontier supply props for high-altitude exploration.',
    supportedGameVersion: DEFAULT_GAME_VERSION,
    categories: ['Weapons', 'Items', 'Biomes'],
    targetPlatforms: ['universal', 'windows', 'android'],
  });

  const now = project.manifest.createdAt;
  const secondAsset: ModAsset = {
    id: 'asset_sample_obelisk',
    name: 'Skyreach Waystone',
    path: 'assets/models/skyreach_waystone.woa3d',
    type: '3d-model',
    modCategory: 'Decoration',
    preset: 'crystal-obelisk',
    format: 'WOA3D',
    sizeBytes: 18400,
    triangleEstimate: 980,
    pivotMode: 'bottom-center',
    collision: { shape: 'capsule', scale: 1, offsetY: 0 },
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 24, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: {
      color: '#334155',
      accentColor: '#38BDF8',
      roughness: 0.24,
      metalness: 0.42,
      emissiveIntensity: 0.45,
      wireframe: false,
    },
    metadata: {
      lodLevels: 2,
      collisionShape: 'capsule',
      castShadows: true,
    },
    createdAt: now,
  };

  const thirdAsset: ModAsset = {
    id: 'asset_sample_crate',
    name: 'Expedition Supply Crate',
    path: 'assets/models/expedition_crate.woa3d',
    type: '3d-model',
    modCategory: 'Decoration',
    preset: 'frontier-crate',
    format: 'WOA3D',
    sizeBytes: 12100,
    triangleEstimate: 640,
    pivotMode: 'bottom-center',
    collision: { shape: 'box', scale: 1, offsetY: 0 },
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: {
      color: '#7C5A3B',
      accentColor: '#94A3B8',
      roughness: 0.65,
      metalness: 0.3,
      emissiveIntensity: 0.1,
      wireframe: false,
    },
    metadata: {
      lodLevels: 2,
      collisionShape: 'box',
      castShadows: true,
    },
    createdAt: now,
  };

  project.assets.push(secondAsset, thirdAsset);
  project.files.push(
    {
      id: 'file_sample_obelisk',
      name: 'skyreach_waystone.woa3d',
      path: secondAsset.path,
      parentPath: 'assets/models',
      type: 'asset-3d',
      assetId: secondAsset.id,
      content: serializeWoa3dAsset({
        ...secondAsset,
        schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      }),
      updatedAt: now,
    },
    {
      id: 'file_sample_crate',
      name: 'expedition_crate.woa3d',
      path: thirdAsset.path,
      parentPath: 'assets/models',
      type: 'asset-3d',
      assetId: thirdAsset.id,
      content: serializeWoa3dAsset({
        ...thirdAsset,
        schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      }),
      updatedAt: now,
    }
  );

  const sampleContents = createSampleContentDatabase(project.manifest.modId, now);
  return syncContentFilesInProject(project, sampleContents);
}
