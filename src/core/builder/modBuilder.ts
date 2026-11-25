import JSZip from 'jszip';
import {
  DEFAULT_GAME_VERSION,
  MIN_SUPPORTED_GAME_VERSION,
  WOA_COMPATIBLE_PACKAGE_FORMATS,
  WOA_MOD_API_SCHEMA,
  WOA_MOD_API_VERSION,
  WOA_PACKAGE_FORMAT_VERSION,
  buildModCompatibilityInfo,
  parseGameVersion,
} from '@/src/core/api/woaModApiSpec';
import {
  getAssetFormatSpec,
  getExpectedAssetCategoryForPath,
  inspect3DBuffer,
  inspectAudioBlob,
  inspectImageBlob,
  isSupportedAssetPath,
  parseAndValidateWoa3dContent,
  serializeWoa3dAsset,
} from '@/src/core/assets/assetPipeline';
import {
  EXTENDED_CONFIG_FILE_PATHS,
  buildStandardRegistryJson,
  extractObjectPart,
  resolveProjectContents,
  serializeContentEntryForExport,
  serializeContentFile,
  serializeExtendedConfigFile,
  serializeLoadOrderFile,
  syncContentFilesInProject,
} from '@/src/core/content/contentRegistry';
import {
  buildLocalizedExportMap,
  type LocalizedTextMap,
  mergeLocalizedField,
  t,
} from '@/src/i18n';
import {
  createModProject,
  serializeManifest,
} from '@/src/core/project/modScaffolder';
import {
  getAssetBlobRecord,
  saveAssetBlob,
} from '@/src/core/storage/modRepository';
import {
  analyzeArchivePath,
  validateModProject,
} from '@/src/core/validation/modValidator';
import {
  assertSafeArchiveEntryPath,
  assertSafeFileSize,
  assertSafeWoamodPackageLimits,
  isAllowedWoamodPackagePath,
  isDisallowedModPackageFile,
  MAX_ARCHIVE_BYTES,
  MAX_JSON_IMPORT_BYTES,
  readZipEntryBufferBounded,
  readZipEntryTextBounded,
  safeJsonParse,
  sanitizeManifestEntryPoint,
  sanitizeSafeModId,
  validateZipArchiveLimits,
} from '@/src/core/security/importGuard';
import { getPlatformAdapter, type SaveExportResult } from '@/src/platform';
import {
  BuildDiagnostic,
  BuildPipelineStep,
  BuildReport,
  ModAsset,
  ModCompatibilityInfo,
  ModContentDatabase,
  ModFileNode,
  ModManifest,
  ModProject,
  ProjectBackupRecord,
  PrunedBuildFile,
  TargetPlatform,
} from '@/src/types/mod';

export class ExportBlockedError extends Error {
  report: BuildReport;
  constructor(report: BuildReport) {
    super(
      t('builder.errBlocked', {
        errors: report.validationReport?.errorCount ?? 1,
      })
    );
    this.name = 'ExportBlockedError';
    this.report = report;
  }
}

export class ExportWarningsConfirmationError extends Error {
  report: BuildReport;
  constructor(report: BuildReport) {
    super(
      t('builder.errWarningsConfirm', {
        warnings: report.validationReport?.warningCount ?? 1,
      })
    );
    this.name = 'ExportWarningsConfirmationError';
    this.report = report;
  }
}

const REQUIRED_ARCHIVE_DIRECTORIES = [
  'assets',
  'assets/models',
  'assets/textures',
  'assets/sounds',
  'data',
  'localization',
];

export function formatWoamodFilename(modName: string, modId: string): string {
  const cleaned = modName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (cleaned) {
    return `${cleaned}.woamod`;
  }
  const fallback = modId.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'world-of-adventure-mod';
  return `${fallback}.woamod`;
}

export function isDevelopmentOnlyPath(rawPath: string): boolean {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lower = normalized.toLowerCase();
  const baseName = lower.split('/').pop() ?? lower;

  if (
    lower === 'mod.manifest.json' ||
    lower === 'build-metadata.json' ||
    lower === 'woa-project.json' ||
    lower === 'package.json' ||
    lower === 'package-lock.json' ||
    lower === 'bun.lock' ||
    lower === 'yarn.lock' ||
    lower === 'pnpm-lock.yaml' ||
    lower === 'index.html' ||
    lower === 'metadata.json' ||
    lower === 'version.json' ||
    /^tsconfig(\.[^/]+)?\.json$/i.test(baseName) ||
    /^(vite|vitest|eslint|prettier|capacitor|electron-builder)\.config\.[^/]+$/i.test(baseName)
  ) {
    return true;
  }
  if (
    baseName === '.ds_store' ||
    baseName === 'thumbs.db' ||
    baseName === 'desktop.ini' ||
    baseName === '.gitignore' ||
    baseName === '.gitattributes' ||
    baseName === '.npmignore' ||
    baseName.startsWith('.env') ||
    baseName.startsWith('.eslint') ||
    baseName.startsWith('.prettier')
  ) {
    return true;
  }
  if (
    lower.startsWith('scripts/') ||
    lower.startsWith('src/') ||
    lower.startsWith('app/') ||
    lower.startsWith('electron/') ||
    lower.startsWith('android/') ||
    lower.startsWith('ios/') ||
    lower.startsWith('build/') ||
    lower.startsWith('dist/') ||
    lower.startsWith('dev-dist/') ||
    lower.startsWith('out/') ||
    lower.startsWith('coverage/') ||
    lower.startsWith('public/') ||
    lower.startsWith('docs/') ||
    lower.startsWith('doc/') ||
    lower.startsWith('test/') ||
    lower.startsWith('tests/') ||
    lower.startsWith('__tests__/') ||
    lower.startsWith('node_modules/') ||
    lower.startsWith('.git/') ||
    lower.startsWith('.github/') ||
    lower.startsWith('.vscode/') ||
    lower.startsWith('.idea/') ||
    lower.startsWith('.husky/') ||
    lower.startsWith('.aistudio/') ||
    lower.startsWith('.woa-blobs/')
  ) {
    return true;
  }
  if (isDisallowedModPackageFile(lower)) {
    return true;
  }
  if (
    baseName.endsWith('.md') ||
    baseName.endsWith('.markdown') ||
    baseName.endsWith('.txt') ||
    baseName.endsWith('.html') ||
    baseName.endsWith('.htm') ||
    baseName.endsWith('.css') ||
    baseName.endsWith('.scss') ||
    baseName.endsWith('.sass') ||
    baseName.endsWith('.less') ||
    baseName.endsWith('.bak') ||
    baseName.endsWith('.tmp') ||
    baseName.endsWith('.log') ||
    baseName.endsWith('.map') ||
    baseName.endsWith('.lock')
  ) {
    return true;
  }
  return false;
}

function mapAssetArchivePath(workspacePath: string): string {
  if (workspacePath.startsWith('assets/audio/')) {
    return `assets/sounds/${workspacePath.slice('assets/audio/'.length)}`;
  }
  return workspacePath;
}

function rewriteAudioRefsToSounds(text: string): string {
  return text.replace(/assets\/audio\//g, 'assets/sounds/');
}

function normalizeRelativeRef(baseDir: string, uri: string): string {
  const rawParts = [...(baseDir ? baseDir.split('/') : []), ...uri.split('/')];
  const out: string[] = [];
  for (const part of rawParts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

async function collectRequiredWorkspaceAssetPaths(
  project: ModProject,
  contents: ModContentDatabase
): Promise<Set<string>> {
  const refs = new Set<string>();
  const addRef = (raw: string | undefined) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('woa:')) return;
    refs.add(trimmed);
  };

  contents.items.forEach((item) => addRef(item.icon));
  contents.weapons.forEach((w) => {
    addRef(w.model);
    addRef(w.icon);
    addRef(w.sound);
  });
  contents.armor.forEach((a) => {
    addRef(a.model);
    addRef(a.icon);
  });
  contents.npcs.forEach((n) => addRef(n.model));
  contents.monsters.forEach((m) => addRef(m.model));
  contents.buildings.forEach((b) => {
    addRef(b.model);
    b.pieces.forEach((p) => addRef(p.model));
    b.doors.forEach((d) => addRef(d.model));
    b.windows.forEach((w) => addRef(w.model));
  });
  (contents.audioCues ?? []).forEach((c) => addRef(c.assetPath));
  (contents.materials ?? []).forEach((m) => {
    addRef(m.albedoTexture);
    addRef(m.normalTexture);
  });
  (contents.worldObjects ?? []).forEach((wo) => addRef(wo.model));

  // Collect asset references inside scripts (e.g. ctx.registerAsset('assets/models/foo.woa3d'))
  for (const file of project.files) {
    if (file.type === 'script' && file.content) {
      const regex = /['"`](assets\/[^'"`\s]+)['"`]/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(file.content)) !== null) {
        addRef(m[1]);
      }
    }
  }

  // Expand GLTF external buffer / image URI dependencies
  for (const asset of project.assets) {
    if (
      refs.has(asset.path) &&
      asset.path.toLowerCase().endsWith('.gltf') &&
      asset.blobKey
    ) {
      const rec = await getAssetBlobRecord(asset.blobKey);
      if (rec) {
        try {
          const parsed = JSON.parse(new TextDecoder().decode(rec.data)) as {
            buffers?: { uri?: string }[];
            images?: { uri?: string }[];
          };
          const baseDir = asset.path.split('/').slice(0, -1).join('/');
          for (const buf of parsed.buffers ?? []) {
            if (buf.uri && !buf.uri.startsWith('data:')) {
              addRef(normalizeRelativeRef(baseDir, buf.uri));
            }
          }
          for (const img of parsed.images ?? []) {
            if (img.uri && !img.uri.startsWith('data:')) {
              const direct = normalizeRelativeRef(baseDir, img.uri);
              const fallback = `assets/textures/${img.uri.split('/').pop()}`;
              if (project.files.some((f) => f.path === direct)) {
                addRef(direct);
              } else if (project.files.some((f) => f.path === fallback)) {
                addRef(fallback);
              }
            }
          }
        } catch {
          // validation already flags corrupt GLTF
        }
      }
    }
  }

  return refs;
}

function buildLocalizationJson(
  manifest: ModManifest,
  contents: ModContentDatabase,
  existingEnJson?: string
): string {
  const strings: Record<string, string> = {};

  if (existingEnJson) {
    try {
      const parsed = JSON.parse(existingEnJson) as {
        strings?: Record<string, string>;
      };
      if (parsed.strings && typeof parsed.strings === 'object') {
        Object.assign(strings, parsed.strings);
      }
    } catch {
      // ignore invalid existing localization override
    }
  }

  const setIfMissing = (key: string, value: string) => {
    if (strings[key] === undefined) {
      strings[key] = value;
    }
  };

  const nsKey = manifest.modId;
  setIfMissing(`mod.${nsKey}.name`, manifest.name);
  setIfMissing(`mod.${nsKey}.description`, manifest.description);

  const slug = (id: string, fallback: string) => extractObjectPart(id) || fallback;

  contents.items.forEach((e) => {
    const k = slug(e.id, e.uid);
    strings[`item.${k}.name`] = e.name;
    strings[`item.${k}.description`] = e.description;
  });
  contents.weapons.forEach((e) => {
    const k = slug(e.id, e.uid);
    strings[`weapon.${k}.name`] = e.name;
    strings[`weapon.${k}.description`] = e.description;
  });
  contents.armor.forEach((e) => {
    const k = slug(e.id, e.uid);
    strings[`armor.${k}.name`] = e.name;
    strings[`armor.${k}.description`] = e.description;
  });
  contents.npcs.forEach((e) => {
    const k = slug(e.id, e.uid);
    strings[`character.${k}.name`] = e.name;
    strings[`character.${k}.description`] = e.description;
    strings[`npc.${k}.name`] = e.name;
    strings[`npc.${k}.description`] = e.description;
    e.dialogue.forEach((d, idx) => {
      strings[`npc.${k}.dialogue.${idx}`] = d.text;
    });
  });
  contents.monsters.forEach((e) => {
    const k = slug(e.id, e.uid);
    strings[`creature.${k}.name`] = e.name;
    strings[`creature.${k}.description`] = e.description;
  });
  contents.buildings.forEach((e) => {
    const k = slug(e.id, e.uid);
    strings[`building.${k}.name`] = e.name;
    strings[`building.${k}.description`] = e.description;
  });
  contents.quests.forEach((e) => {
    const k = slug(e.id, e.uid);
    strings[`quest.${k}.name`] = e.name;
    strings[`quest.${k}.description`] = e.description;
    e.objectives.forEach((obj, idx) => {
      strings[`quest.${k}.objective.${idx}`] = obj.summary;
    });
    e.dialogue.forEach((dlg) => {
      strings[`quest.${k}.dialogue.${dlg.stage}`] = dlg.text;
    });
  });
  contents.recipes.forEach((e) => {
    const k = slug(e.id, e.uid);
    strings[`recipe.${k}.name`] = e.name;
    strings[`recipe.${k}.description`] = e.description;
  });
  contents.spawns.forEach((e) => {
    const k = slug(e.id, e.uid);
    strings[`spawn.${k}.name`] = e.name;
    strings[`spawn.${k}.description`] = e.description;
  });

  return JSON.stringify(
    {
      $schema: 'woa.localization.v1',
      modId: manifest.modId,
      locale: 'en',
      strings,
    },
    null,
    2
  );
}

function buildArabicLocalizationJson(
  manifest: ModManifest,
  contents: ModContentDatabase,
  existingArJson?: string
): { json: string; hasStrings: boolean } {
  const strings: Record<string, string> = {};

  if (existingArJson) {
    try {
      const parsed = JSON.parse(existingArJson) as {
        strings?: Record<string, string>;
      };
      if (parsed.strings && typeof parsed.strings === 'object') {
        Object.assign(strings, parsed.strings);
      }
    } catch {
      // ignore invalid existing localization override
    }
  }

  const put = (key: string, val?: string) => {
    const cleaned = val?.trim();
    if (cleaned) {
      strings[key] = cleaned;
    }
  };

  const nsKey = manifest.modId;
  put(`mod.${nsKey}.name`, manifest.translations?.name?.ar);
  put(`mod.${nsKey}.description`, manifest.translations?.description?.ar);

  const slug = (id: string, fallback: string) => extractObjectPart(id) || fallback;

  contents.items.forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`item.${k}.name`, e.translations?.name?.ar);
    put(`item.${k}.description`, e.translations?.description?.ar);
  });
  contents.weapons.forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`weapon.${k}.name`, e.translations?.name?.ar);
    put(`weapon.${k}.description`, e.translations?.description?.ar);
  });
  contents.armor.forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`armor.${k}.name`, e.translations?.name?.ar);
    put(`armor.${k}.description`, e.translations?.description?.ar);
  });
  contents.npcs.forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`character.${k}.name`, e.translations?.name?.ar);
    put(`character.${k}.description`, e.translations?.description?.ar);
    put(`npc.${k}.name`, e.translations?.name?.ar);
    put(`npc.${k}.description`, e.translations?.description?.ar);
    e.dialogue.forEach((d, idx) => {
      put(`npc.${k}.dialogue.${idx}`, d.textTranslations?.ar);
    });
  });
  contents.monsters.forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`creature.${k}.name`, e.translations?.name?.ar);
    put(`creature.${k}.description`, e.translations?.description?.ar);
  });
  contents.buildings.forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`building.${k}.name`, e.translations?.name?.ar);
    put(`building.${k}.description`, e.translations?.description?.ar);
    e.interactiveObjects.forEach((io, idx) => {
      put(
        `building.${k}.interactive.${io.id || idx}.prompt`,
        io.promptTranslations?.ar
      );
    });
  });
  contents.quests.forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`quest.${k}.name`, e.translations?.name?.ar);
    put(`quest.${k}.description`, e.translations?.description?.ar);
    e.objectives.forEach((obj, idx) => {
      put(`quest.${k}.objective.${idx}`, obj.summaryTranslations?.ar);
    });
    e.dialogue.forEach((dlg) => {
      put(`quest.${k}.dialogue.${dlg.stage}`, dlg.textTranslations?.ar);
    });
  });
  contents.recipes.forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`recipe.${k}.name`, e.translations?.name?.ar);
    put(`recipe.${k}.description`, e.translations?.description?.ar);
  });
  contents.spawns.forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`spawn.${k}.name`, e.translations?.name?.ar);
    put(`spawn.${k}.description`, e.translations?.description?.ar);
  });
  (contents.dialogues ?? []).forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`dialogue.${k}.name`, e.translations?.name?.ar);
    put(`dialogue.${k}.description`, e.translations?.description?.ar);
    e.nodes.forEach((node) => {
      put(`dialogue.${k}.node.${node.id}.text`, node.textTranslations?.ar);
      node.choices.forEach((choice, idx) => {
        put(
          `dialogue.${k}.node.${node.id}.choice.${idx}`,
          choice.labelTranslations?.ar
        );
      });
    });
  });
  (contents.worldObjects ?? []).forEach((e) => {
    const k = slug(e.id, e.uid);
    put(`world_object.${k}.name`, e.translations?.name?.ar);
    put(`world_object.${k}.description`, e.translations?.description?.ar);
    put(`world_object.${k}.prompt`, e.promptTranslations?.ar);
  });

  return {
    hasStrings: Object.keys(strings).length > 0,
    json: JSON.stringify(
      {
        $schema: 'woa.localization.v1',
        modId: manifest.modId,
        locale: 'ar',
        direction: 'rtl',
        strings,
      },
      null,
      2
    ),
  };
}

function buildCharactersJson(modId: string, contents: ModContentDatabase): string {
  const entries = contents.npcs.map((npc) => ({
    ...serializeContentEntryForExport(npc),
    characterRole: npc.behaviorType,
  }));
  return JSON.stringify(
    {
      $schema: 'woa.content.v1',
      modId,
      contentType: 'character',
      entries,
    },
    null,
    2
  );
}

function buildCreaturesJson(modId: string, contents: ModContentDatabase): string {
  const entries = contents.monsters.map((monster) => ({
    ...serializeContentEntryForExport(monster),
    creatureClass: monster.attackBehavior,
  }));
  return JSON.stringify(
    {
      $schema: 'woa.content.v1',
      modId,
      contentType: 'creature',
      entries,
    },
    null,
    2
  );
}

function buildRuntimeModJson(
  manifest: ModManifest,
  targetPlatform: TargetPlatform,
  builtAt: string,
  localizationFiles: string[],
  counts: { assets: number; objects: number },
  compatibility: ModCompatibilityInfo
): string {
  const localizedName = buildLocalizedExportMap(
    manifest.name,
    manifest.translations?.name
  );
  const localizedDescription = buildLocalizedExportMap(
    manifest.description,
    manifest.translations?.description
  );
  const localized =
    localizedName || localizedDescription
      ? {
          ...(localizedName ? { name: localizedName } : {}),
          ...(localizedDescription ? { description: localizedDescription } : {}),
        }
      : undefined;

  return JSON.stringify(
    {
      $schema: 'woa.mod.v1',
      schemaVersion: WOA_PACKAGE_FORMAT_VERSION,
      packageFormatVersion: compatibility.packageFormatVersion,
      compatiblePackageFormats: compatibility.compatiblePackageFormats,
      modApiSchema: WOA_MOD_API_SCHEMA,
      modApiVersion: compatibility.modApiVersion,
      modId: manifest.modId,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      ...(localized ? { localized } : {}),
      ...(manifest.translations ? { translations: manifest.translations } : {}),
      supportedGameVersion: manifest.supportedGameVersion,
      minGameVersion: compatibility.minGameVersion,
      maxGameVersion: compatibility.maxGameVersion,
      categories: manifest.categories,
      targetPlatforms: manifest.targetPlatforms,
      buildTarget: targetPlatform,
      dependencies: manifest.dependencies ?? [],
      loadOrder: manifest.loadOrder ?? {
        priority: 100,
        loadAfter: ['woa.core'],
        loadBefore: [],
      },
      compatibility,
      directories: {
        assets: 'assets',
        models: 'assets/models',
        textures: 'assets/textures',
        sounds: 'assets/sounds',
        data: 'data',
        localization: 'localization',
      },
      registries: {
        items: 'data/items.json',
        weapons: 'data/weapons.json',
        armor: 'data/armor.json',
        characters: 'data/characters.json',
        creatures: 'data/creatures.json',
        npcs: 'data/npcs.json',
        buildings: 'data/buildings.json',
        quests: 'data/quests.json',
        recipes: 'data/recipes.json',
        spawns: 'data/spawns.json',
        animations: EXTENDED_CONFIG_FILE_PATHS.animation,
        audio: EXTENDED_CONFIG_FILE_PATHS.audio,
        materials: EXTENDED_CONFIG_FILE_PATHS.material,
        lootTables: EXTENDED_CONFIG_FILE_PATHS.loot_table,
        dialogues: EXTENDED_CONFIG_FILE_PATHS.dialogue,
        worldObjects: EXTENDED_CONFIG_FILE_PATHS.world_object,
        loadOrder: 'data/load_order.json',
        registry: 'data/registry.json',
      },
      localization: localizationFiles,
      stats: {
        assetCount: counts.assets,
        registeredObjectCount: counts.objects,
      },
      builtAt,
      createdAt: manifest.createdAt,
      updatedAt: builtAt,
    },
    null,
    2
  );
}

interface AssembledPackageResult {
  report: BuildReport;
  blob: Blob | null;
}

async function runBuildPipeline(
  project: ModProject,
  targetPlatform: TargetPlatform,
  allProjects: ModProject[]
): Promise<AssembledPackageResult> {
  const start = performance.now();
  const packageFileName = formatWoamodFilename(
    project.manifest.name,
    project.manifest.modId
  );
  const pipelineSteps: BuildPipelineStep[] = [];
  const prunedFiles: PrunedBuildFile[] = [];

  // Step 1: Validate the project
  const validationReport = await validateModProject(
    project,
    allProjects,
    targetPlatform
  );
  const warnings = validationReport.issues.filter((i) => i.severity === 'warning');
  const dependencies = project.manifest.dependencies ?? [];
  const compatibility = buildModCompatibilityInfo(project.manifest, targetPlatform);
  const contents = resolveProjectContents(project);
  const registeredObjectCount = validationReport.checkedObjects;

  pipelineSteps.push({
    step: 1,
    label: t('builder.step1.label'),
    status:
      validationReport.errorCount > 0
        ? 'failed'
        : validationReport.warningCount > 0
          ? 'warning'
          : 'passed',
    detail: t('builder.step1.detail', {
      files: validationReport.checkedFiles,
      assets: validationReport.checkedAssets,
      objects: registeredObjectCount,
      errors: validationReport.errorCount,
      warnings: validationReport.warningCount,
    }),
  });

  const diagnostics: BuildDiagnostic[] = validationReport.issues.map((issue) => ({
    level: issue.severity === 'error' ? 'error' : 'warn',
    code: issue.code,
    path: issue.file,
    object: issue.object,
    property: issue.property,
    message: issue.problem,
    suggestion: issue.suggestion,
  }));

  // Step 2: Stop if critical errors exist
  if (validationReport.errorCount > 0) {
    pipelineSteps.push({
      step: 2,
      label: t('builder.step2.label'),
      status: 'failed',
      detail: t('builder.step2.fail', { errors: validationReport.errorCount }),
    });
    const skippedLabels = [
      t('builder.step3.label'),
      t('builder.step4.label'),
      t('builder.step5.label'),
      t('builder.step6.label'),
      t('builder.step7.label'),
      t('builder.step8.label'),
      t('builder.step9.label', { filename: packageFileName }),
    ];
    skippedLabels.forEach((label, idx) => {
      pipelineSteps.push({
        step: idx + 3,
        label,
        status: 'skipped',
        detail: t('builder.skippedErrors'),
      });
    });

    const report: BuildReport = {
      id: `build_${Date.now()}`,
      modName: project.manifest.name,
      modId: project.manifest.modId,
      version: project.manifest.version,
      targetPlatform,
      success: false,
      buildStatus: 'blocked',
      packageFileName,
      timestamp: validationReport.timestamp,
      durationMs: Math.max(10, Math.round(performance.now() - start)),
      fileCount: 0,
      assetCount: 0,
      registeredObjectCount,
      excludedAssetCount: 0,
      estimatedBundleBytes: 0,
      packagedBytes: 0,
      dependencies,
      compatibility,
      warnings,
      diagnostics,
      pipelineSteps,
      prunedFiles,
      packagedPaths: [],
      validationReport,
    };
    return { report, blob: null };
  }

  pipelineSteps.push({
    step: 2,
    label: t('builder.step2.label'),
    status: 'passed',
    detail: t('builder.step2.pass'),
  });

  // Step 4 & 5 analysis: Collect required assets & prune unused / dev-only files
  const requiredAssetPaths = await collectRequiredWorkspaceAssetPaths(
    project,
    contents
  );

  const assetByPath = new Map(project.assets.map((a) => [a.path, a]));
  const zipEntries = new Map<string, string | ArrayBuffer>();

  // Gather supported, referenced assets
  const collectedAssetArchivePaths = new Set<string>();
  for (const asset of project.assets) {
    if (!isSupportedAssetPath(asset.path)) {
      prunedFiles.push({ path: asset.path, reason: 'unsupported-format' });
      continue;
    }

    if (!requiredAssetPaths.has(asset.path)) {
      prunedFiles.push({ path: asset.path, reason: 'unused-asset' });
      continue;
    }

    const archivePath = mapAssetArchivePath(asset.path);
    collectedAssetArchivePaths.add(archivePath);

    if (asset.blobKey) {
      const record = await getAssetBlobRecord(asset.blobKey);
      if (record) {
        zipEntries.set(archivePath, record.data);
        continue;
      }
    }

    const fileNode = project.files.find((f) => f.path === asset.path);
    let rawContent = fileNode?.content ?? '';
    if (asset.path.toLowerCase().endsWith('.woa3d')) {
      try {
        const parsedWoa3d = parseAndValidateWoa3dContent(rawContent);
        rawContent = serializeWoa3dAsset({
          format: 'WOA3D',
          preset: parsedWoa3d.preset,
          modCategory: asset.modCategory ?? parsedWoa3d.modCategory,
          pivotMode: asset.pivotMode ?? parsedWoa3d.pivotMode,
          collision: asset.collision ?? parsedWoa3d.collision,
          transform: parsedWoa3d.transform,
          material: parsedWoa3d.material,
        });
      } catch {
        rawContent = serializeWoa3dAsset(asset);
      }
    }
    zipEntries.set(archivePath, rewriteAudioRefsToSounds(rawContent));
  }

  const standardDataFiles = new Set([
    'data/items.json',
    'data/weapons.json',
    'data/armor.json',
    'data/npcs.json',
    'data/monsters.json',
    'data/characters.json',
    'data/creatures.json',
    'data/quests.json',
    'data/recipes.json',
    'data/buildings.json',
    'data/spawns.json',
    'data/animations.json',
    'data/audio.json',
    'data/materials.json',
    'data/loot_tables.json',
    'data/dialogues.json',
    'data/world_objects.json',
    'data/load_order.json',
    'data/registry.json',
    'compatibility.json',
  ]);

  let existingEnLoc: string | undefined;
  let existingArLoc: string | undefined;
  const localizationFiles: string[] = ['localization/en.json'];

  for (const file of project.files) {
    if (file.type === 'folder') continue;

    if (file.path === 'localization/en.json') {
      existingEnLoc = file.content;
      continue;
    }

    if (file.path === 'localization/ar.json') {
      existingArLoc = file.content;
      continue;
    }

    if (isDevelopmentOnlyPath(file.path)) {
      if (file.path !== 'mod.manifest.json') {
        prunedFiles.push({ path: file.path, reason: 'dev-only' });
      }
      continue;
    }

    if (file.path.startsWith('assets/')) {
      if (!isSupportedAssetPath(file.path)) {
        if (!prunedFiles.some((p) => p.path === file.path)) {
          prunedFiles.push({ path: file.path, reason: 'unsupported-format' });
        }
        continue;
      }
      const mapped = mapAssetArchivePath(file.path);
      if (collectedAssetArchivePaths.has(mapped)) {
        // Already added from asset pass (or if unlinked asset file, add content)
        if (!zipEntries.has(mapped) && !assetByPath.has(file.path)) {
          zipEntries.set(mapped, rewriteAudioRefsToSounds(file.content ?? ''));
        }
      } else if (!prunedFiles.some((p) => p.path === file.path)) {
        prunedFiles.push({ path: file.path, reason: 'unused-asset' });
      }
      continue;
    }

    if (standardDataFiles.has(file.path)) {
      // Standard data files are freshly serialized cleanly below
      continue;
    }

    if (
      (file.path.startsWith('data/') || file.path.startsWith('localization/')) &&
      file.path.toLowerCase().endsWith('.json') &&
      isAllowedWoamodPackagePath(file.path)
    ) {
      if (file.path.startsWith('localization/')) {
        localizationFiles.push(file.path);
      }
      zipEntries.set(file.path, rewriteAudioRefsToSounds(file.content ?? ''));
      continue;
    }

    // Anything outside the verified data-driven .woamod package boundary is excluded
    prunedFiles.push({
      path: file.path,
      reason: isDisallowedModPackageFile(file.path) ? 'dev-only' : 'unsupported-format',
    });
  }

  // Generate standardized runtime data & localization files
  const builtAt = new Date().toISOString();
  zipEntries.set(
    'data/items.json',
    rewriteAudioRefsToSounds(serializeContentFile('item', project.manifest.modId, contents.items))
  );
  zipEntries.set(
    'data/weapons.json',
    rewriteAudioRefsToSounds(serializeContentFile('weapon', project.manifest.modId, contents.weapons))
  );
  zipEntries.set(
    'data/armor.json',
    rewriteAudioRefsToSounds(serializeContentFile('armor', project.manifest.modId, contents.armor))
  );
  zipEntries.set(
    'data/characters.json',
    rewriteAudioRefsToSounds(buildCharactersJson(project.manifest.modId, contents))
  );
  zipEntries.set(
    'data/npcs.json',
    rewriteAudioRefsToSounds(serializeContentFile('npc', project.manifest.modId, contents.npcs))
  );
  zipEntries.set(
    'data/creatures.json',
    rewriteAudioRefsToSounds(buildCreaturesJson(project.manifest.modId, contents))
  );
  zipEntries.set(
    'data/buildings.json',
    rewriteAudioRefsToSounds(serializeContentFile('building', project.manifest.modId, contents.buildings))
  );
  zipEntries.set(
    'data/quests.json',
    rewriteAudioRefsToSounds(serializeContentFile('quest', project.manifest.modId, contents.quests))
  );
  zipEntries.set(
    'data/recipes.json',
    rewriteAudioRefsToSounds(serializeContentFile('recipe', project.manifest.modId, contents.recipes))
  );
  zipEntries.set(
    'data/spawns.json',
    rewriteAudioRefsToSounds(serializeContentFile('spawn', project.manifest.modId, contents.spawns))
  );
  zipEntries.set(
    EXTENDED_CONFIG_FILE_PATHS.animation,
    rewriteAudioRefsToSounds(
      serializeExtendedConfigFile('animation', project.manifest.modId, contents.animations ?? [])
    )
  );
  zipEntries.set(
    EXTENDED_CONFIG_FILE_PATHS.audio,
    rewriteAudioRefsToSounds(
      serializeExtendedConfigFile('audio', project.manifest.modId, contents.audioCues ?? [])
    )
  );
  zipEntries.set(
    EXTENDED_CONFIG_FILE_PATHS.material,
    rewriteAudioRefsToSounds(
      serializeExtendedConfigFile('material', project.manifest.modId, contents.materials ?? [])
    )
  );
  zipEntries.set(
    EXTENDED_CONFIG_FILE_PATHS.loot_table,
    rewriteAudioRefsToSounds(
      serializeExtendedConfigFile('loot_table', project.manifest.modId, contents.lootTables ?? [])
    )
  );
  zipEntries.set(
    EXTENDED_CONFIG_FILE_PATHS.dialogue,
    rewriteAudioRefsToSounds(
      serializeExtendedConfigFile('dialogue', project.manifest.modId, contents.dialogues ?? [])
    )
  );
  zipEntries.set(
    EXTENDED_CONFIG_FILE_PATHS.world_object,
    rewriteAudioRefsToSounds(
      serializeExtendedConfigFile('world_object', project.manifest.modId, contents.worldObjects ?? [])
    )
  );
  zipEntries.set('data/load_order.json', serializeLoadOrderFile(project.manifest));

  const collectedAssetsList = project.assets.filter((a) =>
    collectedAssetArchivePaths.has(mapAssetArchivePath(a.path))
  );
  zipEntries.set(
    'data/registry.json',
    rewriteAudioRefsToSounds(
      buildStandardRegistryJson(project.manifest, contents, collectedAssetsList)
    )
  );
  zipEntries.set(
    'compatibility.json',
    JSON.stringify(
      {
        $schema: 'woa.compatibility.v1',
        modId: project.manifest.modId,
        version: project.manifest.version,
        ...compatibility,
        backwardCompatibilityNotes:
          'Maintains .woamod v1 manifest keys and directory hierarchy alongside Mod API v1 extended registries.',
      },
      null,
      2
    )
  );
  zipEntries.set(
    'localization/en.json',
    buildLocalizationJson(project.manifest, contents, existingEnLoc)
  );

  const arLoc = buildArabicLocalizationJson(
    project.manifest,
    contents,
    existingArLoc
  );
  if (arLoc.hasStrings || existingArLoc !== undefined) {
    zipEntries.set('localization/ar.json', arLoc.json);
    localizationFiles.push('localization/ar.json');
  }

  const finalLocalizationFiles = Array.from(new Set(localizationFiles));

  // Step 3: Generate mod.json
  const modJsonText = rewriteAudioRefsToSounds(
    buildRuntimeModJson(
      project.manifest,
      targetPlatform,
      builtAt,
      finalLocalizationFiles,
      {
        assets: collectedAssetArchivePaths.size,
        objects: registeredObjectCount,
      },
      compatibility
    )
  );
  zipEntries.set('mod.json', modJsonText);

  pipelineSteps.push({
    step: 3,
    label: t('builder.step3.label'),
    status: 'passed',
    detail: t('builder.step3.detail', {
      modId: project.manifest.modId,
      version: project.manifest.version,
    }),
  });

  pipelineSteps.push({
    step: 4,
    label: t('builder.step4.label'),
    status: 'passed',
    detail: t('builder.step4.detail', {
      count: collectedAssetArchivePaths.size,
    }),
  });

  pipelineSteps.push({
    step: 5,
    label: t('builder.step5.label'),
    status: 'passed',
    detail:
      prunedFiles.length > 0
        ? t('builder.step5.detailSome', { count: prunedFiles.length })
        : t('builder.step5.detailNone'),
  });

  // Step 6: Preserve required directory structure
  const requiredDirs = [...REQUIRED_ARCHIVE_DIRECTORIES];
  pipelineSteps.push({
    step: 6,
    label: t('builder.step6.label'),
    status: 'passed',
    detail: t('builder.step6.detail', {
      count: requiredDirs.length,
      dirs: requiredDirs.join(', '),
    }),
  });

  // Step 7: Validate all internal paths inside the assembled archive
  const seenArchivePaths = new Map<string, string>();
  let internalPathErrors = 0;

  for (const dir of requiredDirs) {
    const dirErr = analyzeArchivePath(dir);
    if (dirErr) {
      internalPathErrors++;
      diagnostics.push({
        level: 'error',
        code: 'INTERNAL_PATH_INVALID',
        path: dir,
        message: dirErr,
      });
    }
  }

  for (const [entryPath, payload] of zipEntries.entries()) {
    const pathErr = analyzeArchivePath(entryPath);
    if (pathErr) {
      internalPathErrors++;
      diagnostics.push({
        level: 'error',
        code: 'INTERNAL_PATH_INVALID',
        path: entryPath,
        message: pathErr,
      });
    } else if (isDisallowedModPackageFile(entryPath) || !isAllowedWoamodPackagePath(entryPath)) {
      internalPathErrors++;
      diagnostics.push({
        level: 'error',
        code: 'INTERNAL_PATH_INVALID',
        path: entryPath,
        message: `Disallowed file "${entryPath}" cannot be packaged inside a data-driven .woamod archive.`,
      });
    }
    const lower = entryPath.toLowerCase();
    if (seenArchivePaths.has(lower)) {
      internalPathErrors++;
      diagnostics.push({
        level: 'error',
        code: 'INTERNAL_PATH_COLLISION',
        path: entryPath,
        message: t('builder.internalCollision', { path: entryPath }),
      });
    } else {
      seenArchivePaths.set(lower, entryPath);
    }

    if (typeof payload === 'string' && entryPath.endsWith('.json')) {
      const refMatches = payload.match(/assets\/(?:models|textures|sounds|audio)\/[^"'\s]+/g) ?? [];
      for (const refPath of refMatches) {
        if (!zipEntries.has(refPath)) {
          internalPathErrors++;
          diagnostics.push({
            level: 'error',
            code: 'INTERNAL_REFERENCE_MISSING',
            path: entryPath,
            message: t('builder.internalMissingRef', {
              refPath,
              entryPath,
            }),
          });
        }
      }
    }
  }

  if (internalPathErrors > 0) {
    pipelineSteps.push({
      step: 7,
      label: t('builder.step7.label'),
      status: 'failed',
      detail: t('builder.step7.fail', { count: internalPathErrors }),
    });
    pipelineSteps.push(
      {
        step: 8,
        label: t('builder.step8.label'),
        status: 'skipped',
        detail: t('builder.skippedPathErrors'),
      },
      {
        step: 9,
        label: t('builder.step9.label', { filename: packageFileName }),
        status: 'skipped',
        detail: t('builder.skippedPathErrors'),
      }
    );

    const report: BuildReport = {
      id: `build_${Date.now()}`,
      modName: project.manifest.name,
      modId: project.manifest.modId,
      version: project.manifest.version,
      targetPlatform,
      success: false,
      buildStatus: 'blocked',
      packageFileName,
      timestamp: builtAt,
      durationMs: Math.max(10, Math.round(performance.now() - start)),
      fileCount: zipEntries.size,
      assetCount: collectedAssetArchivePaths.size,
      registeredObjectCount,
      excludedAssetCount: prunedFiles.length,
      estimatedBundleBytes: 0,
      packagedBytes: 0,
      dependencies,
      compatibility,
      warnings,
      diagnostics,
      pipelineSteps,
      prunedFiles,
      packagedPaths: Array.from(zipEntries.keys()).sort(),
      validationReport,
    };
    return { report, blob: null };
  }

  pipelineSteps.push({
    step: 7,
    label: t('builder.step7.label'),
    status: 'passed',
    detail: t('builder.step7.pass', { count: zipEntries.size }),
  });

  // Step 8 & 9: Package the mod and generate the .woamod zip blob
  const zip = new JSZip();
  for (const dir of requiredDirs) {
    zip.folder(dir);
  }
  for (const [entryPath, payload] of zipEntries.entries()) {
    zip.file(entryPath, payload);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const packagedPaths = Array.from(zipEntries.keys()).sort();
  const encoder = new TextEncoder();
  const uncompressedBytes = Array.from(zipEntries.values()).reduce((sum, val) => {
    return sum + (typeof val === 'string' ? encoder.encode(val).length : val.byteLength);
  }, 0);

  pipelineSteps.push({
    step: 8,
    label: t('builder.step8.label'),
    status: 'passed',
    detail: t('builder.step8.detail', {
      objects: registeredObjectCount,
      locales: finalLocalizationFiles.join(', '),
      assets: collectedAssetArchivePaths.size,
    }),
  });

  const sizeKb = (blob.size / 1024).toFixed(1);
  pipelineSteps.push({
    step: 9,
    label: t('builder.step9.label', { filename: packageFileName }),
    status: warnings.length > 0 ? 'warning' : 'passed',
    detail: t('builder.step9.detail', {
      filename: packageFileName,
      sizeKb,
    }),
  });

  diagnostics.push({
    level: 'info',
    code: 'BUILD_VERIFIED',
    message: t('builder.buildVerified', {
      filename: packageFileName,
      files: zipEntries.size,
      assets: collectedAssetArchivePaths.size,
      objects: registeredObjectCount,
      sizeKb,
    }),
  });

  const report: BuildReport = {
    id: `build_${Date.now()}`,
    modName: project.manifest.name,
    modId: project.manifest.modId,
    version: project.manifest.version,
    targetPlatform,
    success: true,
    buildStatus: warnings.length > 0 ? 'passed_with_warnings' : 'passed',
    packageFileName,
    timestamp: builtAt,
    durationMs: Math.max(12, Math.round(performance.now() - start)),
    fileCount: zipEntries.size,
    assetCount: collectedAssetArchivePaths.size,
    registeredObjectCount,
    excludedAssetCount: prunedFiles.length,
    estimatedBundleBytes: uncompressedBytes,
    packagedBytes: blob.size,
    dependencies,
    compatibility,
    warnings,
    diagnostics,
    pipelineSteps,
    prunedFiles,
    packagedPaths,
    validationReport,
  };

  return { report, blob };
}

export async function buildModProjectAsync(
  project: ModProject,
  targetPlatform: TargetPlatform,
  allProjects: ModProject[] = [project]
): Promise<BuildReport> {
  const { report } = await runBuildPipeline(project, targetPlatform, allProjects);
  return report;
}

export async function exportModArchiveBlob(
  project: ModProject,
  targetPlatform: TargetPlatform,
  options?: {
    allProjects?: ModProject[];
    confirmWarnings?: boolean;
  }
): Promise<{ blob: Blob; filename: string; report: BuildReport }> {
  const { report, blob } = await runBuildPipeline(
    project,
    targetPlatform,
    options?.allProjects ?? [project]
  );

  if (!report.success || !blob || (report.validationReport?.errorCount ?? 0) > 0) {
    throw new ExportBlockedError(report);
  }

  if (
    (report.validationReport?.warningCount ?? 0) > 0 &&
    !options?.confirmWarnings
  ) {
    throw new ExportWarningsConfirmationError(report);
  }

  return {
    blob,
    filename: report.packageFileName,
    report,
  };
}

export async function generateUniqueExportFilename(
  baseFilename: string,
  existsFn: (candidate: string) => Promise<boolean> | boolean
): Promise<string> {
  const clean = baseFilename.trim() || 'world-of-adventure-mod.woamod';
  if (!(await existsFn(clean))) {
    return clean;
  }
  const dotIdx = clean.lastIndexOf('.');
  const stem = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
  const ext = dotIdx > 0 ? clean.slice(dotIdx) : '';
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!(await existsFn(candidate))) {
      return candidate;
    }
  }
  return `${stem}-${Date.now()}${ext}`;
}

export async function saveExportedPackage(
  blob: Blob,
  filename: string,
  options?: {
    promptSaveDialog?: boolean;
    subdir?: 'Exports' | 'Backups' | 'Projects' | 'Assets' | 'Settings' | 'Templates';
    conflictResolution?: 'ask' | 'replace' | 'rename';
  }
): Promise<SaveExportResult> {
  return getPlatformAdapter().saveExportFile({
    fileName: filename,
    blob,
    mimeType: blob.type || 'application/octet-stream',
    promptSaveDialog: options?.promptSaveDialog,
    subdir: options?.subdir,
    conflictResolution: options?.conflictResolution,
  });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    void adapter
      .saveExportFile({
        fileName: filename,
        blob,
        mimeType: blob.type || 'application/octet-stream',
        promptSaveDialog: adapter.platform === 'android' ? true : false,
      })
      .catch(() => {
        // Error already reported via AndroidAccessManager banner
      });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function validateBackupRecord(record: ProjectBackupRecord): void {
  if (
    !record ||
    typeof record !== 'object' ||
    !record.project ||
    !record.project.manifest ||
    !Array.isArray(record.project.files) ||
    !Array.isArray(record.project.assets)
  ) {
    throw new Error(t('builder.errInvalidJsonImport'));
  }
  const safeModId = sanitizeSafeModId(record.project.manifest.modId);
  if (!record.project.manifest.name?.trim() || !record.project.manifest.version?.trim()) {
    throw new Error(t('builder.errInvalidJsonImport'));
  }
  if (!safeModId) {
    throw new Error(t('builder.errInvalidJsonImport'));
  }
  sanitizeManifestEntryPoint(record.project.manifest.entryPoint);
}

export async function parseBackupRecordFile(file: File): Promise<ProjectBackupRecord> {
  assertSafeFileSize(file.size, MAX_JSON_IMPORT_BYTES, `Backup file "${file.name}"`);
  const text = await file.text();
  const parsed = safeJsonParse<Partial<ProjectBackupRecord>>(text);

  if (
    !parsed ||
    !parsed.project?.manifest ||
    !Array.isArray(parsed.project.files) ||
    !Array.isArray(parsed.project.assets)
  ) {
    throw new Error(t('builder.errInvalidJsonImport'));
  }

  const safeModId = sanitizeSafeModId(parsed.project.manifest.modId);
  const restoredProject: ModProject = syncContentFilesInProject(
    {
      ...parsed.project,
      id: safeModId,
      manifest: {
        ...parsed.project.manifest,
        modId: safeModId,
        entryPoint: sanitizeManifestEntryPoint(parsed.project.manifest.entryPoint),
      },
      lastOpenedAt: new Date().toISOString(),
    },
    resolveProjectContents(parsed.project)
  );

  const normalizedRecord: ProjectBackupRecord = {
    id:
      typeof parsed.id === 'string' && parsed.id.trim()
        ? parsed.id.trim()
        : `backup_restore_${Date.now()}`,
    modId: restoredProject.manifest.modId,
    modName:
      typeof parsed.modName === 'string' && parsed.modName.trim()
        ? parsed.modName.trim()
        : restoredProject.manifest.name,
    version:
      typeof parsed.version === 'string' && parsed.version.trim()
        ? parsed.version.trim()
        : restoredProject.manifest.version,
    label:
      typeof parsed.label === 'string' && parsed.label.trim()
        ? parsed.label.trim()
        : file.name,
    createdAt:
      typeof parsed.createdAt === 'string' && parsed.createdAt.trim()
        ? parsed.createdAt.trim()
        : new Date().toISOString(),
    reason: parsed.reason === 'pre-build' ? 'pre-build' : 'manual',
    sizeBytes:
      typeof parsed.sizeBytes === 'number' && parsed.sizeBytes >= 0
        ? parsed.sizeBytes
        : file.size,
    project: restoredProject,
  };

  validateBackupRecord(normalizedRecord);
  return normalizedRecord;
}

export function formatProjectZipFilename(modName: string, modId: string): string {
  const cleaned = modName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = cleaned || modId.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'world-of-adventure-project';
  return `${base}.woaproj.zip`;
}

export async function exportWorkspaceProjectZip(project: ModProject): Promise<Blob> {
  const zip = new JSZip();
  const resolved = syncContentFilesInProject(project, resolveProjectContents(project));
  const blobManifest: Record<string, { path: string; mimeType: string }> = {};

  for (const asset of resolved.assets) {
    if (asset.blobKey) {
      const rec = await getAssetBlobRecord(asset.blobKey);
      if (rec) {
        const archiveBlobPath = `.woa-blobs/${asset.id}`;
        zip.file(archiveBlobPath, rec.data);
        blobManifest[asset.id] = {
          path: archiveBlobPath,
          mimeType: rec.mimeType,
        };
      }
    }
  }

  zip.file(
    'woa-project.json',
    JSON.stringify(
      {
        woaFormat: 'woa.project.v1',
        exportedAt: new Date().toISOString(),
        project: resolved,
        blobManifest,
      },
      null,
      2
    )
  );

  for (const file of resolved.files) {
    if (file.type !== 'folder' && typeof file.content === 'string') {
      zip.file(file.path, file.content);
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function importModFromFile(file: File): Promise<ModProject> {
  if (file.name.toLowerCase().endsWith('.json')) {
    assertSafeFileSize(file.size, MAX_JSON_IMPORT_BYTES, `JSON file "${file.name}"`);
    const text = await file.text();
    const parsed = safeJsonParse<
      Partial<ModManifest> & Partial<ModProject> & Partial<ProjectBackupRecord>
    >(text);

    if (parsed.project?.manifest && parsed.project?.files) {
      const safeModId = sanitizeSafeModId(parsed.project.manifest.modId);
      const restored: ModProject = {
        ...parsed.project,
        id: safeModId,
        manifest: {
          ...parsed.project.manifest,
          modId: safeModId,
          entryPoint: sanitizeManifestEntryPoint(parsed.project.manifest.entryPoint),
        },
        lastOpenedAt: new Date().toISOString(),
      };
      return syncContentFilesInProject(restored, resolveProjectContents(restored));
    }

    if (parsed.manifest && parsed.files && parsed.assets) {
      const safeModId = sanitizeSafeModId(parsed.manifest.modId);
      const hydrated = {
        ...parsed,
        id: safeModId,
        manifest: {
          ...parsed.manifest,
          modId: safeModId,
          entryPoint: sanitizeManifestEntryPoint(parsed.manifest.entryPoint),
        },
        lastOpenedAt: new Date().toISOString(),
      } as ModProject;
      return {
        ...hydrated,
        contents: resolveProjectContents(hydrated),
      };
    }
    if (parsed.modId && parsed.name) {
      const safeModId = sanitizeSafeModId(parsed.modId);
      const localized = (
        parsed as {
          localized?: { name?: LocalizedTextMap; description?: LocalizedTextMap };
        }
      ).localized;
      const mergedName = mergeLocalizedField(
        parsed.name,
        parsed.translations?.name ?? localized?.name
      );
      const mergedDesc = mergeLocalizedField(
        parsed.description ?? '',
        parsed.translations?.description ?? localized?.description
      );
      return createModProject({
        modId: safeModId,
        name: mergedName.value,
        nameAr: mergedName.translations?.ar,
        version: parsed.version || '0.1.0',
        author: parsed.author || 'Imported Author',
        description: mergedDesc.value,
        descriptionAr: mergedDesc.translations?.ar,
        supportedGameVersion:
          typeof parsed.supportedGameVersion === 'string' && parsed.supportedGameVersion.trim()
            ? parsed.supportedGameVersion.trim()
            : DEFAULT_GAME_VERSION,
        categories: parsed.categories?.length ? parsed.categories : ['Items'],
      });
    }
    throw new Error(t('builder.errInvalidJsonImport'));
  }

  // .woaproj.zip / .woamod / .zip archive
  assertSafeFileSize(file.size, MAX_ARCHIVE_BYTES, `Mod archive "${file.name}"`);
  const zip = await JSZip.loadAsync(file);
  const isWoamodArchive = file.name.toLowerCase().endsWith('.woamod');
  const projectBundleEntry = !isWoamodArchive ? zip.file('woa-project.json') : null;
  if (projectBundleEntry) {
    validateZipArchiveLimits(zip, file.size);
    const bundleJson = await readZipEntryTextBounded(projectBundleEntry);
    const rawBundle = safeJsonParse<{
      project?: ModProject;
      blobManifest?: Record<string, { path: string; mimeType: string }>;
    }>(bundleJson);
    if (!rawBundle.project?.manifest) {
      throw new Error(t('builder.errMissingBundleManifest'));
    }
    const restoredProject = rawBundle.project;
    const safeModId = sanitizeSafeModId(restoredProject.manifest.modId);
    restoredProject.manifest.modId = safeModId;
    restoredProject.manifest.entryPoint = sanitizeManifestEntryPoint(
      restoredProject.manifest.entryPoint
    );

    for (const [assetId, meta] of Object.entries(rawBundle.blobManifest ?? {})) {
      if (!meta?.path) continue;
      const safeBlobArchivePath = assertSafeArchiveEntryPath(meta.path);
      const blobEntry = zip.file(safeBlobArchivePath);
      if (blobEntry) {
        const buf = await readZipEntryBufferBounded(blobEntry);
        const asset = restoredProject.assets.find((a) => a.id === assetId);
        const safeAssetId = assetId.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const blobKey = `${safeModId}/${safeAssetId}`;
        await saveAssetBlob(blobKey, buf, meta.mimeType);
        if (asset) asset.blobKey = blobKey;
      }
    }
    const hydrated: ModProject = {
      ...restoredProject,
      id: safeModId,
      lastOpenedAt: new Date().toISOString(),
    };
    return syncContentFilesInProject(hydrated, resolveProjectContents(hydrated));
  }

  // Runtime .woamod / standard mod archive: enforce strict data-driven package security
  assertSafeWoamodPackageLimits(zip, file.size);

  const manifestEntry = zip.file('mod.manifest.json') ?? zip.file('mod.json');
  if (!manifestEntry) {
    throw new Error(t('builder.errArchiveMissingManifest'));
  }

  const manifestRaw = await readZipEntryTextBounded(manifestEntry);
  const rawManifest = safeJsonParse<
    ModManifest & {
      localized?: { name?: LocalizedTextMap; description?: LocalizedTextMap };
      compatibility?: { requiresNativeCode?: boolean };
    }
  >(manifestRaw);
  if (rawManifest.compatibility?.requiresNativeCode === true) {
    throw new Error(
      'Security violation detected. Native code execution is not permitted inside data-driven .woamod mods.'
    );
  }
  const safeModId = sanitizeSafeModId(rawManifest.modId);
  const mergedName = mergeLocalizedField(
    rawManifest.name,
    rawManifest.translations?.name ?? rawManifest.localized?.name
  );
  const mergedDesc = mergeLocalizedField(
    rawManifest.description || '',
    rawManifest.translations?.description ?? rawManifest.localized?.description
  );
  const manifestTranslations =
    mergedName.translations || mergedDesc.translations
      ? {
          ...(mergedName.translations ? { name: mergedName.translations } : {}),
          ...(mergedDesc.translations ? { description: mergedDesc.translations } : {}),
        }
      : undefined;

  const importedGameVersion =
    typeof rawManifest.supportedGameVersion === 'string'
      ? rawManifest.supportedGameVersion.trim()
      : '';
  const parsedImportedVer = parseGameVersion(importedGameVersion);
  const defaultImportedMax =
    parsedImportedVer && parsedImportedVer.major >= 2
      ? `${parsedImportedVer.major}.x`
      : '2.x';

  const manifest: ModManifest = {
    modId: safeModId,
    name: mergedName.value,
    version: rawManifest.version || '0.1.0',
    author: rawManifest.author || 'Imported Author',
    description: mergedDesc.value,
    ...(manifestTranslations ? { translations: manifestTranslations } : {}),
    supportedGameVersion: importedGameVersion,
    minGameVersion: rawManifest.minGameVersion || MIN_SUPPORTED_GAME_VERSION,
    maxGameVersion: rawManifest.maxGameVersion || defaultImportedMax,
    modApiVersion: rawManifest.modApiVersion || WOA_MOD_API_VERSION,
    packageFormatVersion:
      rawManifest.packageFormatVersion || WOA_COMPATIBLE_PACKAGE_FORMATS[0],
    categories: rawManifest.categories?.length ? rawManifest.categories : ['Items'],
    entryPoint: sanitizeManifestEntryPoint(rawManifest.entryPoint),
    targetPlatforms: rawManifest.targetPlatforms?.length
      ? rawManifest.targetPlatforms
      : ['universal', 'windows', 'android'],
    dependencies: rawManifest.dependencies ?? [],
    loadOrder: rawManifest.loadOrder ?? {
      priority: 100,
      loadAfter: ['woa.core'],
      loadBefore: [],
    },
    changelog: rawManifest.changelog ?? [],
    createdAt: rawManifest.createdAt || new Date().toISOString(),
    updatedAt: rawManifest.updatedAt || new Date().toISOString(),
  };

  const now = new Date().toISOString();
  const files: ModFileNode[] = [];
  const assets: ModAsset[] = [];

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    const cleanPath = entry.name.replace(/\/$/, '');
    if (!cleanPath || cleanPath === 'build-metadata.json') continue;
    if (analyzeArchivePath(cleanPath)) continue;

    const parts = cleanPath.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;

    if (entry.dir) {
      files.push({
        id: `dir_${cleanPath}`,
        name,
        path: cleanPath,
        parentPath,
        type: 'folder',
        updatedAt: now,
      });
      continue;
    }

    const spec = getAssetFormatSpec(name);
    if (cleanPath.startsWith('assets/')) {
      if (!spec) {
        continue;
      }
      const expectedDirCat = getExpectedAssetCategoryForPath(cleanPath);
      if (expectedDirCat && expectedDirCat !== spec.category) {
        throw new Error(
          `Incompatible asset (${cleanPath}): wrong_category — ${spec.formatLabel} files (${spec.category}) must reside under ${spec.targetDirectory}/.`
        );
      }
    }

    if (spec) {
      if (spec.ext === 'woa3d') {
        if (!cleanPath.toLowerCase().startsWith('assets/models/')) {
          throw new Error(
            `Incompatible asset (${cleanPath}): wrong_category — WOA3D 3D models must reside under assets/models/.`
          );
        }
        const content = await readZipEntryTextBounded(entry);
        const parsedWoa3d = parseAndValidateWoa3dContent(content);
        const assetId = `asset_import_${assets.length + 1}`;
        assets.push({
          id: assetId,
          name: name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
          path: cleanPath,
          type: '3d-model',
          modCategory: parsedWoa3d.modCategory,
          preset: parsedWoa3d.preset,
          format: spec.formatLabel,
          sizeBytes: content.length,
          triangleEstimate: parsedWoa3d.triangleEstimate,
          pivotMode: parsedWoa3d.pivotMode,
          collision: parsedWoa3d.collision,
          transform: parsedWoa3d.transform,
          material: parsedWoa3d.material,
          metadata: { source: 'package-import', imported: true },
          createdAt: now,
        });

        files.push({
          id: `file_${cleanPath}`,
          name,
          path: cleanPath,
          parentPath,
          type: spec.nodeType,
          content,
          assetId,
          updatedAt: now,
        });
        continue;
      }

      const buf = await readZipEntryBufferBounded(entry);
      const assetId = `asset_pkg_${assets.length + 1}_${Date.now().toString().slice(-4)}`;
      const blobKey = `${safeModId}/${assetId}`;
      await saveAssetBlob(blobKey, buf, spec.defaultMime);

      let dimensions: ModAsset['dimensions'];
      let triangleEstimate = 0;
      let extractedMaterials: ModAsset['extractedMaterials'];
      let resolution: ModAsset['resolution'];
      let durationSeconds: number | undefined;

      if (spec.category === '3d-model') {
        try {
          const stats = await inspect3DBuffer(buf, spec.ext);
          dimensions = stats.dimensions;
          triangleEstimate = stats.triangleEstimate;
          extractedMaterials = stats.materials;
        } catch {
          // fallback
        }
      } else if (spec.category === 'texture') {
        resolution = await inspectImageBlob(new Blob([buf], { type: spec.defaultMime }));
      } else if (spec.category === 'audio') {
        durationSeconds = await inspectAudioBlob(
          new Blob([buf], { type: spec.defaultMime })
        );
      }

      assets.push({
        id: assetId,
        name: name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        path: cleanPath,
        type: spec.category,
        blobKey,
        mimeType: spec.defaultMime,
        originalFileName: name,
        isImported: true,
        format: spec.formatLabel,
        sizeBytes: buf.byteLength,
        triangleEstimate,
        dimensions,
        resolution,
        durationSeconds,
        extractedMaterials,
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        material: {
          color: extractedMaterials?.[0]?.color ?? '#64748B',
          accentColor: '#3B82F6',
          roughness: 0.4,
          metalness: 0.4,
          emissiveIntensity: 0.25,
          wireframe: false,
        },
        metadata: { source: 'package-import', localCopyStored: true },
        createdAt: now,
      });

      files.push({
        id: `file_${cleanPath}`,
        name,
        path: cleanPath,
        parentPath,
        type: spec.nodeType,
        assetId,
        updatedAt: now,
      });
      continue;
    }

    const content = await readZipEntryTextBounded(entry);
    let nodeType: ModFileNode['type'] = 'data';

    if (cleanPath === 'mod.manifest.json' || cleanPath === 'mod.json') {
      nodeType = 'manifest';
    } else if (name.endsWith('.ts') || name.endsWith('.js')) {
      nodeType = 'script';
    } else if (name.endsWith('.md') || name.endsWith('.txt')) {
      nodeType = 'doc';
    }

    files.push({
      id: `file_${cleanPath}`,
      name,
      path: cleanPath,
      parentPath,
      type: nodeType,
      content,
      updatedAt: now,
    });
  }

  // Ensure workspace mod.manifest.json exists when importing a runtime .woamod containing mod.json
  if (!files.some((f) => f.path === 'mod.manifest.json')) {
    files.push({
      id: 'file_manifest',
      name: 'mod.manifest.json',
      path: 'mod.manifest.json',
      parentPath: null,
      type: 'manifest',
      content: serializeManifest(manifest),
      updatedAt: now,
    });
  }

  const importedProject: ModProject = {
    id: manifest.modId,
    manifest,
    files,
    assets,
    activeAssetId: assets[0]?.id ?? null,
    lastOpenedAt: now,
  };

  return {
    ...importedProject,
    contents: resolveProjectContents(importedProject),
  };
}
