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
  DEFAULT_GAME_VERSION,
  MIN_SUPPORTED_GAME_VERSION,
  validateSupportedGameVersion,
} from '../src/core/api/woaModApiSpec';
import {
  getAssetFormatSpec,
  isSupportedAssetPath,
  parseAndValidateWoa3dContent,
  serializeWoa3dAsset,
} from '../src/core/assets/assetPipeline';
import {
  createModProject,
  createStarterSampleProject,
} from '../src/core/project/modScaffolder';
import {
  exportModArchiveBlob,
  importModFromFile,
  isDevelopmentOnlyPath,
} from '../src/core/builder/modBuilder';
import { validateModProject } from '../src/core/validation/modValidator';
import {
  detectFormFactor,
  detectRuntimePlatform,
  getPlatformCapabilities,
} from '../src/platform/detect';
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

test('validateSupportedGameVersion enforces SemVer >= 1.1.24 with exact error messages', () => {
  assert.equal(MIN_SUPPORTED_GAME_VERSION, '1.1.24');
  assert.equal(DEFAULT_GAME_VERSION, '1.1.24');

  for (const validVer of ['1.1.24', ' 1.1.24 ', '1.1.25', '1.2.0', '1.8.0', '1.9.0', '2.0.0', '2.0.0-preview', '3.4.5']) {
    const res = validateSupportedGameVersion(validVer);
    assert.equal(res.valid, true, `Expected ${validVer} to be valid`);
  }

  for (const lowVer of ['1.1.23', '1.1.0', '1.0.0', '0.9.9']) {
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

  // Sample project round-trip preserves all 3 .woa3d assets + 1.1.24 version cleanly
  const sample = createStarterSampleProject();
  assert.equal(sample.manifest.supportedGameVersion, '1.1.24');
  const { blob, filename } = await exportModArchiveBlob(sample, 'universal', { confirmWarnings: true });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const modJson = JSON.parse(await zip.file('mod.json')!.async('string')) as Record<string, unknown>;
  assert.equal(modJson.supportedGameVersion, '1.1.24');

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
