import {
  getAssetFormatSpec,
  getExpectedAssetCategoryForPath,
  getFileExtension,
  inspect3DBuffer,
  inspectAudioBlob,
  inspectImageBlob,
  isSupportedAssetPath,
  parseAndValidateWoa3dContent,
} from '@/src/core/assets/assetPipeline';
import {
  CONTENT_FILE_PATHS,
  CONTENT_KIND_LABELS,
  EXTENDED_CONFIG_FILE_PATHS,
  NAMESPACED_ID_REGEX,
  collectAllContentIds,
  resolveProjectContents,
  validateAnimationConfig,
  validateArmor,
  validateAudioConfig,
  validateBuilding,
  validateDialogueTreeConfig,
  validateItem,
  validateLootTableConfig,
  validateMaterialConfig,
  validateMonster,
  validateNpc,
  validateQuest,
  validateRecipe,
  validateSpawn,
  validateWeapon,
  validateWorldObjectConfig,
} from '@/src/core/content/contentRegistry';
import {
  CURRENT_GAME_VERSION,
  CURRENT_MOD_CONTENT_SCHEMA_VERSION,
  MIN_SUPPORTED_GAME_VERSION,
  SUPPORTED_MOD_CONTENT_SCHEMA_VERSIONS,
  isSupportedContentSchemaVersion,
  parseSchemaVersionNumber,
  validateMaxGameVersion,
  validateSupportedGameVersion,
} from '@/src/core/api/woaModApiSpec';
import { t, type TranslationKey } from '@/src/i18n';
import {
  validateModId,
  validateSemver,
} from '@/src/core/project/modScaffolder';
import { getAssetBlobRecord } from '@/src/core/storage/modRepository';
import { isBlockedExecutableFile } from '@/src/core/security/importGuard';
import { APP_VERSION } from '@/src/core/version';
import {
  ContentKind,
  ContentValidationIssue,
  ExtendedConfigKind,
  ModAsset,
  ModContentDatabase,
  ModManifest,
  ModProject,
  ModValidationReport,
  TargetPlatform,
  ValidationCategory,
  ValidationIssue,
  ValidationSeverity,
  WoAContentBase,
} from '@/src/types/mod';

const RESERVED_WINDOWS_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const RESERVED_MOD_NAMESPACES = new Set(['woa', 'core', 'system', 'game', 'default']);

const FIELD_SUGGESTION_KEYS: Record<string, TranslationKey> = {
  id: 'val.sug.id',
  name: 'val.sug.name',
  description: 'val.sug.description',
  icon: 'val.sug.icon',
  model: 'val.sug.model',
  sound: 'val.sug.sound',
  stackSize: 'val.sug.stackSize',
  weight: 'val.sug.weight',
  value: 'val.sug.value',
  damage: 'val.sug.damage',
  attackSpeed: 'val.sug.attackSpeed',
  range: 'val.sug.range',
  durability: 'val.sug.durability',
  criticalChance: 'val.sug.criticalChance',
  'projectile.projectileId': 'val.sug.projectileId',
  'projectile.speed': 'val.sug.projectileSpeed',
  animation: 'val.sug.animation',
  defense: 'val.sug.defense',
  slot: 'val.sug.slot',
  health: 'val.sug.health',
  movementSpeed: 'val.sug.movementSpeed',
  faction: 'val.sug.faction',
  speed: 'val.sug.speed',
  detectionRange: 'val.sug.detectionRange',
  'spawnRules.biomes': 'val.sug.spawnBiomes',
  'spawnRules.groupSize': 'val.sug.spawnGroup',
  'spawnRules.spawnWeight': 'val.sug.spawnWeight',
  objectives: 'val.sug.objectives',
  rewards: 'val.sug.rewards',
  chain: 'val.sug.chain',
  'chain.nextQuestId': 'val.sug.nextQuestId',
  outputItemId: 'val.sug.outputItemId',
  outputQuantity: 'val.sug.outputQuantity',
  craftTimeSeconds: 'val.sug.craftTimeSeconds',
  ingredients: 'val.sug.ingredients',
  footprint: 'val.sug.footprint',
  collision: 'val.sug.collision',
  entityId: 'val.sug.entityId',
  spawnPoints: 'val.sug.spawnPoints',
  biomes: 'val.sug.biomes',
  'conditions.level': 'val.sug.level',
  population: 'val.sug.population',
  respawn: 'val.sug.respawn',
};

function suggestionForField(field: string): string {
  const key = FIELD_SUGGESTION_KEYS[field];
  if (key) return t(key);
  if (field.startsWith('loot.')) {
    return t('val.sug.loot');
  }
  if (field.startsWith('objectives.')) {
    return t('val.sug.objList');
  }
  if (field.startsWith('rewards.items.')) {
    return t('val.sug.rewardItems');
  }
  if (field.startsWith('ingredients.')) {
    return t('val.sug.ingList');
  }
  if (field.startsWith('dialogue.') || field.startsWith('questReferences.')) {
    return t('val.sug.dialogueList');
  }
  if (field.startsWith('materials.')) {
    return t('val.sug.matList');
  }
  return t('val.sug.default');
}

function assetTypeLabel(assetType: '3d-model' | 'texture' | 'audio' | 'data'): string {
  if (assetType === '3d-model') return t('assets.filterModels');
  if (assetType === 'texture') return t('assets.filterTextures');
  if (assetType === 'audio') return t('assets.filterAudio');
  return t('validation.cat.data');
}

export function analyzeArchivePath(rawPath: string): string | null {
  if (!rawPath || !rawPath.trim()) {
    return t('validator.archiveEmpty');
  }
  if (/[\x00-\x1f]/.test(rawPath)) {
    return t('validator.archiveControlChars');
  }
  if (rawPath.includes('\\')) {
    return t('validator.archiveBackslashes');
  }
  if (/^[a-zA-Z]:/.test(rawPath)) {
    return t('validator.archiveDriveLetter');
  }
  if (rawPath.startsWith('/')) {
    return t('validator.archiveAbsolute');
  }
  if (rawPath.includes('//')) {
    return t('validator.archiveDoubleSlash');
  }
  if (/[<>:"|?*]/.test(rawPath)) {
    return t('validator.archiveForbiddenChars');
  }
  const segments = rawPath.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') {
      return t('validator.archiveUnsafeSeg', { seg: seg || 'empty' });
    }
    const baseName = seg.split('.')[0].toUpperCase();
    if (RESERVED_WINDOWS_NAMES.has(baseName)) {
      return t('validator.archiveReservedName', { seg });
    }
  }
  return null;
}

function parseSemverTuple(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

export function satisfiesVersionRange(actualVersion: string, rangeRaw: string): boolean {
  const actual = parseSemverTuple(actualVersion);
  if (!actual) return false;
  const range = rangeRaw.trim();
  if (!range || range === '*') return true;

  if (range.startsWith('^')) {
    const target = parseSemverTuple(range.slice(1));
    if (!target) return false;
    if (compareSemver(actual, target) < 0) return false;
    if (target[0] === 0) {
      return actual[0] === 0 && actual[1] === target[1];
    }
    return actual[0] === target[0];
  }
  if (range.startsWith('~')) {
    const target = parseSemverTuple(range.slice(1));
    if (!target) return false;
    return (
      compareSemver(actual, target) >= 0 &&
      actual[0] === target[0] &&
      actual[1] === target[1]
    );
  }
  if (range.startsWith('>=')) {
    const target = parseSemverTuple(range.slice(2));
    return target ? compareSemver(actual, target) >= 0 : false;
  }
  if (range.startsWith('>')) {
    const target = parseSemverTuple(range.slice(1));
    return target ? compareSemver(actual, target) > 0 : false;
  }
  if (range.startsWith('<=')) {
    const target = parseSemverTuple(range.slice(2));
    return target ? compareSemver(actual, target) <= 0 : false;
  }
  if (range.startsWith('<')) {
    const target = parseSemverTuple(range.slice(1));
    return target ? compareSemver(actual, target) < 0 : false;
  }
  const exact = parseSemverTuple(range.replace(/^=/, ''));
  return exact ? compareSemver(actual, exact) === 0 : false;
}

function hasMagicBytes(bytes: Uint8Array, expected: number[], offset = 0): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
}

function validateAudioBytes(bytes: Uint8Array, ext: string): string | null {
  if (bytes.length < 12) {
    return t('validator.audioTooSmall');
  }
  if (ext === 'wav') {
    const isRiff = hasMagicBytes(bytes, [0x52, 0x49, 0x46, 0x46], 0); // RIFF
    const isWave = hasMagicBytes(bytes, [0x57, 0x41, 0x56, 0x45], 8); // WAVE
    if (!isRiff || !isWave) {
      return t('validator.wavMissingHeader');
    }
    return null;
  }
  if (ext === 'ogg') {
    if (!hasMagicBytes(bytes, [0x4f, 0x67, 0x67, 0x53], 0)) {
      return t('validator.oggMissingHeader');
    }
    return null;
  }
  if (ext === 'mp3') {
    const hasId3 = hasMagicBytes(bytes, [0x49, 0x44, 0x33], 0); // ID3
    const hasFrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    if (!hasId3 && !hasFrameSync) {
      return t('validator.mp3MissingHeader');
    }
    return null;
  }
  return t('validator.audioUnsupportedExt', { ext });
}

function validateTextureBytes(bytes: Uint8Array, ext: string): string | null {
  if (bytes.length < 8) {
    return t('validator.textureTooSmall');
  }
  if (ext === 'png') {
    if (!hasMagicBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)) {
      return t('validator.pngInvalidSig');
    }
    return null;
  }
  if (ext === 'jpg' || ext === 'jpeg') {
    if (!hasMagicBytes(bytes, [0xff, 0xd8, 0xff], 0)) {
      return t('validator.jpgInvalidSig');
    }
    return null;
  }
  return t('validator.textureUnsupportedExt', { ext });
}

function findModCycle(
  startModId: string,
  allProjects: ModProject[],
  currentProject: ModProject
): string[] | null {
  const depMap = new Map<string, string[]>();
  for (const proj of allProjects) {
    const deps = (proj.manifest.dependencies ?? []).map((d) => d.modId.trim()).filter(Boolean);
    depMap.set(proj.manifest.modId, deps);
  }
  depMap.set(
    currentProject.manifest.modId,
    (currentProject.manifest.dependencies ?? []).map((d) => d.modId.trim()).filter(Boolean)
  );

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string, stack: string[]): string[] | null => {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node);
      return [...stack.slice(idx), node];
    }
    if (visited.has(node)) return null;

    visiting.add(node);
    const neighbors = depMap.get(node) ?? [];
    for (const next of neighbors) {
      const cycle = dfs(next, [...stack, next]);
      if (cycle) return cycle;
    }
    visiting.delete(node);
    visited.add(node);
    return null;
  };

  return dfs(startModId, [startModId]);
}

function findDirectedCycle(edges: Map<string, string[]>): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string, stack: string[]): string[] | null => {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node);
      return [...stack.slice(idx), node];
    }
    if (visited.has(node)) return null;

    visiting.add(node);
    for (const next of edges.get(node) ?? []) {
      const cycle = dfs(next, [...stack, next]);
      if (cycle) return cycle;
    }
    visiting.delete(node);
    visited.add(node);
    return null;
  };

  for (const node of edges.keys()) {
    const cycle = dfs(node, [node]);
    if (cycle) return cycle;
  }
  return null;
}

function normalizeRelativeRef(baseDir: string, uri: string): string {
  const rawParts = [...(baseDir ? baseDir.split('/') : []), ...uri.split('/')];
  const out: string[] = [];
  for (const p of rawParts) {
    if (!p || p === '.') continue;
    if (p === '..') {
      out.pop();
    } else {
      out.push(p);
    }
  }
  return out.join('/');
}

function isExternalUrlOrAbsPath(ref: string): boolean {
  const trimmed = ref.trim();
  return (
    /^(https?:|file:|ftp:|blob:)/i.test(trimmed) ||
    trimmed.startsWith('/') ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  );
}

export async function validateModProject(
  project: ModProject,
  allProjects: ModProject[] = [project],
  targetPlatform: TargetPlatform = 'universal'
): Promise<ModValidationReport> {
  const start = performance.now();
  const issues: ValidationIssue[] = [];
  let seq = 0;

  const pushIssue = (
    severity: ValidationSeverity,
    code: string,
    category: ValidationCategory,
    data: {
      file: string;
      object: string;
      property: string;
      problem: string;
      suggestion: string;
      targetType?: ValidationIssue['targetType'];
      targetRef?: string;
    }
  ) => {
    issues.push({
      id: `val_${++seq}_${code}`,
      severity,
      code,
      category,
      ...data,
    });
  };

  const { manifest, files, assets } = project;
  const manifestNode = files.find((f) => f.path === 'mod.manifest.json');
  const modJsonNode = files.find((f) => f.path === 'mod.json');
  const activeManifestFile = manifestNode
    ? 'mod.manifest.json'
    : modJsonNode
      ? 'mod.json'
      : 'mod.manifest.json';
  let detectedSchemaVersion: number | undefined;
  const supportedSchemaListText = SUPPORTED_MOD_CONTENT_SCHEMA_VERSIONS.map((v) => `v${v}`).join(', ');

  // ---------------------------------------------------------------------------
  // 1. MANIFEST & METADATA (mod.json / mod.manifest.json, Mod ID, Version)
  // ---------------------------------------------------------------------------
  if (!manifestNode && !modJsonNode) {
    pushIssue('error', 'MANIFEST_FILE_MISSING', 'manifest', {
      file: 'mod.manifest.json',
      object: t('validator.obj.manifest'),
      property: 'file',
      problem: t('validator.manifestMissingProblem'),
      suggestion: t('validator.manifestMissingSuggestion'),
      targetType: 'manifest',
    });
  } else {
    for (const node of [manifestNode, modJsonNode].filter(Boolean)) {
      if (!node) continue;
      if (!node.content?.trim()) {
        pushIssue('error', 'MANIFEST_EMPTY', 'manifest', {
          file: node.path,
          object: t('validator.obj.manifest'),
          property: 'content',
          problem: t('validator.manifestEmptyProblem', { path: node.path }),
          suggestion: t('validator.manifestEmptySuggestion'),
          targetType: 'file',
          targetRef: node.path,
        });
      } else {
        try {
          const parsed = JSON.parse(node.content) as Partial<ModManifest> & {
            schemaVersion?: unknown;
          };
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            pushIssue('error', 'MANIFEST_INVALID_OBJECT', 'manifest', {
              file: node.path,
              object: t('validator.obj.manifest'),
              property: 'root',
              problem: t('validator.manifestInvalidObjProblem', { path: node.path }),
              suggestion: t('validator.manifestInvalidObjSuggestion'),
              targetType: 'file',
              targetRef: node.path,
            });
          } else {
            if (parsed.schemaVersion !== undefined) {
              if (!isSupportedContentSchemaVersion(parsed.schemaVersion)) {
                pushIssue('error', 'UNSUPPORTED_SCHEMA_VERSION', 'manifest', {
                  file: node.path,
                  object: t('validator.obj.manifest'),
                  property: 'schemaVersion',
                  problem: t('validator.unsupportedSchemaProblem', {
                    path: node.path,
                    schemaVersion: String(parsed.schemaVersion),
                    supported: supportedSchemaListText,
                  }),
                  suggestion: t('validator.unsupportedSchemaSuggestion', {
                    supported: supportedSchemaListText,
                  }),
                  targetType: 'file',
                  targetRef: node.path,
                });
              } else {
                const sv = parseSchemaVersionNumber(parsed.schemaVersion);
                if (sv !== null) {
                  detectedSchemaVersion = Math.max(detectedSchemaVersion ?? 0, sv);
                }
              }
            }
            if (parsed.packageFormatVersion !== undefined) {
              if (!isSupportedContentSchemaVersion(parsed.packageFormatVersion)) {
                pushIssue('error', 'UNSUPPORTED_SCHEMA_VERSION', 'manifest', {
                  file: node.path,
                  object: t('validator.obj.manifest'),
                  property: 'packageFormatVersion',
                  problem: t('validator.unsupportedSchemaProblem', {
                    path: node.path,
                    schemaVersion: String(parsed.packageFormatVersion),
                    supported: supportedSchemaListText,
                  }),
                  suggestion: t('validator.unsupportedSchemaSuggestion', {
                    supported: supportedSchemaListText,
                  }),
                  targetType: 'file',
                  targetRef: node.path,
                });
              } else if (detectedSchemaVersion === undefined) {
                const pv = parseSchemaVersionNumber(parsed.packageFormatVersion);
                if (pv !== null) {
                  detectedSchemaVersion = pv;
                }
              }
            }
            if (parsed.modId && parsed.modId !== manifest.modId) {
              pushIssue('warning', 'MANIFEST_OUT_OF_SYNC', 'manifest', {
                file: node.path,
                object: t('validator.obj.manifest'),
                property: 'modId',
                problem: t('validator.manifestOutOfSyncProblem', {
                  path: node.path,
                  fileModId: parsed.modId,
                  projectModId: manifest.modId,
                }),
                suggestion: t('validator.manifestOutOfSyncSuggestion'),
                targetType: 'file',
                targetRef: node.path,
              });
            }
          }
        } catch (err) {
          pushIssue('error', 'MANIFEST_JSON_SYNTAX', 'data', {
            file: node.path,
            object: t('validator.obj.manifest'),
            property: 'JSON syntax',
            problem: t('validator.manifestJsonSyntaxProblem', {
              path: node.path,
              error: err instanceof Error ? err.message : 'Parse error',
            }),
            suggestion: t('validator.manifestJsonSyntaxSuggestion'),
            targetType: 'file',
            targetRef: node.path,
          });
        }
      }
    }
  }

  const modIdError = validateModId(manifest.modId);
  if (modIdError) {
    pushIssue('error', 'INVALID_MOD_ID', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'modId',
      problem: modIdError,
      suggestion: t('validator.modIdSuggestion'),
      targetType: 'manifest',
    });
  } else if (RESERVED_MOD_NAMESPACES.has(manifest.modId.trim())) {
    pushIssue('error', 'RESERVED_MOD_ID', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'modId',
      problem: t('validator.reservedModIdProblem', { modId: manifest.modId }),
      suggestion: t('validator.reservedModIdSuggestion'),
      targetType: 'manifest',
    });
  }

  // Duplicate Mod ID across workspace projects
  const matchingProjects = allProjects.filter(
    (p) => p.manifest.modId.trim().toLowerCase() === manifest.modId.trim().toLowerCase()
  );
  if (matchingProjects.length > 1) {
    pushIssue('error', 'DUPLICATE_MOD_ID', 'identifiers', {
      file: activeManifestFile,
      object: manifest.name || manifest.modId,
      property: 'modId',
      problem: t('validator.duplicateModIdProblem', {
        modId: manifest.modId,
        count: matchingProjects.length,
      }),
      suggestion: t('validator.duplicateModIdSuggestion'),
      targetType: 'manifest',
    });
  }

  const semverErr = validateSemver(manifest.version);
  if (semverErr) {
    pushIssue('error', 'INVALID_MOD_VERSION', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || manifest.modId,
      property: 'version',
      problem: semverErr,
      suggestion: t('validator.semverSuggestion'),
      targetType: 'manifest',
    });
  }

  if (!manifest.name.trim()) {
    pushIssue('error', 'MISSING_MOD_NAME', 'manifest', {
      file: activeManifestFile,
      object: manifest.modId || t('validator.obj.manifest'),
      property: 'name',
      problem: t('validator.missingModNameProblem'),
      suggestion: t('validator.missingModNameSuggestion'),
      targetType: 'manifest',
    });
  }

  if (!manifest.author.trim()) {
    pushIssue('error', 'MISSING_MOD_AUTHOR', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'author',
      problem: t('validator.missingModAuthorProblem'),
      suggestion: t('validator.missingModAuthorSuggestion'),
      targetType: 'manifest',
    });
  }

  if (!manifest.description.trim()) {
    pushIssue('error', 'MISSING_MOD_DESCRIPTION', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'description',
      problem: t('validator.missingModDescProblem'),
      suggestion: t('validator.missingModDescSuggestion'),
      targetType: 'manifest',
    });
  } else if (manifest.description.trim().length < 12) {
    pushIssue('warning', 'SHORT_MOD_DESCRIPTION', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'description',
      problem: t('validator.shortModDescProblem'),
      suggestion: t('validator.shortModDescSuggestion'),
      targetType: 'manifest',
    });
  }

  // Supported game version check (authoritative SemVer >= MIN_SUPPORTED_GAME_VERSION; current: CURRENT_GAME_VERSION)
  const gameVer = manifest.supportedGameVersion?.trim() ?? '';
  const gameVerResult = validateSupportedGameVersion(gameVer);
  if (!gameVer) {
    pushIssue('error', 'MISSING_GAME_VERSION', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'supportedGameVersion',
      problem: t('validator.missingGameVerProblem'),
      suggestion: t('validator.missingGameVerSuggestion', {
        currentGameVer: CURRENT_GAME_VERSION,
        minGameVer: MIN_SUPPORTED_GAME_VERSION,
      }),
      targetType: 'manifest',
    });
  } else if (!gameVerResult.valid) {
    pushIssue('error', 'UNSUPPORTED_GAME_VERSION', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'supportedGameVersion',
      problem:
        gameVerResult.code === 'below_minimum'
          ? t('validator.legacyGameVerProblem', {
              version: gameVer,
              minGameVer: MIN_SUPPORTED_GAME_VERSION,
              currentGameVer: CURRENT_GAME_VERSION,
            })
          : t('validator.unsupportedGameVerProblem', { version: gameVer }),
      suggestion:
        gameVerResult.code === 'below_minimum'
          ? t('validator.legacyGameVerSuggestion', {
              minGameVer: MIN_SUPPORTED_GAME_VERSION,
              currentGameVer: CURRENT_GAME_VERSION,
            })
          : t('validator.unsupportedGameVerSuggestion', {
              minGameVer: MIN_SUPPORTED_GAME_VERSION,
              currentGameVer: CURRENT_GAME_VERSION,
            }),
      targetType: 'manifest',
    });
  }

  const minGameVer = manifest.minGameVersion?.trim() ?? '';
  if (minGameVer) {
    const minGameVerResult = validateSupportedGameVersion(minGameVer);
    if (!minGameVerResult.valid) {
      pushIssue('error', 'UNSUPPORTED_GAME_VERSION', 'manifest', {
        file: activeManifestFile,
        object: manifest.name || t('validator.obj.manifest'),
        property: 'minGameVersion',
        problem:
          minGameVerResult.code === 'below_minimum'
            ? t('validator.legacyGameVerProblem', {
                version: minGameVer,
                minGameVer: MIN_SUPPORTED_GAME_VERSION,
                currentGameVer: CURRENT_GAME_VERSION,
              })
            : t('validator.unsupportedGameVerProblem', { version: minGameVer }),
        suggestion: t('validator.legacyGameVerSuggestion', {
          minGameVer: MIN_SUPPORTED_GAME_VERSION,
          currentGameVer: CURRENT_GAME_VERSION,
        }),
        targetType: 'manifest',
      });
    }
  }

  const maxGameVer = manifest.maxGameVersion?.trim() ?? '';
  if (maxGameVer) {
    const maxCheck = validateMaxGameVersion(maxGameVer, gameVer || minGameVer || MIN_SUPPORTED_GAME_VERSION);
    if (!maxCheck.valid) {
      pushIssue('error', 'INVALID_MAX_GAME_VERSION', 'manifest', {
        file: activeManifestFile,
        object: manifest.name || t('validator.obj.manifest'),
        property: 'maxGameVersion',
        problem: t('validator.invalidMaxGameVerProblem', {
          version: maxGameVer,
        }),
        suggestion: t('validator.invalidMaxGameVerSuggestion', {
          currentGameVer: CURRENT_GAME_VERSION,
        }),
        targetType: 'manifest',
      });
    }
  }

  if (
    manifest.packageFormatVersion !== undefined &&
    !isSupportedContentSchemaVersion(manifest.packageFormatVersion)
  ) {
    pushIssue('error', 'UNSUPPORTED_SCHEMA_VERSION', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'packageFormatVersion',
      problem: t('validator.unsupportedSchemaProblem', {
        path: activeManifestFile,
        schemaVersion: String(manifest.packageFormatVersion),
        supported: supportedSchemaListText,
      }),
      suggestion: t('validator.unsupportedSchemaSuggestion', {
        supported: supportedSchemaListText,
      }),
      targetType: 'manifest',
    });
  }

  if (!manifest.categories || manifest.categories.length === 0) {
    pushIssue('warning', 'EMPTY_MOD_CATEGORIES', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'categories',
      problem: t('validator.emptyCategoriesProblem'),
      suggestion: t('validator.emptyCategoriesSuggestion'),
      targetType: 'manifest',
    });
  }

  if (!manifest.targetPlatforms || manifest.targetPlatforms.length === 0) {
    pushIssue('error', 'MISSING_TARGET_PLATFORMS', 'manifest', {
      file: activeManifestFile,
      object: manifest.name || t('validator.obj.manifest'),
      property: 'targetPlatforms',
      problem: t('validator.missingPlatformsProblem'),
      suggestion: t('validator.missingPlatformsSuggestion'),
      targetType: 'manifest',
    });
  }

  const hasDataDrivenRegistry = files.some(
    (f) => f.path === 'data/registry.json' && f.type !== 'folder'
  );

  if (!manifest.entryPoint?.trim()) {
    if (!hasDataDrivenRegistry) {
      pushIssue('error', 'MISSING_ENTRY_POINT', 'manifest', {
        file: activeManifestFile,
        object: manifest.name || t('validator.obj.manifest'),
        property: 'entryPoint',
        problem: t('validator.missingEntryPointProblem'),
        suggestion: t('validator.missingEntryPointSuggestion'),
        targetType: 'manifest',
      });
    }
  } else {
    const unsafeEntry = analyzeArchivePath(manifest.entryPoint);
    if (unsafeEntry) {
      pushIssue('error', 'UNSAFE_ARCHIVE_PATH', 'security', {
        file: activeManifestFile,
        object: t('validator.obj.manifest'),
        property: 'entryPoint',
        problem: t('validator.unsafeEntryPointProblem', {
          path: manifest.entryPoint,
          error: unsafeEntry,
        }),
        suggestion: t('validator.unsafeEntryPointSuggestion'),
        targetType: 'manifest',
      });
    } else if (
      !files.some((f) => f.path === manifest.entryPoint && f.type !== 'folder') &&
      !(hasDataDrivenRegistry && manifest.entryPoint === 'scripts/main.ts')
    ) {
      pushIssue('error', 'MISSING_ENTRY_SCRIPT', 'assets', {
        file: manifest.entryPoint,
        object: t('validator.obj.entryScript'),
        property: 'entryPoint',
        problem: t('validator.missingEntryScriptProblem', { path: manifest.entryPoint }),
        suggestion: t('validator.missingEntryScriptSuggestion', { path: manifest.entryPoint }),
        targetType: 'manifest',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. UNSAFE ARCHIVE PATHS & FILE COLLISIONS & INVALID JSON/DATA FILES
  // ---------------------------------------------------------------------------
  const seenNormalizedFilePaths = new Map<string, string>();
  const filePathSet = new Set<string>();

  for (const file of files) {
    const pathErr = analyzeArchivePath(file.path);
    if (pathErr) {
      pushIssue('error', 'UNSAFE_ARCHIVE_PATH', 'security', {
        file: file.path,
        object: file.name || file.path,
        property: 'path',
        problem: pathErr,
        suggestion: t('validator.unsafeFileSuggestion'),
        targetType: 'file',
        targetRef: file.path,
      });
    }

    const lower = file.path.toLowerCase();
    if (seenNormalizedFilePaths.has(lower)) {
      pushIssue('error', 'DUPLICATE_ARCHIVE_PATH', 'security', {
        file: file.path,
        object: file.name,
        property: 'path',
        problem: t('validator.duplicatePathProblem', {
          path: file.path,
          other: seenNormalizedFilePaths.get(lower) ?? '',
        }),
        suggestion: t('validator.duplicatePathSuggestion'),
        targetType: 'file',
        targetRef: file.path,
      });
    } else {
      seenNormalizedFilePaths.set(lower, file.path);
    }

    if (file.type !== 'folder') {
      filePathSet.add(file.path);

      if (isBlockedExecutableFile(file.path)) {
        pushIssue('error', 'BLOCKED_EXECUTABLE_FILE', 'security', {
          file: file.path,
          object: file.name,
          property: 'extension',
          problem: `Blocked executable or unsafe binary extension in "${file.path}".`,
          suggestion: 'Remove executable binaries; .woamod packages support data-driven JSON registries, 3D models, textures, and audio only.',
          targetType: 'file',
          targetRef: file.path,
        });
      }

      if (file.path.startsWith('assets/')) {
        const formatSpec = getAssetFormatSpec(file.path);
        const expectedDirCat = getExpectedAssetCategoryForPath(file.path);
        if (!formatSpec) {
          pushIssue('warning', 'UNSUPPORTED_ASSET_EXCLUDED', 'assets', {
            file: file.path,
            object: file.name,
            property: 'format',
            problem: t('validator.unsupportedAssetExcludedProblem', { name: file.name }),
            suggestion: t('validator.unsupportedAssetExcludedSuggestion'),
            targetType: 'file',
            targetRef: file.path,
          });
        } else if (expectedDirCat && expectedDirCat !== formatSpec.category) {
          pushIssue('error', 'INVALID_ASSET_CATEGORY', 'assets', {
            file: file.path,
            object: file.name,
            property: 'path',
            problem: t('validator.wrongAssetCategoryProblem', {
              path: file.path,
              actualCategory: formatSpec.category,
              expectedDir: formatSpec.targetDirectory,
            }),
            suggestion: t('validator.wrongAssetCategorySuggestion', {
              expectedDir: formatSpec.targetDirectory,
            }),
            targetType: 'file',
            targetRef: file.path,
          });
        }
      }

      if (
        (file.name.endsWith('.json') || file.name.endsWith('.woa3d')) &&
        file.path !== 'mod.manifest.json' &&
        file.path !== 'mod.json'
      ) {
        if (file.content === undefined || file.content === '') {
          pushIssue('error', 'EMPTY_JSON_FILE', 'data', {
            file: file.path,
            object: file.name,
            property: 'content',
            problem: t('validator.emptyJsonProblem', { path: file.path }),
            suggestion: t('validator.emptyJsonSuggestion'),
            targetType: 'file',
            targetRef: file.path,
          });
        } else {
          try {
            const parsed = JSON.parse(file.content) as Record<string, unknown>;
            if (file.path === 'data/registry.json') {
              if (parsed.schemaVersion !== undefined) {
                if (!isSupportedContentSchemaVersion(parsed.schemaVersion)) {
                  pushIssue('error', 'UNSUPPORTED_SCHEMA_VERSION', 'data', {
                    file: file.path,
                    object: t('validator.obj.registry'),
                    property: 'schemaVersion',
                    problem: t('validator.unsupportedSchemaProblem', {
                      path: file.path,
                      schemaVersion: String(parsed.schemaVersion),
                      supported: supportedSchemaListText,
                    }),
                    suggestion: t('validator.unsupportedSchemaSuggestion', {
                      supported: supportedSchemaListText,
                    }),
                    targetType: 'file',
                    targetRef: file.path,
                  });
                } else {
                  const sv = parseSchemaVersionNumber(parsed.schemaVersion);
                  if (sv !== null) {
                    detectedSchemaVersion = Math.max(detectedSchemaVersion ?? 0, sv);
                  }
                }
              }
              if (!Array.isArray(parsed.entries)) {
                pushIssue('error', 'INVALID_REGISTRY_SCHEMA', 'data', {
                  file: file.path,
                  object: t('validator.obj.registry'),
                  property: 'entries',
                  problem: t('validator.invalidRegistryProblem'),
                  suggestion: t('validator.invalidRegistrySuggestion'),
                  targetType: 'file',
                  targetRef: file.path,
                });
              }
            } else if (
              Object.values(CONTENT_FILE_PATHS).includes(file.path) ||
              Object.values(EXTENDED_CONFIG_FILE_PATHS).includes(file.path)
            ) {
              if (parsed.schemaVersion !== undefined) {
                if (!isSupportedContentSchemaVersion(parsed.schemaVersion)) {
                  pushIssue('error', 'UNSUPPORTED_SCHEMA_VERSION', 'data', {
                    file: file.path,
                    object: file.name,
                    property: 'schemaVersion',
                    problem: t('validator.unsupportedSchemaProblem', {
                      path: file.path,
                      schemaVersion: String(parsed.schemaVersion),
                      supported: supportedSchemaListText,
                    }),
                    suggestion: t('validator.unsupportedSchemaSuggestion', {
                      supported: supportedSchemaListText,
                    }),
                    targetType: 'file',
                    targetRef: file.path,
                  });
                } else {
                  const sv = parseSchemaVersionNumber(parsed.schemaVersion);
                  if (sv !== null) {
                    detectedSchemaVersion = Math.max(detectedSchemaVersion ?? 0, sv);
                  }
                }
              }
              if (!Array.isArray(parsed.entries)) {
                pushIssue('error', 'INVALID_CONTENT_FILE_SCHEMA', 'data', {
                  file: file.path,
                  object: file.name,
                  property: 'entries',
                  problem: t('validator.invalidContentSchemaProblem', { path: file.path }),
                  suggestion: t('validator.invalidContentSchemaSuggestion'),
                  targetType: 'file',
                  targetRef: file.path,
                });
              }
            }
          } catch (err) {
            pushIssue('error', 'INVALID_JSON_SYNTAX', 'data', {
              file: file.path,
              object: file.name,
              property: 'JSON syntax',
              problem: t('validator.malformedJsonProblem', {
                path: file.path,
                error: err instanceof Error ? err.message : 'Syntax error',
              }),
              suggestion: t('validator.malformedJsonSuggestion'),
              targetType: 'file',
              targetRef: file.path,
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. ASSETS, BINARY BLOBS, 3D MODELS, TEXTURES & AUDIO FILES
  // ---------------------------------------------------------------------------
  const assetIdsSeen = new Set<string>();
  const assetByPath = new Map<string, ModAsset>();
  const blobCache = new Map<string, { data: ArrayBuffer; mimeType: string } | null>();

  const loadBlob = async (blobKey: string) => {
    if (!blobCache.has(blobKey)) {
      blobCache.set(blobKey, await getAssetBlobRecord(blobKey));
    }
    return blobCache.get(blobKey) ?? null;
  };

  for (const asset of assets) {
    if (assetIdsSeen.has(asset.id)) {
      pushIssue('error', 'DUPLICATE_ASSET_ID', 'identifiers', {
        file: asset.path,
        object: asset.name,
        property: 'asset.id',
        problem: t('validator.duplicateAssetIdProblem', { id: asset.id }),
        suggestion: t('validator.duplicateAssetIdSuggestion'),
        targetType: 'asset',
        targetRef: asset.id,
      });
    } else {
      assetIdsSeen.add(asset.id);
    }

    const unsafeAssetPath = analyzeArchivePath(asset.path);
    if (unsafeAssetPath) {
      pushIssue('error', 'UNSAFE_ARCHIVE_PATH', 'security', {
        file: asset.path,
        object: asset.name,
        property: 'path',
        problem: unsafeAssetPath,
        suggestion: t('validator.unsafeAssetPathSuggestion'),
        targetType: 'asset',
        targetRef: asset.id,
      });
    }

    assetByPath.set(asset.path, asset);

    if (!filePathSet.has(asset.path)) {
      pushIssue('error', 'MISSING_ASSET_FILE_NODE', 'assets', {
        file: asset.path,
        object: asset.name,
        property: 'fileNode',
        problem: t('validator.missingAssetNodeProblem', {
          name: asset.name,
          path: asset.path,
        }),
        suggestion: t('validator.missingAssetNodeSuggestion'),
        targetType: 'asset',
        targetRef: asset.id,
      });
    }

    const assetSpec = getAssetFormatSpec(asset.path);
    const expectedAssetDirCat = getExpectedAssetCategoryForPath(asset.path);
    if (!assetSpec) {
      pushIssue('warning', 'UNSUPPORTED_ASSET_FORMAT', 'assets', {
        file: asset.path,
        object: asset.name,
        property: 'format',
        problem: t('validator.unsupportedAssetFormatProblem', {
          format: asset.format,
          path: asset.path,
        }),
        suggestion: t('validator.unsupportedAssetFormatSuggestion'),
        targetType: 'asset',
        targetRef: asset.id,
      });
      continue;
    }

    if (
      (expectedAssetDirCat && expectedAssetDirCat !== assetSpec.category) ||
      asset.type !== assetSpec.category ||
      !isSupportedAssetPath(asset.path)
    ) {
      pushIssue('error', 'INVALID_ASSET_CATEGORY', 'assets', {
        file: asset.path,
        object: asset.name,
        property: 'type',
        problem: t('validator.wrongAssetCategoryProblem', {
          path: asset.path,
          actualCategory: assetSpec.category,
          expectedDir: assetSpec.targetDirectory,
        }),
        suggestion: t('validator.wrongAssetCategorySuggestion', {
          expectedDir: assetSpec.targetDirectory,
        }),
        targetType: 'asset',
        targetRef: asset.id,
      });
      continue;
    }

    // Object property validation on ModAsset
    if (
      !Number.isFinite(asset.material.roughness) ||
      asset.material.roughness < 0 ||
      asset.material.roughness > 1
    ) {
      pushIssue('error', 'INVALID_OBJECT_PROPERTY', 'properties', {
        file: asset.path,
        object: asset.name,
        property: 'material.roughness',
        problem: t('validator.roughnessProblem', { value: asset.material.roughness }),
        suggestion: t('validator.roughnessSuggestion'),
        targetType: 'asset',
        targetRef: asset.id,
      });
    }
    if (
      !Number.isFinite(asset.material.metalness) ||
      asset.material.metalness < 0 ||
      asset.material.metalness > 1
    ) {
      pushIssue('error', 'INVALID_OBJECT_PROPERTY', 'properties', {
        file: asset.path,
        object: asset.name,
        property: 'material.metalness',
        problem: t('validator.metalnessProblem', { value: asset.material.metalness }),
        suggestion: t('validator.metalnessSuggestion'),
        targetType: 'asset',
        targetRef: asset.id,
      });
    }
    if (
      asset.transform.scale.x <= 0 ||
      asset.transform.scale.y <= 0 ||
      asset.transform.scale.z <= 0 ||
      !Number.isFinite(asset.transform.scale.x) ||
      !Number.isFinite(asset.transform.scale.y) ||
      !Number.isFinite(asset.transform.scale.z)
    ) {
      pushIssue('error', 'INVALID_OBJECT_PROPERTY', 'properties', {
        file: asset.path,
        object: asset.name,
        property: 'transform.scale',
        problem: t('validator.scaleProblem'),
        suggestion: t('validator.scaleSuggestion'),
        targetType: 'asset',
        targetRef: asset.id,
      });
    }

    const ext = getFileExtension(asset.path);
    const blobRecord = asset.blobKey ? await loadBlob(asset.blobKey) : null;

    if (asset.blobKey && (!blobRecord || blobRecord.data.byteLength === 0)) {
      pushIssue('error', 'MISSING_ASSET_BINARY', 'assets', {
        file: asset.path,
        object: asset.name,
        property: 'blobData',
        problem: t('validator.missingBinaryProblem', { name: asset.name }),
        suggestion: t('validator.missingBinarySuggestion'),
        targetType: 'asset',
        targetRef: asset.id,
      });
      continue;
    }

    // Validate 3D Models
    if (asset.type === '3d-model') {
      if (ext === 'woa3d') {
        const node = files.find((f) => f.path === asset.path);
        if (!node?.content?.trim()) {
          pushIssue('error', 'INVALID_3D_MODEL', 'models', {
            file: asset.path,
            object: asset.name,
            property: 'content',
            problem: t('validator.woa3dEmptyProblem'),
            suggestion: t('validator.woa3dEmptySuggestion'),
            targetType: 'asset',
            targetRef: asset.id,
          });
        } else {
          try {
            parseAndValidateWoa3dContent(node.content);
          } catch (err) {
            const reason = err instanceof Error ? err.message : 'Invalid WOA3D payload';
            const missingPreset = /preset/i.test(reason);
            pushIssue('error', 'INVALID_3D_MODEL', 'models', {
              file: asset.path,
              object: asset.name,
              property: missingPreset ? 'preset' : 'content',
              problem: missingPreset
                ? t('validator.woa3dMissingPresetProblem')
                : t('validator.woa3dInvalidContentProblem', { reason }),
              suggestion: missingPreset
                ? t('validator.woa3dMissingPresetSuggestion')
                : t('validator.woa3dInvalidContentSuggestion'),
              targetType: 'file',
              targetRef: asset.path,
            });
          }
        }
      } else if (blobRecord) {
        const bytes = new Uint8Array(blobRecord.data);
        if (ext === 'glb') {
          if (!hasMagicBytes(bytes, [0x67, 0x6c, 0x54, 0x46], 0)) {
            pushIssue('error', 'INVALID_3D_MODEL', 'models', {
              file: asset.path,
              object: asset.name,
              property: 'binaryHeader',
              problem: t('validator.glbHeaderProblem'),
              suggestion: t('validator.glbHeaderSuggestion'),
              targetType: 'asset',
              targetRef: asset.id,
            });
          } else {
            try {
              const stats = await inspect3DBuffer(blobRecord.data, 'glb');
              if (stats.triangleEstimate <= 0 || stats.meshCount <= 0) {
                pushIssue('error', 'INVALID_3D_MODEL', 'models', {
                  file: asset.path,
                  object: asset.name,
                  property: 'geometry',
                  problem: t('validator.glbNoMeshProblem', { name: asset.name }),
                  suggestion: t('validator.glbNoMeshSuggestion'),
                  targetType: 'asset',
                  targetRef: asset.id,
                });
              }
            } catch (err) {
              pushIssue('error', 'INVALID_3D_MODEL', 'models', {
                file: asset.path,
                object: asset.name,
                property: 'gltfScene',
                problem: t('validator.glbParseProblem', {
                  error: err instanceof Error ? err.message : 'Corrupt GLB stream',
                }),
                suggestion: t('validator.glbParseSuggestion'),
                targetType: 'asset',
                targetRef: asset.id,
              });
            }
          }
        } else if (ext === 'gltf') {
          try {
            const text = new TextDecoder().decode(bytes);
            const gltfJson = JSON.parse(text) as {
              asset?: { version?: string };
              meshes?: unknown[];
              buffers?: { uri?: string }[];
              images?: { uri?: string; name?: string }[];
            };
            if (!gltfJson.asset?.version) {
              pushIssue('error', 'INVALID_3D_MODEL', 'models', {
                file: asset.path,
                object: asset.name,
                property: 'asset.version',
                problem: t('validator.gltfVersionProblem'),
                suggestion: t('validator.gltfVersionSuggestion'),
                targetType: 'asset',
                targetRef: asset.id,
              });
            }
            if (!Array.isArray(gltfJson.meshes) || gltfJson.meshes.length === 0) {
              pushIssue('error', 'INVALID_3D_MODEL', 'models', {
                file: asset.path,
                object: asset.name,
                property: 'meshes',
                problem: t('validator.gltfNoMeshProblem'),
                suggestion: t('validator.gltfNoMeshSuggestion'),
                targetType: 'asset',
                targetRef: asset.id,
              });
            }
            const baseDir = asset.path.split('/').slice(0, -1).join('/');
            for (const buf of gltfJson.buffers ?? []) {
              if (buf.uri && !buf.uri.startsWith('data:')) {
                const resolvedBuf = normalizeRelativeRef(baseDir, buf.uri);
                if (!filePathSet.has(resolvedBuf)) {
                  pushIssue('error', 'MISSING_MODEL_BUFFER', 'models', {
                    file: asset.path,
                    object: asset.name,
                    property: 'buffers.uri',
                    problem: t('validator.gltfMissingBufferProblem', { uri: buf.uri }),
                    suggestion: t('validator.gltfMissingBufferSuggestion'),
                    targetType: 'asset',
                    targetRef: asset.id,
                  });
                }
              }
            }
            for (const img of gltfJson.images ?? []) {
              if (img.uri && !img.uri.startsWith('data:')) {
                const resolvedImg = normalizeRelativeRef(baseDir, img.uri);
                const texFallback = `assets/textures/${img.uri.split('/').pop()}`;
                if (!filePathSet.has(resolvedImg) && !filePathSet.has(texFallback)) {
                  pushIssue('error', 'MISSING_TEXTURE', 'textures', {
                    file: asset.path,
                    object: asset.name,
                    property: `images[${img.name || img.uri}]`,
                    problem: t('validator.gltfMissingTextureProblem', { uri: img.uri }),
                    suggestion: t('validator.gltfMissingTextureSuggestion', {
                      file: img.uri.split('/').pop() ?? img.uri,
                    }),
                    targetType: 'asset',
                    targetRef: asset.id,
                  });
                }
              }
            }
          } catch (err) {
            pushIssue('error', 'INVALID_3D_MODEL', 'models', {
              file: asset.path,
              object: asset.name,
              property: 'gltfJson',
              problem: t('validator.gltfInvalidJsonProblem', {
                error: err instanceof Error ? err.message : 'Parse error',
              }),
              suggestion: t('validator.gltfInvalidJsonSuggestion'),
              targetType: 'asset',
              targetRef: asset.id,
            });
          }
        } else if (ext === 'obj') {
          const text = new TextDecoder().decode(bytes);
          const hasVertices = /^v\s+/m.test(text);
          const hasFaces = /^f\s+/m.test(text);
          if (!hasVertices || !hasFaces) {
            pushIssue('error', 'INVALID_3D_MODEL', 'models', {
              file: asset.path,
              object: asset.name,
              property: 'objGeometry',
              problem: t('validator.objInvalidProblem'),
              suggestion: t('validator.objInvalidSuggestion'),
              targetType: 'asset',
              targetRef: asset.id,
            });
          }
        }
      }

      if (
        (targetPlatform === 'android' || targetPlatform === 'universal') &&
        asset.triangleEstimate > 5000
      ) {
        pushIssue('warning', 'ANDROID_POLY_BUDGET', 'models', {
          file: asset.path,
          object: asset.name,
          property: 'triangleEstimate',
          problem: t('validator.polyBudgetProblem', {
            name: asset.name,
            tris: asset.triangleEstimate.toLocaleString(),
          }),
          suggestion: t('validator.polyBudgetSuggestion'),
          targetType: 'asset',
          targetRef: asset.id,
        });
      }
    }

    // Validate Textures
    if (asset.type === 'texture') {
      if (blobRecord) {
        const bytes = new Uint8Array(blobRecord.data);
        const sigErr = validateTextureBytes(bytes, ext);
        if (sigErr) {
          pushIssue('error', 'INVALID_TEXTURE_FILE', 'textures', {
            file: asset.path,
            object: asset.name,
            property: 'imageSignature',
            problem: sigErr,
            suggestion: t('validator.textureInvalidSuggestion'),
            targetType: 'asset',
            targetRef: asset.id,
          });
        } else {
          let res = asset.resolution;
          if (!res || res.width <= 0 || res.height <= 0) {
            res = await inspectImageBlob(
              new Blob([blobRecord.data], { type: blobRecord.mimeType })
            );
          }
          if (res.width <= 0 || res.height <= 0) {
            pushIssue('error', 'INVALID_TEXTURE_FILE', 'textures', {
              file: asset.path,
              object: asset.name,
              property: 'resolution',
              problem: t('validator.textureDecodeProblem', { name: asset.name }),
              suggestion: t('validator.textureDecodeSuggestion'),
              targetType: 'asset',
              targetRef: asset.id,
            });
          } else if (
            (targetPlatform === 'android' || targetPlatform === 'universal') &&
            (res.width > 2048 || res.height > 2048)
          ) {
            pushIssue('warning', 'TEXTURE_RESOLUTION_BUDGET', 'textures', {
              file: asset.path,
              object: asset.name,
              property: 'resolution',
              problem: t('validator.textureBudgetProblem', {
                width: res.width,
                height: res.height,
              }),
              suggestion: t('validator.textureBudgetSuggestion'),
              targetType: 'asset',
              targetRef: asset.id,
            });
          }
        }
      }
    }

    // Validate Audio
    if (asset.type === 'audio') {
      if (blobRecord) {
        const bytes = new Uint8Array(blobRecord.data);
        const audioSigErr = validateAudioBytes(bytes, ext);
        if (audioSigErr) {
          pushIssue('error', 'INVALID_AUDIO_FILE', 'audio', {
            file: asset.path,
            object: asset.name,
            property: 'audioHeader',
            problem: audioSigErr,
            suggestion: t('validator.audioInvalidSuggestion'),
            targetType: 'asset',
            targetRef: asset.id,
          });
        } else {
          let duration = asset.durationSeconds ?? 0;
          if (duration <= 0) {
            duration = await inspectAudioBlob(
              new Blob([blobRecord.data], { type: blobRecord.mimeType })
            );
          }
          if (duration <= 0) {
            pushIssue('warning', 'AUDIO_DURATION_UNVERIFIED', 'audio', {
              file: asset.path,
              object: asset.name,
              property: 'durationSeconds',
              problem: t('validator.audioDurationProblem', { name: asset.name }),
              suggestion: t('validator.audioDurationSuggestion'),
              targetType: 'asset',
              targetRef: asset.id,
            });
          }
        }
        if (blobRecord.data.byteLength > 5 * 1024 * 1024) {
          pushIssue('warning', 'AUDIO_FILE_SIZE_BUDGET', 'audio', {
            file: asset.path,
            object: asset.name,
            property: 'sizeBytes',
            problem: t('validator.audioSizeProblem', {
              mb: (blobRecord.data.byteLength / (1024 * 1024)).toFixed(1),
            }),
            suggestion: t('validator.audioSizeSuggestion'),
            targetType: 'asset',
            targetRef: asset.id,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. CONTENT OBJECTS, ASSET REFERENCES, DUPLICATE IDS & PROPERTY VALIDATION
  // ---------------------------------------------------------------------------
  const contents: ModContentDatabase = resolveProjectContents(project);
  const idIndex = collectAllContentIds(contents);
  const declaredDepSet = new Set(
    (manifest.dependencies ?? []).map((d) => d.modId.trim()).filter(Boolean)
  );

  const checkAssetRef = (
    file: string,
    objectLabel: string,
    property: string,
    refValue: string,
    expectedType: '3d-model' | 'texture' | 'audio',
    targetRef: string
  ) => {
    const trimmed = refValue.trim();
    if (!trimmed) return; // required check handled by validate*
    if (trimmed.startsWith('woa:')) {
      if (trimmed.length <= 4) {
        pushIssue('error', 'BROKEN_ASSET_REFERENCE', 'assets', {
          file,
          object: objectLabel,
          property,
          problem: t('validator.builtinAssetIncompleteProblem', { ref: trimmed }),
          suggestion: t('validator.builtinAssetIncompleteSuggestion'),
          targetType: 'content',
          targetRef,
        });
      }
      return;
    }

    if (isExternalUrlOrAbsPath(trimmed)) {
      pushIssue('error', 'EXTERNAL_ASSET_REFERENCE', 'assets', {
        file,
        object: objectLabel,
        property,
        problem: t('validator.externalRefProblem', { ref: trimmed }),
        suggestion: t('validator.externalRefSuggestion'),
        targetType: 'content',
        targetRef,
      });
      return;
    }

    const unsafe = analyzeArchivePath(trimmed);
    if (unsafe) {
      pushIssue('error', 'UNSAFE_ARCHIVE_PATH', 'security', {
        file,
        object: objectLabel,
        property,
        problem: t('validator.unsafeAssetRefProblem', {
          ref: trimmed,
          error: unsafe,
        }),
        suggestion: t('validator.unsafeAssetRefSuggestion'),
        targetType: 'content',
        targetRef,
      });
      return;
    }

    const matchedAsset = assetByPath.get(trimmed);
    const hasFile = filePathSet.has(trimmed);

    if (!matchedAsset && !hasFile) {
      const code = expectedType === 'texture' ? 'MISSING_TEXTURE' : 'BROKEN_ASSET_REFERENCE';
      const cat: ValidationCategory = expectedType === 'texture' ? 'textures' : 'assets';
      pushIssue('error', code, cat, {
        file,
        object: objectLabel,
        property,
        problem: t('validator.missingAssetRefProblem', {
          type: assetTypeLabel(expectedType),
          ref: trimmed,
        }),
        suggestion: t('validator.missingAssetRefSuggestion'),
        targetType: 'content',
        targetRef,
      });
      return;
    }

    if (matchedAsset && matchedAsset.type !== expectedType) {
      pushIssue('error', 'INVALID_ASSET_REFERENCE_TYPE', 'assets', {
        file,
        object: objectLabel,
        property,
        problem: t('validator.wrongAssetTypeProblem', {
          property,
          expected: assetTypeLabel(expectedType),
          ref: trimmed,
          actual: assetTypeLabel(matchedAsset.type),
        }),
        suggestion: t('validator.wrongAssetTypeSuggestion', {
          expected: assetTypeLabel(expectedType),
        }),
        targetType: 'content',
        targetRef,
      });
    }
  };

  const checkNamespacedReference = (
    file: string,
    objectLabel: string,
    property: string,
    refId: string,
    targetRef: string
  ) => {
    const trimmed = refId.trim();
    if (!trimmed) return;
    const match = NAMESPACED_ID_REGEX.exec(trimmed);
    if (!match) return;
    const ns = match[1];
    if (ns === manifest.modId) {
      if (!idIndex.has(trimmed)) {
        pushIssue('warning', 'UNRESOLVED_CONTENT_REFERENCE', 'properties', {
          file,
          object: objectLabel,
          property,
          problem: t('validator.unresolvedRefProblem', { ref: trimmed }),
          suggestion: t('validator.unresolvedRefSuggestion', { ref: trimmed, property }),
          targetType: 'content',
          targetRef,
        });
      }
    } else if (ns !== 'woa' && !declaredDepSet.has(ns)) {
      pushIssue('error', 'UNDECLARED_DEPENDENCY', 'dependencies', {
        file,
        object: objectLabel,
        property,
        problem: t('validator.undeclaredDepProblem', { ns, ref: trimmed }),
        suggestion: t('validator.undeclaredDepSuggestion', { ns, modId: manifest.modId }),
        targetType: 'manifest',
      });
    }
  };

  const pushContentValidation = (
    kind: ContentKind,
    entry: WoAContentBase,
    fieldIssues: ContentValidationIssue[]
  ) => {
    const file = CONTENT_FILE_PATHS[kind];
    const objectLabel = `${entry.name || t('common.unnamed')} (${entry.id || entry.uid})`;
    const targetRef = `${kind}:${entry.uid}`;

    for (const fi of fieldIssues) {
      const isDuplicate =
        fi.field === 'id' && (idIndex.get(entry.id.trim())?.length ?? 0) > 1;
      pushIssue(
        fi.level === 'error' ? 'error' : 'warning',
        isDuplicate ? 'DUPLICATE_OBJECT_ID' : 'INVALID_OBJECT_PROPERTY',
        isDuplicate ? 'identifiers' : 'properties',
        {
          file,
          object: objectLabel,
          property: fi.field,
          problem: fi.message,
          suggestion: suggestionForField(fi.field),
          targetType: 'content',
          targetRef,
        }
      );
    }
  };

  contents.items.forEach((item) => {
    pushContentValidation('item', item, validateItem(item, manifest.modId, idIndex));
    const label = `${item.name || 'Item'} (${item.id})`;
    checkAssetRef(CONTENT_FILE_PATHS.item, label, 'icon', item.icon, 'texture', `item:${item.uid}`);
  });

  contents.weapons.forEach((weapon) => {
    pushContentValidation('weapon', weapon, validateWeapon(weapon, manifest.modId, idIndex));
    const label = `${weapon.name || 'Weapon'} (${weapon.id})`;
    const ref = `weapon:${weapon.uid}`;
    checkAssetRef(CONTENT_FILE_PATHS.weapon, label, 'model', weapon.model, '3d-model', ref);
    checkAssetRef(CONTENT_FILE_PATHS.weapon, label, 'icon', weapon.icon, 'texture', ref);
    checkAssetRef(CONTENT_FILE_PATHS.weapon, label, 'sound', weapon.sound, 'audio', ref);
  });

  contents.armor.forEach((armor) => {
    pushContentValidation('armor', armor, validateArmor(armor, manifest.modId, idIndex));
    const label = `${armor.name || 'Armor'} (${armor.id})`;
    const ref = `armor:${armor.uid}`;
    checkAssetRef(CONTENT_FILE_PATHS.armor, label, 'model', armor.model, '3d-model', ref);
    checkAssetRef(CONTENT_FILE_PATHS.armor, label, 'icon', armor.icon, 'texture', ref);
  });

  contents.npcs.forEach((npc) => {
    pushContentValidation('npc', npc, validateNpc(npc, manifest.modId, idIndex));
    const label = `${npc.name || 'NPC'} (${npc.id})`;
    const ref = `npc:${npc.uid}`;
    checkAssetRef(CONTENT_FILE_PATHS.npc, label, 'model', npc.model, '3d-model', ref);
    npc.loot.forEach((l, i) =>
      checkNamespacedReference(CONTENT_FILE_PATHS.npc, label, `loot[${i}].itemId`, l.itemId, ref)
    );
    npc.questReferences.forEach((q, i) =>
      checkNamespacedReference(CONTENT_FILE_PATHS.npc, label, `questReferences[${i}]`, q, ref)
    );
  });

  contents.monsters.forEach((monster) => {
    pushContentValidation('monster', monster, validateMonster(monster, manifest.modId, idIndex));
    const label = `${monster.name || 'Monster'} (${monster.id})`;
    const ref = `monster:${monster.uid}`;
    checkAssetRef(CONTENT_FILE_PATHS.monster, label, 'model', monster.model, '3d-model', ref);
    monster.loot.forEach((l, i) =>
      checkNamespacedReference(CONTENT_FILE_PATHS.monster, label, `loot[${i}].itemId`, l.itemId, ref)
    );
  });

  contents.quests.forEach((quest) => {
    pushContentValidation('quest', quest, validateQuest(quest, manifest.modId, idIndex));
    const label = `${quest.name || 'Quest'} (${quest.id})`;
    const ref = `quest:${quest.uid}`;
    checkNamespacedReference(CONTENT_FILE_PATHS.quest, label, 'giverNpcId', quest.giverNpcId, ref);
    quest.objectives.forEach((obj, i) => {
      if (obj.type !== 'reach_location') {
        checkNamespacedReference(
          CONTENT_FILE_PATHS.quest,
          label,
          `objectives[${i}].targetId`,
          obj.targetId,
          ref
        );
      }
    });
    quest.rewards.items.forEach((ri, i) =>
      checkNamespacedReference(
        CONTENT_FILE_PATHS.quest,
        label,
        `rewards.items[${i}].itemId`,
        ri.itemId,
        ref
      )
    );
    quest.chain.prerequisiteQuestIds.forEach((pid, i) =>
      checkNamespacedReference(
        CONTENT_FILE_PATHS.quest,
        label,
        `chain.prerequisiteQuestIds[${i}]`,
        pid,
        ref
      )
    );
    if (quest.chain.nextQuestId.trim()) {
      checkNamespacedReference(
        CONTENT_FILE_PATHS.quest,
        label,
        'chain.nextQuestId',
        quest.chain.nextQuestId,
        ref
      );
    }
  });

  contents.recipes.forEach((recipe) => {
    pushContentValidation('recipe', recipe, validateRecipe(recipe, manifest.modId, idIndex));
    const label = `${recipe.name || 'Recipe'} (${recipe.id})`;
    const ref = `recipe:${recipe.uid}`;
    checkNamespacedReference(CONTENT_FILE_PATHS.recipe, label, 'outputItemId', recipe.outputItemId, ref);
    recipe.ingredients.forEach((ing, i) =>
      checkNamespacedReference(
        CONTENT_FILE_PATHS.recipe,
        label,
        `ingredients[${i}].itemId`,
        ing.itemId,
        ref
      )
    );
  });

  contents.buildings.forEach((building) => {
    pushContentValidation('building', building, validateBuilding(building, manifest.modId, idIndex));
    const label = `${building.name || 'Building'} (${building.id})`;
    const ref = `building:${building.uid}`;
    checkAssetRef(CONTENT_FILE_PATHS.building, label, 'model', building.model, '3d-model', ref);
    building.pieces.forEach((piece, i) =>
      checkAssetRef(
        CONTENT_FILE_PATHS.building,
        label,
        `pieces[${i}].model`,
        piece.model,
        '3d-model',
        ref
      )
    );
    building.doors.forEach((door, i) => {
      checkAssetRef(
        CONTENT_FILE_PATHS.building,
        label,
        `doors[${i}].model`,
        door.model,
        '3d-model',
        ref
      );
      if (door.locked && door.keyItemId.trim()) {
        checkNamespacedReference(
          CONTENT_FILE_PATHS.building,
          label,
          `doors[${i}].keyItemId`,
          door.keyItemId,
          ref
        );
      }
    });
    building.windows.forEach((win, i) =>
      checkAssetRef(
        CONTENT_FILE_PATHS.building,
        label,
        `windows[${i}].model`,
        win.model,
        '3d-model',
        ref
      )
    );
    building.materials.forEach((mat, i) =>
      checkNamespacedReference(
        CONTENT_FILE_PATHS.building,
        label,
        `materials[${i}].itemId`,
        mat.itemId,
        ref
      )
    );
  });

  contents.spawns.forEach((spawn) => {
    pushContentValidation('spawn', spawn, validateSpawn(spawn, manifest.modId, idIndex));
    const label = `${spawn.name || 'Spawn'} (${spawn.id})`;
    const ref = `spawn:${spawn.uid}`;
    checkNamespacedReference(CONTENT_FILE_PATHS.spawn, label, 'entityId', spawn.entityId, ref);
    if (spawn.conditions.requiredQuestId.trim()) {
      checkNamespacedReference(
        CONTENT_FILE_PATHS.spawn,
        label,
        'conditions.requiredQuestId',
        spawn.conditions.requiredQuestId,
        ref
      );
    }
  });

  const pushExtendedValidation = (
    kind: ExtendedConfigKind,
    entry: WoAContentBase,
    fieldIssues: ContentValidationIssue[]
  ) => {
    const file = EXTENDED_CONFIG_FILE_PATHS[kind];
    const objectLabel = `${entry.name || t('common.unnamed')} (${entry.id || entry.uid})`;
    const targetRef = `${kind}:${entry.uid}`;

    for (const fi of fieldIssues) {
      const isDuplicate =
        fi.field === 'id' && (idIndex.get(entry.id.trim())?.length ?? 0) > 1;
      pushIssue(
        fi.level === 'error' ? 'error' : 'warning',
        isDuplicate ? 'DUPLICATE_OBJECT_ID' : 'INVALID_OBJECT_PROPERTY',
        isDuplicate ? 'identifiers' : 'properties',
        {
          file,
          object: objectLabel,
          property: fi.field,
          problem: fi.message,
          suggestion: suggestionForField(fi.field),
          targetType: 'content',
          targetRef,
        }
      );
    }
  };

  (contents.animations ?? []).forEach((anim) => {
    pushExtendedValidation(
      'animation',
      anim,
      validateAnimationConfig(anim, manifest.modId, idIndex)
    );
    const label = `${anim.name || 'Animation'} (${anim.id})`;
    const ref = `animation:${anim.uid}`;
    if (anim.soundCueId.trim()) {
      checkNamespacedReference(
        EXTENDED_CONFIG_FILE_PATHS.animation,
        label,
        'soundCueId',
        anim.soundCueId,
        ref
      );
    }
  });

  (contents.audioCues ?? []).forEach((cue) => {
    pushExtendedValidation(
      'audio',
      cue,
      validateAudioConfig(cue, manifest.modId, idIndex)
    );
    const label = `${cue.name || 'Audio Cue'} (${cue.id})`;
    const ref = `audio:${cue.uid}`;
    checkAssetRef(
      EXTENDED_CONFIG_FILE_PATHS.audio,
      label,
      'assetPath',
      cue.assetPath,
      'audio',
      ref
    );
  });

  (contents.materials ?? []).forEach((mat) => {
    pushExtendedValidation(
      'material',
      mat,
      validateMaterialConfig(mat, manifest.modId, idIndex)
    );
    const label = `${mat.name || 'Material'} (${mat.id})`;
    const ref = `material:${mat.uid}`;
    if (mat.albedoTexture.trim()) {
      checkAssetRef(
        EXTENDED_CONFIG_FILE_PATHS.material,
        label,
        'albedoTexture',
        mat.albedoTexture,
        'texture',
        ref
      );
    }
    if (mat.normalTexture.trim()) {
      checkAssetRef(
        EXTENDED_CONFIG_FILE_PATHS.material,
        label,
        'normalTexture',
        mat.normalTexture,
        'texture',
        ref
      );
    }
  });

  (contents.lootTables ?? []).forEach((table) => {
    pushExtendedValidation(
      'loot_table',
      table,
      validateLootTableConfig(table, manifest.modId, idIndex)
    );
    const label = `${table.name || 'Loot Table'} (${table.id})`;
    const ref = `loot_table:${table.uid}`;
    table.entries.forEach((drop, idx) =>
      checkNamespacedReference(
        EXTENDED_CONFIG_FILE_PATHS.loot_table,
        label,
        `entries[${idx}].itemId`,
        drop.itemId,
        ref
      )
    );
  });

  (contents.dialogues ?? []).forEach((tree) => {
    pushExtendedValidation(
      'dialogue',
      tree,
      validateDialogueTreeConfig(tree, manifest.modId, idIndex)
    );
    const label = `${tree.name || 'Dialogue Tree'} (${tree.id})`;
    const ref = `dialogue:${tree.uid}`;
    checkNamespacedReference(
      EXTENDED_CONFIG_FILE_PATHS.dialogue,
      label,
      'npcId',
      tree.npcId,
      ref
    );
    tree.nodes.forEach((node, idx) => {
      if (node.questTriggerId?.trim()) {
        checkNamespacedReference(
          EXTENDED_CONFIG_FILE_PATHS.dialogue,
          label,
          `nodes[${idx}].questTriggerId`,
          node.questTriggerId,
          ref
        );
      }
    });
  });

  (contents.worldObjects ?? []).forEach((wo) => {
    pushExtendedValidation(
      'world_object',
      wo,
      validateWorldObjectConfig(wo, manifest.modId, idIndex)
    );
    const label = `${wo.name || 'World Object'} (${wo.id})`;
    const ref = `world_object:${wo.uid}`;
    checkAssetRef(
      EXTENDED_CONFIG_FILE_PATHS.world_object,
      label,
      'model',
      wo.model,
      '3d-model',
      ref
    );
    if (wo.materialConfigId.trim()) {
      checkNamespacedReference(
        EXTENDED_CONFIG_FILE_PATHS.world_object,
        label,
        'materialConfigId',
        wo.materialConfigId,
        ref
      );
    }
    if (wo.audioCueId.trim()) {
      checkNamespacedReference(
        EXTENDED_CONFIG_FILE_PATHS.world_object,
        label,
        'audioCueId',
        wo.audioCueId,
        ref
      );
    }
    if (wo.lootTableId.trim()) {
      checkNamespacedReference(
        EXTENDED_CONFIG_FILE_PATHS.world_object,
        label,
        'lootTableId',
        wo.lootTableId,
        ref
      );
    }
    if (wo.questId.trim()) {
      checkNamespacedReference(
        EXTENDED_CONFIG_FILE_PATHS.world_object,
        label,
        'questId',
        wo.questId,
        ref
      );
    }
  });

  // Check script registerAsset('...') calls for broken asset references
  for (const file of files) {
    if (file.type === 'script' && file.content) {
      const regex = /registerAsset\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(file.content)) !== null) {
        const assetPath = m[1].trim();
        if (!assetPath.startsWith('woa:') && !filePathSet.has(assetPath)) {
          pushIssue('error', 'BROKEN_SCRIPT_ASSET_REF', 'assets', {
            file: file.path,
            object: file.name,
            property: 'registerAsset',
            problem: t('validator.brokenScriptAssetProblem', { path: assetPath }),
            suggestion: t('validator.brokenScriptAssetSuggestion', { path: assetPath }),
            targetType: 'file',
            targetRef: file.path,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. DEPENDENCIES & CIRCULAR DEPENDENCIES
  // ---------------------------------------------------------------------------
  const workspaceProjectMap = new Map<string, ModProject>();
  for (const proj of allProjects) {
    workspaceProjectMap.set(proj.manifest.modId.trim(), proj);
  }
  workspaceProjectMap.set(manifest.modId.trim(), project);

  const declaredDeps = manifest.dependencies ?? [];
  const seenDepIds = new Set<string>();

  declaredDeps.forEach((dep, idx) => {
    const depId = dep.modId.trim();
    if (!depId) {
      pushIssue('error', 'EMPTY_DEPENDENCY_ID', 'dependencies', {
        file: activeManifestFile,
        object: t('validator.obj.dependencyRow', { index: idx + 1 }),
        property: `dependencies[${idx}].modId`,
        problem: t('validator.emptyDepIdProblem'),
        suggestion: t('validator.emptyDepIdSuggestion'),
        targetType: 'manifest',
      });
      return;
    }

    if (seenDepIds.has(depId)) {
      pushIssue('warning', 'DUPLICATE_DEPENDENCY', 'dependencies', {
        file: activeManifestFile,
        object: depId,
        property: `dependencies[${idx}].modId`,
        problem: t('validator.duplicateDepProblem', { depId }),
        suggestion: t('validator.duplicateDepSuggestion'),
        targetType: 'manifest',
      });
    }
    seenDepIds.add(depId);

    if (depId === manifest.modId.trim()) {
      pushIssue('error', 'CIRCULAR_DEPENDENCY', 'dependencies', {
        file: activeManifestFile,
        object: manifest.name || manifest.modId,
        property: `dependencies[${idx}].modId`,
        problem: t('validator.selfDepProblem', { modId: manifest.modId }),
        suggestion: t('validator.selfDepSuggestion'),
        targetType: 'manifest',
      });
      return;
    }

    if (depId === 'woa' || depId === 'woa.core') return;

    const targetProj = workspaceProjectMap.get(depId);
    if (!targetProj) {
      pushIssue(dep.optional ? 'warning' : 'error', 'MISSING_DEPENDENCY', 'dependencies', {
        file: activeManifestFile,
        object: depId,
        property: `dependencies[${idx}]`,
        problem: t('validator.missingDepProblem', {
          depId,
          range: dep.versionRange || '*',
        }),
        suggestion: t('validator.missingDepSuggestion'),
        targetType: 'manifest',
      });
    } else if (
      dep.versionRange.trim() &&
      !satisfiesVersionRange(targetProj.manifest.version, dep.versionRange)
    ) {
      pushIssue('error', 'DEPENDENCY_VERSION_MISMATCH', 'dependencies', {
        file: activeManifestFile,
        object: depId,
        property: `dependencies[${idx}].versionRange`,
        problem: t('validator.depVersionProblem', {
          depId,
          actual: targetProj.manifest.version,
          range: dep.versionRange,
        }),
        suggestion: t('validator.depVersionSuggestion', {
          actual: targetProj.manifest.version,
          depId,
        }),
        targetType: 'manifest',
      });
    }
  });

  // Circular mod dependency graph cycle
  const modCycle = findModCycle(manifest.modId, allProjects, project);
  if (modCycle && modCycle.length > 2) {
    pushIssue('error', 'CIRCULAR_DEPENDENCY', 'dependencies', {
      file: activeManifestFile,
      object: manifest.name || manifest.modId,
      property: 'dependencies',
      problem: t('validator.circularDepProblem', { cycle: modCycle.join(' -> ') }),
      suggestion: t('validator.circularDepSuggestion'),
      targetType: 'manifest',
    });
  }

  // Circular Quest Chain detection
  const questEdges = new Map<string, string[]>();
  for (const q of contents.quests) {
    const qId = q.id.trim();
    if (!qId) continue;
    const nextList = questEdges.get(qId) ?? [];
    if (q.chain.nextQuestId.trim() && q.chain.nextQuestId.trim() !== qId) {
      nextList.push(q.chain.nextQuestId.trim());
    }
    questEdges.set(qId, nextList);
    for (const prereq of q.chain.prerequisiteQuestIds) {
      const pId = prereq.trim();
      if (!pId || pId === qId) continue;
      const list = questEdges.get(pId) ?? [];
      list.push(qId);
      questEdges.set(pId, list);
    }
  }
  const questCycle = findDirectedCycle(questEdges);
  if (questCycle) {
    pushIssue('error', 'CIRCULAR_QUEST_CHAIN', 'dependencies', {
      file: CONTENT_FILE_PATHS.quest,
      object: questCycle[0],
      property: 'chain',
      problem: t('validator.circularQuestProblem', { cycle: questCycle.join(' -> ') }),
      suggestion: t('validator.circularQuestSuggestion'),
      targetType: 'content',
      targetRef: `quest:${contents.quests.find((q) => q.id.trim() === questCycle[0])?.uid ?? ''}`,
    });
  }

  // Circular Crafting Recipe detection
  const recipeEdges = new Map<string, string[]>();
  for (const r of contents.recipes) {
    const outId = r.outputItemId.trim();
    if (!outId) continue;
    const ingIds = r.ingredients.map((i) => i.itemId.trim()).filter(Boolean);
    recipeEdges.set(outId, [...(recipeEdges.get(outId) ?? []), ...ingIds]);
  }
  const craftCycle = findDirectedCycle(recipeEdges);
  if (craftCycle) {
    pushIssue('error', 'CIRCULAR_CRAFTING_LOOP', 'dependencies', {
      file: CONTENT_FILE_PATHS.recipe,
      object: craftCycle[0],
      property: 'ingredients / outputItemId',
      problem: t('validator.circularCraftProblem', { cycle: craftCycle.join(' -> ') }),
      suggestion: t('validator.circularCraftSuggestion'),
      targetType: 'content',
      targetRef: `recipe:${contents.recipes.find((r) => r.outputItemId.trim() === craftCycle[0])?.uid ?? ''}`,
    });
  }

  // Load-Order rules & cycle checks
  const loadOrder = manifest.loadOrder;
  if (loadOrder) {
    const afterSet = new Set(loadOrder.loadAfter.map((s) => s.trim()).filter(Boolean));
    const beforeSet = new Set(loadOrder.loadBefore.map((s) => s.trim()).filter(Boolean));
    for (const target of afterSet) {
      if (target === manifest.modId.trim()) {
        pushIssue('error', 'LOAD_ORDER_SELF_REF', 'dependencies', {
          file: activeManifestFile,
          object: manifest.name || manifest.modId,
          property: 'loadOrder.loadAfter',
          problem: t('validator.loadOrderSelfAfterProblem', { modId: manifest.modId }),
          suggestion: t('validator.loadOrderSelfAfterSuggestion'),
          targetType: 'manifest',
        });
      }
      if (beforeSet.has(target)) {
        pushIssue('error', 'LOAD_ORDER_CONFLICT', 'dependencies', {
          file: activeManifestFile,
          object: manifest.name || manifest.modId,
          property: 'loadOrder',
          problem: t('validator.loadOrderConflictProblem', { target }),
          suggestion: t('validator.loadOrderConflictSuggestion'),
          targetType: 'manifest',
        });
      }
    }
    for (const target of beforeSet) {
      if (target === manifest.modId.trim()) {
        pushIssue('error', 'LOAD_ORDER_SELF_REF', 'dependencies', {
          file: activeManifestFile,
          object: manifest.name || manifest.modId,
          property: 'loadOrder.loadBefore',
          problem: t('validator.loadOrderSelfBeforeProblem', { modId: manifest.modId }),
          suggestion: t('validator.loadOrderSelfBeforeSuggestion'),
          targetType: 'manifest',
        });
      }
    }

    const orderEdges = new Map<string, string[]>();
    const pushOrderEdge = (from: string, to: string) => {
      if (!from || !to || from === to) return;
      const list = orderEdges.get(from) ?? [];
      if (!list.includes(to)) list.push(to);
      orderEdges.set(from, list);
    };
    for (const proj of workspaceProjectMap.values()) {
      const id = proj.manifest.modId.trim();
      const lo = proj.manifest.loadOrder;
      if (!lo) continue;
      for (const a of lo.loadAfter) pushOrderEdge(a.trim(), id);
      for (const b of lo.loadBefore) pushOrderEdge(id, b.trim());
    }
    const orderCycle = findDirectedCycle(orderEdges);
    if (orderCycle) {
      pushIssue('error', 'CIRCULAR_LOAD_ORDER', 'dependencies', {
        file: activeManifestFile,
        object: manifest.name || manifest.modId,
        property: 'loadOrder',
        problem: t('validator.circularLoadOrderProblem', { cycle: orderCycle.join(' -> ') }),
        suggestion: t('validator.circularLoadOrderSuggestion'),
        targetType: 'manifest',
      });
    }
  }

  // Sort: errors first, then warnings
  issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.file.localeCompare(b.file);
  });

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const coreObjects = (Object.keys(CONTENT_KIND_LABELS) as ContentKind[]).reduce(
    (sum, kind) => {
      switch (kind) {
        case 'item':
          return sum + contents.items.length;
        case 'weapon':
          return sum + contents.weapons.length;
        case 'armor':
          return sum + contents.armor.length;
        case 'npc':
          return sum + contents.npcs.length;
        case 'monster':
          return sum + contents.monsters.length;
        case 'quest':
          return sum + contents.quests.length;
        case 'recipe':
          return sum + contents.recipes.length;
        case 'building':
          return sum + contents.buildings.length;
        case 'spawn':
          return sum + contents.spawns.length;
      }
    },
    0
  );
  const checkedObjects =
    coreObjects +
    (contents.animations?.length ?? 0) +
    (contents.audioCues?.length ?? 0) +
    (contents.materials?.length ?? 0) +
    (contents.lootTables?.length ?? 0) +
    (contents.dialogues?.length ?? 0) +
    (contents.worldObjects?.length ?? 0);

  return {
    id: `val_${Date.now()}`,
    modId: manifest.modId,
    version: manifest.version,
    targetPlatform,
    currentGameVersion: CURRENT_GAME_VERSION,
    minSupportedGameVersion: MIN_SUPPORTED_GAME_VERSION,
    targetGameVersion: gameVer || CURRENT_GAME_VERSION,
    modCreatorVersion: APP_VERSION,
    contentSchemaVersion:
      detectedSchemaVersion ??
      (manifest.packageFormatVersion && isSupportedContentSchemaVersion(manifest.packageFormatVersion)
        ? parseSchemaVersionNumber(manifest.packageFormatVersion) ?? CURRENT_MOD_CONTENT_SCHEMA_VERSION
        : CURRENT_MOD_CONTENT_SCHEMA_VERSION),
    timestamp: new Date().toISOString(),
    durationMs: Math.max(8, Math.round(performance.now() - start)),
    errorCount,
    warningCount,
    canExport: errorCount === 0,
    requiresConfirmation: errorCount === 0 && warningCount > 0,
    issues,
    checkedFiles: files.filter((f) => f.type !== 'folder').length,
    checkedAssets: assets.length,
    checkedObjects,
  };
}
