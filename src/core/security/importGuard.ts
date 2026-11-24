import type JSZip from 'jszip';

export const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024; // 150 MB compressed package cap
export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024; // 250 MB decompressed cap
export const MAX_ARCHIVE_ENTRY_BYTES = 50 * 1024 * 1024; // 50 MB single entry cap
export const MAX_ARCHIVE_ENTRIES = 2500;
export const MAX_COMPRESSION_RATIO = 50; // Zip bomb guard
export const MAX_LOCAL_ASSET_BYTES = 50 * 1024 * 1024; // 50 MB single asset file cap
export const MAX_JSON_IMPORT_BYTES = 20 * 1024 * 1024; // 20 MB standalone JSON import cap

export const BLOCKED_EXECUTABLE_EXTENSIONS = new Set([
  'exe',
  'dll',
  'so',
  'dylib',
  'apk',
  'aab',
  'xapk',
  'ipa',
  'msi',
  'dmg',
  'pkg',
  'bat',
  'cmd',
  'ps1',
  'vbs',
  'vbe',
  'jse',
  'hta',
  'wsf',
  'wsh',
  'sh',
  'bash',
  'zsh',
  'jar',
  'class',
  'bin',
  'com',
  'scr',
  'pif',
  'cpl',
  'ocx',
  'sys',
  'drv',
  'ko',
  'efi',
  'elf',
  'appimage',
  'deb',
  'rpm',
  'wasm',
  'node',
  'cjs',
  'mjs',
]);

export const BLOCKED_SOURCE_CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'pyc',
  'pyo',
  'rb',
  'php',
  'lua',
  'pl',
  'java',
  'kt',
  'cs',
  'cpp',
  'c',
  'h',
  'hpp',
  'rs',
  'go',
  'swift',
  'dart',
  'asm',
  'sh',
  'bash',
  'zsh',
  'bat',
  'cmd',
  'ps1',
  'vbs',
  'vbe',
  'hta',
  'wsf',
  'wsh',
  'jse',
]);

export const WOAMOD_ALLOWED_ASSET_EXTENSIONS = new Set([
  'glb',
  'gltf',
  'obj',
  'png',
  'jpg',
  'jpeg',
  'wav',
  'ogg',
  'mp3',
  'woa3d',
]);

export const SAFE_ARCHIVE_EXTENSIONS = new Set([
  'json',
  ...WOAMOD_ALLOWED_ASSET_EXTENSIONS,
]);

const WOAMOD_ALLOWED_ROOT_FILES = new Set([
  'mod.json',
  'mod.manifest.json',
  'compatibility.json',
  'build-metadata.json',
]);

const RESERVED_WINDOWS_SEGMENTS = new Set([
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

const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function getExtensionLower(fileName: string): string {
  const clean = fileName.trim().toLowerCase();
  const lastDot = clean.lastIndexOf('.');
  return lastDot >= 0 && lastDot < clean.length - 1 ? clean.slice(lastDot + 1) : '';
}

export function isBlockedExecutableFile(filePath: string): boolean {
  const ext = getExtensionLower(filePath);
  return ext !== '' && BLOCKED_EXECUTABLE_EXTENSIONS.has(ext);
}

export function isDisallowedModPackageFile(filePath: string): boolean {
  const ext = getExtensionLower(filePath);
  if (!ext) return false;
  return BLOCKED_EXECUTABLE_EXTENSIONS.has(ext) || BLOCKED_SOURCE_CODE_EXTENSIONS.has(ext);
}

export function isAllowedWoamodPackagePath(rawPath: string): boolean {
  const clean = rawPath.replace(/\/+$/, '');
  if (getArchivePathViolation(clean) !== null) return false;
  if (isDisallowedModPackageFile(clean)) return false;

  const lower = clean.toLowerCase();
  const ext = getExtensionLower(lower);

  if (!lower.includes('/')) {
    return WOAMOD_ALLOWED_ROOT_FILES.has(lower);
  }

  if (lower.startsWith('data/')) {
    return ext === 'json';
  }

  if (lower.startsWith('localization/')) {
    return ext === 'json';
  }

  if (
    lower.startsWith('assets/models/') ||
    lower.startsWith('assets/textures/') ||
    lower.startsWith('assets/sounds/') ||
    lower.startsWith('assets/audio/')
  ) {
    return ext !== '' && WOAMOD_ALLOWED_ASSET_EXTENSIONS.has(ext);
  }

  return false;
}

/**
 * Pure archive path safety analyzer (no i18n runtime dependency so Node tests work directly).
 * Returns null if path is safe, or an English reason string if unsafe.
 */
export function getArchivePathViolation(rawPath: string): string | null {
  if (!rawPath || !rawPath.trim()) return 'Archive path is empty.';
  if (/[\x00-\x1f]/.test(rawPath)) return 'Archive path contains control characters.';
  if (rawPath.includes('\\')) return 'Archive path contains backslashes.';
  if (/^[a-zA-Z]:/.test(rawPath)) return 'Archive path contains a Windows drive prefix.';
  if (rawPath.startsWith('/')) return 'Archive path cannot start with "/".';
  if (rawPath.includes('//')) return 'Archive path contains empty double slashes.';
  if (/[<>:"|?*]/.test(rawPath)) return 'Archive path contains forbidden filename characters.';

  const segments = rawPath.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') {
      return `Archive path contains unsafe segment "${seg || 'empty'}".`;
    }
    const baseName = seg.split('.')[0].toUpperCase();
    if (RESERVED_WINDOWS_SEGMENTS.has(baseName)) {
      return `Archive path uses reserved Windows filename "${seg}".`;
    }
  }
  return null;
}

export function assertSafeArchiveEntryPath(rawPath: string): string {
  const clean = rawPath.replace(/\/+$/, '');
  const violation = getArchivePathViolation(clean);
  if (violation) {
    throw new Error(`Security violation in archive path "${rawPath}": ${violation}`);
  }
  if (isBlockedExecutableFile(clean)) {
    throw new Error(
      `Blocked potentially dangerous executable/binary file inside archive: "${clean}".`
    );
  }
  return clean;
}

export function stripPrototypePollution<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripPrototypePollution(item)) as unknown as T;
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_JSON_KEYS.has(key)) continue;
    result[key] = stripPrototypePollution(val);
  }
  return Object.assign({}, result) as T;
}

export function safeJsonParse<T = unknown>(rawJson: string): T {
  const parsed = JSON.parse(rawJson, (key, value) => {
    if (FORBIDDEN_JSON_KEYS.has(key)) {
      return undefined;
    }
    return value;
  });
  return stripPrototypePollution(parsed) as T;
}

export function sanitizeSafeModId(rawModId: string): string {
  const trimmed = String(rawModId || '').trim().toLowerCase();
  if (
    /^[a-z0-9][a-z0-9._-]{1,63}$/.test(trimmed) &&
    !trimmed.includes('..') &&
    !trimmed.includes('/') &&
    !trimmed.includes('\\')
  ) {
    return trimmed;
  }
  const cleaned = trimmed
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .slice(0, 64);
  if (cleaned.length < 3) {
    throw new Error(`Invalid or unsafe modId "${rawModId}".`);
  }
  return cleaned;
}

export function assertSafeFileSize(byteLength: number, maxBytes: number, label: string): void {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error(`Invalid byte length for ${label}.`);
  }
  if (byteLength > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`${label} exceeds maximum allowed size (${limitMb} MB).`);
  }
}

interface ZipInternalData {
  _data?: {
    compressedSize?: number;
    uncompressedSize?: number;
  };
}

/**
 * Inspects JSZip central directory headers before inflating all entries so zip bombs,
 * oversized archives, path traversals, and dangerous executables are rejected early.
 */
export function validateZipArchiveLimits(
  zip: JSZip,
  compressedArchiveBytes?: number
): { entryCount: number; declaredUncompressedBytes: number } {
  if (typeof compressedArchiveBytes === 'number') {
    assertSafeFileSize(compressedArchiveBytes, MAX_ARCHIVE_BYTES, 'Mod archive');
  }

  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error(
      `Archive contains too many entries (${entries.length} > ${MAX_ARCHIVE_ENTRIES}).`
    );
  }

  let totalDeclaredUncompressed = 0;
  for (const entry of entries) {
    const clean = entry.name.replace(/\/+$/, '');
    if (!clean) continue;

    assertSafeArchiveEntryPath(clean);

    if (entry.dir) continue;

    const meta = (entry as unknown as ZipInternalData)._data;
    const uncompressedSize = Number(meta?.uncompressedSize ?? 0);
    const compressedSize = Number(meta?.compressedSize ?? 0);

    if (uncompressedSize > MAX_ARCHIVE_ENTRY_BYTES) {
      throw new Error(
        `Archive entry "${clean}" exceeds maximum single-file size (${Math.round(
          MAX_ARCHIVE_ENTRY_BYTES / (1024 * 1024)
        )} MB).`
      );
    }

    if (
      compressedSize > 0 &&
      uncompressedSize > 1024 * 1024 &&
      uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
    ) {
      throw new Error(
        `Archive entry "${clean}" triggered compression-ratio safety limit (potential zip bomb).`
      );
    }

    totalDeclaredUncompressed += Math.max(0, uncompressedSize);
    if (totalDeclaredUncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Archive decompressed size exceeds safety limit (${Math.round(
          MAX_ARCHIVE_UNCOMPRESSED_BYTES / (1024 * 1024)
        )} MB).`
      );
    }
  }

  return {
    entryCount: entries.length,
    declaredUncompressedBytes: totalDeclaredUncompressed,
  };
}

/**
 * Enforces strict data-driven .woamod package security:
 * - Inherits all zip-bomb, size, path-traversal, and reserved-name limits
 * - Rejects executables, native/original libraries, and source-code/script files (.ts, .js, .exe, .dll, etc.)
 * - Rejects any file outside the allowed data-driven mod package boundary
 */
export function assertSafeWoamodPackageLimits(
  zip: JSZip,
  compressedArchiveBytes?: number
): { entryCount: number; declaredUncompressedBytes: number } {
  const limits = validateZipArchiveLimits(zip, compressedArchiveBytes);

  for (const entry of Object.values(zip.files)) {
    const clean = entry.name.replace(/\/+$/, '');
    if (!clean || entry.dir) continue;

    if (isDisallowedModPackageFile(clean)) {
      throw new Error(
        `Security violation detected. Executable files or original libraries are not allowed inside mods. (${clean})`
      );
    }

    if (!isAllowedWoamodPackagePath(clean)) {
      throw new Error(
        `Security violation detected. Disallowed file "${clean}" is outside the data-driven .woamod package boundary.`
      );
    }
  }

  return limits;
}

export async function readZipEntryTextBounded(
  entry: JSZip.JSZipObject,
  maxBytes: number = MAX_ARCHIVE_ENTRY_BYTES
): Promise<string> {
  const buf = await entry.async('uint8array');
  assertSafeFileSize(buf.byteLength, maxBytes, `Archive entry "${entry.name}"`);
  return new TextDecoder().decode(buf);
}

export async function readZipEntryBufferBounded(
  entry: JSZip.JSZipObject,
  maxBytes: number = MAX_ARCHIVE_ENTRY_BYTES
): Promise<ArrayBuffer> {
  const buf = await entry.async('arraybuffer');
  assertSafeFileSize(buf.byteLength, maxBytes, `Archive entry "${entry.name}"`);
  return buf;
}

export function assertSafeLocalAssetSize(fileName: string, sizeBytes: number): void {
  if (isBlockedExecutableFile(fileName) || isDisallowedModPackageFile(fileName)) {
    throw new Error(`Blocked executable/unsafe file type: "${fileName}".`);
  }
  assertSafeFileSize(sizeBytes, MAX_LOCAL_ASSET_BYTES, `Asset "${fileName}"`);
}

export function sanitizeManifestEntryPoint(rawEntry: unknown): string {
  const candidate = typeof rawEntry === 'string' && rawEntry.trim() ? rawEntry.trim() : 'scripts/main.ts';
  const clean = assertSafeArchiveEntryPath(candidate);
  const ext = getExtensionLower(clean);
  if (ext !== 'ts' && ext !== 'js') {
    return 'scripts/main.ts';
  }
  return clean;
}
