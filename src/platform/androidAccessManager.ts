import { Capacitor } from '@capacitor/core';
import { t } from '@/src/i18n';
import type { StorageConfig } from './types';
import {
  WoaStorage,
  type WoaStorageAccessStatusResponse,
} from './woaStoragePlugin';

export const APP_ROOT_FOLDER_NAME = 'World of Adventure Mod Creator';

export function sanitizeFolderSegment(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return cleaned || 'default_item';
}

export function formatBackupTimestampFolder(isoDate?: string): string {
  const d = isoDate ? new Date(isoDate) : new Date();
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `backup-${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}-${pad(valid.getHours())}${pad(valid.getMinutes())}`;
}

export function parseScopedBlobKey(key: string): {
  projectSegment: string | null;
  assetSegment: string;
} {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return {
      projectSegment: sanitizeFolderSegment(parts[0]),
      assetSegment: sanitizeFolderSegment(parts.slice(1).join('_')),
    };
  }
  return {
    projectSegment: null,
    assetSegment: sanitizeFolderSegment(normalized),
  };
}

export function createDefaultStorageConfig(): StorageConfig {
  return {
    safTreeUri: null,
    safTreeLabel: null,
    folderAccessValid: false,
    folderAccessRevoked: false,
    firstTimeSetupPrompted: false,
    lastOpenedProjectId: null,
    defaultExportMode: 'dedicated-folder',
    exportConflictPolicy: 'ask',
    autoBackupOnBuild: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function generateUniqueFilename(
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

export type AndroidAccessOperation =
  | 'import-mod'
  | 'export-mod'
  | 'import-media'
  | 'open-project'
  | 'save-project'
  | 'pick-directory'
  | 'backup-export'
  | 'backup-restore'
  | 'app-storage';

export type AndroidStorageCapabilityTier =
  | 'legacy-external'
  | 'scoped-pre13'
  | 'scoped-android13-plus';

export interface AndroidStorageCapabilities {
  sdkInt: number;
  tier: AndroidStorageCapabilityTier;
  usesScopedStorage: boolean;
  isAndroid13Plus: boolean;
  requiresLegacyStoragePermission: boolean;
  usesSafByDefault: boolean;
}

export type AndroidStorageAccessStatus = WoaStorageAccessStatusResponse;

export type AndroidNativeErrorCode =
  | 'ACCESS_DENIED'
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'PICKER_UNAVAILABLE'
  | 'DIRECTORY_INIT_FAILED'
  | 'SETTINGS_OPEN_FAILED'
  | 'UNKNOWN';

export interface AndroidAccessIssue {
  id: string;
  operation: AndroidAccessOperation;
  code: AndroidNativeErrorCode;
  message: string;
  explanation: string;
  permanentlyDenied: boolean;
  canRetry: boolean;
  canOpenSettings: boolean;
  retryAction?: () => void | Promise<void>;
}

export class AndroidAccessDeniedError extends Error {
  readonly code: AndroidNativeErrorCode;
  readonly operation: AndroidAccessOperation;
  readonly permanentlyDenied: boolean;

  constructor(
    operation: AndroidAccessOperation,
    message?: string,
    permanentlyDenied = false,
    code: AndroidNativeErrorCode = 'ACCESS_DENIED'
  ) {
    super(message || getDefaultDeniedMessage());
    this.name = 'AndroidAccessDeniedError';
    this.code = code;
    this.operation = operation;
    this.permanentlyDenied = permanentlyDenied;
  }
}

export function getDefaultDeniedMessage(): string {
  try {
    return t('android.fileAccessDenied');
  } catch {
    return 'File access was denied. Please allow access or select the file again.';
  }
}

/**
 * Pure helper classifying Android storage API tier by SDK_INT:
 * - API < 29 (Android 7-9): legacy external storage available if explicitly requested, SAF preferred
 * - API 29-32 (Android 10-12): Scoped Storage + SAF, no runtime storage permissions for SAF/app-private
 * - API 33+ (Android 13-15+): Scoped Storage + SAF, READ/WRITE_EXTERNAL_STORAGE obsolete; zero broad READ_MEDIA_* requested
 */
export function detectAndroidStorageCapabilities(
  sdkInt: number
): AndroidStorageCapabilities {
  const safeSdk = Number.isFinite(sdkInt) && sdkInt > 0 ? Math.floor(sdkInt) : 33;
  const usesScopedStorage = safeSdk >= 29;
  const isAndroid13Plus = safeSdk >= 33;
  const tier: AndroidStorageCapabilityTier = isAndroid13Plus
    ? 'scoped-android13-plus'
    : usesScopedStorage
      ? 'scoped-pre13'
      : 'legacy-external';

  return {
    sdkInt: safeSdk,
    tier,
    usesScopedStorage,
    isAndroid13Plus,
    requiresLegacyStoragePermission: !usesScopedStorage,
    usesSafByDefault: true,
  };
}

/**
 * Determines whether a storage operation requires requesting an Android runtime permission.
 * - App-private storage operations (`app-storage`, `open-project`, `save-project`) NEVER require runtime permissions.
 * - On Android 10+ (API >= 29), SAF + app-private storage NEVER require runtime permissions.
 * - On Android 7-9 (API < 29), runtime permission is only required when legacy direct external path access is explicitly requested.
 */
export function doesOperationRequireRuntimePermission(
  operation: AndroidAccessOperation,
  sdkInt: number,
  requireLegacyExternal = false
): boolean {
  if (
    operation === 'app-storage' ||
    operation === 'open-project' ||
    operation === 'save-project'
  ) {
    return false;
  }
  if (sdkInt >= 29) {
    return false;
  }
  return Boolean(requireLegacyExternal);
}

export function classifyAndroidNativeError(raw: unknown): {
  code: AndroidNativeErrorCode;
  detail: string;
} {
  const rawMessage =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
        ? raw
        : typeof raw === 'object' && raw !== null && 'message' in raw
          ? String((raw as { message?: unknown }).message ?? '')
          : '';

  const trimmed = rawMessage.trim();
  const knownCodes: AndroidNativeErrorCode[] = [
    'ACCESS_DENIED',
    'READ_FAILED',
    'WRITE_FAILED',
    'PICKER_UNAVAILABLE',
    'DIRECTORY_INIT_FAILED',
    'SETTINGS_OPEN_FAILED',
  ];

  for (const code of knownCodes) {
    if (trimmed.startsWith(`${code}:`)) {
      return {
        code,
        detail: trimmed.slice(code.length + 1).trim(),
      };
    }
    if (trimmed === code) {
      return { code, detail: '' };
    }
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.includes('securityexception') ||
    lower.includes('permission denial') ||
    lower.includes('eacces') ||
    lower.includes('access was denied') ||
    lower.includes('permission denied')
  ) {
    return { code: 'ACCESS_DENIED', detail: trimmed };
  }

  return {
    code: 'UNKNOWN',
    detail: trimmed,
  };
}

export function getOperationExplanation(operation: AndroidAccessOperation): string {
  switch (operation) {
    case 'import-mod':
      return t('android.explain.importMod');
    case 'export-mod':
      return t('android.explain.exportMod');
    case 'import-media':
      return t('android.explain.importMedia');
    case 'pick-directory':
      return t('android.explain.pickDirectory');
    case 'backup-export':
    case 'backup-restore':
      return t('android.explain.backup');
    case 'open-project':
    case 'save-project':
    case 'app-storage':
    default:
      return t('android.explain.appStorage');
  }
}

export function inferImportOperationFromAccept(
  accept?: string[]
): AndroidAccessOperation {
  if (!accept || accept.length === 0) return 'import-mod';
  const joined = accept.join(',').toLowerCase();
  if (joined.includes('.woabackup') || joined.includes('backup')) {
    return 'backup-restore';
  }
  if (
    joined.includes('.png') ||
    joined.includes('.jpg') ||
    joined.includes('.wav') ||
    joined.includes('.mp3') ||
    joined.includes('.ogg') ||
    joined.includes('.glb') ||
    joined.includes('.gltf') ||
    joined.includes('.obj') ||
    joined.includes('.woa3d')
  ) {
    return 'import-media';
  }
  return 'import-mod';
}

let activeIssue: AndroidAccessIssue | null = null;
const issueListeners = new Set<(issue: AndroidAccessIssue | null) => void>();

function notifyIssueListeners(): void {
  for (const listener of issueListeners) {
    listener(activeIssue);
  }
}

export function getCurrentAndroidAccessIssue(): AndroidAccessIssue | null {
  return activeIssue;
}

export function clearAndroidAccessIssue(): void {
  if (activeIssue === null) return;
  activeIssue = null;
  notifyIssueListeners();
}

export function subscribeAndroidAccessIssue(
  listener: (issue: AndroidAccessIssue | null) => void
): () => void {
  issueListeners.add(listener);
  listener(activeIssue);
  return () => {
    issueListeners.delete(listener);
  };
}

function isAndroidNativeRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function getAndroidAccessStatus(): Promise<AndroidStorageAccessStatus | null> {
  if (!isAndroidNativeRuntime()) return null;
  try {
    return await WoaStorage.getStorageAccessStatus();
  } catch {
    return null;
  }
}

export async function checkAndroidDirectoryAccess(
  ensureStructure = false
): Promise<AndroidStorageAccessStatus | null> {
  if (!isAndroidNativeRuntime()) return null;
  try {
    return await WoaStorage.checkDirectoryAccess({ ensureStructure });
  } catch {
    return await getAndroidAccessStatus();
  }
}

export function reportAndroidSafRevoked(reconnectAction?: () => void | Promise<void>): AndroidAccessIssue {
  const issue: AndroidAccessIssue = {
    id: `android_saf_revoked_${Date.now()}`,
    operation: 'pick-directory',
    code: 'ACCESS_DENIED',
    message: t('android.safRevokedMessage'),
    explanation: t('android.safRevokedExplain'),
    permanentlyDenied: false,
    canRetry: true,
    canOpenSettings: true,
    retryAction: reconnectAction,
  };
  activeIssue = issue;
  notifyIssueListeners();
  return issue;
}

export async function ensureAndroidOperationAccess(
  operation: AndroidAccessOperation,
  options?: {
    requireLegacyExternal?: boolean;
    retryAction?: () => void | Promise<void>;
  }
): Promise<boolean> {
  if (!isAndroidNativeRuntime()) return true;

  // Never trigger prompts for app-private storage
  if (
    operation === 'app-storage' ||
    operation === 'open-project' ||
    operation === 'save-project'
  ) {
    return true;
  }

  try {
    const res = await WoaStorage.requestOperationAccess({
      operation,
      requireLegacyExternal: Boolean(options?.requireLegacyExternal),
    });

    if (res.granted) {
      if (activeIssue?.operation === operation) {
        clearAndroidAccessIssue();
      }
      return true;
    }

    const permanentlyDenied = Boolean(res.permanentlyDenied);
    const msg = getDefaultDeniedMessage();
    activeIssue = {
      id: `android_access_${Date.now()}`,
      operation,
      code: 'ACCESS_DENIED',
      message: msg,
      explanation: permanentlyDenied
        ? t('android.permanentlyDenied')
        : getOperationExplanation(operation),
      permanentlyDenied,
      canRetry: true,
      canOpenSettings: permanentlyDenied,
      retryAction: options?.retryAction,
    };
    notifyIssueListeners();
    throw new AndroidAccessDeniedError(operation, msg, permanentlyDenied, 'ACCESS_DENIED');
  } catch (err) {
    if (err instanceof AndroidAccessDeniedError) {
      throw err;
    }
    const issue = reportAndroidAccessError(operation, err, {
      retryAction: options?.retryAction,
    });
    throw new AndroidAccessDeniedError(
      operation,
      issue.message,
      issue.permanentlyDenied,
      issue.code
    );
  }
}

export function reportAndroidAccessError(
  operation: AndroidAccessOperation,
  err: unknown,
  options?: {
    permanentlyDenied?: boolean;
    retryAction?: () => void | Promise<void>;
  }
): AndroidAccessIssue {
  if (err instanceof AndroidAccessDeniedError) {
    const issue: AndroidAccessIssue = {
      id: `android_err_${Date.now()}`,
      operation,
      code: err.code,
      message: err.message || getDefaultDeniedMessage(),
      explanation: err.permanentlyDenied
        ? t('android.permanentlyDenied')
        : getOperationExplanation(operation),
      permanentlyDenied: err.permanentlyDenied,
      canRetry: true,
      canOpenSettings: err.permanentlyDenied,
      retryAction: options?.retryAction,
    };
    activeIssue = issue;
    notifyIssueListeners();
    return issue;
  }

  const classified = classifyAndroidNativeError(err);
  const permanentlyDenied = Boolean(options?.permanentlyDenied);
  let message = getDefaultDeniedMessage();

  if (classified.code === 'WRITE_FAILED') {
    message = t('android.exportFailedPreserved');
  } else if (classified.code === 'READ_FAILED') {
    message = t('android.readFailed', {
      detail: classified.detail || 'I/O error',
    });
  } else if (classified.code === 'PICKER_UNAVAILABLE') {
    message = classified.detail || getDefaultDeniedMessage();
  } else if (classified.code === 'ACCESS_DENIED') {
    message = getDefaultDeniedMessage();
  }

  const issue: AndroidAccessIssue = {
    id: `android_err_${Date.now()}`,
    operation,
    code: classified.code,
    message,
    explanation: permanentlyDenied
      ? t('android.permanentlyDenied')
      : getOperationExplanation(operation),
    permanentlyDenied,
    canRetry: classified.code !== 'PICKER_UNAVAILABLE',
    canOpenSettings:
      permanentlyDenied ||
      classified.code === 'ACCESS_DENIED' ||
      classified.code === 'DIRECTORY_INIT_FAILED',
    retryAction: options?.retryAction,
  };
  activeIssue = issue;
  notifyIssueListeners();
  return issue;
}

export async function openAndroidAppSettings(): Promise<boolean> {
  if (!isAndroidNativeRuntime()) return false;
  try {
    const res = await WoaStorage.openAppSettings();
    return Boolean(res.opened);
  } catch {
    return false;
  }
}
