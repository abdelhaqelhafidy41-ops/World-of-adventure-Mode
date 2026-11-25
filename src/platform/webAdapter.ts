import {
  createDefaultStorageConfig,
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

const LS_WEB_STORAGE_CONFIG_KEY = 'woa_web_storage_config_v1';

function makeBrowserInputFilePicker(options?: PickFilesOptions): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve([]);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.multiple) {
      input.multiple = true;
    }
    if (options?.accept && options.accept.length > 0) {
      input.accept = options.accept.join(',');
    }
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = () => {
      settled = true;
      const files = input.files ? Array.from(input.files) : [];
      cleanup();
      resolve(files);
    };

    window.addEventListener(
      'focus',
      () => {
        window.setTimeout(() => {
          if (!settled) {
            cleanup();
            resolve([]);
          }
        }, 400);
      },
      { once: true }
    );

    input.click();
  });
}

function triggerBrowserBlobDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class WebPlatformAdapter implements PlatformBridge {
  readonly platform = 'web' as const;

  async getStorageInfo(): Promise<StorageLocationInfo> {
    const subdirectories = {} as Record<StorageSubdir, string>;
    for (const dir of STORAGE_SUBDIRS) {
      subdirectories[dir] = `IndexedDB://woa_mod_creator_db/${dir}`;
    }
    return {
      platform: 'web',
      rootPath: 'Browser IndexedDB (woa_mod_creator_db)',
      mode: 'browser-indexeddb',
      folderAccessValid: true,
      folderAccessRevoked: false,
      subdirectories,
    };
  }

  async ensureStorageDirectories(): Promise<StorageLocationInfo> {
    return this.getStorageInfo();
  }

  async checkStorageFolderAccess(): Promise<StorageAccessCheckResult> {
    return {
      valid: true,
      revoked: false,
      mode: 'browser-indexeddb',
      rootPath: 'Browser IndexedDB (woa_mod_creator_db)',
    };
  }

  async ensureFirstTimeStorageSetup(): Promise<boolean> {
    return true;
  }

  async pickImportFiles(options?: PickFilesOptions): Promise<File[]> {
    if (typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function') {
      try {
        const extensions = (options?.accept ?? []).filter((e) => e.startsWith('.'));
        const handles = await window.showOpenFilePicker({
          multiple: Boolean(options?.multiple),
          ...(extensions.length > 0
            ? {
                types: [
                  {
                    description: options?.title || 'Mod Files & Assets',
                    accept: { 'application/octet-stream': extensions },
                  },
                ],
              }
            : {}),
        });
        const files = await Promise.all(handles.map((h) => h.getFile()));
        return files;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return [];
        }
        // Fallback to classic input picker if File System Access API fails inside sandboxed iframe
      }
    }
    return makeBrowserInputFilePicker(options);
  }

  async pickStorageDirectory(): Promise<PickDirectoryResult | null> {
    return null;
  }

  async saveExportFile(options: SaveExportOptions): Promise<SaveExportResult> {
    const { fileName, blob, promptSaveDialog } = options;

    if (
      promptSaveDialog &&
      typeof window !== 'undefined' &&
      typeof window.showSaveFilePicker === 'function'
    ) {
      try {
        const extMatch = /\.[^.]+$/.exec(fileName);
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          ...(extMatch
            ? {
                types: [
                  {
                    description: 'World of Adventure Package',
                    accept: {
                      [options.mimeType || 'application/octet-stream']: [extMatch[0]],
                    },
                  },
                ],
              }
            : {}),
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return {
          saved: true,
          locationLabel: fileName,
          filePath: fileName,
          fileName,
          directoryLabel: 'Selected Folder',
        };
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return { saved: false, cancelled: true, locationLabel: '' };
        }
        // Fallback to blob download below
      }
    }

    triggerBrowserBlobDownload(fileName, blob);
    return {
      saved: true,
      locationLabel: fileName,
      filePath: fileName,
      fileName,
      directoryLabel: 'Browser Downloads',
    };
  }

  async exportFileExists(): Promise<boolean> {
    return false;
  }

  async listSubdirEntries(): Promise<DedicatedFolderEntry[]> {
    return [];
  }

  async openStorageFolder(): Promise<boolean> {
    return false;
  }

  async syncSaveProject(): Promise<void> {}
  async syncRenameProject(): Promise<void> {}
  async syncDeleteProject(): Promise<void> {}
  async syncListProjects() {
    return null;
  }
  async syncSaveAssetBlob(): Promise<void> {}
  async syncGetAssetBlob() {
    return null;
  }
  async syncDeleteAssetBlob(): Promise<void> {}
  async syncSaveBackup(): Promise<void> {}
  async syncListBackups() {
    return null;
  }
  async syncDeleteBackup(): Promise<void> {}
  async syncSaveSettings(): Promise<void> {}
  async syncLoadSettings() {
    return null;
  }
  async syncSaveStorageConfig(config: StorageConfig): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LS_WEB_STORAGE_CONFIG_KEY, JSON.stringify(config));
      }
    } catch {
      // ignore
    }
  }
  async syncLoadStorageConfig(): Promise<StorageConfig | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(LS_WEB_STORAGE_CONFIG_KEY);
        if (raw) {
          return {
            ...createDefaultStorageConfig(),
            ...(JSON.parse(raw) as Partial<StorageConfig>),
          };
        }
      }
    } catch {
      // ignore
    }
    return null;
  }
}
