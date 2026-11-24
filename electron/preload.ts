import { contextBridge, ipcRenderer } from 'electron';
import type { WoaDesktopBridge } from '../src/platform/types';

const bridge: WoaDesktopBridge = {
  platform: 'windows',
  version: process.env.WOA_APP_VERSION || '1.0.0',

  getStorageInfo: () => ipcRenderer.invoke('woa:get-storage-info'),
  ensureStorageDirectories: () => ipcRenderer.invoke('woa:ensure-storage-dirs'),
  openStorageFolder: (subdir) => ipcRenderer.invoke('woa:open-storage-folder', subdir),

  listProjects: () => ipcRenderer.invoke('woa:list-projects'),
  writeProject: (project) => ipcRenderer.invoke('woa:write-project', project),
  deleteProject: (modId) => ipcRenderer.invoke('woa:delete-project', modId),

  writeAssetBlob: (key, data, mimeType) =>
    ipcRenderer.invoke('woa:write-asset-blob', { key, data, mimeType }),
  readAssetBlob: (key) => ipcRenderer.invoke('woa:read-asset-blob', key),
  deleteAssetBlob: (key) => ipcRenderer.invoke('woa:delete-asset-blob', key),

  writeBackup: (record) => ipcRenderer.invoke('woa:write-backup', record),
  listBackups: (modId) => ipcRenderer.invoke('woa:list-backups', modId),
  deleteBackup: (backupId) => ipcRenderer.invoke('woa:delete-backup', backupId),

  writeSettings: (settings) => ipcRenderer.invoke('woa:write-settings', settings),
  readSettings: () => ipcRenderer.invoke('woa:read-settings'),

  saveExportFile: (payload) => ipcRenderer.invoke('woa:save-export-file', payload),
  openFilesDialog: (options) => ipcRenderer.invoke('woa:open-files-dialog', options),
  openDirectoryDialog: () => ipcRenderer.invoke('woa:open-directory-dialog'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('woa:show-item-in-folder', filePath),
};

contextBridge.exposeInMainWorld('woaDesktop', bridge);
