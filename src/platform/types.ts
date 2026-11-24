import type {
  EditorSettings,
  ModProject,
  ProjectBackupRecord,
} from '@/src/types/mod';

export type RuntimePlatform = 'windows' | 'android' | 'web';
export type DeviceFormFactor = 'phone' | 'tablet' | 'desktop';

export const STORAGE_SUBDIRS = [
  'Projects',
  'Templates',
  'Assets',
  'Exports',
  'Backups',
  'Settings',
] as const;

export type StorageSubdir = (typeof STORAGE_SUBDIRS)[number];

export interface StorageLocationInfo {
  platform: RuntimePlatform;
  rootPath: string;
  mode: 'native-documents' | 'android-saf' | 'android-appdata' | 'browser-indexeddb';
  safTreeUri?: string | null;
  safTreeLabel?: string | null;
  subdirectories: Record<StorageSubdir, string>;
}

export interface PlatformCapabilities {
  platform: RuntimePlatform;
  hasNativeFilesystem: boolean;
  hasNativeDialogs: boolean;
  hasStorageAccessFramework: boolean;
  hasDragAndDrop: boolean;
  hasKeyboardShortcuts: boolean;
  hasWindowControls: boolean;
  supportsHardwareBack: boolean;
  supportsShareSheet: boolean;
  isTouchPrimary: boolean;
}

export interface PlatformInfo extends PlatformCapabilities {
  formFactor: DeviceFormFactor;
  viewportWidth: number;
  viewportHeight: number;
  isPortrait: boolean;
}

export interface PickFilesOptions {
  accept?: string[];
  multiple?: boolean;
  title?: string;
}

export interface SaveExportOptions {
  fileName: string;
  blob: Blob;
  mimeType?: string;
  promptSaveDialog?: boolean;
}

export interface SaveExportResult {
  saved: boolean;
  locationLabel: string;
  filePath?: string;
  cancelled?: boolean;
}

export interface PickDirectoryResult {
  uri: string;
  label: string;
}

export interface PlatformStorageSnapshot {
  projects?: ModProject[];
  backups?: ProjectBackupRecord[];
  settings?: EditorSettings;
}

export interface PlatformBridge {
  readonly platform: RuntimePlatform;
  getStorageInfo(): Promise<StorageLocationInfo>;
  ensureStorageDirectories(): Promise<StorageLocationInfo>;
  pickImportFiles(options?: PickFilesOptions): Promise<File[]>;
  pickStorageDirectory(): Promise<PickDirectoryResult | null>;
  saveExportFile(options: SaveExportOptions): Promise<SaveExportResult>;
  openStorageFolder(subdir?: StorageSubdir): Promise<boolean>;

  // Native persistence sync helpers (no-ops on pure Web where IndexedDB is authoritative)
  syncSaveProject(project: ModProject): Promise<void>;
  syncDeleteProject(modId: string): Promise<void>;
  syncListProjects(): Promise<ModProject[] | null>;
  syncSaveAssetBlob(key: string, buffer: ArrayBuffer, mimeType: string): Promise<void>;
  syncGetAssetBlob(key: string): Promise<{ data: ArrayBuffer; mimeType: string } | null>;
  syncDeleteAssetBlob(key: string): Promise<void>;
  syncSaveBackup(record: ProjectBackupRecord): Promise<void>;
  syncListBackups(modId?: string): Promise<ProjectBackupRecord[] | null>;
  syncDeleteBackup(backupId: string): Promise<void>;
  syncSaveSettings(settings: EditorSettings): Promise<void>;
  syncLoadSettings(): Promise<EditorSettings | null>;
}

export interface WoaDesktopBridge {
  platform: 'windows';
  version: string;
  getStorageInfo(): Promise<StorageLocationInfo>;
  ensureStorageDirectories(): Promise<StorageLocationInfo>;
  openStorageFolder(subdir?: StorageSubdir): Promise<boolean>;
  listProjects(): Promise<ModProject[]>;
  writeProject(project: ModProject): Promise<void>;
  deleteProject(modId: string): Promise<void>;
  writeAssetBlob(key: string, data: Uint8Array, mimeType: string): Promise<void>;
  readAssetBlob(key: string): Promise<{ data: Uint8Array; mimeType: string } | null>;
  deleteAssetBlob(key: string): Promise<void>;
  writeBackup(record: ProjectBackupRecord): Promise<void>;
  listBackups(modId?: string): Promise<ProjectBackupRecord[]>;
  deleteBackup(backupId: string): Promise<void>;
  writeSettings(settings: EditorSettings): Promise<void>;
  readSettings(): Promise<EditorSettings | null>;
  saveExportFile(payload: {
    fileName: string;
    data: Uint8Array;
    promptDialog?: boolean;
  }): Promise<{ saved: boolean; filePath?: string; cancelled?: boolean }>;
  openFilesDialog(options: {
    title?: string;
    extensions?: string[];
    multiple?: boolean;
  }): Promise<Array<{ name: string; mimeType: string; data: Uint8Array }>>;
  openDirectoryDialog(): Promise<{ uri: string; label: string } | null>;
  showItemInFolder(filePath: string): Promise<boolean>;
}

declare global {
  interface Window {
    woaDesktop?: WoaDesktopBridge;
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<Array<{ getFile(): Promise<File> }>>;
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable(): Promise<{
        write(data: Blob): Promise<void>;
        close(): Promise<void>;
      }>;
    }>;
  }
}
