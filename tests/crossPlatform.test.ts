import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_ENTRY_BYTES,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  assertSafeArchiveEntryPath,
  assertSafeLocalAssetSize,
  assertSafeWoamodPackageLimits,
  getArchivePathViolation,
  isAllowedWoamodPackagePath,
  isBlockedExecutableFile,
  isDisallowedModPackageFile,
  safeJsonParse,
  sanitizeManifestEntryPoint,
  sanitizeSafeModId,
  stripPrototypePollution,
  validateZipArchiveLimits,
} from '../src/core/security/importGuard';
import {
  CURRENT_GAME_VERSION,
  CURRENT_MOD_CONTENT_SCHEMA_VERSION,
  DEFAULT_GAME_VERSION,
  MIN_SUPPORTED_GAME_VERSION,
  SUPPORTED_MOD_CONTENT_SCHEMA_VERSIONS,
  validateMaxGameVersion,
  validateSupportedGameVersion,
} from '../src/core/api/woaModApiSpec';
import {
  deriveAssetModCategoryFromContext,
  getAssetFormatSpec,
  isSupportedAssetPath,
  normalizeAssetModCategory,
  parseAndValidateWoa3dContent,
  serializeWoa3dAsset,
} from '../src/core/assets/assetPipeline';
import {
  createModProject,
  createStarterSampleProject,
} from '../src/core/project/modScaffolder';
import {
  exportModArchiveBlob,
  generateUniqueExportFilename,
  importModFromFile,
  isDevelopmentOnlyPath,
  parseBackupRecordFile,
  validateBackupRecord,
} from '../src/core/builder/modBuilder';
import { validateModProject } from '../src/core/validation/modValidator';
import {
  cloneSpawnConfig,
  createDefaultBuilding,
  createDefaultItem,
  createDefaultModEvent,
  createDefaultMonster,
  createDefaultNpc,
  createDefaultSpawnConfig,
  createDefaultSpawnLocation,
  createDefaultWeapon,
  resolveProjectContents,
  syncContentFilesInProject,
  validateContentSpawnConfig,
} from '../src/core/content/contentRegistry';
import {
  EVENT_ACTION_CATALOG,
  EVENT_CONDITION_CATALOG,
  EVENT_TRIGGER_CATALOG,
  createEventFromTemplate,
} from '../src/core/events/eventCatalog';
import {
  createDefaultEventSimState,
  detectEventChainCycles,
  dispatchSandboxEvent,
  remapEventContentIds,
  resetSandboxEventStates,
  validateModEventConfig,
} from '../src/core/events/eventEngine';
import {
  detectFormFactor,
  detectRuntimePlatform,
  getPlatformCapabilities,
} from '../src/platform/detect';
import { STORAGE_SUBDIRS } from '../src/platform/types';
import {
  APP_ROOT_FOLDER_NAME,
  AndroidAccessDeniedError,
  classifyAndroidNativeError,
  createDefaultStorageConfig,
  detectAndroidStorageCapabilities,
  doesOperationRequireRuntimePermission,
  formatBackupTimestampFolder,
  generateUniqueFilename,
  getDefaultDeniedMessage,
  inferImportOperationFromAccept,
  parseScopedBlobKey,
  sanitizeFolderSegment,
} from '../src/platform/androidAccessManager';
import {
  APP_DISPLAY_NAME,
  APP_ID,
  APP_SHORT_NAME,
  APP_VERSION,
  APP_VERSION_CODE,
  getArtifactFileNames,
} from '../src/core/version';
import { en } from '../src/i18n/locales/en';
import { ar } from '../src/i18n/locales/ar';

test('single version source matches version.json, package.json, and Android build.gradle', () => {
  const rootDir = process.cwd();
  const versionJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'version.json'), 'utf8'));
  const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const gradleRaw = fs.readFileSync(path.join(rootDir, 'android/app/build.gradle'), 'utf8');

  assert.equal(APP_VERSION, versionJson.version);
  assert.equal(APP_VERSION_CODE, versionJson.versionCode);
  assert.equal(APP_DISPLAY_NAME, versionJson.appName);
  assert.equal(APP_SHORT_NAME, versionJson.shortName);
  assert.equal(APP_ID, versionJson.appId);
  assert.equal(pkgJson.version, versionJson.version);
  assert.match(gradleRaw, new RegExp(`versionCode\\s+${versionJson.versionCode}\\b`));
  assert.match(gradleRaw, new RegExp(`versionName\\s+"${versionJson.version}"`));
  const artifacts = getArtifactFileNames();
  assert.equal(artifacts.androidApk, `World-of-Adventure-Mod-Creator-v${versionJson.version}.apk`);
  assert.equal(
    artifacts.windowsPortable,
    `World-of-Adventure-Mod-Creator-v${versionJson.version}-Windows-Portable.exe`
  );
  assert.equal(
    artifacts.windowsSetup,
    `World-of-Adventure-Mod-Creator-v${versionJson.version}-Windows-Setup.exe`
  );
});

test('importGuard rejects path traversal, drive prefixes, and reserved Windows names', () => {
  assert.equal(getArchivePathViolation('assets/models/sword.glb'), null);
  assert.ok(getArchivePathViolation('../evil.json'));
  assert.ok(getArchivePathViolation('assets/../../evil.json'));
  assert.ok(getArchivePathViolation('/etc/passwd'));
  assert.ok(getArchivePathViolation('C:\\Windows\\System32\\cmd.exe'));
  assert.ok(getArchivePathViolation('assets/CON.json'));
  assert.ok(getArchivePathViolation('assets/nul.txt'));

  assert.throws(() => assertSafeArchiveEntryPath('../escape.txt'));
  assert.throws(() => assertSafeArchiveEntryPath('scripts/lpt1.ts'));
});

test('importGuard blocks dangerous executable extensions across archives and local assets', () => {
  for (const dangerous of ['payload.exe', 'lib.dll', 'native.so', 'mod.apk', 'run.sh', 'macro.ps1']) {
    assert.equal(isBlockedExecutableFile(dangerous), true, `Expected ${dangerous} to be blocked`);
    assert.throws(() => assertSafeArchiveEntryPath(`assets/${dangerous}`));
    assert.throws(() => assertSafeLocalAssetSize(dangerous, 1024));
  }

  assert.equal(isBlockedExecutableFile('models/hero_sword.glb'), false);
  assert.doesNotThrow(() => assertSafeLocalAssetSize('hero_sword.glb', 1024 * 1024));
});

test('importGuard strips prototype-pollution keys and sanitizes modId/entryPoint', () => {
  const maliciousJson = '{"name":"Safe","__proto__":{"polluted":true},"nested":{"constructor":{"prototype":{"evil":1}},"ok":42}}';
  const parsed = safeJsonParse<Record<string, unknown>>(maliciousJson);

  assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), false);
  assert.equal((parsed as { polluted?: boolean }).polluted, undefined);
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsed.nested as Record<string, unknown>, 'constructor'),
    false
  );
  assert.equal((parsed.nested as { ok: number }).ok, 42);

  const obj = { constructor: 'bad', prototype: 'bad', valid: 'good' };
  const stripped = stripPrototypePollution(obj);
  assert.deepEqual(stripped, { valid: 'good' });

  assert.equal(sanitizeSafeModId('My Awesome Mod!!'), 'my_awesome_mod');
  assert.throws(() => sanitizeSafeModId('..'));

  assert.equal(sanitizeManifestEntryPoint('scripts/main.ts'), 'scripts/main.ts');
  assert.equal(sanitizeManifestEntryPoint('assets/model.glb'), 'scripts/main.ts');
  assert.throws(() => sanitizeManifestEntryPoint('../hack.ts'));
});

test('validateZipArchiveLimits rejects oversized archives, entry bombs, and high compression ratios', () => {
  const safeZip = new JSZip();
  safeZip.file('mod.json', JSON.stringify({ modId: 'demo', name: 'Demo' }));
  assert.doesNotThrow(() => validateZipArchiveLimits(safeZip, 512));

  // Simulated zip bomb central-directory metadata
  const bombZip = {
    files: {
      'data/huge.json': {
        name: 'data/huge.json',
        dir: false,
        _data: {
          compressedSize: 1024,
          uncompressedSize: 20 * 1024 * 1024, // 20,000x ratio
        },
      },
    },
  } as unknown as JSZip;
  assert.throws(() => validateZipArchiveLimits(bombZip, 1024), /zip bomb/i);

  // Too many entries
  const manyEntries: Record<string, unknown> = {};
  for (let i = 0; i <= MAX_ARCHIVE_ENTRIES; i++) {
    manyEntries[`f_${i}.json`] = {
      name: `f_${i}.json`,
      dir: false,
      _data: { compressedSize: 10, uncompressedSize: 10 },
    };
  }
  assert.throws(
    () => validateZipArchiveLimits({ files: manyEntries } as unknown as JSZip, 1024),
    /too many entries/i
  );

  // Oversized single entry
  assert.throws(
    () =>
      validateZipArchiveLimits(
        {
          files: {
            'assets/giant.glb': {
              name: 'assets/giant.glb',
              dir: false,
              _data: {
                compressedSize: MAX_ARCHIVE_ENTRY_BYTES,
                uncompressedSize: MAX_ARCHIVE_ENTRY_BYTES + 1,
              },
            },
          },
        } as unknown as JSZip,
        1024
      ),
    /single-file size/i
  );

  // Total uncompressed cap
  const perEntry = Math.floor(MAX_ARCHIVE_ENTRY_BYTES * 0.9);
  const countForCap = Math.ceil((MAX_ARCHIVE_UNCOMPRESSED_BYTES + 1) / perEntry);
  const capEntries: Record<string, unknown> = {};
  for (let i = 0; i < countForCap; i++) {
    capEntries[`chunk_${i}.json`] = {
      name: `chunk_${i}.json`,
      dir: false,
      _data: { compressedSize: perEntry, uncompressedSize: perEntry },
    };
  }
  assert.throws(
    () => validateZipArchiveLimits({ files: capEntries } as unknown as JSZip, 1024),
    /decompressed size/i
  );
});

test('platform detection falls back safely in non-DOM/Web runtime and classifies form factors', () => {
  assert.equal(detectRuntimePlatform(), 'web');
  const webCaps = getPlatformCapabilities('web');
  assert.equal(webCaps.platform, 'web');
  assert.equal(webCaps.supportsHardwareBack, false);

  const winCaps = getPlatformCapabilities('windows');
  assert.equal(winCaps.hasNativeFilesystem, true);
  assert.equal(winCaps.hasKeyboardShortcuts, true);
  assert.equal(winCaps.hasDragAndDrop, true);

  const androidCaps = getPlatformCapabilities('android');
  assert.equal(androidCaps.hasStorageAccessFramework, true);
  assert.equal(androidCaps.supportsHardwareBack, true);
  assert.equal(androidCaps.isTouchPrimary, true);

  assert.equal(detectFormFactor(1440, 'windows', false), 'desktop');
  assert.equal(detectFormFactor(390, 'android', true), 'phone');
  assert.equal(detectFormFactor(820, 'android', true), 'tablet');
  assert.equal(detectFormFactor(375, 'web', true), 'phone');
  assert.equal(detectFormFactor(1280, 'web', false), 'desktop');
});

test('English and Arabic i18n dictionaries stay strictly aligned', () => {
  const enKeys = Object.keys(en).sort();
  const arKeys = Object.keys(ar).sort();
  assert.deepEqual(arKeys, enKeys);
});

test('data-driven .woamod package boundary blocks scripts, source code, dev configs, and executables', () => {
  assert.equal(isAllowedWoamodPackagePath('mod.json'), true);
  assert.equal(isAllowedWoamodPackagePath('compatibility.json'), true);
  assert.equal(isAllowedWoamodPackagePath('data/items.json'), true);
  assert.equal(isAllowedWoamodPackagePath('localization/ar.json'), true);
  assert.equal(isAllowedWoamodPackagePath('assets/models/relic_sword.woa3d'), true);
  assert.equal(isAllowedWoamodPackagePath('assets/textures/albedo.png'), true);
  assert.equal(isAllowedWoamodPackagePath('assets/sounds/chime.wav'), true);

  for (const disallowed of [
    'scripts/main.ts',
    'scripts/helper.js',
    'src/App.tsx',
    'electron/main.cjs',
    'package.json',
    'vite.config.ts',
    'README.md',
    'payload.exe',
    'lib.dll',
    'run.sh',
  ]) {
    assert.equal(isAllowedWoamodPackagePath(disallowed), false, `Expected ${disallowed} to be disallowed in .woamod`);
    assert.equal(isDevelopmentOnlyPath(disallowed), true, `Expected ${disallowed} to be pruned as dev/source file`);
  }

  assert.equal(isDisallowedModPackageFile('scripts/main.ts'), true);
  assert.equal(isDisallowedModPackageFile('evil.js'), true);
  assert.equal(isDisallowedModPackageFile('payload.exe'), true);
  assert.equal(isDisallowedModPackageFile('data/items.json'), false);
});

test('exportModArchiveBlob generates a clean data-driven .woamod free of scripts/dev files and round-trips through importModFromFile', async () => {
  const sample = createStarterSampleProject();
  // Inject extra development/source files into workspace to prove general boundary pruning
  sample.files.push(
    {
      id: 'file_dev_pkg',
      name: 'package.json',
      path: 'package.json',
      parentPath: null,
      type: 'data',
      content: '{"name":"dev"}',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'file_dev_vite',
      name: 'vite.config.ts',
      path: 'vite.config.ts',
      parentPath: null,
      type: 'script',
      content: 'export default {};',
      updatedAt: new Date().toISOString(),
    }
  );

  const { blob, filename, report } = await exportModArchiveBlob(sample, 'universal', {
    confirmWarnings: true,
  });
  assert.equal(filename, 'Skyreach-Relics.woamod');
  assert.equal(report.success, true);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const allEntries = Object.keys(zip.files);
  const fileEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);

  assert.ok(fileEntries.includes('mod.json'));
  assert.ok(fileEntries.includes('compatibility.json'));
  assert.ok(fileEntries.includes('data/registry.json'));
  assert.ok(fileEntries.includes('data/recipes.json'));
  assert.ok(fileEntries.includes('data/quests.json'));
  assert.ok(fileEntries.includes('localization/en.json'));

  for (const entryName of allEntries) {
    assert.equal(entryName.startsWith('scripts'), false, `Unexpected scripts entry in .woamod: ${entryName}`);
  }
  for (const filePath of fileEntries) {
    assert.equal(isDisallowedModPackageFile(filePath), false, `Disallowed file in .woamod: ${filePath}`);
    assert.equal(isAllowedWoamodPackagePath(filePath), true, `Out-of-boundary file in .woamod: ${filePath}`);
  }

  const modJson = JSON.parse(await zip.file('mod.json')!.async('string')) as Record<string, unknown>;
  assert.equal(modJson.entryPoint, undefined);
  assert.equal((modJson.directories as Record<string, unknown>).scripts, undefined);
  assert.equal((modJson.compatibility as Record<string, unknown>).executionModel, 'data-driven');
  assert.equal((modJson.compatibility as Record<string, unknown>).requiresNativeCode, false);

  assert.doesNotThrow(() => assertSafeWoamodPackageLimits(zip, blob.size));

  const exportedFile = new File([blob], filename, { type: 'application/octet-stream' });
  const importedProject = await importModFromFile(exportedFile);
  assert.equal(importedProject.manifest.modId, 'com.adventureforge.skyreach_relics');

  const postImportValidation = await validateModProject(importedProject, [importedProject], 'universal');
  assert.equal(postImportValidation.errorCount, 0, JSON.stringify(postImportValidation.issues));
});

test('importModFromFile rejects .woamod archives containing scripts/main.ts, arbitrary JS/TS, executables, or disguised workspace bundles', async () => {
  const maliciousPayloads = [
    { path: 'scripts/main.ts', content: 'console.log("hi")' },
    { path: 'evil.js', content: 'alert(1)' },
    { path: 'payload.exe', content: 'MZ' },
    { path: 'native/lib.dll', content: 'MZ' },
    { path: 'native/libmod.so', content: 'ELF' },
    { path: 'tools/install.bat', content: '@echo off' },
    { path: 'run.sh', content: '#!/bin/sh\nid' },
  ];

  for (const payload of maliciousPayloads) {
    const badZip = new JSZip();
    badZip.file('mod.json', JSON.stringify({ modId: 'com.test.bad', name: 'Bad Mod', version: '1.0.0' }));
    badZip.file(payload.path, payload.content);
    const badBlob = await badZip.generateAsync({ type: 'blob' });
    const badFile = new File([badBlob], 'malicious.woamod', { type: 'application/octet-stream' });
    await assert.rejects(() => importModFromFile(badFile), /Security violation|Blocked/i);
  }

  // Disguised .woamod containing woa-project.json + scripts/main.ts must still be blocked
  const disguisedZip = new JSZip();
  disguisedZip.file('woa-project.json', JSON.stringify({ project: { manifest: { modId: 'com.test.disguised' }, assets: [] } }));
  disguisedZip.file('scripts/main.ts', 'export function onModLoad() {}');
  const disguisedBlob = await disguisedZip.generateAsync({ type: 'blob' });
  const disguisedFile = new File([disguisedBlob], 'disguised.woamod', { type: 'application/octet-stream' });
  await assert.rejects(() => importModFromFile(disguisedFile), /Security violation|Blocked/i);
});

test('validateSupportedGameVersion enforces SemVer >= 1.1.24 with current game version 1.1.25', () => {
  assert.equal(CURRENT_GAME_VERSION, '1.1.25');
  assert.equal(MIN_SUPPORTED_GAME_VERSION, '1.1.24');
  assert.equal(DEFAULT_GAME_VERSION, '1.1.25');
  assert.equal(APP_VERSION, '1.0.0');
  assert.notEqual(CURRENT_GAME_VERSION, APP_VERSION);

  for (const validVer of ['1.1.24', ' 1.1.24 ', '1.1.25', '1.1.26', '1.2.0', '1.8.0', '1.9.0', '2.0.0', '2.0.0-preview', '3.0.0', '3.5.10']) {
    const res = validateSupportedGameVersion(validVer);
    assert.equal(res.valid, true, `Expected ${validVer} to be valid`);
  }

  for (const lowVer of ['1.1.23', '1.1.22', '1.1.0', '1.0.0', '0.9.9', '0.9.0']) {
    const res = validateSupportedGameVersion(lowVer);
    assert.equal(res.valid, false, `Expected ${lowVer} to be rejected`);
    assert.equal(res.code, 'below_minimum');
    assert.equal(res.error, 'Game version must be 1.1.24 or higher.');
  }

  for (const badVer of ['', '   ', 'abc', '1.1', '1.9.x (Current)', '1.8.x (Stable)', '2.0-preview']) {
    const res = validateSupportedGameVersion(badVer);
    assert.equal(res.valid, false, `Expected "${badVer}" to be rejected`);
    assert.equal(res.error, 'Enter a valid game version, for example 1.1.24.');
  }

  assert.equal(en['createMod.gameVersionLabel'], 'Game Version');
  assert.equal(en['createMod.gameVersionPlaceholder'], 'Enter game version (minimum 1.1.24)');
  assert.equal(en['createMod.errGameVersionMin'], 'Game version must be 1.1.24 or higher.');
  assert.equal(en['createMod.errGameVersionFormat'], 'Enter a valid game version, for example 1.1.24.');
});

test('createModProject preserves exact trimmed supportedGameVersion without legacy defaults', async () => {
  for (const enteredVersion of ['1.1.24', '1.5.2', '2.0.0-preview']) {
    const project = createModProject({
      modId: 'com.test.custom_ver',
      name: 'Custom Version Mod',
      version: '0.1.0',
      author: 'Tester',
      description: 'Validates custom SemVer preservation.',
      supportedGameVersion: `  ${enteredVersion}  `,
      categories: ['Items'],
      templateId: 'blank',
    });

    assert.equal(project.manifest.supportedGameVersion, enteredVersion);
    assert.equal(project.manifest.minGameVersion, '1.1.24');

    const manifestFile = project.files.find((f) => f.path === 'mod.manifest.json');
    assert.ok(manifestFile?.content);
    const parsedManifest = JSON.parse(manifestFile.content) as Record<string, unknown>;
    assert.equal(parsedManifest.supportedGameVersion, enteredVersion);

    const validation = await validateModProject(project, [project], 'universal');
    assert.equal(
      validation.issues.filter((i) => i.code === 'UNSUPPORTED_GAME_VERSION' || i.code === 'MISSING_GAME_VERSION').length,
      0
    );
  }
});

test('validator flags legacy "1.9.x (Current)" and "< 1.1.24" versions while accepting >= 1.1.24 SemVer', async () => {
  const legacyProject = createStarterSampleProject();
  legacyProject.manifest.supportedGameVersion = '1.9.x (Current)';
  const legacyValidation = await validateModProject(legacyProject, [legacyProject], 'universal');
  assert.ok(
    legacyValidation.issues.some(
      (i) => i.severity === 'error' && i.code === 'UNSUPPORTED_GAME_VERSION'
    )
  );

  const belowMinProject = createStarterSampleProject();
  belowMinProject.manifest.supportedGameVersion = '1.1.23';
  const belowMinValidation = await validateModProject(belowMinProject, [belowMinProject], 'universal');
  assert.ok(
    belowMinValidation.issues.some(
      (i) => i.severity === 'error' && i.code === 'UNSUPPORTED_GAME_VERSION'
    )
  );

  const compatProject = createStarterSampleProject();
  compatProject.manifest.supportedGameVersion = '1.9.0';
  const compatValidation = await validateModProject(compatProject, [compatProject], 'universal');
  assert.equal(compatValidation.errorCount, 0, JSON.stringify(compatValidation.issues));
});

test('general .woa3d classification, serialization, import, and category/content rejection work across arbitrary filenames', async () => {
  const customSpec = getAssetFormatSpec('assets/models/arbitrary_custom_model.woa3d');
  assert.ok(customSpec);
  assert.equal(customSpec.category, '3d-model');
  assert.equal(customSpec.nodeType, 'asset-3d');
  assert.equal(customSpec.formatLabel, 'WOA3D');
  assert.equal(customSpec.targetDirectory, 'assets/models');

  assert.equal(isSupportedAssetPath('assets/models/arbitrary_custom_model.woa3d'), true);
  assert.equal(isSupportedAssetPath('assets/textures/arbitrary_custom_model.woa3d'), false);

  // Sample project round-trip preserves all 3 .woa3d assets + 1.1.25 version without artificial 2.x cap
  const sample = createStarterSampleProject();
  assert.equal(sample.manifest.supportedGameVersion, '1.1.25');
  assert.equal(sample.manifest.maxGameVersion, undefined);
  const { blob, filename } = await exportModArchiveBlob(sample, 'universal', { confirmWarnings: true });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const modJson = JSON.parse(await zip.file('mod.json')!.async('string')) as Record<string, unknown>;
  assert.equal(modJson.supportedGameVersion, '1.1.25');
  assert.equal(modJson.currentGameVersion, '1.1.25');
  assert.equal(modJson.minGameVersion, '1.1.24');
  assert.equal(modJson.maxGameVersion, undefined);
  assert.equal(modJson.schemaVersion, 2);

  const woa3dEntries = Object.keys(zip.files).filter((p) => p.endsWith('.woa3d'));
  assert.equal(woa3dEntries.length, 3);
  for (const woaPath of woa3dEntries) {
    const raw = await zip.file(woaPath)!.async('string');
    const parsed = parseAndValidateWoa3dContent(raw);
    assert.equal(parsed.format, 'WOA3D');
    assert.equal(parsed.type, '3d-model');
    assert.equal(parsed.category, '3d-model');
  }

  // Arbitrary custom .woa3d inside a .woamod package imports cleanly without any filename whitelist
  const customZip = new JSZip();
  customZip.file(
    'mod.json',
    JSON.stringify({
      modId: 'com.test.custom_models',
      name: 'Custom Models Mod',
      version: '1.0.0',
      author: 'Tester',
      supportedGameVersion: '1.2.5',
      categories: ['Items'],
    })
  );
  customZip.file(
    'assets/models/ancient_compass_custom.woa3d',
    serializeWoa3dAsset({
      format: 'WOA3D',
      preset: 'beacon-pedestal',
      modCategory: 'Item',
      pivotMode: 'bottom-center',
      collision: { shape: 'box', scale: 1, offsetY: 0 },
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      material: { color: '#475569', accentColor: '#3B82F6', roughness: 0.4, metalness: 0.6, emissiveIntensity: 0.2, wireframe: false },
    })
  );
  customZip.file(
    'data/items.json',
    JSON.stringify({
      entries: [
        {
          id: 'com.test.custom_models:compass',
          name: 'Ancient Compass',
          description: 'Custom compass item.',
          category: 'Item',
          rarity: 'rare',
          stackSize: 1,
          value: 150,
          model: 'assets/models/ancient_compass_custom.woa3d',
        },
      ],
    })
  );
  const customBlob = await customZip.generateAsync({ type: 'blob' });
  const customFile = new File([customBlob], filename, { type: 'application/octet-stream' });
  const importedCustom = await importModFromFile(customFile);
  assert.equal(importedCustom.manifest.supportedGameVersion, '1.2.5');
  assert.equal(importedCustom.assets.length, 1);
  assert.equal(importedCustom.assets[0].type, '3d-model');
  assert.equal(importedCustom.assets[0].format, 'WOA3D');
  assert.equal(importedCustom.assets[0].path, 'assets/models/ancient_compass_custom.woa3d');
  assert.equal(importedCustom.contents?.items.length, 1);
  assert.equal(importedCustom.contents?.items[0].id, 'com.test.custom_models:compass');

  // Misplaced .woa3d under assets/textures/ is rejected as wrong_category
  const wrongCatZip = new JSZip();
  wrongCatZip.file(
    'mod.json',
    JSON.stringify({ modId: 'com.test.wrong_cat', name: 'Wrong Cat', version: '1.0.0', supportedGameVersion: '1.1.24' })
  );
  wrongCatZip.file('assets/textures/misplaced_sword.woa3d', JSON.stringify({ format: 'WOA3D', preset: 'relic-sword' }));
  const wrongCatFile = new File([await wrongCatZip.generateAsync({ type: 'blob' })], 'wrong.woamod');
  await assert.rejects(() => importModFromFile(wrongCatFile), /wrong_category/i);

  // Corrupted .woa3d JSON is rejected cleanly
  const badWoaZip = new JSZip();
  badWoaZip.file(
    'mod.json',
    JSON.stringify({ modId: 'com.test.bad_woa3d', name: 'Bad WOA3D', version: '1.0.0', supportedGameVersion: '1.1.24' })
  );
  badWoaZip.file('assets/models/broken.woa3d', '{not-valid-json');
  const badWoaFile = new File([await badWoaZip.generateAsync({ type: 'blob' })], 'broken.woamod');
  await assert.rejects(() => importModFromFile(badWoaFile), /Corrupted WOA3D JSON/i);
});

test('Android storage capability detection and runtime permission rules across API levels (Android 7 to 15+)', () => {
  const api24 = detectAndroidStorageCapabilities(24);
  assert.equal(api24.tier, 'legacy-external');
  assert.equal(api24.usesScopedStorage, false);
  assert.equal(api24.isAndroid13Plus, false);
  assert.equal(api24.requiresLegacyStoragePermission, true);

  const api28 = detectAndroidStorageCapabilities(28);
  assert.equal(api28.tier, 'legacy-external');
  assert.equal(api28.usesScopedStorage, false);

  const api29 = detectAndroidStorageCapabilities(29);
  assert.equal(api29.tier, 'scoped-pre13');
  assert.equal(api29.usesScopedStorage, true);
  assert.equal(api29.isAndroid13Plus, false);
  assert.equal(api29.requiresLegacyStoragePermission, false);

  const api32 = detectAndroidStorageCapabilities(32);
  assert.equal(api32.tier, 'scoped-pre13');
  assert.equal(api32.usesScopedStorage, true);
  assert.equal(api32.isAndroid13Plus, false);

  for (const sdk of [33, 35, 36]) {
    const caps = detectAndroidStorageCapabilities(sdk);
    assert.equal(caps.tier, 'scoped-android13-plus');
    assert.equal(caps.usesScopedStorage, true);
    assert.equal(caps.isAndroid13Plus, true);
    assert.equal(caps.requiresLegacyStoragePermission, false);
    assert.equal(caps.usesSafByDefault, true);
  }

  // App-private storage NEVER requires runtime permission at any API level
  for (const op of ['app-storage', 'open-project', 'save-project'] as const) {
    assert.equal(doesOperationRequireRuntimePermission(op, 24, true), false);
    assert.equal(doesOperationRequireRuntimePermission(op, 29, true), false);
    assert.equal(doesOperationRequireRuntimePermission(op, 33, true), false);
    assert.equal(doesOperationRequireRuntimePermission(op, 36, true), false);
  }

  // SAF operations never require runtime permissions on API 29+/33+ or when using picker on API < 29
  for (const op of ['import-mod', 'export-mod', 'import-media', 'pick-directory', 'backup-export', 'backup-restore'] as const) {
    assert.equal(doesOperationRequireRuntimePermission(op, 24, false), false);
    assert.equal(doesOperationRequireRuntimePermission(op, 24, true), true);
    assert.equal(doesOperationRequireRuntimePermission(op, 29, true), false);
    assert.equal(doesOperationRequireRuntimePermission(op, 33, true), false);
    assert.equal(doesOperationRequireRuntimePermission(op, 35, true), false);
  }

  assert.equal(inferImportOperationFromAccept(['.woamod', '.zip']), 'import-mod');
  assert.equal(inferImportOperationFromAccept(['.png', '.glb', '.mp3']), 'import-media');
  assert.equal(inferImportOperationFromAccept(['.woabackup.json']), 'backup-restore');
});

test('Android error classification, localized denial strings, and native manifest/plugin contracts', () => {
  assert.equal(classifyAndroidNativeError('ACCESS_DENIED: File permission denied').code, 'ACCESS_DENIED');
  assert.equal(classifyAndroidNativeError('READ_FAILED: Unable to read stream').code, 'READ_FAILED');
  assert.equal(classifyAndroidNativeError('WRITE_FAILED: Disk full').code, 'WRITE_FAILED');
  assert.equal(classifyAndroidNativeError('PICKER_UNAVAILABLE: No activity').code, 'PICKER_UNAVAILABLE');
  assert.equal(classifyAndroidNativeError(new Error('java.lang.SecurityException: Permission Denial')).code, 'ACCESS_DENIED');

  const deniedErr = new AndroidAccessDeniedError('import-mod');
  assert.equal(
    deniedErr.message,
    'File access was denied. Please allow access or select the file again.'
  );
  assert.equal(
    getDefaultDeniedMessage(),
    'File access was denied. Please allow access or select the file again.'
  );
  assert.equal(
    en['android.fileAccessDenied'],
    'File access was denied. Please allow access or select the file again.'
  );
  assert.equal(
    ar['android.fileAccessDenied'],
    'تم رفض الوصول إلى الملف. يرجى السماح بالوصول أو اختيار الملف مرة أخرى.'
  );

  const rootDir = process.cwd();
  const manifestXml = fs.readFileSync(
    path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'),
    'utf8'
  );
  assert.match(manifestXml, /android\.permission\.INTERNET/);
  assert.match(
    manifestXml,
    /android:name="android\.permission\.READ_EXTERNAL_STORAGE"[^>]*android:maxSdkVersion="32"/
  );
  assert.match(
    manifestXml,
    /android:name="android\.permission\.WRITE_EXTERNAL_STORAGE"[^>]*android:maxSdkVersion="29"/
  );

  for (const forbidden of [
    'MANAGE_EXTERNAL_STORAGE',
    'READ_MEDIA_IMAGES',
    'READ_MEDIA_AUDIO',
    'READ_MEDIA_VIDEO',
    'android.permission.CAMERA',
    'ACCESS_FINE_LOCATION',
    'ACCESS_COARSE_LOCATION',
    'BLUETOOTH',
    'READ_CONTACTS',
    'READ_PHONE_STATE',
    'READ_SMS',
    'RECORD_AUDIO',
    'READ_CALL_LOG',
    'READ_CALENDAR',
  ]) {
    assert.equal(
      manifestXml.includes(forbidden),
      false,
      `AndroidManifest.xml must not request forbidden/unrelated permission ${forbidden}`
    );
  }

  const pluginJava = fs.readFileSync(
    path.join(rootDir, 'android/app/src/main/java/com/woa/modcreator/WoaStoragePlugin.java'),
    'utf8'
  );
  assert.match(pluginJava, /ACTION_OPEN_DOCUMENT\b/);
  assert.match(pluginJava, /ACTION_CREATE_DOCUMENT\b/);
  assert.match(pluginJava, /ACTION_OPEN_DOCUMENT_TREE\b/);
  assert.match(pluginJava, /takePersistableUriPermission\b/);
  assert.match(pluginJava, /ACTION_APPLICATION_DETAILS_SETTINGS\b/);
  assert.equal(pluginJava.includes('MANAGE_EXTERNAL_STORAGE'), false);
  assert.equal(pluginJava.includes('READ_MEDIA_'), false);
});

test('parseBackupRecordFile safely parses valid .woabackup.json, strips prototype pollution, and rejects invalid backups', async () => {
  const sample = createStarterSampleProject();
  const backupJson = JSON.stringify({
    id: 'bk_1',
    modId: sample.manifest.modId,
    modName: sample.manifest.name,
    version: sample.manifest.version,
    label: 'Manual Backup Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    reason: 'manual',
    sizeBytes: 1024,
    __proto__: { polluted: true },
    project: sample,
  });
  const backupFile = new File([backupJson], 'skyreach.woabackup.json', {
    type: 'application/json',
  });
  const restored = await parseBackupRecordFile(backupFile);
  assert.equal(restored.modId, sample.manifest.modId);
  assert.equal(restored.label, 'Manual Backup Test');
  assert.equal(Object.prototype.hasOwnProperty.call(restored, '__proto__'), false);

  const badBackupFile = new File(['{"invalid": true}'], 'bad.woabackup.json', {
    type: 'application/json',
  });
  await assert.rejects(() => parseBackupRecordFile(badBackupFile));

  // Backup integrity checks reject incomplete project payloads directly
  assert.throws(() =>
    validateBackupRecord({
      id: 'bk_missing_name',
      modId: 'com.test.bad',
      modName: '',
      version: '1.0.0',
      label: 'Bad',
      createdAt: '2026-01-01T00:00:00.000Z',
      reason: 'manual',
      sizeBytes: 10,
      project: {
        ...sample,
        manifest: {
          ...sample.manifest,
          name: '   ',
        },
      },
    })
  );
  assert.throws(() =>
    validateBackupRecord({
      id: 'bk_traversal',
      modId: '..',
      modName: 'Bad',
      version: '1.0.0',
      label: 'Bad',
      createdAt: '2026-01-01T00:00:00.000Z',
      reason: 'manual',
      sizeBytes: 10,
      project: {
        ...sample,
        manifest: {
          ...sample.manifest,
          modId: '..',
        },
      },
    })
  );
  assert.throws(() =>
    validateBackupRecord({
      id: 'bk_bad_entry',
      modId: sample.manifest.modId,
      modName: 'Bad',
      version: '1.0.0',
      label: 'Bad',
      createdAt: '2026-01-01T00:00:00.000Z',
      reason: 'manual',
      sizeBytes: 10,
      project: {
        ...sample,
        manifest: {
          ...sample.manifest,
          entryPoint: '../evil.ts',
        },
      },
    })
  );
});

test('dedicated storage folder layout, scoped asset isolation, backup folder timestamps, and default storage config', () => {
  assert.equal(APP_ROOT_FOLDER_NAME, 'World of Adventure Mod Creator');
  for (const requiredDir of ['Projects', 'Exports', 'Backups', 'Assets', 'Settings'] as const) {
    assert.ok(
      STORAGE_SUBDIRS.includes(requiredDir),
      `Expected STORAGE_SUBDIRS to include ${requiredDir}`
    );
  }

  const defaultCfg = createDefaultStorageConfig();
  assert.equal(defaultCfg.safTreeUri, null);
  assert.equal(defaultCfg.safTreeLabel, null);
  assert.equal(defaultCfg.folderAccessValid, false);
  assert.equal(defaultCfg.folderAccessRevoked, false);
  assert.equal(defaultCfg.firstTimeSetupPrompted, false);
  assert.equal(defaultCfg.lastOpenedProjectId, null);
  assert.equal(defaultCfg.defaultExportMode, 'dedicated-folder');
  assert.equal(defaultCfg.exportConflictPolicy, 'ask');
  assert.equal(defaultCfg.autoBackupOnBuild, true);

  assert.equal(sanitizeFolderSegment('../Skyreach Relics!!'), 'Skyreach_Relics');
  assert.equal(sanitizeFolderSegment('   '), 'default_item');

  // Assets for two different mods stay isolated under Assets/<safeModId>/
  const modA = parseScopedBlobKey('com.author.mod_a/sword_albedo.png');
  const modB = parseScopedBlobKey('com.author.mod_b/sword_albedo.png');
  assert.equal(modA.projectSegment, 'com.author.mod_a');
  assert.equal(modB.projectSegment, 'com.author.mod_b');
  assert.notEqual(modA.projectSegment, modB.projectSegment);
  assert.equal(modA.assetSegment, 'sword_albedo.png');

  const legacyBlob = parseScopedBlobKey('legacy_texture.png');
  assert.equal(legacyBlob.projectSegment, null);
  assert.equal(legacyBlob.assetSegment, 'legacy_texture.png');

  const backupFolder = formatBackupTimestampFolder('2026-11-26T14:05:00');
  assert.match(backupFolder, /^backup-\d{4}-\d{2}-\d{2}-\d{4}$/);
  assert.equal(backupFolder, 'backup-2026-11-26-1405');
});

test('generateUniqueFilename and generateUniqueExportFilename avoid collisions cleanly', async () => {
  const existing = new Set(['Skyreach-Relics.woamod', 'Skyreach-Relics (2).woamod']);
  const nextExportName = await generateUniqueExportFilename('Skyreach-Relics.woamod', (name) =>
    existing.has(name)
  );
  assert.equal(nextExportName, 'Skyreach-Relics (3).woamod');

  const freshName = await generateUniqueFilename('NewMod.woamod', (name) => existing.has(name));
  assert.equal(freshName, 'NewMod.woamod');
});

test('Android WoaStoragePlugin native SAF dedicated folder methods, atomic temp staging, and revocation tracking exist without extra permissions', () => {
  const rootDir = process.cwd();
  const pluginJava = fs.readFileSync(
    path.join(rootDir, 'android/app/src/main/java/com/woa/modcreator/WoaStoragePlugin.java'),
    'utf8'
  );

  assert.match(pluginJava, /World of Adventure Mod Creator/);
  assert.match(pluginJava, /"Projects",\s*"Exports",\s*"Backups",\s*"Assets",\s*"Settings"/);
  assert.match(pluginJava, /PREF_SAF_REVOKED/);
  assert.match(pluginJava, /TEMP_SUFFIX\s*=\s*"\.woatmp"/);
  for (const methodName of [
    'checkDirectoryAccess',
    'ensureAppFolderStructure',
    'readTreeFile',
    'treeEntryExists',
    'deleteTreeEntry',
    'renameTreeEntry',
    'listTreeEntries',
    'openTreeSubfolder',
    'writeFileToTree',
  ]) {
    assert.match(pluginJava, new RegExp(`public\\s+void\\s+${methodName}\\s*\\(`));
  }
});

test('validator separates game version (1.1.25) from Mod Creator app version (1.0.0) and rejects 2.x maxGameVersion', async () => {
  const mod1125 = createModProject({
    modId: 'com.test.woa_1125',
    name: 'Frontier 1.1.25 Mod',
    version: '0.2.0',
    author: 'Tester',
    description: 'Validates game version 1.1.25 and schema v2 alignment.',
    supportedGameVersion: '1.1.25',
    categories: ['Items'],
    templateId: 'blank',
  });

  assert.equal(mod1125.manifest.supportedGameVersion, '1.1.25');
  assert.equal(mod1125.manifest.minGameVersion, '1.1.24');
  assert.equal(mod1125.manifest.maxGameVersion, undefined);

  const report = await validateModProject(mod1125, [mod1125], 'universal');
  assert.equal(report.errorCount, 0, JSON.stringify(report.issues));
  assert.equal(report.currentGameVersion, '1.1.25');
  assert.equal(report.minSupportedGameVersion, '1.1.24');
  assert.equal(report.targetGameVersion, '1.1.25');
  assert.equal(report.modCreatorVersion, '1.0.0');
  assert.equal(report.contentSchemaVersion, 2);
  assert.equal(CURRENT_MOD_CONTENT_SCHEMA_VERSION, 2);
  assert.deepEqual([...SUPPORTED_MOD_CONTENT_SCHEMA_VERSIONS], [1, 2]);

  // Below-minimum version error reports current game version 1.1.25 (never Mod Creator 1.0.0)
  const lowVerMod = createModProject({
    modId: 'com.test.woa_low',
    name: 'Legacy Low Mod',
    version: '0.1.0',
    author: 'Tester',
    description: 'Verifies below-minimum version error text does not confuse 1.0.0.',
    supportedGameVersion: '1.0.0',
    categories: ['Items'],
    templateId: 'blank',
  });
  const lowReport = await validateModProject(lowVerMod, [lowVerMod], 'universal');
  const verIssue = lowReport.issues.find((i) => i.code === 'UNSUPPORTED_GAME_VERSION');
  assert.ok(verIssue, 'Expected UNSUPPORTED_GAME_VERSION for 1.0.0');
  assert.match(verIssue.problem, /1\.1\.25/);
  assert.doesNotMatch(verIssue.problem, /current.*1\.0\.0/i);

  // maxGameVersion validation: wildcard "2.x" rejected, omitted or valid SemVer >= target accepted
  assert.equal(validateMaxGameVersion(undefined, '1.1.25').valid, true);
  assert.equal(validateMaxGameVersion('1.1.25', '1.1.25').valid, true);
  assert.equal(validateMaxGameVersion('2.0.0', '1.1.25').valid, true);
  assert.equal(validateMaxGameVersion('2.x', '1.1.25').valid, false);
  assert.equal(validateMaxGameVersion('1.1.24', '1.1.25').valid, false);

  const badMaxMod = createModProject({
    modId: 'com.test.bad_max',
    name: 'Bad Max Cap Mod',
    version: '0.1.0',
    author: 'Tester',
    description: 'Verifies invalid maxGameVersion wildcard is caught by validator.',
    supportedGameVersion: '1.1.25',
    categories: ['Items'],
    templateId: 'blank',
  });
  badMaxMod.manifest.maxGameVersion = '2.x';
  const badMaxReport = await validateModProject(badMaxMod, [badMaxMod], 'universal');
  assert.ok(badMaxReport.issues.some((i) => i.code === 'INVALID_MAX_GAME_VERSION'));
});

test('schemaVersion v1 (backward-compatible) and v2 pass validation while preserving original game version', async () => {
  const v1Zip = new JSZip();
  v1Zip.file(
    'mod.json',
    JSON.stringify({
      $schema: 'woa.mod.v1',
      schemaVersion: 1,
      packageFormatVersion: 1,
      modId: 'com.test.legacy_v1',
      name: 'Legacy V1 Mod',
      version: '1.0.0',
      author: 'LegacyAuthor',
      description: 'Backward compatible schema v1 mod targeting 1.1.24.',
      supportedGameVersion: '1.1.24',
      minGameVersion: '1.1.24',
      categories: ['Items'],
    })
  );
  v1Zip.file(
    'data/registry.json',
    JSON.stringify({
      schemaVersion: 1,
      modId: 'com.test.legacy_v1',
      categories: ['Items'],
      entries: [],
    })
  );

  const v1File = new File([await v1Zip.generateAsync({ type: 'blob' })], 'legacy-v1.woamod');
  const importedV1 = await importModFromFile(v1File);
  // Original project supportedGameVersion is NOT silently overwritten
  assert.equal(importedV1.manifest.supportedGameVersion, '1.1.24');
  assert.equal(importedV1.manifest.maxGameVersion, undefined);
  assert.equal(importedV1.manifest.packageFormatVersion, 1);

  const v1Validation = await validateModProject(importedV1, [importedV1], 'universal');
  assert.equal(v1Validation.errorCount, 0, JSON.stringify(v1Validation.issues));
  assert.equal(v1Validation.contentSchemaVersion, 1);

  // Unsupported schemaVersion 99 is rejected on import
  const badSchemaZip = new JSZip();
  badSchemaZip.file(
    'mod.json',
    JSON.stringify({
      schemaVersion: 99,
      modId: 'com.test.bad_schema',
      name: 'Unsupported Schema',
      version: '1.0.0',
      supportedGameVersion: '1.1.25',
    })
  );
  const badSchemaFile = new File([await badSchemaZip.generateAsync({ type: 'blob' })], 'bad-schema.woamod');
  await assert.rejects(() => importModFromFile(badSchemaFile), /Unsupported mod schemaVersion/i);
});

test('Entities mod with assets/models/clockwork_sentinel.woa3d (v1 & v2) validates, exports, and re-imports cleanly for 1.1.25', async () => {
  const sentinelProject = createModProject({
    modId: 'com.test.clockwork_mod',
    name: 'Clockwork Guardians',
    version: '0.1.0',
    author: 'Tester',
    description: 'Includes clockwork_sentinel.woa3d entity model for World of Adventure 1.1.25.',
    supportedGameVersion: '1.1.25',
    categories: ['Entities'],
    templateId: 'blank',
  });

  const sentinelAsset = sentinelProject.assets.find(
    (a) => a.path === 'assets/models/clockwork_sentinel.woa3d'
  );
  assert.ok(sentinelAsset, 'Expected clockwork_sentinel.woa3d asset to be scaffolded');

  // Upgrade the .woa3d payload to schema v2 and verify validator + export preserve it without error
  const sentinelNode = sentinelProject.files.find(
    (f) => f.path === 'assets/models/clockwork_sentinel.woa3d'
  );
  assert.ok(sentinelNode?.content);
  const parsedV1 = parseAndValidateWoa3dContent(sentinelNode.content);
  sentinelNode.content = serializeWoa3dAsset({
    $schema: 'woa.asset3d.v2',
    schemaVersion: 2,
    format: 'WOA3D',
    preset: parsedV1.preset,
    modCategory: parsedV1.modCategory,
    pivotMode: parsedV1.pivotMode,
    collision: parsedV1.collision,
    transform: parsedV1.transform,
    material: parsedV1.material,
  });

  const validation = await validateModProject(sentinelProject, [sentinelProject], 'universal');
  assert.equal(validation.errorCount, 0, JSON.stringify(validation.issues));

  const exported = await exportModArchiveBlob(sentinelProject, 'universal', { confirmWarnings: true });
  const exportedZip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
  const sentinelEntry = exportedZip.file('assets/models/clockwork_sentinel.woa3d');
  assert.ok(sentinelEntry, 'Expected exported .woamod to preserve assets/models/clockwork_sentinel.woa3d');
  const exportedWoa3d = parseAndValidateWoa3dContent(await sentinelEntry.async('string'));
  assert.equal(exportedWoa3d.$schema, 'woa.asset3d.v2');
  assert.equal(exportedWoa3d.schemaVersion, 2);

  // Re-import and re-export without scripts/main.ts — registry modelAsset keeps clockwork_sentinel.woa3d intact
  const reimported = await importModFromFile(
    new File([exported.blob], exported.filename, { type: 'application/octet-stream' })
  );
  assert.equal(reimported.manifest.supportedGameVersion, '1.1.25');
  assert.equal(reimported.manifest.maxGameVersion, undefined);
  assert.ok(
    reimported.assets.some((a) => a.path === 'assets/models/clockwork_sentinel.woa3d'),
    'Expected re-imported project to retain clockwork_sentinel.woa3d'
  );
  const reValidation = await validateModProject(reimported, [reimported], 'universal');
  assert.equal(reValidation.errorCount, 0, JSON.stringify(reValidation.issues));

  const reExported = await exportModArchiveBlob(reimported, 'universal', { confirmWarnings: true });
  const reExportZip = await JSZip.loadAsync(await reExported.blob.arrayBuffer());
  assert.ok(
    reExportZip.file('assets/models/clockwork_sentinel.woa3d'),
    'Expected re-exported .woamod to retain clockwork_sentinel.woa3d'
  );
});

test('WOA3D category derivation, legacy aliases, invalid category rejection, and content-vs-model cross-validation', async () => {
  // Preset & category derivation never silently coerces clockwork-sentinel or Entities to Item
  assert.equal(deriveAssetModCategoryFromContext({ preset: 'clockwork-sentinel' }), 'Monster');
  assert.equal(deriveAssetModCategoryFromContext({ preset: 'relic-sword' }), 'Weapon');
  assert.equal(deriveAssetModCategoryFromContext({ preset: 'frontier-crate' }), 'Building');
  assert.equal(deriveAssetModCategoryFromContext({ preset: 'crystal-obelisk' }), 'Decoration');
  assert.equal(deriveAssetModCategoryFromContext({ modCategories: ['Biomes'] }), 'Decoration');

  // Legacy category alias mapping for backward compatibility
  assert.equal(normalizeAssetModCategory('monster'), 'Monster');
  assert.equal(normalizeAssetModCategory('creature'), 'Monster');
  assert.equal(normalizeAssetModCategory('entity'), 'Monster');
  assert.equal(normalizeAssetModCategory('prop'), 'Decoration');
  assert.equal(normalizeAssetModCategory('npc'), 'NPC');
  assert.equal(normalizeAssetModCategory('bogus_category'), null);

  // Unknown modCategory inside .woa3d throws wrong_category error
  assert.throws(
    () =>
      parseAndValidateWoa3dContent(
        JSON.stringify({
          format: 'WOA3D',
          preset: 'clockwork-sentinel',
          modCategory: 'bogus_category',
        })
      ),
    /wrong_category/i
  );

  // Omitted modCategory derives accurately from preset/contentType
  const inferredFromPreset = parseAndValidateWoa3dContent(
    JSON.stringify({ format: 'WOA3D', preset: 'clockwork-sentinel' })
  );
  assert.equal(inferredFromPreset.modCategory, 'Monster');

  const inferredFromAlias = parseAndValidateWoa3dContent(
    JSON.stringify({ format: 'WOA3D', preset: 'beacon-pedestal', modCategory: 'creature' })
  );
  assert.equal(inferredFromAlias.modCategory, 'Monster');

  // Entities mod with clockwork_sentinel.woa3d defaults to Monster + schemaVersion 2
  const entityMod = createModProject({
    modId: 'com.test.sentinel_match',
    name: 'Sentinel Match Mod',
    version: '1.0.0',
    author: 'Tester',
    description: 'Verifies Monster content + Monster clockwork_sentinel.woa3d passes validation.',
    supportedGameVersion: '1.1.25',
    categories: ['Entities'],
    templateId: 'biome-creature',
  });
  const sentinelModel = entityMod.assets.find((a) => a.preset === 'clockwork-sentinel');
  assert.ok(sentinelModel);
  assert.equal(sentinelModel.modCategory, 'Monster');
  const sentinelNode = entityMod.files.find((f) => f.path === sentinelModel.path);
  assert.ok(sentinelNode?.content);
  const parsedSentinel = parseAndValidateWoa3dContent(sentinelNode.content);
  assert.equal(parsedSentinel.modCategory, 'Monster');
  assert.equal(parsedSentinel.schemaVersion, 2);

  // Matching Monster -> Monster .woa3d passes cleanly
  const matchingReport = await validateModProject(entityMod, [entityMod], 'universal');
  assert.equal(matchingReport.errorCount, 0, JSON.stringify(matchingReport.issues));
  assert.equal(APP_VERSION, '1.0.0');

  // Mismatched Monster referencing an Item/Weapon .woa3d fails with INVALID_ASSET_CATEGORY
  const mismatchedMod = createModProject({
    modId: 'com.test.sentinel_mismatch',
    name: 'Sentinel Mismatch Mod',
    version: '1.0.0',
    author: 'Tester',
    description: 'Verifies Monster referencing Weapon model fails validation.',
    supportedGameVersion: '1.1.25',
    categories: ['Entities'],
    templateId: 'biome-creature',
  });
  const targetModel = mismatchedMod.assets.find((a) => a.preset === 'clockwork-sentinel')!;
  targetModel.modCategory = 'Weapon';
  const targetNode = mismatchedMod.files.find((f) => f.path === targetModel.path)!;
  targetNode.content = serializeWoa3dAsset({ ...targetModel, schemaVersion: 2 });

  const mismatchReport = await validateModProject(mismatchedMod, [mismatchedMod], 'universal');
  assert.ok(
    mismatchReport.issues.some(
      (i) => i.severity === 'error' && i.code === 'INVALID_ASSET_CATEGORY'
    ),
    `Expected INVALID_ASSET_CATEGORY for Monster->Weapon model mismatch, got ${JSON.stringify(mismatchReport.issues)}`
  );

  // All built-in mod templates scaffold and validate cleanly with 0 errors for 1.1.25
  for (const templateId of [
    'blank',
    'weapon-pack',
    'quest-npc',
    'building-dungeon',
    'biome-creature',
    'character-mod',
    'npc-mod',
    'quest-mod',
    'item-mod',
    'audio-mod',
    'complete-mod',
  ] as const) {
    const tplProject = createModProject({
      modId: `com.test.tpl_${templateId.replace(/-/g, '_')}`,
      name: `Template ${templateId}`,
      version: '0.1.0',
      author: 'Tester',
      description: `Validates ${templateId} template for 1.1.25.`,
      supportedGameVersion: '1.1.25',
      categories: templateId === 'weapon-pack' ? ['Weapons', 'Items'] : ['Items'],
      templateId,
    });
    const tplReport = await validateModProject(tplProject, [tplProject], 'universal');
    assert.equal(
      tplReport.errorCount,
      0,
      `Template ${templateId} failed validation: ${JSON.stringify(tplReport.issues)}`
    );
  }
});

test('World Spawning supports exact decimal/negative coordinates, modes, behaviors, and .woamod round-trip', async () => {
  const project = createModProject({
    modId: 'com.test.worldspawn',
    name: 'World Spawn Test Mod',
    version: '1.2.0',
    author: 'Tester',
    description: 'Verifies exact world spawn coordinates across weapons, NPCs, monsters, items, and buildings.',
    supportedGameVersion: '1.1.25',
    categories: ['Weapons', 'Entities', 'Blocks'],
    templateId: 'complete-mod',
  });

  const findModel = (cat: string) =>
    project.assets.find((a) => a.type === '3d-model' && a.modCategory === cat) ??
    project.assets.find((a) => a.type === '3d-model');
  const weaponModel = findModel('Weapon');
  const npcModel = findModel('NPC');
  const monsterModel = findModel('Monster');
  const buildingModel = findModel('Building');
  assert.ok(weaponModel);
  assert.ok(npcModel);
  assert.ok(monsterModel);
  assert.ok(buildingModel);
  const iconRef = 'woa:icons/relic_gem';

  const db = resolveProjectContents(project);

  // 1. Weapon with exact negative & decimal coordinates, rotation, scale + pickup behavior
  const relicWeapon = createDefaultWeapon(
    project.manifest.modId,
    new Set(db.weapons.map((w) => w.id)),
    weaponModel.path,
    iconRef,
    'woa:sfx/weapon_swing'
  );
  relicWeapon.name = 'Stormblade Relic';
  relicWeapon.spawnConfig = {
    enabled: true,
    mode: 'absolute',
    behavior: {
      pickupAvailable: true,
      respawnEnabled: false,
      respawnDelaySeconds: 120,
      visualFloat: true,
      visualRotate: true,
    },
    locations: [
      createDefaultSpawnLocation(0, {
        spawnId: 'stormblade_pedestal_01',
        label: 'Sunken Pedestal',
        enabled: true,
        quantity: 1,
        position: { x: -142.375, y: 19.625, z: -88.125 },
        rotation: { x: 12.5, y: -135.75, z: 3.25 },
        scale: { x: 1.35, y: 1.35, z: 1.35 },
      }),
    ],
  };

  // 2. Inventory-only item without spawnConfig remains completely valid
  const pouchItem = createDefaultItem(
    project.manifest.modId,
    new Set(db.items.map((i) => i.id)),
    iconRef
  );
  pouchItem.name = 'Traveler Ration';

  // 3. Item with world pickup + respawn
  const worldGem = createDefaultItem(
    project.manifest.modId,
    new Set([...db.items.map((i) => i.id), pouchItem.id]),
    iconRef
  );
  worldGem.name = 'Sunstone Shard';
  worldGem.spawnConfig = createDefaultSpawnConfig(
    'item',
    { x: 14.25, y: 3.5, z: -9.75 },
    { x: 0, y: 45, z: 0 },
    { x: 1, y: 1, z: 1 }
  );
  worldGem.spawnConfig.locations[0].spawnId = 'sunstone_pickup_01';
  worldGem.spawnConfig.locations[0].quantity = 3;
  worldGem.spawnConfig.behavior = {
    pickupAvailable: true,
    respawnEnabled: true,
    respawnDelaySeconds: 90,
    visualFloat: false,
    visualRotate: true,
  };

  // 4. NPC with exact spawn position, facing rotation, stationary + uniquePersistent
  const npc = createDefaultNpc(
    project.manifest.modId,
    new Set(db.npcs.map((n) => n.id)),
    npcModel.path
  );
  npc.name = 'Elder Veyra';
  npc.spawnConfig = createDefaultSpawnConfig(
    'npc',
    { x: -24.5, y: 64.0, z: 108.25 },
    { x: 0, y: -90, z: 0 }
  );
  npc.spawnConfig.mode = 'relative_world_spawn';
  npc.spawnConfig.locations[0].spawnId = 'elder_veyra_watchpost';
  npc.spawnConfig.behavior = {
    npcBehavior: 'stationary',
    uniquePersistent: true,
    dialogueAvailable: true,
  };

  // 5. Monster with multiple locations & random_area bounds
  const monster = createDefaultMonster(
    project.manifest.modId,
    new Set(db.monsters.map((m) => m.id)),
    monsterModel.path
  );
  monster.name = 'Ash Stalker';
  monster.spawnConfig = {
    enabled: true,
    mode: 'random_area',
    behavior: {
      maxActiveInstances: 6,
      respawnEnabled: true,
      respawnDelaySeconds: 240,
      groupBehavior: 'pack',
    },
    locations: [
      createDefaultSpawnLocation(0, {
        spawnId: 'ash_stalker_pack_north',
        label: 'North Caldera Pack',
        position: { x: 200, y: 12, z: -150 },
        area: {
          minX: 170,
          maxX: 230,
          minY: 10,
          maxY: 22,
          minZ: -180,
          maxZ: -120,
          minDistance: 8,
          maxInstances: 4,
          deterministicSeedOffset: 42,
        },
      }),
      createDefaultSpawnLocation(1, {
        spawnId: 'ash_stalker_pack_south',
        label: 'South Caldera Pack',
        position: { x: 240, y: 14, z: 95 },
        area: {
          minX: 220,
          maxX: 260,
          minY: 10,
          maxY: 24,
          minZ: 75,
          maxZ: 115,
          minDistance: 6,
          maxInstances: 2,
          deterministicSeedOffset: 7,
        },
      }),
    ],
  };

  // 6. Building placement coordinates & terrain alignment
  const watchtower = createDefaultBuilding(
    project.manifest.modId,
    new Set(db.buildings.map((b) => b.id)),
    buildingModel.path
  );
  watchtower.name = 'Frontier Watchtower';
  watchtower.spawnConfig = createDefaultSpawnConfig(
    'building',
    { x: -300.5, y: 18.25, z: 420.75 },
    { x: 0, y: 180, z: 0 }
  );
  watchtower.spawnConfig.locations[0].spawnId = 'frontier_watchtower_site';
  watchtower.spawnConfig.behavior = {
    terrainAlignment: 'flatten',
    validateCollisionOverlap: true,
    footprintRadius: 5.5,
  };

  const nextDb = {
    ...db,
    items: [...db.items, pouchItem, worldGem],
    weapons: [...db.weapons, relicWeapon],
    npcs: [...db.npcs, npc],
    monsters: [...db.monsters, monster],
    buildings: [...db.buildings, watchtower],
  };
  const updatedProject = syncContentFilesInProject(project, nextDb);

  // Project validation should have zero errors
  const report = await validateModProject(updatedProject, [updatedProject], 'universal');
  assert.equal(report.errorCount, 0, JSON.stringify(report.issues));

  // Export .woamod archive and re-import to verify round-trip precision
  const { blob } = await exportModArchiveBlob(updatedProject, 'universal', {
    confirmWarnings: true,
  });
  const file = new File([await blob.arrayBuffer()], 'world_spawn_test.woamod', {
    type: 'application/zip',
  });
  const imported = await importModFromFile(file);
  const importedDb = resolveProjectContents(imported);

  const importedWeapon = importedDb.weapons.find((w) => w.id === relicWeapon.id);
  assert.ok(importedWeapon?.spawnConfig);
  assert.equal(importedWeapon.spawnConfig.enabled, true);
  assert.equal(importedWeapon.spawnConfig.mode, 'absolute');
  assert.equal(importedWeapon.spawnConfig.locations[0].position.x, -142.375);
  assert.equal(importedWeapon.spawnConfig.locations[0].position.y, 19.625);
  assert.equal(importedWeapon.spawnConfig.locations[0].position.z, -88.125);
  assert.equal(importedWeapon.spawnConfig.locations[0].rotation.y, -135.75);
  assert.deepEqual(importedWeapon.spawnConfig.locations[0].scale, { x: 1.35, y: 1.35, z: 1.35 });
  assert.equal(importedWeapon.spawnConfig.behavior?.visualFloat, true);

  const importedInventoryOnly = importedDb.items.find((i) => i.id === pouchItem.id);
  assert.equal(importedInventoryOnly?.spawnConfig, undefined);

  const importedNpc = importedDb.npcs.find((n) => n.id === npc.id);
  assert.equal(importedNpc?.spawnConfig?.mode, 'relative_world_spawn');
  assert.equal(importedNpc?.spawnConfig?.behavior?.npcBehavior, 'stationary');
  assert.equal(importedNpc?.spawnConfig?.behavior?.uniquePersistent, true);

  const importedMonster = importedDb.monsters.find((m) => m.id === monster.id);
  assert.equal(importedMonster?.spawnConfig?.locations.length, 2);
  assert.equal(importedMonster?.spawnConfig?.locations[0].area?.deterministicSeedOffset, 42);

  const importedTower = importedDb.buildings.find((b) => b.id === watchtower.id);
  assert.equal(importedTower?.spawnConfig?.behavior?.terrainAlignment, 'flatten');
  assert.equal(importedTower?.spawnConfig?.locations[0].position.z, 420.75);

  // Clone preserves spawn config independently with updated spawnIds
  const cloned = cloneSpawnConfig(relicWeapon.spawnConfig);
  assert.ok(cloned);
  assert.notEqual(cloned.locations[0].spawnId, relicWeapon.spawnConfig.locations[0].spawnId);
  assert.equal(cloned.locations[0].position.x, -142.375);
});

test('World Spawning validation catches invalid coordinates, duplicate IDs, bad area bounds, and structure overlaps', async () => {
  const badCfg = createDefaultSpawnConfig('monster', { x: Number.NaN, y: 0, z: 0 });
  badCfg.mode = 'relative_reference';
  badCfg.referenceObjectId = '';
  badCfg.locations[0].scale = { x: 0, y: 1, z: 1 };
  badCfg.locations[0].conditions.minPlayerDistance = 50;
  badCfg.locations[0].conditions.maxPlayerDistance = 10;
  badCfg.locations.push(
    createDefaultSpawnLocation(1, {
      spawnId: badCfg.locations[0].spawnId,
      area: {
        minX: 20,
        maxX: 5,
        minY: 0,
        maxY: 4,
        minZ: 0,
        maxZ: 4,
        minDistance: -1,
        maxInstances: 0,
      },
    })
  );
  const issues = validateContentSpawnConfig(badCfg, 'monster', 'com.test.overlap');
  assert.ok(issues.some((i) => i.field === 'spawnConfig.referenceObjectId'));
  assert.ok(issues.some((i) => i.field === 'spawnConfig.locations.0.position'));
  assert.ok(issues.some((i) => i.field === 'spawnConfig.locations.0.scale'));
  assert.ok(issues.some((i) => i.field === 'spawnConfig.locations.0.conditions.minPlayerDistance'));
  assert.ok(issues.some((i) => i.field === 'spawnConfig.locations.1.spawnId'));

  badCfg.mode = 'random_area';
  const areaIssues = validateContentSpawnConfig(badCfg, 'monster', 'com.test.overlap');
  assert.ok(areaIssues.some((i) => i.field === 'spawnConfig.locations.1.area'));

  const unsupported = createDefaultSpawnConfig('item');
  (unsupported as unknown as { mode: string }).mode = 'telepathic_matrix';
  const modeIssues = validateContentSpawnConfig(unsupported, 'item', 'com.test.overlap');
  assert.ok(modeIssues.some((i) => i.field === 'spawnConfig.mode'));

  // Cross-entry duplicate spawnId + structure overlap warning
  const project = createModProject({
    modId: 'com.test.overlap',
    name: 'Overlap Validation Mod',
    version: '1.0.0',
    author: 'Tester',
    description: 'Verifies cross-entry duplicate spawnId and structure overlap detection.',
    supportedGameVersion: '1.1.25',
    categories: ['Blocks'],
    templateId: 'building-dungeon',
  });
  const modelAsset = project.assets.find((a) => a.type === '3d-model')!;
  const db = resolveProjectContents(project);
  const b1 = createDefaultBuilding(
    project.manifest.modId,
    new Set(db.buildings.map((b) => b.id)),
    modelAsset.path
  );
  b1.name = 'Keep One';
  b1.spawnConfig = createDefaultSpawnConfig('building', { x: 100, y: 0, z: 100 });
  b1.spawnConfig.locations[0].spawnId = 'shared_structure_spawn';
  b1.spawnConfig.behavior = { terrainAlignment: 'conform_terrain', validateCollisionOverlap: true, footprintRadius: 6 };

  const b2 = createDefaultBuilding(
    project.manifest.modId,
    new Set([...db.buildings.map((b) => b.id), b1.id]),
    modelAsset.path
  );
  b2.name = 'Keep Two';
  b2.spawnConfig = createDefaultSpawnConfig('building', { x: 103, y: 0, z: 102 });
  b2.spawnConfig.locations[0].spawnId = 'shared_structure_spawn';
  b2.spawnConfig.behavior = { terrainAlignment: 'conform_terrain', validateCollisionOverlap: true, footprintRadius: 6 };

  const nextDb = { ...db, buildings: [...db.buildings, b1, b2] };
  const synced = syncContentFilesInProject(project, nextDb);
  const report = await validateModProject(synced, [synced], 'universal');

  assert.ok(
    report.issues.some((i) => i.code === 'DUPLICATE_OBJECT_ID' && i.problem.includes('shared_structure_spawn')),
    `Expected duplicate spawnId error, got ${JSON.stringify(report.issues)}`
  );
  assert.ok(
    report.issues.some((i) => i.severity === 'warning' && i.targetType === 'content' && i.problem.includes('overlap')),
    `Expected structure overlap warning, got ${JSON.stringify(report.issues)}`
  );
});

test('Backward compatibility: v1 and v2 .woamod archives without spawnConfig import cleanly', async () => {
  for (const schemaVer of [1, 2] as const) {
    const zip = new JSZip();
    const manifest = {
      $schema: `woa.mod.v${schemaVer}`,
      schemaVersion: schemaVer,
      packageFormatVersion: schemaVer,
      modId: `com.test.legacy_v${schemaVer}`,
      name: `Legacy v${schemaVer} Mod`,
      version: '1.0.0',
      author: 'Tester',
      description: 'Legacy package without spawnConfig.',
      supportedGameVersion: '1.1.24',
      minGameVersion: '1.1.24',
      categories: ['Items'],
      dependencies: [],
    };
    zip.file('mod.json', JSON.stringify(manifest, null, 2));
    zip.file(
      'data/registry.json',
      JSON.stringify({
        schemaVersion: schemaVer,
        modId: manifest.modId,
        categories: ['Items'],
        entries: [
          {
            id: `${manifest.modId}:legacy_potion`,
            kind: 'item',
            name: 'Legacy Potion',
          },
        ],
      })
    );
    zip.file(
      'data/items.json',
      JSON.stringify(
        {
          schemaVersion: schemaVer,
          modId: manifest.modId,
          entries: [
            {
              id: `${manifest.modId}:legacy_potion`,
              name: 'Legacy Potion',
              description: 'No spawnConfig defined.',
              category: 'consumable',
              rarity: 'common',
              stackSize: 10,
              weight: 0.2,
              value: 15,
              icon: 'woa:icons/legacy_potion',
            },
          ],
        },
        null,
        2
      )
    );

    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([await blob.arrayBuffer()], `legacy_v${schemaVer}.woamod`, {
      type: 'application/zip',
    });
    const imported = await importModFromFile(file);
    const db = resolveProjectContents(imported);
    assert.equal(db.items.length, 1);
    assert.equal(db.items[0].spawnConfig, undefined);
    const report = await validateModProject(imported, [imported], 'universal');
    assert.equal(report.errorCount, 0, JSON.stringify(report.issues));
  }
});

// ============================================================================
// EVENTS, TRIGGERS, CONDITIONS & REWARDS TESTS
// ============================================================================

test('Event catalogs expose all 40 triggers, 15 conditions, and 20 actions with EN/AR 1:1 parity', () => {
  assert.equal(EVENT_TRIGGER_CATALOG.length, 40);
  assert.equal(EVENT_CONDITION_CATALOG.length, 15);
  assert.equal(EVENT_ACTION_CATALOG.length, 20);

  const enKeys = Object.keys(en).sort();
  const arKeys = Object.keys(ar).sort();
  assert.deepEqual(enKeys, arKeys, 'English and Arabic translation dictionaries must have 1:1 key parity');

  for (const td of EVENT_TRIGGER_CATALOG) {
    assert.ok(`events.trigger.${td.type}` in en, `Missing EN key for trigger ${td.type}`);
    assert.ok(`events.trigger.${td.type}` in ar, `Missing AR key for trigger ${td.type}`);
  }
  for (const cd of EVENT_CONDITION_CATALOG) {
    assert.ok(`events.cond.${cd.field}` in en, `Missing EN key for condition ${cd.field}`);
  }
  for (const ad of EVENT_ACTION_CATALOG) {
    assert.ok(`events.action.${ad.type}` in en, `Missing EN key for action ${ad.type}`);
  }
});

test('Events sandbox simulation: starter sword, NPC dialogue/choice, monster & animal kills, destruction & gathering', () => {
  const modId = 'com.test.events_sim';
  const db = resolveProjectContents(
    createModProject({
      modId,
      name: 'Events Sim Mod',
      version: '1.0.0',
      author: 'Tester',
      description: 'Tests sandbox event engine.',
      supportedGameVersion: '1.1.25',
      categories: ['Weapons', 'Items', 'Quests'],
      templateId: 'weapon-pack',
    })
  );

  const weaponId = db.weapons[0]?.id ?? `${modId}:starter_blade`;
  const itemId = db.items[0]?.id ?? `${modId}:med_herb`;

  // 1. Starter Sword (auto-equip on new world)
  const starterEv = createEventFromTemplate('starter_sword', modId, new Set(), db);
  starterEv.actions[0] = {
    ...starterEv.actions[0],
    targetId: weaponId,
    equipAutomatically: true,
  };

  // 2. NPC talk + NPC dialogue choice reward
  const npcTalkEv = createDefaultModEvent(modId, new Set([starterEv.id]), db);
  npcTalkEv.id = `${modId}:npc_greet`;
  npcTalkEv.trigger = { type: 'on_npc_talk', targetMode: 'specific_id', targetId: `${modId}:elder_kael` };
  npcTalkEv.actions = [{ id: 'a_xp', type: 'give_xp', amount: 100 }];

  const choiceEv = createEventFromTemplate('npc_reward', modId, new Set([starterEv.id, npcTalkEv.id]), db);
  choiceEv.id = `${modId}:dialogue_choice_gift`;
  choiceEv.trigger = {
    type: 'on_dialogue_choice_selected',
    targetMode: 'specific_id',
    targetId: `${modId}:elder_dialogue`,
    secondaryTargetId: 'choice_accept_oath',
  };
  choiceEv.conditionGroups = [
    {
      id: 'g1',
      logic: 'and',
      rules: [
        { id: 'r1', field: 'player_level', operator: '>=', value: 2 },
      ],
    },
  ];
  choiceEv.actions = [{ id: 'a_gift', type: 'give_item', targetId: itemId, quantity: 3 }];

  // 3. Monster kill + weapon kill + Animal kill
  const monsterEv = createEventFromTemplate('monster_loot', modId, new Set(), db);
  monsterEv.id = `${modId}:slay_shadow`;
  monsterEv.trigger = { type: 'on_monster_killed', targetMode: 'specific_id', targetId: `${modId}:shadow_beast` };
  monsterEv.actions = [{ id: 'a_gold', type: 'give_currency', amount: 75 }];

  const animalEv = createEventFromTemplate('animal_loot', modId, new Set(), db);
  animalEv.id = `${modId}:hunt_animal`;
  animalEv.actions = [{ id: 'a_hide', type: 'give_item', targetId: 'woa:items/raw_hide', quantity: 2 }];

  // 4. Block broken & Object destroyed & Container destroyed
  const blockEv = createDefaultModEvent(modId, new Set(), db);
  blockEv.id = `${modId}:mine_crate`;
  blockEv.trigger = { type: 'on_block_broken', targetMode: 'specific_id', targetId: 'woa:blocks/stone_crate' };
  blockEv.actions = [{ id: 'a_shard', type: 'give_item', targetId: 'woa:items/relic_shard', quantity: 1 }];

  const objEv = createEventFromTemplate('destruction_reward', modId, new Set(), db);
  objEv.id = `${modId}:smash_barrel`;
  objEv.trigger = { type: 'on_object_destroyed', targetMode: 'specific_id', targetId: 'woa:objects/wooden_barrel' };
  objEv.actions = [{ id: 'a_drop', type: 'drop_reward_in_world', targetId: itemId, quantity: 2, position: { x: 4, y: 1, z: -2 } }];

  const events = [starterEv, npcTalkEv, choiceEv, monsterEv, animalEv, blockEv, objEv];
  let sim = createDefaultEventSimState({ playerLevel: 1 });

  // Fire on_new_world_created -> equips weapon & sends notification
  let res = dispatchSandboxEvent(events, sim, { type: 'on_new_world_created' }, db);
  sim = res.nextState;
  assert.equal(sim.inventory[weaponId], 1);
  assert.equal(sim.equippedWeaponId, weaponId);
  assert.equal(sim.notifications.length, 1);

  // Fire on_new_world_created again in SAME world -> blocked_limit (once_per_player_per_world)
  res = dispatchSandboxEvent(events, sim, { type: 'on_new_world_created' }, db);
  assert.equal(res.outcomes.find((o) => o.eventId === starterEv.id)?.status, 'blocked_limit');

  // Switch to a DIFFERENT worldId -> fires again!
  sim = { ...res.nextState, worldId: 'world_beta' };
  res = dispatchSandboxEvent(events, sim, { type: 'on_new_world_created' }, db);
  sim = res.nextState;
  assert.equal(sim.inventory[weaponId], 2);

  // NPC talk
  res = dispatchSandboxEvent(events, sim, { type: 'on_npc_talk', targetId: `${modId}:elder_kael` }, db);
  sim = res.nextState;
  assert.equal(sim.xp, 100);

  // Dialogue choice when playerLevel is 1 -> blocked_condition
  res = dispatchSandboxEvent(events, sim, {
    type: 'on_dialogue_choice_selected',
    targetId: `${modId}:elder_dialogue`,
    secondaryTargetId: 'choice_accept_oath',
  }, db);
  sim = res.nextState;
  assert.equal(res.outcomes.find((o) => o.eventId === choiceEv.id)?.status, 'blocked_condition');

  // Level up to 3 -> dialogue choice passes!
  sim = { ...sim, playerLevel: 3 };
  res = dispatchSandboxEvent(events, sim, {
    type: 'on_dialogue_choice_selected',
    targetId: `${modId}:elder_dialogue`,
    secondaryTargetId: 'choice_accept_oath',
  }, db);
  sim = res.nextState;
  assert.equal(sim.inventory[itemId], 3);

  // Monster kill, animal kill, block broken, object destroyed
  sim = dispatchSandboxEvent(events, sim, {
    type: 'on_monster_killed',
    targetId: `${modId}:shadow_beast`,
    triggerInstanceId: 'mob_1',
  }, db).nextState;
  assert.equal(sim.currency, 75);

  sim = dispatchSandboxEvent(events, sim, {
    type: 'on_animal_killed',
    targetCategory: 'animal',
    triggerInstanceId: 'boar_1',
  }, db).nextState;
  assert.equal(sim.inventory['woa:items/raw_hide'], 2);

  sim = dispatchSandboxEvent(events, sim, {
    type: 'on_block_broken',
    targetId: 'woa:blocks/stone_crate',
    triggerInstanceId: 'blk_1',
  }, db).nextState;
  assert.equal(sim.inventory['woa:items/relic_shard'], 1);

  sim = dispatchSandboxEvent(events, sim, {
    type: 'on_object_destroyed',
    targetId: 'woa:objects/wooden_barrel',
    triggerInstanceId: 'obj_1',
  }, db).nextState;
  assert.equal(sim.droppedRewards.length, 1);
  assert.equal(sim.droppedRewards[0].quantity, 2);
});

test('Events execution cooldown, scopes, and reset behaviors work accurately', () => {
  const modId = 'com.test.cooldown';
  const cdEv = createDefaultModEvent(modId, new Set());
  cdEv.id = `${modId}:respawn_buff`;
  cdEv.trigger = { type: 'on_player_respawn', targetMode: 'any' };
  cdEv.actions = [{ id: 'a1', type: 'give_currency', amount: 10 }];
  cdEv.execution = {
    scope: 'repeatable_cooldown',
    maxExecutions: null,
    cooldownSeconds: 30,
    persistentState: true,
    resetBehavior: 'on_player_respawn',
  };

  const onceEv = createDefaultModEvent(modId, new Set([cdEv.id]));
  onceEv.id = `${modId}:once_world_flag`;
  onceEv.trigger = { type: 'on_world_loaded', targetMode: 'any' };
  onceEv.actions = [{ id: 'a2', type: 'set_world_flag', targetId: 'initialized', flagValue: true }];
  onceEv.execution = {
    scope: 'once_per_world',
    maxExecutions: 1,
    cooldownSeconds: 0,
    persistentState: true,
    resetBehavior: 'on_world_reset',
  };

  let sim = createDefaultEventSimState({ nowSeconds: 100 });
  sim = dispatchSandboxEvent([cdEv, onceEv], sim, { type: 'on_player_respawn' }).nextState;
  assert.equal(sim.currency, 10);

  // Advance 10s (still within 30s cooldown) -> blocked_cooldown
  sim = { ...sim, nowSeconds: 110 };
  let res = dispatchSandboxEvent([cdEv, onceEv], sim, { type: 'on_player_respawn' });
  assert.equal(res.outcomes[0].status, 'blocked_cooldown');
  assert.equal(res.nextState.currency, 10);

  // Advance 25s (total +35s >= 30s) -> executes again
  sim = { ...res.nextState, nowSeconds: 135 };
  sim = dispatchSandboxEvent([cdEv, onceEv], sim, { type: 'on_player_respawn' }).nextState;
  assert.equal(sim.currency, 20);

  // once_per_world fires once then blocks until world reset
  sim = dispatchSandboxEvent([cdEv, onceEv], sim, { type: 'on_world_loaded' }).nextState;
  assert.equal(sim.worldFlags['initialized'], true);
  res = dispatchSandboxEvent([cdEv, onceEv], sim, { type: 'on_world_loaded' });
  assert.equal(res.outcomes[0].status, 'blocked_limit');

  sim = resetSandboxEventStates([cdEv, onceEv], sim, 'on_world_reset');
  res = dispatchSandboxEvent([cdEv, onceEv], sim, { type: 'on_world_loaded' });
  assert.equal(res.outcomes[0].status, 'executed');
});

test('Events serialize to data/events.json, survive .woamod export/re-import, and stay backward-compatible without data/events.json', async () => {
  const project = createModProject({
    modId: 'com.test.events_pkg',
    name: 'Events Export Mod',
    version: '1.0.0',
    author: 'Tester',
    description: 'Verifies data/events.json export, localization, and re-import.',
    supportedGameVersion: '1.1.25',
    categories: ['Weapons', 'Items'],
    templateId: 'weapon-pack',
  });
  const modId = project.manifest.modId;
  const db = resolveProjectContents(project);

  const ev = createEventFromTemplate('starter_sword', modId, new Set(), db);
  ev.name = 'Starter Blade Blessing';
  ev.description = 'Equips the starter weapon on world creation.';
  ev.translations = {
    name: { en: 'Starter Blade Blessing', ar: 'بركة سيف البداية' },
    description: { en: 'Equips the starter weapon on world creation.', ar: 'يجهز سلاح البداية عند إنشاء العالم.' },
  };
  const nextDb = { ...db, events: [ev] };
  const synced = syncContentFilesInProject(project, nextDb);

  const eventsFile = synced.files.find((f) => f.path === 'data/events.json');
  assert.ok(eventsFile, 'data/events.json must be synced into project files');

  const report = await validateModProject(synced, [synced], 'universal');
  assert.equal(report.errorCount, 0, JSON.stringify(report.issues));

  const { blob: exportedBlob } = await exportModArchiveBlob(synced, 'universal', {
    confirmWarnings: true,
  });
  const zip = await JSZip.loadAsync(await exportedBlob.arrayBuffer());
  const manifestJson = JSON.parse(await zip.file('mod.json')!.async('string'));
  const eventsJson = JSON.parse(await zip.file('data/events.json')!.async('string'));
  const registryJson = JSON.parse(await zip.file('data/registry.json')!.async('string'));
  const enJson = JSON.parse(await zip.file('localization/en.json')!.async('string'));
  const arJson = JSON.parse(await zip.file('localization/ar.json')!.async('string'));

  assert.equal(manifestJson.registries.events, 'data/events.json');
  assert.equal(eventsJson.entries.length, 1);
  assert.equal(eventsJson.entries[0].id, ev.id);
  assert.ok(registryJson.entries.some((e: { type: string; id: string }) => e.type === 'event' && e.id === ev.id));
  assert.equal(enJson.strings[`event.starter_sword_grant.name`], 'Starter Blade Blessing');
  assert.equal(arJson.strings[`event.starter_sword_grant.name`], 'بركة سيف البداية');

  // Re-import exported .woamod
  const reimportedFile = new File([await exportedBlob.arrayBuffer()], 'events_export.woamod', {
    type: 'application/zip',
  });
  const reimported = await importModFromFile(reimportedFile);
  const reimportedDb = resolveProjectContents(reimported);
  assert.equal(reimportedDb.events?.length, 1);
  assert.equal(reimportedDb.events?.[0].id, ev.id);
  assert.equal(reimportedDb.events?.[0].trigger.type, 'on_new_world_created');
  assert.equal(reimportedDb.events?.[0].actions[0].equipAutomatically, true);

  // Backward compatibility: .woamod archive without data/events.json imports cleanly with 0 events
  zip.remove('data/events.json');
  const legacyBlob = await zip.generateAsync({ type: 'blob' });
  const legacyFile = new File([await legacyBlob.arrayBuffer()], 'no_events.woamod', {
    type: 'application/zip',
  });
  const legacyProject = await importModFromFile(legacyFile);
  const legacyDb = resolveProjectContents(legacyProject);
  assert.equal(legacyDb.events?.length ?? 0, 0);
});

test('Event validation rejects unsupported multiplayer_authority, script injection, invalid params, circular loops, and undeclared deps, and remaps IDs cleanly', async () => {
  const modId = 'com.test.ev_val';
  const baseEv = createDefaultModEvent(modId, new Set());

  // Unsupported condition, negative qty, cooldown <= 0 with repeatable_cooldown, script injection
  const badEv = {
    ...baseEv,
    id: `${modId}:bad_ev`,
    name: '<script>alert(1)</script>',
    conditionGroups: [
      {
        id: 'g1',
        logic: 'and' as const,
        rules: [
          { id: 'r1', field: 'multiplayer_authority' as const, operator: '==' as const, value: 'server' },
        ],
      },
    ],
    actions: [{ id: 'a1', type: 'give_item' as const, targetId: `${modId}:missing_item`, quantity: 0 }],
    execution: {
      scope: 'repeatable_cooldown' as const,
      maxExecutions: 0,
      cooldownSeconds: 0,
      persistentState: false,
      resetBehavior: 'never' as const,
    },
  };

  const evIssues = validateModEventConfig(badEv, modId);
  assert.ok(evIssues.some((i) => i.field === 'security'));
  assert.ok(evIssues.some((i) => i.field.includes('conditionGroups.0.rules.0.field')));
  assert.ok(evIssues.some((i) => i.field === 'actions.0.quantity'));
  assert.ok(evIssues.some((i) => i.field === 'execution.cooldownSeconds'));
  assert.ok(evIssues.some((i) => i.field === 'execution.maxExecutions'));

  // Sandbox dispatch cleanly rejects multiplayer_authority without faking support
  const simRes = dispatchSandboxEvent([badEv], createDefaultEventSimState(), {
    type: badEv.trigger.type,
  });
  assert.equal(simRes.outcomes[0].status, 'rejected_unsupported');

  // Circular event chain detection (EvA -> EvB -> EvA)
  const evA = createDefaultModEvent(modId, new Set());
  evA.id = `${modId}:loop_a`;
  evA.trigger = { type: 'on_quest_started', targetMode: 'specific_id', targetId: `${modId}:q1` };
  evA.actions = [{ id: 'a1', type: 'complete_quest', targetId: `${modId}:q1` }];
  evA.execution.scope = 'repeatable';
  evA.execution.maxExecutions = null;

  const evB = createDefaultModEvent(modId, new Set([evA.id]));
  evB.id = `${modId}:loop_b`;
  evB.trigger = { type: 'on_quest_completed', targetMode: 'specific_id', targetId: `${modId}:q1` };
  evB.actions = [{ id: 'a2', type: 'start_quest', targetId: `${modId}:q1` }];
  evB.execution.scope = 'repeatable';
  evB.execution.maxExecutions = null;

  const cycles = detectEventChainCycles([evA, evB]);
  assert.ok(cycles.length >= 1, 'Expected circular event chain A -> B -> A');

  // Project validator catches CIRCULAR_EVENT_CHAIN, UNDECLARED_DEPENDENCY, and SCRIPT_INJECTION
  const proj = createModProject({
    modId,
    name: 'Event Validation Project',
    version: '1.0.0',
    author: 'Tester',
    description: 'Verifies event project validation rules.',
    supportedGameVersion: '1.1.25',
    categories: ['Items'],
    templateId: 'weapon-pack',
  });
  const db = resolveProjectContents(proj);
  const crossModEv = createDefaultModEvent(modId, new Set());
  crossModEv.id = `${modId}:cross_ref`;
  crossModEv.trigger = { type: 'on_new_world_created', targetMode: 'any' };
  crossModEv.actions = [{ id: 'a3', type: 'give_item', targetId: 'com.other.mod:emerald_gem', quantity: 1 }];

  const synced = syncContentFilesInProject(proj, { ...db, events: [badEv, evA, evB, crossModEv] });
  const projReport = await validateModProject(synced, [synced], 'universal');
  assert.ok(projReport.issues.some((i) => i.code === 'CIRCULAR_EVENT_CHAIN'));
  assert.ok(projReport.issues.some((i) => i.code === 'EVENT_SCRIPT_INJECTION'));
  assert.ok(projReport.issues.some((i) => i.code === 'UNDECLARED_DEPENDENCY' && i.problem.includes('com.other.mod')));

  // Remap IDs on rename/duplicate
  const remapped = remapEventContentIds(
    {
      ...evA,
      actions: [
        ...evA.actions,
        {
          id: 'b1',
          type: 'give_multiple_items',
          bundleItems: [{ id: 'bi1', itemId: `${modId}:ruby`, quantity: 2 }],
        },
      ],
    },
    `${modId}:`,
    'com.test.renamed:'
  );
  assert.equal(remapped.id, 'com.test.renamed:loop_a');
  assert.equal(remapped.trigger.targetId, 'com.test.renamed:q1');
  assert.equal(remapped.actions[0].targetId, 'com.test.renamed:q1');
  assert.equal(remapped.actions[1].bundleItems?.[0].itemId, 'com.test.renamed:ruby');
});

