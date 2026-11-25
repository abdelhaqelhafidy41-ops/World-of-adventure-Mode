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
  type DedicatedFolderEntry,
  type StorageConfig,
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

function resolveConfinedRelativePath(subdir: StorageSubdir, relativePath?: string): string {
  const base = path.resolve(getSubdirPath(subdir));
  if (!relativePath || !relativePath.trim()) {
    return base;
  }
  const parts = relativePath
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  return resolveConfined(subdir, ...parts);
}

async function atomicWriteFile(
  targetPath: string,
  content: string | Buffer
): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.woatmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    if (typeof content === 'string') {
      await fs.writeFile(tempPath, content, 'utf8');
    } else {
      await fs.writeFile(tempPath, content);
    }
    await fs.rename(tempPath, targetPath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function existsPath(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function generateUniqueFileNameInDir(
  subdir: StorageSubdir,
  fileName: string
): Promise<string> {
  const safeName = sanitizeSegment(fileName);
  if (!(await existsPath(resolveConfined(subdir, safeName)))) {
    return safeName;
  }
  const dotIdx = safeName.lastIndexOf('.');
  const stem = dotIdx > 0 ? safeName.slice(0, dotIdx) : safeName;
  const ext = dotIdx > 0 ? safeName.slice(dotIdx) : '';
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!(await existsPath(resolveConfined(subdir, candidate)))) {
      return candidate;
    }
  }
  return `${stem}-${Date.now()}${ext}`;
}

function formatBackupFolder(isoDate?: string): string {
  const d = isoDate ? new Date(isoDate) : new Date();
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `backup-${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}-${pad(valid.getHours())}${pad(valid.getMinutes())}`;
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
    folderAccessValid: true,
    folderAccessRevoked: false,
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

async function writeProjectFolderStructure(project: ModProject): Promise<void> {
  const safeFolder = sanitizeSegment(project.id);
  const projectDir = resolveConfined('Projects', safeFolder);
  for (const nested of ['data', 'localization', 'scripts']) {
    await fs.mkdir(path.join(projectDir, nested), { recursive: true });
  }
  await atomicWriteFile(
    resolveConfined('Projects', safeFolder, '.woa-project.json'),
    JSON.stringify(project, null, 2)
  );
  await atomicWriteFile(
    resolveConfined('Projects', safeFolder, 'mod.json'),
    JSON.stringify(project.manifest, null, 2)
  );
  await atomicWriteFile(
    resolveConfined('Projects', safeFolder, 'mod.manifest.json'),
    JSON.stringify(
      {
        id: project.id,
        modId: project.manifest.modId,
        name: project.manifest.name,
        version: project.manifest.version,
        supportedGameVersion: project.manifest.supportedGameVersion,
        targetPlatform: project.manifest.targetPlatform,
        lastOpenedAt: project.lastOpenedAt,
      },
      null,
      2
    )
  );
  await atomicWriteFile(
    resolveConfined('Projects', safeFolder, 'data', 'content.json'),
    JSON.stringify(
      {
        items: project.items,
        blocks: project.blocks,
        recipes: project.recipes,
        entities: project.entities,
        quests: project.quests,
        biomes: project.biomes,
        structures: project.structures,
      },
      null,
      2
    )
  );
  await atomicWriteFile(
    resolveConfined('Projects', safeFolder, 'localization', 'strings.json'),
    JSON.stringify(project.localization ?? [], null, 2)
  );
  for (const script of project.scripts ?? []) {
    const scriptName = sanitizeSegment(script.name || `${script.id}.ts`);
    await atomicWriteFile(
      resolveConfined('Projects', safeFolder, 'scripts', scriptName),
      script.content ?? ''
    );
  }
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
    const projectMap = new Map<string, ModProject>();

    // First scan legacy flat *.woaproj.json files
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.woaproj.json')) continue;
      try {
        const fullPath = resolveConfined('Projects', entry.name);
        const stat = await fs.stat(fullPath);
        if (stat.size > 20 * 1024 * 1024) continue;
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw) as ModProject;
        if (parsed?.id) projectMap.set(parsed.id, parsed);
      } catch {
        // skip corrupted file
      }
    }

    // Then scan structured per-project folders Projects/<safeId>/.woa-project.json
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.endsWith('.woatmp')) continue;
      try {
        const fullPath = resolveConfined('Projects', entry.name, '.woa-project.json');
        if (!(await existsPath(fullPath))) continue;
        const stat = await fs.stat(fullPath);
        if (stat.size > 20 * 1024 * 1024) continue;
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw) as ModProject;
        if (!parsed?.id) continue;
        const existing = projectMap.get(parsed.id);
        if (
          !existing ||
          new Date(parsed.lastOpenedAt).getTime() >= new Date(existing.lastOpenedAt).getTime()
        ) {
          projectMap.set(parsed.id, parsed);
        }
      } catch {
        // skip corrupted project directory
      }
    }

    return Array.from(projectMap.values()).sort(
      (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
    );
  });

  ipcMain.handle('woa:write-project', async (_event, project: ModProject) => {
    await ensureAllStorageDirectories();
    await writeProjectFolderStructure(project);
    const legacyPath = resolveConfined('Projects', `${project.id}.woaproj.json`);
    await fs.rm(legacyPath, { force: true }).catch(() => {});
  });

  ipcMain.handle(
    'woa:rename-project',
    async (_event, payload: { oldModId: string; project: ModProject }) => {
      await ensureAllStorageDirectories();
      await writeProjectFolderStructure(payload.project);
      if (payload.oldModId && payload.oldModId !== payload.project.id) {
        try {
          const oldFolder = resolveConfined('Projects', sanitizeSegment(payload.oldModId));
          await fs.rm(oldFolder, { recursive: true, force: true });
        } catch {
          // ignore
        }
        try {
          const legacyPath = resolveConfined('Projects', `${payload.oldModId}.woaproj.json`);
          await fs.rm(legacyPath, { force: true });
        } catch {
          // ignore
        }
        try {
          const oldAssetDir = resolveConfined('Assets', sanitizeSegment(payload.oldModId));
          const newAssetDir = resolveConfined('Assets', sanitizeSegment(payload.project.id));
          if (await existsPath(oldAssetDir)) {
            if (!(await existsPath(newAssetDir))) {
              await fs.rename(oldAssetDir, newAssetDir);
            }
          }
        } catch {
          // ignore asset dir migration errors
        }
      }
    }
  );

  ipcMain.handle('woa:delete-project', async (_event, modId: string) => {
    await ensureAllStorageDirectories();
    const safeId = sanitizeSegment(modId);
    await fs.rm(resolveConfined('Projects', safeId), { recursive: true, force: true });
    await fs.rm(resolveConfined('Projects', `${modId}.woaproj.json`), { force: true });
    await fs.rm(resolveConfined('Assets', safeId), { recursive: true, force: true }).catch(() => {});
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
      const [modPart, ...restParts] = payload.key.replace(/\\/g, '/').split('/').filter(Boolean);
      const safeFolder = sanitizeSegment(modPart || 'shared');
      const safeFile = sanitizeSegment(restParts.join('_') || payload.key);
      const dir = resolveConfined('Assets', safeFolder);
      await fs.mkdir(dir, { recursive: true });
      const binPath = resolveConfined('Assets', safeFolder, `${safeFile}.bin`);
      const metaPath = resolveConfined('Assets', safeFolder, `${safeFile}.meta.json`);
      await atomicWriteFile(binPath, Buffer.from(payload.data));
      await atomicWriteFile(
        metaPath,
        JSON.stringify({ mimeType: payload.mimeType || 'application/octet-stream' })
      );
    }
  );

  ipcMain.handle('woa:read-asset-blob', async (_event, key: string) => {
    try {
      const [modPart, ...restParts] = key.replace(/\\/g, '/').split('/').filter(Boolean);
      const safeFolder = sanitizeSegment(modPart || 'shared');
      const safeFile = sanitizeSegment(restParts.join('_') || key);
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
      const [modPart, ...restParts] = key.replace(/\\/g, '/').split('/').filter(Boolean);
      const safeFolder = sanitizeSegment(modPart || 'shared');
      const safeFile = sanitizeSegment(restParts.join('_') || key);
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
    const projectSeg = sanitizeSegment(record.project?.id || record.modId);
    const baseFolder = formatBackupFolder(record.createdAt);
    let backupFolder = baseFolder;
    let candidatePath = resolveConfined('Backups', projectSeg, backupFolder, 'backup.json');
    if (await existsPath(candidatePath)) {
      backupFolder = `${baseFolder}-${sanitizeSegment(record.id.slice(-6))}`;
      candidatePath = resolveConfined('Backups', projectSeg, backupFolder, 'backup.json');
    }
    await atomicWriteFile(candidatePath, JSON.stringify(record, null, 2));
  });

  ipcMain.handle('woa:list-backups', async (_event, modId?: string) => {
    await ensureAllStorageDirectories();
    const dir = getSubdirPath('Backups');
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const rowMap = new Map<string, ProjectBackupRecord>();

    // Scan legacy flat *.backup.json files
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.backup.json')) continue;
      try {
        const fullPath = resolveConfined('Backups', entry.name);
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw) as ProjectBackupRecord;
        if (!modId || parsed.modId === modId || parsed.project?.id === modId) {
          rowMap.set(parsed.id, parsed);
        }
      } catch {
        // ignore
      }
    }

    // Scan structured Backups/<modId>/backup-YYYY-MM-DD-HHmm/backup.json
    for (const modEntry of entries) {
      if (!modEntry.isDirectory() || modEntry.name.endsWith('.woatmp')) continue;
      try {
        const modBackupsDir = resolveConfined('Backups', modEntry.name);
        const childDirs = await fs.readdir(modBackupsDir, { withFileTypes: true });
        for (const subEntry of childDirs) {
          if (!subEntry.isDirectory()) continue;
          const bkpFile = resolveConfined('Backups', modEntry.name, subEntry.name, 'backup.json');
          if (!(await existsPath(bkpFile))) continue;
          const raw = await fs.readFile(bkpFile, 'utf8');
          const parsed = JSON.parse(raw) as ProjectBackupRecord;
          if (!modId || parsed.modId === modId || parsed.project?.id === modId) {
            rowMap.set(parsed.id, parsed);
          }
        }
      } catch {
        // ignore malformed backup subfolder
      }
    }

    return Array.from(rowMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  ipcMain.handle('woa:delete-backup', async (_event, backupId: string) => {
    await ensureAllStorageDirectories();
    const legacyPath = resolveConfined('Backups', `${backupId}.backup.json`);
    await fs.rm(legacyPath, { force: true }).catch(() => {});

    const dir = getSubdirPath('Backups');
    const modEntries = await fs.readdir(dir, { withFileTypes: true });
    for (const modEntry of modEntries) {
      if (!modEntry.isDirectory()) continue;
      const modBackupsDir = resolveConfined('Backups', modEntry.name);
      const childDirs = await fs.readdir(modBackupsDir, { withFileTypes: true });
      for (const subEntry of childDirs) {
        if (!subEntry.isDirectory()) continue;
        const bkpFile = resolveConfined('Backups', modEntry.name, subEntry.name, 'backup.json');
        if (!(await existsPath(bkpFile))) continue;
        try {
          const parsed = JSON.parse(await fs.readFile(bkpFile, 'utf8')) as ProjectBackupRecord;
          if (parsed.id === backupId) {
            await fs.rm(resolveConfined('Backups', modEntry.name, subEntry.name), {
              recursive: true,
              force: true,
            });
          }
        } catch {
          // ignore
        }
      }
    }
  });

  ipcMain.handle('woa:write-settings', async (_event, settings: EditorSettings) => {
    await ensureAllStorageDirectories();
    const filePath = resolveConfined('Settings', 'editor-settings.json');
    await atomicWriteFile(filePath, JSON.stringify(settings, null, 2));
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

  ipcMain.handle('woa:write-storage-config', async (_event, config: StorageConfig) => {
    await ensureAllStorageDirectories();
    const filePath = resolveConfined('Settings', 'storage-config.json');
    await atomicWriteFile(filePath, JSON.stringify(config, null, 2));
  });

  ipcMain.handle('woa:read-storage-config', async () => {
    try {
      const filePath = resolveConfined('Settings', 'storage-config.json');
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as StorageConfig;
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'woa:export-file-exists',
    async (_event, payload: { fileName: string; subdir?: StorageSubdir }) => {
      await ensureAllStorageDirectories();
      const subdir: StorageSubdir =
        payload.subdir && STORAGE_SUBDIRS.includes(payload.subdir)
          ? payload.subdir
          : 'Exports';
      const safeName = sanitizeSegment(payload.fileName);
      return existsPath(resolveConfined(subdir, safeName));
    }
  );

  ipcMain.handle(
    'woa:list-subdir-entries',
    async (_event, payload: { subdir: StorageSubdir; relativePath?: string }) => {
      await ensureAllStorageDirectories();
      const subdir: StorageSubdir =
        payload.subdir && STORAGE_SUBDIRS.includes(payload.subdir)
          ? payload.subdir
          : 'Exports';
      const dir = resolveConfinedRelativePath(subdir, payload.relativePath);
      if (!(await existsPath(dir))) return [];
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      const results: DedicatedFolderEntry[] = [];
      for (const entry of dirents) {
        if (entry.name.includes('.woatmp')) continue;
        const full = path.join(dir, entry.name);
        const stat = await fs.stat(full).catch(() => null);
        const rel = payload.relativePath
          ? `${payload.relativePath.replace(/\/+$/, '')}/${entry.name}`
          : entry.name;
        results.push({
          name: entry.name,
          relativePath: rel,
          isDirectory: entry.isDirectory(),
          sizeBytes: entry.isDirectory() ? undefined : stat?.size,
          lastModified: stat ? stat.mtime.toISOString() : undefined,
        });
      }
      return results.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
  );

  ipcMain.handle(
    'woa:save-export-file',
    async (
      _event,
      payload: {
        fileName: string;
        data: Uint8Array;
        promptDialog?: boolean;
        subdir?: StorageSubdir;
        conflictResolution?: 'ask' | 'replace' | 'rename';
      }
    ) => {
      await ensureAllStorageDirectories();
      const subdir: StorageSubdir =
        payload.subdir && STORAGE_SUBDIRS.includes(payload.subdir)
          ? payload.subdir
          : 'Exports';
      const requestedName = sanitizeSegment(payload.fileName);
      if (isBlockedFileName(requestedName)) {
        throw new Error(`Blocked export extension: ${requestedName}`);
      }

      if (payload.promptDialog && mainWindow) {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: 'Save Mod Export',
          defaultPath: resolveConfined(subdir, requestedName),
          filters: [
            { name: 'World of Adventure Mod', extensions: ['woamod', 'zip', 'json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (result.canceled || !result.filePath) {
          return { saved: false, cancelled: true, locationLabel: '' };
        }
        await atomicWriteFile(result.filePath, Buffer.from(payload.data));
        return {
          saved: true,
          filePath: result.filePath,
          fileName: path.basename(result.filePath),
          directoryLabel: path.dirname(result.filePath),
          locationLabel: result.filePath,
        };
      }

      let finalName = requestedName;
      const requestedPath = resolveConfined(subdir, finalName);
      if (await existsPath(requestedPath)) {
        const policy = payload.conflictResolution ?? 'ask';
        if (policy === 'ask') {
          const suggestedName = await generateUniqueFileNameInDir(subdir, requestedName);
          return {
            saved: false,
            conflict: true,
            existingName: requestedName,
            suggestedName,
            directoryLabel: `${ROOT_DIR_NAME}/${subdir}/`,
            locationLabel: requestedPath,
          };
        }
        if (policy === 'rename') {
          finalName = await generateUniqueFileNameInDir(subdir, requestedName);
        }
      }

      const finalExportPath = resolveConfined(subdir, finalName);
      await atomicWriteFile(finalExportPath, Buffer.from(payload.data));

      return {
        saved: true,
        filePath: finalExportPath,
        fileName: finalName,
        directoryLabel: `${ROOT_DIR_NAME}/${subdir}/`,
        locationLabel: finalExportPath,
      };
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
