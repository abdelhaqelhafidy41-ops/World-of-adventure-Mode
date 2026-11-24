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

function getBridge() {
  if (typeof window === 'undefined' || !window.woaDesktop) {
    throw new Error('Windows Electron bridge is unavailable.');
  }
  return window.woaDesktop;
}

export class ElectronWindowsAdapter implements PlatformBridge {
  readonly platform = 'windows' as const;

  async getStorageInfo(): Promise<StorageLocationInfo> {
    return getBridge().getStorageInfo();
  }

  async ensureStorageDirectories(): Promise<StorageLocationInfo> {
    return getBridge().ensureStorageDirectories();
  }

  async pickImportFiles(options?: PickFilesOptions): Promise<File[]> {
    const extensions = (options?.accept ?? [])
      .map((ext) => ext.replace(/^\./, '').trim())
      .filter(Boolean);
    const picked = await getBridge().openFilesDialog({
      title: options?.title,
      extensions,
      multiple: Boolean(options?.multiple),
    });

    return picked.map((entry) => {
      const bytes = new Uint8Array(entry.data);
      return new File([bytes], entry.name, {
        type: entry.mimeType || 'application/octet-stream',
      });
    });
  }

  async pickStorageDirectory(): Promise<PickDirectoryResult | null> {
    return getBridge().openDirectoryDialog();
  }

  async saveExportFile(options: SaveExportOptions): Promise<SaveExportResult> {
    const buffer = await options.blob.arrayBuffer();
    const res = await getBridge().saveExportFile({
      fileName: options.fileName,
      data: new Uint8Array(buffer),
      promptDialog: options.promptSaveDialog,
    });
    if (res.cancelled) {
      return { saved: false, cancelled: true, locationLabel: '' };
    }
    return {
      saved: res.saved,
      filePath: res.filePath,
      locationLabel: res.filePath || options.fileName,
    };
  }

  async openStorageFolder(subdir?: StorageSubdir): Promise<boolean> {
    return getBridge().openStorageFolder(subdir);
  }

  async syncSaveProject(project: ModProject): Promise<void> {
    await getBridge().writeProject(project);
  }

  async syncDeleteProject(modId: string): Promise<void> {
    await getBridge().deleteProject(modId);
  }

  async syncListProjects(): Promise<ModProject[] | null> {
    try {
      return await getBridge().listProjects();
    } catch {
      return null;
    }
  }

  async syncSaveAssetBlob(
    key: string,
    buffer: ArrayBuffer,
    mimeType: string
  ): Promise<void> {
    await getBridge().writeAssetBlob(key, new Uint8Array(buffer), mimeType);
  }

  async syncGetAssetBlob(
    key: string
  ): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
    const rec = await getBridge().readAssetBlob(key);
    if (!rec) return null;
    const copy = new Uint8Array(rec.data).buffer;
    return { data: copy, mimeType: rec.mimeType };
  }

  async syncDeleteAssetBlob(key: string): Promise<void> {
    await getBridge().deleteAssetBlob(key);
  }

  async syncSaveBackup(record: ProjectBackupRecord): Promise<void> {
    await getBridge().writeBackup(record);
  }

  async syncListBackups(modId?: string): Promise<ProjectBackupRecord[] | null> {
    try {
      return await getBridge().listBackups(modId);
    } catch {
      return null;
    }
  }

  async syncDeleteBackup(backupId: string): Promise<void> {
    await getBridge().deleteBackup(backupId);
  }

  async syncSaveSettings(settings: EditorSettings): Promise<void> {
    await getBridge().writeSettings(settings);
  }

  async syncLoadSettings(): Promise<EditorSettings | null> {
    try {
      return await getBridge().readSettings();
    } catch {
      return null;
    }
  }
}

export function buildFallbackWindowsStorageInfo(): StorageLocationInfo {
  const root = '%USERPROFILE%\\Documents\\World of Adventure Mod Creator';
  const subdirectories = {} as Record<StorageSubdir, string>;
  for (const dir of STORAGE_SUBDIRS) {
    subdirectories[dir] = `${root}\\${dir}`;
  }
  return {
    platform: 'windows',
    rootPath: root,
    mode: 'native-documents',
    subdirectories,
  };
}
