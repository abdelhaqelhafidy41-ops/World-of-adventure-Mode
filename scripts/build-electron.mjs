#!/usr/bin/env node
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-electron');

fs.mkdirSync(outDir, { recursive: true });

await Promise.all([
  esbuild.build({
    entryPoints: [path.join(rootDir, 'electron', 'main.ts')],
    outfile: path.join(outDir, 'main.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron'],
    sourcemap: false,
  }),
  esbuild.build({
    entryPoints: [path.join(rootDir, 'electron', 'preload.ts')],
    outfile: path.join(outDir, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron'],
    sourcemap: false,
  }),
]);

console.log('Built Electron bundles -> dist-electron/main.cjs, dist-electron/preload.cjs');
