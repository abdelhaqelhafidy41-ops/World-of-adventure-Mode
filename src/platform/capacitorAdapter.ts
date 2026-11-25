import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type {
  EditorSettings,
  ModProject,
  ProjectBackupRecord,
} from '@/src/types/mod';
import {
  APP_ROOT_FOLDER_NAME,
  AndroidAccessDeniedError,
  checkAndroidDirectoryAccess,
  classifyAndroidNativeError,
  clearAndroidAccessIssue,
  createDefaultStorageConfig,
  ensureAndroidOperationAccess,
  formatBackupTimestampFolder,
  generateUniqueFilename,
  getAndroidAccessStatus,
  inferImportOperationFromAccept,
  parseScopedBlobKey,
  reportAndroidAccessError,
  reportAndroidSafRevoked,
  sanitizeFolderSegment,
} from './androidAccessManager';
import {
  DedicatedFolderEntry,
  PickDirectoryResult,
  PickFilesOptions,
  PlatformBridge,
  SaveExportOptions,
  SaveExportResult,
  STORAGE_SUBDIRS,
  StorageAccessCheckResult,
  StorageConfig,
  StorageLocationInfo,
  StorageSubdir,
} from './types';
import { WoaStorage } from './woaStoragePlugin';

const ROOT_FOLDER_NAME = APP_ROOT_FOLDER_NAME;
const TEMP_SUFFIX = '.woatmp';
const LS_SAF_URI_KEY = 'woa_android_saf_tree_uri';
const LS_SAF_LABEL_KEY = 'woa_android_saf_tree_label';
const LS_STORAGE_CONFIG_KEY = 'woa_android_storage_config_v1';
const LS_PERSISTED_FILES_KEY = 'woa_android_persisted_imports';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode(...slice));
  }
  return btoa(chunks.join(''));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function encodeUtf8ToBase64(text: string): string {
  const encoded = new TextEncoder().encode(text);
  return arrayBufferToBase64(encoded.buffer as ArrayBuffer);
}

function decodeBase64ToUtf8(base64: string): string {
  return new TextDecoder().decode(base64ToArrayBuffer(base64));
}

function sanitizeKeySegment(raw: string): string {
  return sanitizeFolderSegment(raw);
}

function recordPersistedImportGrant(entry: {
  name: string;
  uri?: string;
  persisted?: boolean;
}): void {
  if (!entry.persisted || !entry.uri) return;
  try {
    const raw = localStorage.getItem(LS_PERSISTED_FILES_KEY);
    const list = raw
      ? (JSON.parse(raw) as Array<{ name: string; uri: string; grantedAt: string }>)
      : [];
    const filtered = list.filter((item) => item.uri !== entry.uri);
    filtered.unshift({
      name: entry.name,
      uri: entry.uri,
      grantedAt: new Date().toISOString(),
    });
    localStorage.setItem(LS_PERSISTED_FILES_KEY, JSON.stringify(filtered.slice(0, 30)));
  } catch {
    // Ignore quota or unavailable localStorage
  }
}

export class CapacitorAndroidAdapter implements PlatformBridge {
  readonly platform = 'android' as const;
  private directoryResolved = false;

  /**
   * Internal app-private storage (`Directory.Data` -> Context.getFilesDir()) requires
   * zero runtime permissions across all Android versions (API 24 through Android 15+).
   */
  private async resolveWritableDirectory(): Promise<Directory> {
    if (!this.directoryResolved) {
      try {
        await Filesystem.mkdir({
          path: ROOT_FOLDER_NAME,
          directory: Directory.Data,
          recursive: true,
        });
      } catch {
        // Directory may already exist
      }
      this.directoryResolved = true;
    }
    return Directory.Data;
  }

  private async ensureAppPrivateFolder(relativeDir: string): Promise<Directory> {
    const dir = await this.resolveWritableDirectory();
    try {
      await Filesystem.mkdir({
        path: `${ROOT_FOLDER_NAME}/${relativeDir}`,
        directory: dir,
        recursive: true,
      });
    } catch {
      // Directory may already exist
    }
    return dir;
  }

  private async atomicWriteAppFile(
    relativePath: string,
    data: string,
    encoding?: Encoding
  ): Promise<void> {
    const dir = await this.resolveWritableDirectory();
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    const parentDir = parts.slice(0, -1).join('/');
    if (parentDir) {
      await this.ensureAppPrivateFolder(parentDir);
    }

    const fullPath = `${ROOT_FOLDER_NAME}/${parts.join('/')}`;
    const tempPath = `${fullPath}.${Date.now()}${TEMP_SUFFIX}`;

    try {
      await Filesystem.writeFile({
        path: tempPath,
        data,
        directory: dir,
        ...(encoding ? { encoding } : {}),
      });
      try {
        await Filesystem.deleteFile({ path: fullPath, directory: dir });
      } catch {
        // Target may not exist yet
      }
      await Filesystem.rename({
        from: tempPath,
        to: fullPath,
        directory: dir,
      });
    } finally {
      try {
        await Filesystem.deleteFile({ path: tempPath, directory: dir });
      } catch {
        // Temp already promoted or never created
      }
    }
  }

  private getSavedSafTree(): { uri: string | null; label: string | null } {
    try {
      return {
        uri: localStorage.getItem(LS_SAF_URI_KEY),
        label: localStorage.getItem(LS_SAF_LABEL_KEY),
      };
    } catch {
      return { uri: null, label: null };
    }
  }

  private syncSafLocalState(uri: string | null, label: string | null): void {
    try {
      if (uri) {
        localStorage.setItem(LS_SAF_URI_KEY, uri);
        localStorage.setItem(LS_SAF_LABEL_KEY, label || ROOT_FOLDER_NAME);
      } else {
        localStorage.removeItem(LS_SAF_URI_KEY);
        localStorage.removeItem(LS_SAF_LABEL_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private async getValidSafTreeUri(): Promise<string | null> {
    const status = await checkAndroidDirectoryAccess(false);
    if (status) {
      if (status.safTreePersisted && status.safTreeUri) {
        this.syncSafLocalState(
          status.safTreeUri,
          status.safTreeLabel || ROOT_FOLDER_NAME
        );
        return status.safTreeUri;
      }
      if (status.safTreeRevoked || this.getSavedSafTree().uri) {
        this.syncSafLocalState(null, null);
      }
      return null;
    }
    return this.getSavedSafTree().uri;
  }

  private async writeSafFileIfConnected(
    relativePath: string,
    mimeType: string,
    base64: string,
    overwrite = true
  ): Promise<{ written: boolean; exists?: boolean; uri?: string; revoked?: boolean }> {
    const treeUri = await this.getValidSafTreeUri();
    if (!treeUri) return { written: false };
    try {
      const res = await WoaStorage.writeFileToTree({
        treeUri,
        relativePath,
        mimeType,
        base64,
        overwrite,
      });
      return {
        written: Boolean(res.saved),
        exists: Boolean(res.exists),
        uri: res.uri,
      };
    } catch (err) {
      const classified = classifyAndroidNativeError(err);
      if (classified.code === 'ACCESS_DENIED') {
        this.syncSafLocalState(null, null);
        reportAndroidSafRevoked(() => void this.pickStorageDirectory());
        return { written: false, revoked: true };
      }
      return { written: false };
    }
  }

  async checkStorageFolderAccess(): Promise<StorageAccessCheckResult> {
    const info = await this.getStorageInfo();
    return {
      valid: Boolean(info.folderAccessValid),
      revoked: Boolean(info.folderAccessRevoked),
      mode: info.mode,
      rootPath: info.rootPath,
      safTreeUri: info.safTreeUri,
      safTreeLabel: info.safTreeLabel,
    };
  }

  async ensureFirstTimeStorageSetup(): Promise<boolean> {
    const status = await checkAndroidDirectoryAccess(true);
    if (status?.safTreePersisted && status.safTreeUri) {
      this.syncSafLocalState(
        status.safTreeUri,
        status.safTreeLabel || ROOT_FOLDER_NAME
      );
      clearAndroidAccessIssue();
      const current = (await this.syncLoadStorageConfig()) ?? createDefaultStorageConfig();
      if (
        current.safTreeUri !== status.safTreeUri ||
        !current.folderAccessValid ||
        current.folderAccessRevoked
      ) {
        await this.syncSaveStorageConfig({
          ...current,
          safTreeUri: status.safTreeUri,
          safTreeLabel: status.safTreeLabel || ROOT_FOLDER_NAME,
          folderAccessValid: true,
          folderAccessRevoked: false,
          firstTimeSetupPrompted: true,
          updatedAt: new Date().toISOString(),
        });
      }
      return true;
    }

    if (status?.safTreeRevoked) {
      reportAndroidSafRevoked(() => void this.pickStorageDirectory());
      return false;
    }

    const existingConfig =
      (await this.syncLoadStorageConfig()) ?? createDefaultStorageConfig();
    if (existingConfig.firstTimeSetupPrompted) {
      return false;
    }

    await this.syncSaveStorageConfig({
      ...existingConfig,
      firstTimeSetupPrompted: true,
      updatedAt: new Date().toISOString(),
    });

    try {
      const picked = await this.pickStorageDirectory();
      return Boolean(picked);
    } catch {
      return false;
    }
  }

  async getStorageInfo(): Promise<StorageLocationInfo> {
    await this.resolveWritableDirectory();
    const nativeStatus = await checkAndroidDirectoryAccess(false);
    let saf = this.getSavedSafTree();
    let folderAccessValid = false;
    let folderAccessRevoked = false;

    if (nativeStatus) {
      folderAccessRevoked = Boolean(nativeStatus.safTreeRevoked);
      if (nativeStatus.safTreePersisted && nativeStatus.safTreeUri) {
        folderAccessValid = true;
        saf = {
          uri: nativeStatus.safTreeUri,
          label: nativeStatus.safTreeLabel || saf.label || ROOT_FOLDER_NAME,
        };
        this.syncSafLocalState(saf.uri, saf.label);
      } else {
        if (saf.uri) {
          folderAccessRevoked = true;
        }
        saf = { uri: null, label: nativeStatus.safTreeLabel || null };
        this.syncSafLocalState(null, null);
      }
    }

    const basePrefix = saf.uri
      ? `${saf.label || ROOT_FOLDER_NAME}/${ROOT_FOLDER_NAME}`
      : `AppData/${ROOT_FOLDER_NAME}`;
    const subdirectories = {} as Record<StorageSubdir, string>;
    for (const sub of STORAGE_SUBDIRS) {
      subdirectories[sub] = `${basePrefix}/${sub}`;
    }

    return {
      platform: 'android',
      rootPath: basePrefix,
      mode: saf.uri ? 'android-saf' : 'android-appdata',
      safTreeUri: saf.uri,
      safTreeLabel: saf.label,
      folderAccessValid: saf.uri ? folderAccessValid : true,
      folderAccessRevoked,
      subdirectories,
    };
  }

  async ensureStorageDirectories(): Promise<StorageLocationInfo> {
    const dir = await this.resolveWritableDirectory();
    for (const sub of STORAGE_SUBDIRS) {
      try {
        await Filesystem.mkdir({
          path: `${ROOT_FOLDER_NAME}/${sub}`,
          directory: dir,
          recursive: true,
        });
      } catch {
        // Directory may already exist
      }
    }
    const status = await checkAndroidDirectoryAccess(true);
    if (status?.safTreePersisted && status.safTreeUri) {
      try {
        await WoaStorage.ensureAppFolderStructure({ treeUri: status.safTreeUri });
      } catch {
        // Handled by status check
      }
    }
    return this.getStorageInfo();
  }

  async pickImportFiles(options?: PickFilesOptions): Promise<File[]> {
    const operation = inferImportOperationFromAccept(options?.accept);
    await ensureAndroidOperationAccess(operation);

    try {
      const res = await WoaStorage.pickFiles({
        mimeTypes: ['*/*'],
        multiple: Boolean(options?.multiple),
      });
      if (res.cancelled || !res.files || res.files.length === 0) {
        return [];
      }
      return res.files.map((entry) => {
        recordPersistedImportGrant(entry);
        const buf = base64ToArrayBuffer(entry.base64);
        return new File([buf], entry.name, {
          type: entry.mimeType || 'application/octet-stream',
        });
      });
    } catch (err) {
      if (err instanceof AndroidAccessDeniedError) {
        throw err;
      }
      const classified = classifyAndroidNativeError(err);
      if (classified.code === 'PICKER_UNAVAILABLE') {
        return await new Promise<File[]>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          if (options?.multiple) input.multiple = true;
          if (options?.accept?.length) input.accept = options.accept.join(',');
          input.onchange = () => {
            resolve(input.files ? Array.from(input.files) : []);
          };
          input.click();
        });
      }
      const issue = reportAndroidAccessError(operation, err);
      throw new AndroidAccessDeniedError(
        operation,
        issue.message,
        issue.permanentlyDenied,
        issue.code
      );
    }
  }

  async pickStorageDirectory(): Promise<PickDirectoryResult | null> {
    await ensureAndroidOperationAccess('pick-directory');

    try {
      const res = await WoaStorage.pickDirectory();
      if (res.cancelled || !res.uri) return null;
      const label = res.label || ROOT_FOLDER_NAME;
      this.syncSafLocalState(res.uri, label);
      clearAndroidAccessIssue();

      const existingConfig =
        (await this.syncLoadStorageConfig()) ?? createDefaultStorageConfig();
      await this.syncSaveStorageConfig({
        ...existingConfig,
        safTreeUri: res.uri,
        safTreeLabel: label,
        folderAccessValid: true,
        folderAccessRevoked: false,
        firstTimeSetupPrompted: true,
        updatedAt: new Date().toISOString(),
      });

      return {
        uri: res.uri,
        label,
      };
    } catch (err) {
      if (err instanceof AndroidAccessDeniedError) {
        throw err;
      }
      const issue = reportAndroidAccessError('pick-directory', err);
      throw new AndroidAccessDeniedError(
        'pick-directory',
        issue.message,
        issue.permanentlyDenied,
        issue.code
      );
    }
  }

  async clearStorageDirectory(): Promise<void> {
    try {
      await WoaStorage.clearPersistedDirectory();
    } catch {
      // Ignore native clear error if no persisted URI
    }
    this.syncSafLocalState(null, null);
    clearAndroidAccessIssue();
    const existingConfig =
      (await this.syncLoadStorageConfig()) ?? createDefaultStorageConfig();
    await this.syncSaveStorageConfig({
      ...existingConfig,
      safTreeUri: null,
      safTreeLabel: null,
      folderAccessValid: false,
      folderAccessRevoked: false,
      updatedAt: new Date().toISOString(),
    });
  }

  async exportFileExists(
    fileName: string,
    subdir: StorageSubdir = 'Exports'
  ): Promise<boolean> {
    const safeName = sanitizeKeySegment(fileName);
    const treeUri = await this.getValidSafTreeUri();
    if (treeUri) {
      try {
        const res = await WoaStorage.treeEntryExists({
          treeUri,
          relativePath: `${subdir}/${safeName}`,
        });
        if (res.exists) return true;
      } catch {
        // Fallback to app-private directory check
      }
    }

    const dir = await this.resolveWritableDirectory();
    try {
      await Filesystem.stat({
        path: `${ROOT_FOLDER_NAME}/${subdir}/${safeName}`,
        directory: dir,
      });
      return true;
    } catch {
      return false;
    }
  }

  async saveExportFile(options: SaveExportOptions): Promise<SaveExportResult> {
    const targetSubdir: StorageSubdir = options.subdir ?? 'Exports';
    const baseSafeName = sanitizeKeySegment(options.fileName) || 'export.woamod';
    const isBackup =
      baseSafeName.toLowerCase().endsWith('.woabackup.json') ||
      baseSafeName.toLowerCase().endsWith('.woaproj.zip');
    const operation = isBackup ? 'backup-export' : 'export-mod';

    await ensureAndroidOperationAccess(operation);

    const buffer = await options.blob.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const mimeType = options.mimeType || options.blob.type || 'application/octet-stream';

    // Interactive Save As... (ACTION_CREATE_DOCUMENT) when requested explicitly
    if (options.promptSaveDialog === true) {
      try {
        const res = await WoaStorage.saveExportDocument({
          fileName: baseSafeName,
          mimeType,
          base64,
        });
        if (res.cancelled) {
          return { saved: false, cancelled: true, locationLabel: '' };
        }
        if (res.saved) {
          return {
            saved: true,
            fileName: res.label || baseSafeName,
            directoryLabel: res.label || baseSafeName,
            filePath: res.uri || `${ROOT_FOLDER_NAME}/${targetSubdir}/${baseSafeName}`,
            locationLabel: res.label || baseSafeName,
          };
        }
      } catch (err) {
        const classified = classifyAndroidNativeError(err);
        if (classified.code !== 'PICKER_UNAVAILABLE') {
          const issue = reportAndroidAccessError(operation, err);
          throw new AndroidAccessDeniedError(
            operation,
            issue.message,
            issue.permanentlyDenied,
            issue.code
          );
        }
      }
    }

    // First-time shared folder setup on Android before saving to dedicated Exports/ folder
    await this.ensureFirstTimeStorageSetup();

    let finalName = baseSafeName;
    const conflictResolution = options.conflictResolution ?? 'ask';
    const alreadyExists = await this.exportFileExists(finalName, targetSubdir);

    if (alreadyExists) {
      const suggestedName = await generateUniqueFilename(finalName, (candidate) =>
        this.exportFileExists(candidate, targetSubdir)
      );
      if (conflictResolution === 'ask') {
        return {
          saved: false,
          conflict: true,
          existingName: finalName,
          suggestedName,
          fileName: finalName,
          directoryLabel: `${ROOT_FOLDER_NAME}/${targetSubdir}/`,
          locationLabel: `${ROOT_FOLDER_NAME}/${targetSubdir}/${finalName}`,
        };
      }
      if (conflictResolution === 'rename') {
        finalName = suggestedName;
      }
    }

    // Write atomically to dedicated app-private Exports/
    const exportRelPath = `${targetSubdir}/${finalName}`;
    await this.atomicWriteAppFile(exportRelPath, base64);

    // Write atomically to shared external SAF folder if configured
    const safStatus = await checkAndroidDirectoryAccess(true);
    if (safStatus?.safTreeRevoked) {
      reportAndroidSafRevoked(() => void this.pickStorageDirectory());
    } else if (safStatus?.safTreePersisted && safStatus.safTreeUri) {
      const safResult = await this.writeSafFileIfConnected(
        exportRelPath,
        mimeType,
        base64,
        true
      );
      if (safResult.revoked) {
        throw new AndroidAccessDeniedError(
          operation,
          undefined,
          false,
          'ACCESS_DENIED'
        );
      }
      return {
        saved: true,
        fileName: finalName,
        directoryLabel: `${ROOT_FOLDER_NAME}/${targetSubdir}/`,
        filePath: safResult.uri || `${ROOT_FOLDER_NAME}/${exportRelPath}`,
        locationLabel: `${ROOT_FOLDER_NAME}/${exportRelPath}`,
      };
    }

    return {
      saved: true,
      fileName: finalName,
      directoryLabel: `${ROOT_FOLDER_NAME}/${targetSubdir}/`,
      filePath: `${ROOT_FOLDER_NAME}/${exportRelPath}`,
      locationLabel: `${ROOT_FOLDER_NAME}/${exportRelPath}`,
    };
  }

  async openStorageFolder(subdir?: StorageSubdir): Promise<boolean> {
    const treeUri = await this.getValidSafTreeUri();
    if (treeUri) {
      try {
        const res = await WoaStorage.openTreeSubfolder({
          treeUri,
          subdir: subdir ?? '',
        });
        if (res.opened) return true;
      } catch {
        // Fallback to returning false so Settings can display the in-app directory browser
      }
      return false;
    }
    const picked = await this.pickStorageDirectory();
    return Boolean(picked);
  }

  async listSubdirEntries(
    subdir: StorageSubdir,
    relativePath = ''
  ): Promise<DedicatedFolderEntry[]> {
    const cleanRel = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const fullSubPath = cleanRel ? `${subdir}/${cleanRel}` : subdir;
    const entriesByName = new Map<string, DedicatedFolderEntry>();

    // Prefer live SAF listing when valid, merge app-private fallback
    const treeUri = await this.getValidSafTreeUri();
    if (treeUri) {
      try {
        const res = await WoaStorage.listTreeEntries({
          treeUri,
          relativeDir: fullSubPath,
        });
        for (const item of res.entries ?? []) {
          if (item.name.endsWith(TEMP_SUFFIX)) continue;
          entriesByName.set(item.name, {
            name: item.name,
            relativePath: cleanRel ? `${fullSubPath}/${item.name}` : `${subdir}/${item.name}`,
            isDirectory: Boolean(item.isDirectory),
            sizeBytes: item.sizeBytes,
            lastModified: item.lastModified
              ? new Date(item.lastModified).toISOString()
              : undefined,
            mimeType: item.mimeType,
            uri: item.uri,
          });
        }
      } catch {
        // Continue with app-private listing
      }
    }

    const dir = await this.resolveWritableDirectory();
    try {
      const listing = await Filesystem.readdir({
        path: `${ROOT_FOLDER_NAME}/${fullSubPath}`,
        directory: dir,
      });
      for (const item of listing.files) {
        if (item.name.endsWith(TEMP_SUFFIX)) continue;
        if (!entriesByName.has(item.name)) {
          entriesByName.set(item.name, {
            name: item.name,
            relativePath: `${fullSubPath}/${item.name}`,
            isDirectory: item.type === 'directory',
            sizeBytes: typeof item.size === 'number' ? item.size : undefined,
            lastModified:
              typeof item.mtime === 'number'
                ? new Date(item.mtime).toISOString()
                : undefined,
          });
        }
      }
    } catch {
      // Directory may be empty or absent
    }

    return Array.from(entriesByName.values()).sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  private async writeJsonFile(relativePath: string, payload: unknown): Promise<void> {
    const json = JSON.stringify(payload, null, 2);
    await this.atomicWriteAppFile(relativePath, json, Encoding.UTF8);
    await this.writeSafFileIfConnected(
      relativePath,
      'application/json',
      encodeUtf8ToBase64(json),
      true
    );
  }

  private async writeTextFile(relativePath: string, text: string, mimeType: string): Promise<void> {
    await this.atomicWriteAppFile(relativePath, text, Encoding.UTF8);
    await this.writeSafFileIfConnected(
      relativePath,
      mimeType,
      encodeUtf8ToBase64(text),
      true
    );
  }

  async syncSaveProject(project: ModProject): Promise<void> {
    const safeId = sanitizeKeySegment(project.id);
    const projectDir = `Projects/${safeId}`;

    // Canonical workspace snapshot inside project subfolder
    await this.writeJsonFile(`${projectDir}/.woa-project.json`, project);

    // Readable mod.json & mod.manifest.json in project folder root
    await this.writeJsonFile(`${projectDir}/mod.json`, {
      modId: project.manifest.modId,
      name: project.manifest.name,
      version: project.manifest.version,
      author: project.manifest.author,
      description: project.manifest.description,
      supportedGameVersion: project.manifest.supportedGameVersion,
      categories: project.manifest.categories,
      targetPlatforms: project.manifest.targetPlatforms,
      entryPoint: project.manifest.entryPoint,
      createdAt: project.manifest.createdAt,
      updatedAt: project.manifest.updatedAt,
    });
    await this.writeJsonFile(`${projectDir}/mod.manifest.json`, project.manifest);

    // Materialize data/, localization/, scripts/, and text .woa3d files inside project subfolder
    for (const file of project.files) {
      if (file.type === 'folder' || typeof file.content !== 'string') continue;
      const rel = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!rel || rel.includes('..')) continue;
      if (rel === 'mod.json' || rel === 'mod.manifest.json') continue;
      const mime = rel.endsWith('.json') || rel.endsWith('.woa3d')
        ? 'application/json'
        : 'text/plain';
      await this.writeTextFile(`${projectDir}/${rel}`, file.content, mime);
    }

    // Remove legacy flat file if one existed so directory listing stays canonical
    const dir = await this.resolveWritableDirectory();
    try {
      await Filesystem.deleteFile({
        path: `${ROOT_FOLDER_NAME}/Projects/${safeId}.woaproj.json`,
        directory: dir,
      });
    } catch {
      // No legacy file
    }
  }

  async syncRenameProject(oldModId: string, project: ModProject): Promise<void> {
    const oldSafe = sanitizeKeySegment(oldModId);
    const newSafe = sanitizeKeySegment(project.id);

    await this.syncSaveProject(project);

    if (oldSafe !== newSafe) {
      // Remove old folder & clean up orphaned flat file after new folder succeeds
      const dir = await this.resolveWritableDirectory();
      try {
        await Filesystem.rmdir({
          path: `${ROOT_FOLDER_NAME}/Projects/${oldSafe}`,
          directory: dir,
          recursive: true,
        });
      } catch {
        // Ignore if not present
      }
      const treeUri = await this.getValidSafTreeUri();
      if (treeUri) {
        try {
          await WoaStorage.deleteTreeEntry({
            treeUri,
            relativePath: `Projects/${oldSafe}`,
          });
        } catch {
          // Ignore SAF delete failure
        }
      }
    }
  }

  async syncDeleteProject(modId: string): Promise<void> {
    const dir = await this.resolveWritableDirectory();
    const safeId = sanitizeKeySegment(modId);

    for (const targetDir of [dir, Directory.Documents]) {
      try {
        await Filesystem.rmdir({
          path: `${ROOT_FOLDER_NAME}/Projects/${safeId}`,
          directory: targetDir,
          recursive: true,
        });
      } catch {
        // Ignore missing directory
      }
      try {
        await Filesystem.rmdir({
          path: `${ROOT_FOLDER_NAME}/Assets/${safeId}`,
          directory: targetDir,
          recursive: true,
        });
      } catch {
        // Ignore missing scoped assets directory
      }
      try {
        await Filesystem.deleteFile({
          path: `${ROOT_FOLDER_NAME}/Projects/${safeId}.woaproj.json`,
          directory: targetDir,
        });
      } catch {
        // ignore missing
      }
    }

    const treeUri = await this.getValidSafTreeUri();
    if (treeUri) {
      try {
        await WoaStorage.deleteTreeEntry({
          treeUri,
          relativePath: `Projects/${safeId}`,
        });
        await WoaStorage.deleteTreeEntry({
          treeUri,
          relativePath: `Assets/${safeId}`,
        });
      } catch {
        // ignore missing SAF directories
      }
    }
  }

  async syncListProjects(): Promise<ModProject[] | null> {
    const dir = await this.resolveWritableDirectory();
    const projectsById = new Map<string, ModProject>();

    // 1. Scan SAF folder if connected (discovers projects persisted externally even across reinstalls)
    const treeUri = await this.getValidSafTreeUri();
    if (treeUri) {
      try {
        const res = await WoaStorage.listTreeEntries({
          treeUri,
          relativeDir: 'Projects',
        });
        for (const entry of res.entries ?? []) {
          if (entry.name.endsWith(TEMP_SUFFIX)) continue;
          if (entry.isDirectory) {
            try {
              const file = await WoaStorage.readTreeFile({
                treeUri,
                relativePath: `Projects/${entry.name}/.woa-project.json`,
              });
              if (file.exists && file.base64) {
                const proj = JSON.parse(decodeBase64ToUtf8(file.base64)) as ModProject;
                if (proj?.id) projectsById.set(proj.id, proj);
              }
            } catch {
              // Skip unreadable project directory
            }
          } else if (entry.name.endsWith('.woaproj.json')) {
            try {
              const file = await WoaStorage.readTreeFile({
                treeUri,
                relativePath: `Projects/${entry.name}`,
              });
              if (file.exists && file.base64) {
                const proj = JSON.parse(decodeBase64ToUtf8(file.base64)) as ModProject;
                if (proj?.id) projectsById.set(proj.id, proj);
              }
            } catch {
              // Skip unreadable legacy file
            }
          }
        }
      } catch {
        // Continue with app-private Directory.Data scan
      }
    }

    // 2. Merge legacy Directory.Documents entries, then authoritative Directory.Data entries
    for (const sourceDir of [Directory.Documents, dir]) {
      try {
        const listing = await Filesystem.readdir({
          path: `${ROOT_FOLDER_NAME}/Projects`,
          directory: sourceDir,
        });
        for (const entry of listing.files) {
          if (entry.name.endsWith(TEMP_SUFFIX)) continue;
          if (entry.type === 'directory') {
            try {
              const read = await Filesystem.readFile({
                path: `${ROOT_FOLDER_NAME}/Projects/${entry.name}/.woa-project.json`,
                directory: sourceDir,
                encoding: Encoding.UTF8,
              });
              if (typeof read.data === 'string') {
                const proj = JSON.parse(read.data) as ModProject;
                if (proj?.id) projectsById.set(proj.id, proj);
              }
            } catch {
              // Not a valid project subfolder
            }
            continue;
          }
          if (!entry.name.endsWith('.woaproj.json')) continue;
          try {
            const read = await Filesystem.readFile({
              path: `${ROOT_FOLDER_NAME}/Projects/${entry.name}`,
              directory: sourceDir,
              encoding: Encoding.UTF8,
            });
            if (typeof read.data === 'string') {
              const proj = JSON.parse(read.data) as ModProject;
              if (proj?.id) projectsById.set(proj.id, proj);
            }
          } catch {
            // Skip corrupt project file
          }
        }
      } catch {
        // Directory may not exist or legacy Documents is inaccessible on Android 11+
      }
    }

    if (projectsById.size === 0) {
      return [];
    }

    return Array.from(projectsById.values()).sort(
      (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
    );
  }

  private getScopedAssetRelativePath(key: string): string {
    const { projectSegment, assetSegment } = parseScopedBlobKey(key);
    return projectSegment
      ? `Assets/${projectSegment}/${assetSegment}.b64`
      : `Assets/${assetSegment}.b64`;
  }

  async syncSaveAssetBlob(key: string, buffer: ArrayBuffer, mimeType: string): Promise<void> {
    const relPath = this.getScopedAssetRelativePath(key);
    const payloadJson = JSON.stringify({
      mimeType,
      base64: arrayBufferToBase64(buffer),
    });
    await this.atomicWriteAppFile(relPath, payloadJson, Encoding.UTF8);
    await this.writeSafFileIfConnected(
      relPath,
      'application/json',
      encodeUtf8ToBase64(payloadJson),
      true
    );
  }

  async syncGetAssetBlob(key: string): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
    const dir = await this.resolveWritableDirectory();
    const scopedPath = this.getScopedAssetRelativePath(key);
    const legacyFlatPath = `Assets/${sanitizeKeySegment(key)}.b64`;

    for (const relPath of [scopedPath, legacyFlatPath]) {
      for (const sourceDir of [dir, Directory.Documents]) {
        try {
          const read = await Filesystem.readFile({
            path: `${ROOT_FOLDER_NAME}/${relPath}`,
            directory: sourceDir,
            encoding: Encoding.UTF8,
          });
          if (typeof read.data !== 'string') continue;
          const parsed = JSON.parse(read.data) as { mimeType: string; base64: string };
          return {
            data: base64ToArrayBuffer(parsed.base64),
            mimeType: parsed.mimeType || 'application/octet-stream',
          };
        } catch {
          // Continue fallback lookup
        }
      }
    }

    // SAF tree fallback if local copy missing (e.g. restored folder after reinstall)
    const treeUri = await this.getValidSafTreeUri();
    if (treeUri) {
      for (const relPath of [scopedPath, legacyFlatPath]) {
        try {
          const file = await WoaStorage.readTreeFile({
            treeUri,
            relativePath: relPath,
          });
          if (file.exists && file.base64) {
            const parsed = JSON.parse(decodeBase64ToUtf8(file.base64)) as {
              mimeType: string;
              base64: string;
            };
            return {
              data: base64ToArrayBuffer(parsed.base64),
              mimeType: parsed.mimeType || 'application/octet-stream',
            };
          }
        } catch {
          // Continue
        }
      }
    }
    return null;
  }

  async syncDeleteAssetBlob(key: string): Promise<void> {
    const dir = await this.resolveWritableDirectory();
    const scopedPath = this.getScopedAssetRelativePath(key);
    const legacyFlatPath = `Assets/${sanitizeKeySegment(key)}.b64`;

    for (const relPath of [scopedPath, legacyFlatPath]) {
      for (const targetDir of [dir, Directory.Documents]) {
        try {
          await Filesystem.deleteFile({
            path: `${ROOT_FOLDER_NAME}/${relPath}`,
            directory: targetDir,
          });
        } catch {
          // ignore
        }
      }
    }

    const treeUri = await this.getValidSafTreeUri();
    if (treeUri) {
      try {
        await WoaStorage.deleteTreeEntry({
          treeUri,
          relativePath: scopedPath,
        });
      } catch {
        // ignore missing
      }
    }
  }

  async syncSaveBackup(record: ProjectBackupRecord): Promise<void> {
    const safeModId = sanitizeKeySegment(record.modId);
    const dir = await this.resolveWritableDirectory();
    const baseFolderName = formatBackupTimestampFolder(record.createdAt);
    let folderName = baseFolderName;

    // Avoid overwriting another distinct backup created in the same minute
    for (let i = 1; i < 50; i++) {
      const candidatePath = `${ROOT_FOLDER_NAME}/Backups/${safeModId}/${folderName}/backup.json`;
      try {
        const existing = await Filesystem.readFile({
          path: candidatePath,
          directory: dir,
          encoding: Encoding.UTF8,
        });
        if (typeof existing.data === 'string') {
          const parsed = JSON.parse(existing.data) as Partial<ProjectBackupRecord>;
          if (parsed.id && parsed.id !== record.id) {
            folderName = `${baseFolderName}-${String(i).padStart(2, '0')}`;
            continue;
          }
        }
      } catch {
        // Does not exist yet; safe to use
      }
      break;
    }

    await this.writeJsonFile(`Backups/${safeModId}/${folderName}/backup.json`, record);
  }

  async syncListBackups(modId?: string): Promise<ProjectBackupRecord[] | null> {
    const dir = await this.resolveWritableDirectory();
    const rowsById = new Map<string, ProjectBackupRecord>();

    const readStructuredBackupRoot = async (sourceDir: Directory) => {
      try {
        const rootListing = await Filesystem.readdir({
          path: `${ROOT_FOLDER_NAME}/Backups`,
          directory: sourceDir,
        });
        for (const entry of rootListing.files) {
          if (entry.name.endsWith(TEMP_SUFFIX)) continue;
          if (entry.type === 'directory') {
            if (modId && sanitizeKeySegment(modId) !== entry.name) continue;
            try {
              const subListing = await Filesystem.readdir({
                path: `${ROOT_FOLDER_NAME}/Backups/${entry.name}`,
                directory: sourceDir,
              });
              for (const bDir of subListing.files) {
                if (bDir.type !== 'directory' || bDir.name.endsWith(TEMP_SUFFIX)) continue;
                try {
                  const read = await Filesystem.readFile({
                    path: `${ROOT_FOLDER_NAME}/Backups/${entry.name}/${bDir.name}/backup.json`,
                    directory: sourceDir,
                    encoding: Encoding.UTF8,
                  });
                  if (typeof read.data === 'string') {
                    const parsed = JSON.parse(read.data) as ProjectBackupRecord;
                    if (parsed?.id && (!modId || parsed.modId === modId)) {
                      rowsById.set(parsed.id, parsed);
                    }
                  }
                } catch {
                  // skip corrupt backup folder
                }
              }
            } catch {
              // ignore unreadable project backup dir
            }
          } else if (entry.name.endsWith('.backup.json')) {
            try {
              const read = await Filesystem.readFile({
                path: `${ROOT_FOLDER_NAME}/Backups/${entry.name}`,
                directory: sourceDir,
                encoding: Encoding.UTF8,
              });
              if (typeof read.data === 'string') {
                const parsed = JSON.parse(read.data) as ProjectBackupRecord;
                if (parsed?.id && (!modId || parsed.modId === modId)) {
                  rowsById.set(parsed.id, parsed);
                }
              }
            } catch {
              // ignore corrupt legacy backup
            }
          }
        }
      } catch {
        // ignore missing directory
      }
    };

    await readStructuredBackupRoot(Directory.Documents);
    await readStructuredBackupRoot(dir);

    // Also scan SAF Backups/ folder when connected
    const treeUri = await this.getValidSafTreeUri();
    if (treeUri) {
      try {
        const modFolders = await WoaStorage.listTreeEntries({
          treeUri,
          relativeDir: 'Backups',
        });
        for (const mf of modFolders.entries ?? []) {
          if (!mf.isDirectory) continue;
          if (modId && sanitizeKeySegment(modId) !== mf.name) continue;
          const bFolders = await WoaStorage.listTreeEntries({
            treeUri,
            relativeDir: `Backups/${mf.name}`,
          });
          for (const bf of bFolders.entries ?? []) {
            if (!bf.isDirectory) continue;
            try {
              const file = await WoaStorage.readTreeFile({
                treeUri,
                relativePath: `Backups/${mf.name}/${bf.name}/backup.json`,
              });
              if (file.exists && file.base64) {
                const parsed = JSON.parse(
                  decodeBase64ToUtf8(file.base64)
                ) as ProjectBackupRecord;
                if (parsed?.id && (!modId || parsed.modId === modId)) {
                  rowsById.set(parsed.id, parsed);
                }
              }
            } catch {
              // skip invalid backup
            }
          }
        }
      } catch {
        // Continue with local backups
      }
    }

    return Array.from(rowsById.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async syncDeleteBackup(backupId: string): Promise<void> {
    const dir = await this.resolveWritableDirectory();
    const safeId = sanitizeKeySegment(backupId);

    for (const targetDir of [dir, Directory.Documents]) {
      try {
        await Filesystem.deleteFile({
          path: `${ROOT_FOLDER_NAME}/Backups/${safeId}.backup.json`,
          directory: targetDir,
        });
      } catch {
        // ignore legacy missing file
      }
      try {
        const rootListing = await Filesystem.readdir({
          path: `${ROOT_FOLDER_NAME}/Backups`,
          directory: targetDir,
        });
        for (const modEntry of rootListing.files) {
          if (modEntry.type !== 'directory') continue;
          const subListing = await Filesystem.readdir({
            path: `${ROOT_FOLDER_NAME}/Backups/${modEntry.name}`,
            directory: targetDir,
          });
          for (const bDir of subListing.files) {
            if (bDir.type !== 'directory') continue;
            try {
              const read = await Filesystem.readFile({
                path: `${ROOT_FOLDER_NAME}/Backups/${modEntry.name}/${bDir.name}/backup.json`,
                directory: targetDir,
                encoding: Encoding.UTF8,
              });
              if (typeof read.data === 'string') {
                const parsed = JSON.parse(read.data) as Partial<ProjectBackupRecord>;
                if (parsed.id === backupId) {
                  await Filesystem.rmdir({
                    path: `${ROOT_FOLDER_NAME}/Backups/${modEntry.name}/${bDir.name}`,
                    directory: targetDir,
                    recursive: true,
                  });
                }
              }
            } catch {
              // skip
            }
          }
        }
      } catch {
        // ignore missing directory
      }
    }

    const treeUri = await this.getValidSafTreeUri();
    if (treeUri) {
      try {
        const modFolders = await WoaStorage.listTreeEntries({
          treeUri,
          relativeDir: 'Backups',
        });
        for (const mf of modFolders.entries ?? []) {
          if (!mf.isDirectory) continue;
          const bFolders = await WoaStorage.listTreeEntries({
            treeUri,
            relativeDir: `Backups/${mf.name}`,
          });
          for (const bf of bFolders.entries ?? []) {
            if (!bf.isDirectory) continue;
            try {
              const file = await WoaStorage.readTreeFile({
                treeUri,
                relativePath: `Backups/${mf.name}/${bf.name}/backup.json`,
              });
              if (file.exists && file.base64) {
                const parsed = JSON.parse(
                  decodeBase64ToUtf8(file.base64)
                ) as Partial<ProjectBackupRecord>;
                if (parsed.id === backupId) {
                  await WoaStorage.deleteTreeEntry({
                    treeUri,
                    relativePath: `Backups/${mf.name}/${bf.name}`,
                  });
                }
              }
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  async syncSaveSettings(settings: EditorSettings): Promise<void> {
    await this.writeJsonFile('Settings/editor-settings.json', settings);
  }

  async syncLoadSettings(): Promise<EditorSettings | null> {
    const dir = await this.resolveWritableDirectory();
    for (const sourceDir of [dir, Directory.Documents]) {
      try {
        const read = await Filesystem.readFile({
          path: `${ROOT_FOLDER_NAME}/Settings/editor-settings.json`,
          directory: sourceDir,
          encoding: Encoding.UTF8,
        });
        if (typeof read.data === 'string') {
          return JSON.parse(read.data) as EditorSettings;
        }
      } catch {
        // continue fallback
      }
    }
    return null;
  }

  async syncSaveStorageConfig(config: StorageConfig): Promise<void> {
    try {
      localStorage.setItem(LS_STORAGE_CONFIG_KEY, JSON.stringify(config));
    } catch {
      // ignore localStorage failure
    }
    await this.writeJsonFile('Settings/storage-config.json', config);
  }

  async syncLoadStorageConfig(): Promise<StorageConfig | null> {
    const dir = await this.resolveWritableDirectory();
    try {
      const read = await Filesystem.readFile({
        path: `${ROOT_FOLDER_NAME}/Settings/storage-config.json`,
        directory: dir,
        encoding: Encoding.UTF8,
      });
      if (typeof read.data === 'string') {
        return JSON.parse(read.data) as StorageConfig;
      }
    } catch {
      // fallback to localStorage
    }
    try {
      const raw = localStorage.getItem(LS_STORAGE_CONFIG_KEY);
      if (raw) return JSON.parse(raw) as StorageConfig;
    } catch {
      // ignore
    }
    return null;
  }
}
