#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const versionJsonPath = path.join(rootDir, 'version.json');
const pkgJsonPath = path.join(rootDir, 'package.json');
const androidGradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
const metaJsonPath = path.join(rootDir, 'metadata.json');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const tagFlagIdx = args.indexOf('--verify-tag');
const tagArg = tagFlagIdx >= 0 ? args[tagFlagIdx + 1] : undefined;

const versionMeta = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
const { version, versionCode } = versionMeta;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid semver in version.json: "${version}"`);
  process.exit(1);
}
if (!Number.isInteger(versionCode) || versionCode < 1) {
  console.error(`Invalid versionCode in version.json: "${versionCode}"`);
  process.exit(1);
}

if (tagArg) {
  const normalizedTag = tagArg.replace(/^refs\/tags\//, '').replace(/^v/, '');
  if (normalizedTag !== version) {
    console.error(
      `Release tag mismatch: tag="${tagArg}" (normalized="${normalizedTag}") does not match version.json version="${version}"`
    );
    process.exit(1);
  }
  console.log(`Tag ${tagArg} matches version.json (${version}).`);
}

let hasMismatch = false;

// 1. Sync package.json
const pkgRaw = fs.readFileSync(pkgJsonPath, 'utf8');
const pkg = JSON.parse(pkgRaw);
if (pkg.version !== version) {
  if (checkOnly) {
    console.error(`package.json version "${pkg.version}" !== version.json "${version}"`);
    hasMismatch = true;
  } else {
    pkg.version = version;
    fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log(`Updated package.json version -> ${version}`);
  }
}

// 2. Sync android/app/build.gradle if it exists
if (fs.existsSync(androidGradlePath)) {
  const gradleRaw = fs.readFileSync(androidGradlePath, 'utf8');
  let nextGradle = gradleRaw;

  nextGradle = nextGradle.replace(
    /(versionCode\s+)\d+/,
    `$1${versionCode}`
  );
  nextGradle = nextGradle.replace(
    /(versionName\s+)"[^"]+"/,
    `$1"${version}"`
  );

  if (nextGradle !== gradleRaw) {
    if (checkOnly) {
      console.error(`android/app/build.gradle versionName/versionCode out of sync with version.json`);
      hasMismatch = true;
    } else {
      fs.writeFileSync(androidGradlePath, nextGradle, 'utf8');
      console.log(`Updated android/app/build.gradle -> versionName "${version}", versionCode ${versionCode}`);
    }
  }
}

// 3. Check metadata.json (preserve existing name; sync version if present or leave clean)
if (fs.existsSync(metaJsonPath)) {
  const meta = JSON.parse(fs.readFileSync(metaJsonPath, 'utf8'));
  if (meta.version && meta.version !== version) {
    if (checkOnly) {
      console.error(`metadata.json version "${meta.version}" !== "${version}"`);
      hasMismatch = true;
    } else {
      meta.version = version;
      fs.writeFileSync(metaJsonPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    }
  }
}

if (checkOnly && hasMismatch) {
  console.error('Run "node scripts/sync-version.mjs" to synchronize versions.');
  process.exit(1);
}

console.log(`Version sync check complete: v${version} (code ${versionCode})`);
