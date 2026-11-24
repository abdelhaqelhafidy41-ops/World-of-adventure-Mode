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
import { createStarterSampleProject } from '../src/core/project/modScaffolder';
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
