import { registerPlugin } from '@capacitor/core';

export interface WoaStorageAccessStatusResponse {
  sdkInt: number;
  release: string;
  usesScopedStorage: boolean;
  isAndroid13Plus: boolean;
  requiresLegacyStoragePermission: boolean;
  legacyReadGranted: boolean;
  legacyWriteGranted: boolean;
  legacyReadPermanentlyDenied: boolean;
  legacyWritePermanentlyDenied: boolean;
  safTreeUri?: string | null;
  safTreeLabel?: string | null;
  safTreePersisted: boolean;
  safTreeAccessValid?: boolean;
  safTreeRevoked?: boolean;
  persistedFilesCount: number;
  appFilesDir: string;
}

export interface WoaOperationAccessResponse extends WoaStorageAccessStatusResponse {
  granted: boolean;
  requiresPermission: boolean;
  permanentlyDenied: boolean;
  mechanism: 'app-private' | 'saf' | 'legacy-runtime';
}

export interface WoaPickedFileEntry {
  name: string;
  mimeType: string;
  uri?: string;
  persisted?: boolean;
  base64: string;
}

export interface WoaTreeFileEntry {
  name: string;
  mimeType: string;
  uri: string;
}

export interface WoaTreeEntry {
  name: string;
  isDirectory: boolean;
  mimeType: string;
  uri: string;
  sizeBytes?: number;
  lastModified?: number;
}

export interface WoaStorageNativePlugin {
  getStorageAccessStatus(): Promise<WoaStorageAccessStatusResponse>;
  checkDirectoryAccess(options?: {
    ensureStructure?: boolean;
  }): Promise<WoaStorageAccessStatusResponse>;
  ensureAppFolderStructure(options?: {
    treeUri?: string;
  }): Promise<WoaStorageAccessStatusResponse>;
  requestOperationAccess(options: {
    operation: string;
    requireLegacyExternal?: boolean;
  }): Promise<WoaOperationAccessResponse>;
  openAppSettings(): Promise<{ opened: boolean }>;
  pickDirectory(): Promise<{
    uri?: string;
    label?: string;
    persisted?: boolean;
    cancelled?: boolean;
  }>;
  clearPersistedDirectory(): Promise<{ cleared: boolean }>;
  pickFiles(options: {
    mimeTypes?: string[];
    multiple?: boolean;
  }): Promise<{
    cancelled?: boolean;
    files: WoaPickedFileEntry[];
  }>;
  readDocumentUri(options: { uri: string }): Promise<WoaPickedFileEntry>;
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
    overwrite?: boolean;
  }): Promise<{ saved: boolean; exists?: boolean; uri?: string }>;
  readTreeFile(options: {
    treeUri: string;
    relativePath: string;
  }): Promise<{
    exists: boolean;
    name?: string;
    mimeType?: string;
    uri?: string;
    base64?: string;
  }>;
  treeEntryExists(options: {
    treeUri: string;
    relativePath: string;
  }): Promise<{
    exists: boolean;
    isDirectory?: boolean;
    uri?: string;
    mimeType?: string;
    sizeBytes?: number;
    lastModified?: number;
  }>;
  deleteTreeEntry(options: {
    treeUri: string;
    relativePath: string;
  }): Promise<{ deleted: boolean }>;
  renameTreeEntry(options: {
    treeUri: string;
    relativePath: string;
    newName: string;
  }): Promise<{ renamed: boolean; uri?: string }>;
  listTreeEntries(options: {
    treeUri: string;
    relativeDir?: string;
  }): Promise<{ entries: WoaTreeEntry[] }>;
  listTreeFiles(options: {
    treeUri: string;
    relativeDir?: string;
  }): Promise<{ files: WoaTreeFileEntry[] }>;
  openTreeSubfolder(options?: {
    treeUri?: string;
    subdir?: string;
  }): Promise<{ opened: boolean; uri?: string }>;
}

export const WoaStorage = registerPlugin<WoaStorageNativePlugin>('WoaStorage');
