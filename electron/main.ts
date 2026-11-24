import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type {
  EditorSettings,
  ModProject,
  ProjectBackupRecord,
} from '../src/types/mod';
import {
  STORAGE_SUBDIRS,
  type StorageLocationInfo,
  type StorageSubdir,
} from '../src/platform/types';

const ROOT_DIR_NAME = 'World of Adventure Mod Creator';
const MAX_READ_FILE_BYTES = 150 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'dll',
  'so',
  'dylib',
  'apk',
  'aab',
  'msi',
  'bat',
  'cmd',
  'ps1',
  'vbs',
  'vbe',
  'sh',
  'bash',
  'jar',
  'bin',
  'com',
  'scr',
  'sys',
  'wasm',
  'node',
]);

let mainWindow: BrowserWindow | null = null;

function getAppRootDir(): string {
  const docs = app.getPath('documents');
  return path.join(docs, ROOT_DIR_NAME);
}

function getSubdirPath(subdir: StorageSubdir): string {
  return path.join(getAppRootDir(), subdir);
}

function sanitizeSegment(raw: string): string {
  const clean = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
  if (!clean) {
    throw new Error('Invalid identifier or filename segment.');
  }
  return clean;
}

function resolveConfined(subdir: StorageSubdir, ...segments: string[]): string {
  const base = path.resolve(getSubdirPath(subdir));
  const safeSegments = segments.map((s) => sanitizeSegment(s));
  const resolved = path.resolve(base, ...safeSegments);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Path traversal blocked by storage confinement.');
  }
  return resolved;
}

function isBlockedFileName(fileName: string): boolean {
  const ext = path.extname(fileName).replace(/^\./, '').toLowerCase();
  return ext !== '' && BLOCKED_EXTENSIONS.has(ext);
}

function guessMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.glb':
      return 'model/gltf-binary';
    case '.gltf':
      return 'model/gltf+json';
    case '.obj':
    case '.txt':
    case '.md':
      return 'text/plain';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.mp3':
      return 'audio/mpeg';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

async function ensureAllStorageDirectories(): Promise<StorageLocationInfo> {
  const rootPath = getAppRootDir();
  await fs.mkdir(rootPath, { recursive: true });
  const subdirectories = {} as Record<StorageSubdir, string>;
  for (const sub of STORAGE_SUBDIRS) {
    const subPath = path.join(rootPath, sub);
    await fs.mkdir(subPath, { recursive: true });
    subdirectories[sub] = subPath;
  }
  return {
    platform: 'windows',
    rootPath,
    mode: 'native-documents',
    subdirectories,
  };
}

function readPackageVersion(): string {
  try {
    const versionJsonPath = path.join(__dirname, '..', 'version.json');
    if (fsSync.existsSync(versionJsonPath)) {
      const parsed = JSON.parse(fsSync.readFileSync(versionJsonPath, 'utf8'));
      if (parsed?.version) return String(parsed.version);
    }
  } catch {
    // ignore
  }
  return app.getVersion() || '1.0.0';
}

function createWindow(): void {
  process.env.WOA_APP_VERSION = readPackageVersion();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'World of Adventure Mod Creator',
    backgroundColor: '#0B0F17',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Security: prevent external navigation or untrusted popups inside Electron
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const isDevServer =
      process.env.ELECTRON_START_URL &&
      targetUrl.startsWith(process.env.ELECTRON_START_URL);
    const isLocalFile = targetUrl.startsWith('file://');
    if (!isDevServer && !isLocalFile) {
      event.preventDefault();
    }
  });

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function installAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Documents Workspace Folder',
          click: async () => {
            await ensureAllStorageDirectories();
            await shell.openPath(getAppRootDir());
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpcHandlers(): void {
  ipcMain.handle('woa:get-storage-info', async () => {
    return ensureAllStorageDirectories();
  });

  ipcMain.handle('woa:ensure-storage-dirs', async () => {
    return ensureAllStorageDirectories();
  });

  ipcMain.handle('woa:open-storage-folder', async (_event, subdir?: StorageSubdir) => {
    await ensureAllStorageDirectories();
    const target =
      subdir && STORAGE_SUBDIRS.includes(subdir) ? getSubdirPath(subdir) : getAppRootDir();
    const err = await shell.openPath(target);
    return err === '';
  });

  ipcMain.handle('woa:list-projects', async () => {
    await ensureAllStorageDirectories();
    const dir = getSubdirPath('Projects');
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const projects: ModProject[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.woaproj.json')) continue;
      try {
        const fullPath = resolveConfined('Projects', entry.name);
        const stat = await fs.stat(fullPath);
        if (stat.size > 20 * 1024 * 1024) continue;
        const raw = await fs.readFile(fullPath, 'utf8');
        projects.push(JSON.parse(raw) as ModProject);
      } catch {
        // skip corrupted file
      }
    }
    return projects.sort(
      (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
    );
  });

  ipcMain.handle('woa:write-project', async (_event, project: ModProject) => {
    await ensureAllStorageDirectories();
    const filePath = resolveConfined('Projects', `${project.id}.woaproj.json`);
    await fs.writeFile(filePath, JSON.stringify(project, null, 2), 'utf8');
  });

  ipcMain.handle('woa:delete-project', async (_event, modId: string) => {
    await ensureAllStorageDirectories();
    const filePath = resolveConfined('Projects', `${modId}.woaproj.json`);
    await fs.rm(filePath, { force: true });
  });

  ipcMain.handle(
    'woa:write-asset-blob',
    async (
      _event,
      payload: { key: string; data: Uint8Array; mimeType: string }
    ) => {
      await ensureAllStorageDirectories();
      if (payload.data.byteLength > 60 * 1024 * 1024) {
        throw new Error('Asset blob exceeds maximum allowed size (60 MB).');
      }
      const [modPart, assetPart] = payload.key.split('/');
      const safeFolder = sanitizeSegment(modPart || 'shared');
      const safeFile = sanitizeSegment(assetPart || payload.key);
      const dir = resolveConfined('Assets', safeFolder);
      await fs.mkdir(dir, { recursive: true });
      const binPath = resolveConfined('Assets', safeFolder, `${safeFile}.bin`);
      const metaPath = resolveConfined('Assets', safeFolder, `${safeFile}.meta.json`);
      await fs.writeFile(binPath, Buffer.from(payload.data));
      await fs.writeFile(
        metaPath,
        JSON.stringify({ mimeType: payload.mimeType || 'application/octet-stream' }),
        'utf8'
      );
    }
  );

  ipcMain.handle('woa:read-asset-blob', async (_event, key: string) => {
    try {
      const [modPart, assetPart] = key.split('/');
      const safeFolder = sanitizeSegment(modPart || 'shared');
      const safeFile = sanitizeSegment(assetPart || key);
      const binPath = resolveConfined('Assets', safeFolder, `${safeFile}.bin`);
      const metaPath = resolveConfined('Assets', safeFolder, `${safeFile}.meta.json`);
      const buf = await fs.readFile(binPath);
      let mimeType = 'application/octet-stream';
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        if (meta?.mimeType) mimeType = String(meta.mimeType);
      } catch {
        // ignore missing meta
      }
      return { data: new Uint8Array(buf), mimeType };
    } catch {
      return null;
    }
  });

  ipcMain.handle('woa:delete-asset-blob', async (_event, key: string) => {
    try {
      const [modPart, assetPart] = key.split('/');
      const safeFolder = sanitizeSegment(modPart || 'shared');
      const safeFile = sanitizeSegment(assetPart || key);
      const binPath = resolveConfined('Assets', safeFolder, `${safeFile}.bin`);
      const metaPath = resolveConfined('Assets', safeFolder, `${safeFile}.meta.json`);
      await fs.rm(binPath, { force: true });
      await fs.rm(metaPath, { force: true });
    } catch {
      // ignore
    }
  });

  ipcMain.handle('woa:write-backup', async (_event, record: ProjectBackupRecord) => {
    await ensureAllStorageDirectories();
    const filePath = resolveConfined('Backups', `${record.id}.backup.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
  });

  ipcMain.handle('woa:list-backups', async (_event, modId?: string) => {
    await ensureAllStorageDirectories();
    const dir = getSubdirPath('Backups');
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const rows: ProjectBackupRecord[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.backup.json')) continue;
      try {
        const fullPath = resolveConfined('Backups', entry.name);
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw) as ProjectBackupRecord;
        if (!modId || parsed.modId === modId) {
          rows.push(parsed);
        }
      } catch {
        // ignore
      }
    }
    return rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  ipcMain.handle('woa:delete-backup', async (_event, backupId: string) => {
    await ensureAllStorageDirectories();
    const filePath = resolveConfined('Backups', `${backupId}.backup.json`);
    await fs.rm(filePath, { force: true });
  });

  ipcMain.handle('woa:write-settings', async (_event, settings: EditorSettings) => {
    await ensureAllStorageDirectories();
    const filePath = resolveConfined('Settings', 'editor-settings.json');
    await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
  });

  ipcMain.handle('woa:read-settings', async () => {
    try {
      const filePath = resolveConfined('Settings', 'editor-settings.json');
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as EditorSettings;
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'woa:save-export-file',
    async (
      _event,
      payload: { fileName: string; data: Uint8Array; promptDialog?: boolean }
    ) => {
      await ensureAllStorageDirectories();
      const safeName = sanitizeSegment(payload.fileName);
      if (isBlockedFileName(safeName)) {
        throw new Error(`Blocked export extension: ${safeName}`);
      }
      const defaultExportPath = resolveConfined('Exports', safeName);
      await fs.writeFile(defaultExportPath, Buffer.from(payload.data));

      if (payload.promptDialog && mainWindow) {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: 'Save Mod Export',
          defaultPath: defaultExportPath,
          filters: [
            { name: 'World of Adventure Mod', extensions: ['woamod', 'zip', 'json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (result.canceled || !result.filePath) {
          return { saved: true, filePath: defaultExportPath, cancelled: false };
        }
        await fs.writeFile(result.filePath, Buffer.from(payload.data));
        return { saved: true, filePath: result.filePath };
      }

      return { saved: true, filePath: defaultExportPath };
    }
  );

  ipcMain.handle(
    'woa:open-files-dialog',
    async (
      _event,
      options: { title?: string; extensions?: string[]; multiple?: boolean }
    ) => {
      const properties: Array<'openFile' | 'multiSelections'> = ['openFile'];
      if (options?.multiple) {
        properties.push('multiSelections');
      }
      const filters =
        options?.extensions && options.extensions.length > 0
          ? [
              {
                name: 'Supported Files',
                extensions: options.extensions,
              },
            ]
          : undefined;

      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, {
            title: options?.title || 'Import Files',
            properties,
            filters,
          })
        : await dialog.showOpenDialog({
            title: options?.title || 'Import Files',
            properties,
            filters,
          });

      if (result.canceled || result.filePaths.length === 0) {
        return [];
      }

      const files: Array<{ name: string; mimeType: string; data: Uint8Array }> = [];
      for (const filePath of result.filePaths) {
        const fileName = path.basename(filePath);
        if (isBlockedFileName(fileName)) {
          throw new Error(`Blocked executable/unsafe file: ${fileName}`);
        }
        const stat = await fs.stat(filePath);
        if (stat.size > MAX_READ_FILE_BYTES) {
          throw new Error(`File "${fileName}" exceeds 150 MB safety limit.`);
        }
        const buf = await fs.readFile(filePath);
        files.push({
          name: fileName,
          mimeType: guessMimeType(fileName),
          data: new Uint8Array(buf),
        });
      }
      return files;
    }
  );

  ipcMain.handle('woa:open-directory-dialog', async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
        });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const chosen = result.filePaths[0];
    return {
      uri: chosen,
      label: path.basename(chosen) || chosen,
    };
  });

  ipcMain.handle('woa:show-item-in-folder', async (_event, filePath: string) => {
    const resolved = path.resolve(filePath);
    const root = path.resolve(getAppRootDir());
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      return false;
    }
    shell.showItemInFolder(resolved);
    return true;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await ensureAllStorageDirectories();
    installAppMenu();
    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
