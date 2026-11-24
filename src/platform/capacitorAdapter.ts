import { registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type {
  EditorSettings,
  ModProject,
  ProjectBackupRecord,
} from '@/src/types/mod';
import {
  PickDirectoryResult,
  PickFilesOptions,
  PlatformBridge,
  SaveExportOptions,
  SaveExportResult,
  STORAGE_SUBDIRS,
  StorageLocationInfo,
  StorageSubdir,
} from './types';

interface WoaStorageNativePlugin {
  pickDirectory(): Promise<{ uri: string; label: string; cancelled?: boolean }>;
  pickFiles(options: {
    mimeTypes?: string[];
    multiple?: boolean;
  }): Promise<{
    files: Array<{ name: string; mimeType: string; base64: string }>;
  }>;
  saveExportDocument(options: {
    fileName: string;
    mimeType: string;
    base64: string;
  }): Promise<{ saved: boolean; uri?: string; label?: string; cancelled?: boolean }>;
  writeFileToTree(options: {
    treeUri: string;
    relativePath: string;
    mimeType: string;
    base64: string;
  }): Promise<{ saved: boolean; uri?: string }>;
}

const WoaStorage = registerPlugin<WoaStorageNativePlugin>('WoaStorage');

const ROOT_FOLDER_NAME = 'World of Adventure Mod Creator';
const LS_SAF_URI_KEY = 'woa_android_saf_tree_uri';
const LS_SAF_LABEL_KEY = 'woa_android_saf_tree_label';

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

function sanitizeKeySegment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.{2,}/g, '.');
}

export class CapacitorAndroidAdapter implements PlatformBridge {
  readonly platform = 'android' as const;
  private activeDirectory: Directory = Directory.Documents;
  private directoryResolved = false;

  private async resolveWritableDirectory(): Promise<Directory> {
    if (this.directoryResolved) {
      return this.activeDirectory;
    }
    try {
      await Filesystem.mkdir({
        path: ROOT_FOLDER_NAME,
        directory: Directory.Documents,
        recursive: true,
      });
      this.activeDirectory = Directory.Documents;
    } catch {
      // Android 11+ scoped storage fallback to app-private external/data storage
      await Filesystem.mkdir({
        path: ROOT_FOLDER_NAME,
        directory: Directory.Data,
        recursive: true,
      });
      this.activeDirectory = Directory.Data;
    }
    this.directoryResolved = true;
    return this.activeDirectory;
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

  async getStorageInfo(): Promise<StorageLocationInfo> {
    const dir = await this.resolveWritableDirectory();
    const saf = this.getSavedSafTree();
    const basePrefix =
      dir === Directory.Documents
        ? `Documents/${ROOT_FOLDER_NAME}`
        : `AppData/${ROOT_FOLDER_NAME}`;

    const subdirectories = {} as Record<StorageSubdir, string>;
    for (const sub of STORAGE_SUBDIRS) {
      subdirectories[sub] = `${basePrefix}/${sub}`;
    }

    return {
      platform: 'android',
      rootPath: saf.label ? `${saf.label} (${basePrefix})` : basePrefix,
      mode: saf.uri
        ? 'android-saf'
        : dir === Directory.Documents
          ? 'native-documents'
          : 'android-appdata',
      safTreeUri: saf.uri,
      safTreeLabel: saf.label,
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
    return this.getStorageInfo();
  }

  async pickImportFiles(options?: PickFilesOptions): Promise<File[]> {
    try {
      const res = await WoaStorage.pickFiles({
        mimeTypes: ['*/*'],
        multiple: Boolean(options?.multiple),
      });
      return (res.files ?? []).map((entry) => {
        const buf = base64ToArrayBuffer(entry.base64);
        return new File([buf], entry.name, {
          type: entry.mimeType || 'application/octet-stream',
        });
      });
    } catch {
      // Fallback to browser <input type="file"> inside Android WebView
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
  }

  async pickStorageDirectory(): Promise<PickDirectoryResult | null> {
    try {
      const res = await WoaStorage.pickDirectory();
      if (res.cancelled || !res.uri) return null;
      try {
        localStorage.setItem(LS_SAF_URI_KEY, res.uri);
        localStorage.setItem(LS_SAF_LABEL_KEY, res.label || 'Selected Folder');
      } catch {
        // ignore storage quota
      }
      return {
        uri: res.uri,
        label: res.label || 'Selected Folder',
      };
    } catch {
      return null;
    }
  }

  async saveExportFile(options: SaveExportOptions): Promise<SaveExportResult> {
    const buffer = await options.blob.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const mimeType = options.mimeType || options.blob.type || 'application/octet-stream';
    const safeName = sanitizeKeySegment(options.fileName) || 'export.woamod';

    // Always write a copy to Exports/ in app/documents folder
    const dir = await this.resolveWritableDirectory();
    const exportRelPath = `${ROOT_FOLDER_NAME}/Exports/${safeName}`;
    try {
      await Filesystem.mkdir({
        path: `${ROOT_FOLDER_NAME}/Exports`,
        directory: dir,
        recursive: true,
      });
      await Filesystem.writeFile({
        path: exportRelPath,
        data: base64,
        directory: dir,
      });
    } catch {
      // non-fatal if scoped directory write is blocked
    }

    // Mirror into user-selected SAF tree if configured
    const saf = this.getSavedSafTree();
    if (saf.uri) {
      try {
        await WoaStorage.writeFileToTree({
          treeUri: saf.uri,
          relativePath: `Exports/${safeName}`,
          mimeType,
          base64,
        });
      } catch {
        // ignore and continue to SAF Save Document / Share sheet
      }
    }

    // If user requested interactive save or we want user-visible export via SAF CREATE_DOCUMENT
    if (options.promptSaveDialog) {
      try {
        const res = await WoaStorage.saveExportDocument({
          fileName: safeName,
          mimeType,
          base64,
        });
        if (res.cancelled) {
          return { saved: false, cancelled: true, locationLabel: '' };
        }
        if (res.saved) {
          return {
            saved: true,
            filePath: res.uri || exportRelPath,
            locationLabel: res.label || safeName,
          };
        }
      } catch {
        // fall through to share sheet
      }
    }

    // Also offer native Android Share sheet using cached file URI when available
    try {
      const cacheName = `share_${Date.now()}_${safeName}`;
      await Filesystem.writeFile({
        path: cacheName,
        data: base64,
        directory: Directory.Cache,
      });
      const uriResult = await Filesystem.getUri({
        path: cacheName,
        directory: Directory.Cache,
      });
      await Share.share({
        title: safeName,
        url: uriResult.uri,
        dialogTitle: safeName,
      });
      return {
        saved: true,
        filePath: exportRelPath,
        locationLabel: `${ROOT_FOLDER_NAME}/Exports/${safeName}`,
      };
    } catch {
      return {
        saved: true,
        filePath: exportRelPath,
        locationLabel: `${ROOT_FOLDER_NAME}/Exports/${safeName}`,
      };
    }
  }

  async openStorageFolder(): Promise<boolean> {
    const picked = await this.pickStorageDirectory();
    return Boolean(picked);
  }

  private async writeJsonFile(subdir: StorageSubdir, fileName: string, payload: unknown): Promise<void> {
    const dir = await this.resolveWritableDirectory();
    const json = JSON.stringify(payload, null, 2);
    await Filesystem.mkdir({
      path: `${ROOT_FOLDER_NAME}/${subdir}`,
      directory: dir,
      recursive: true,
    });
    await Filesystem.writeFile({
      path: `${ROOT_FOLDER_NAME}/${subdir}/${fileName}`,
      data: json,
      directory: dir,
      encoding: Encoding.UTF8,
    });

    const saf = this.getSavedSafTree();
    if (saf.uri) {
      try {
        const encoded = new TextEncoder().encode(json);
        await WoaStorage.writeFileToTree({
          treeUri: saf.uri,
          relativePath: `${subdir}/${fileName}`,
          mimeType: 'application/json',
          base64: arrayBufferToBase64(encoded.buffer),
        });
      } catch {
        // Non-blocking SAF mirror
      }
    }
  }

  async syncSaveProject(project: ModProject): Promise<void> {
    const safeId = sanitizeKeySegment(project.id);
    await this.writeJsonFile('Projects', `${safeId}.woaproj.json`, project);
  }

  async syncDeleteProject(modId: string): Promise<void> {
    const dir = await this.resolveWritableDirectory();
    const safeId = sanitizeKeySegment(modId);
    try {
      await Filesystem.deleteFile({
        path: `${ROOT_FOLDER_NAME}/Projects/${safeId}.woaproj.json`,
        directory: dir,
      });
    } catch {
      // ignore missing
    }
  }

  async syncListProjects(): Promise<ModProject[] | null> {
    try {
      const dir = await this.resolveWritableDirectory();
      const listing = await Filesystem.readdir({
        path: `${ROOT_FOLDER_NAME}/Projects`,
        directory: dir,
      });
      const projects: ModProject[] = [];
      for (const entry of listing.files) {
        if (!entry.name.endsWith('.woaproj.json')) continue;
        const read = await Filesystem.readFile({
          path: `${ROOT_FOLDER_NAME}/Projects/${entry.name}`,
          directory: dir,
          encoding: Encoding.UTF8,
        });
        if (typeof read.data === 'string') {
          projects.push(JSON.parse(read.data) as ModProject);
        }
      }
      return projects.sort(
        (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
      );
    } catch {
      return null;
    }
  }

  async syncSaveAssetBlob(key: string, buffer: ArrayBuffer, mimeType: string): Promise<void> {
    const dir = await this.resolveWritableDirectory();
    const safeKey = sanitizeKeySegment(key);
    await Filesystem.mkdir({
      path: `${ROOT_FOLDER_NAME}/Assets`,
      directory: dir,
      recursive: true,
    });
    await Filesystem.writeFile({
      path: `${ROOT_FOLDER_NAME}/Assets/${safeKey}.b64`,
      data: JSON.stringify({
        mimeType,
        base64: arrayBufferToBase64(buffer),
      }),
      directory: dir,
      encoding: Encoding.UTF8,
    });
  }

  async syncGetAssetBlob(key: string): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
    try {
      const dir = await this.resolveWritableDirectory();
      const safeKey = sanitizeKeySegment(key);
      const read = await Filesystem.readFile({
        path: `${ROOT_FOLDER_NAME}/Assets/${safeKey}.b64`,
        directory: dir,
        encoding: Encoding.UTF8,
      });
      if (typeof read.data !== 'string') return null;
      const parsed = JSON.parse(read.data) as { mimeType: string; base64: string };
      return {
        data: base64ToArrayBuffer(parsed.base64),
        mimeType: parsed.mimeType || 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  async syncDeleteAssetBlob(key: string): Promise<void> {
    const dir = await this.resolveWritableDirectory();
    const safeKey = sanitizeKeySegment(key);
    try {
      await Filesystem.deleteFile({
        path: `${ROOT_FOLDER_NAME}/Assets/${safeKey}.b64`,
        directory: dir,
      });
    } catch {
      // ignore
    }
  }

  async syncSaveBackup(record: ProjectBackupRecord): Promise<void> {
    const safeId = sanitizeKeySegment(record.id);
    await this.writeJsonFile('Backups', `${safeId}.backup.json`, record);
  }

  async syncListBackups(modId?: string): Promise<ProjectBackupRecord[] | null> {
    try {
      const dir = await this.resolveWritableDirectory();
      const listing = await Filesystem.readdir({
        path: `${ROOT_FOLDER_NAME}/Backups`,
        directory: dir,
      });
      const rows: ProjectBackupRecord[] = [];
      for (const entry of listing.files) {
        if (!entry.name.endsWith('.backup.json')) continue;
        const read = await Filesystem.readFile({
          path: `${ROOT_FOLDER_NAME}/Backups/${entry.name}`,
          directory: dir,
          encoding: Encoding.UTF8,
        });
        if (typeof read.data === 'string') {
          const parsed = JSON.parse(read.data) as ProjectBackupRecord;
          if (!modId || parsed.modId === modId) {
            rows.push(parsed);
          }
        }
      }
      return rows.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return null;
    }
  }

  async syncDeleteBackup(backupId: string): Promise<void> {
    const dir = await this.resolveWritableDirectory();
    const safeId = sanitizeKeySegment(backupId);
    try {
      await Filesystem.deleteFile({
        path: `${ROOT_FOLDER_NAME}/Backups/${safeId}.backup.json`,
        directory: dir,
      });
    } catch {
      // ignore
    }
  }

  async syncSaveSettings(settings: EditorSettings): Promise<void> {
    await this.writeJsonFile('Settings', 'editor-settings.json', settings);
  }

  async syncLoadSettings(): Promise<EditorSettings | null> {
    try {
      const dir = await this.resolveWritableDirectory();
      const read = await Filesystem.readFile({
        path: `${ROOT_FOLDER_NAME}/Settings/editor-settings.json`,
        directory: dir,
        encoding: Encoding.UTF8,
      });
      if (typeof read.data !== 'string') return null;
      return JSON.parse(read.data) as EditorSettings;
    } catch {
      return null;
    }
  }
}
