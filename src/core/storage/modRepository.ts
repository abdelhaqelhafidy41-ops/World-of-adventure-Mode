import {
  DEFAULT_GAME_VERSION,
  validateSupportedGameVersion,
} from '@/src/core/api/woaModApiSpec';
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
  t,
} from '@/src/i18n';
import { getPlatformAdapter } from '@/src/platform';
import {
  BuildHistoryEntry,
  EditorSettings,
  ModProject,
  ProjectBackupRecord,
} from '@/src/types/mod';

const DB_NAME = 'woa_mod_creator_db';
const DB_VERSION = 3;
const STORE_PROJECTS = 'projects';
const STORE_SETTINGS = 'settings';
const STORE_ASSET_BLOBS = 'asset_blobs';
const STORE_BACKUPS = 'backups';
const STORE_BUILD_HISTORY = 'build_history';
const SETTINGS_KEY = 'editor_settings';
const LS_PROJECTS_FALLBACK = 'woa_mod_creator_projects_v1';
const LS_SETTINGS_FALLBACK = 'woa_mod_creator_settings_v1';
const LS_BACKUPS_FALLBACK = 'woa_mod_creator_backups_v1';
const LS_BUILDS_FALLBACK = 'woa_mod_creator_build_history_v1';

interface StoredAssetBlob {
  key: string;
  data: ArrayBuffer;
  mimeType: string;
  updatedAt: string;
}

const memoryBlobFallback = new Map<string, { data: ArrayBuffer; mimeType: string }>();

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  language: DEFAULT_LANGUAGE,
  theme: 'dark',
  defaultAuthor: 'Creator',
  defaultGameVersion: DEFAULT_GAME_VERSION,
  defaultTargetPlatform: 'universal',
  viewportGrid: true,
  viewportAxes: true,
  showShadows: true,
  lowPowerMode: false,
  autoSave: true,
  autoBackupOnBuild: true,
  snapToGrid: false,
  gridStep: 0.25,
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
      }
      if (!db.objectStoreNames.contains(STORE_ASSET_BLOBS)) {
        db.createObjectStore(STORE_ASSET_BLOBS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
        const backups = db.createObjectStore(STORE_BACKUPS, { keyPath: 'id' });
        backups.createIndex('modId', 'modId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BUILD_HISTORY)) {
        const builds = db.createObjectStore(STORE_BUILD_HISTORY, { keyPath: 'id' });
        builds.createIndex('modId', 'modId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

let nativeDirsInitialized = false;

async function ensureNativeDirectoriesOnce(): Promise<void> {
  if (nativeDirsInitialized) return;
  const adapter = getPlatformAdapter();
  if (adapter.platform === 'web') return;
  nativeDirsInitialized = true;
  try {
    await adapter.ensureStorageDirectories();
  } catch {
    nativeDirsInitialized = false;
  }
}

export async function listProjects(): Promise<ModProject[]> {
  await ensureNativeDirectoriesOnce();
  const adapter = getPlatformAdapter();
  let rows: ModProject[] = [];

  try {
    const db = await openDatabase();
    rows = await new Promise<ModProject[]>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = (req.result as ModProject[]) ?? [];
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(LS_PROJECTS_FALLBACK);
      rows = raw ? (JSON.parse(raw) as ModProject[]) : [];
    } catch {
      rows = [];
    }
  }

  // Merge any projects stored on native disk (Windows Documents / Android folder) that aren't in IndexedDB yet
  if (adapter.platform !== 'web') {
    try {
      const nativeProjects = await adapter.syncListProjects();
      if (nativeProjects && nativeProjects.length > 0) {
        const mergedMap = new Map<string, ModProject>();
        for (const p of rows) mergedMap.set(p.id, p);
        for (const np of nativeProjects) {
          const existing = mergedMap.get(np.id);
          if (
            !existing ||
            new Date(np.lastOpenedAt).getTime() > new Date(existing.lastOpenedAt).getTime()
          ) {
            mergedMap.set(np.id, np);
          }
        }
        rows = Array.from(mergedMap.values());
      }
    } catch {
      // Keep IndexedDB projects safely
    }
  }

  rows.sort(
    (a, b) =>
      new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
  );
  return rows;
}

export async function saveProject(project: ModProject): Promise<void> {
  const normalized: ModProject = {
    ...project,
    lastOpenedAt: new Date().toISOString(),
  };

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      tx.objectStore(STORE_PROJECTS).put(normalized);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await listProjects();
    const filtered = existing.filter((p) => p.id !== normalized.id);
    filtered.unshift(normalized);
    localStorage.setItem(LS_PROJECTS_FALLBACK, JSON.stringify(filtered));
  }

  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    await ensureNativeDirectoriesOnce();
    try {
      await adapter.syncSaveProject(normalized);
    } catch {
      // IndexedDB remains consistent even if native sync fails temporarily
    }
  }
}

export async function deleteProject(modId: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_PROJECTS, STORE_ASSET_BLOBS], 'readwrite');
      tx.objectStore(STORE_PROJECTS).delete(modId);
      const blobStore = tx.objectStore(STORE_ASSET_BLOBS);
      const cursorReq = blobStore.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          if (String(cursor.key).startsWith(`${modId}/`)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await listProjects();
    const filtered = existing.filter((p) => p.id !== modId);
    localStorage.setItem(LS_PROJECTS_FALLBACK, JSON.stringify(filtered));
  }
  for (const key of memoryBlobFallback.keys()) {
    if (key.startsWith(`${modId}/`)) {
      memoryBlobFallback.delete(key);
    }
  }

  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    try {
      await adapter.syncDeleteProject(modId);
    } catch {
      // ignore
    }
  }
}

export async function saveAssetBlob(
  key: string,
  buffer: ArrayBuffer,
  mimeType: string
): Promise<void> {
  // Always copy buffer so no external reference mutates it
  const copy = buffer.slice(0);
  memoryBlobFallback.set(key, { data: copy, mimeType });

  try {
    const db = await openDatabase();
    const record: StoredAssetBlob = {
      key,
      data: copy,
      mimeType,
      updatedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ASSET_BLOBS, 'readwrite');
      tx.objectStore(STORE_ASSET_BLOBS).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // memoryBlobFallback already holds the safe copy for current session
  }

  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    await ensureNativeDirectoriesOnce();
    try {
      await adapter.syncSaveAssetBlob(key, copy, mimeType);
    } catch {
      // ignore
    }
  }
}

export async function getAssetBlobRecord(
  key: string
): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
  try {
    const db = await openDatabase();
    const record = await new Promise<StoredAssetBlob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_ASSET_BLOBS, 'readonly');
      const req = tx.objectStore(STORE_ASSET_BLOBS).get(key);
      req.onsuccess = () => resolve(req.result as StoredAssetBlob | undefined);
      req.onerror = () => reject(req.error);
    });
    if (record) {
      return { data: record.data.slice(0), mimeType: record.mimeType };
    }
  } catch {
    // fallback below
  }
  const mem = memoryBlobFallback.get(key);
  if (mem) {
    return { data: mem.data.slice(0), mimeType: mem.mimeType };
  }

  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    try {
      const nativeRec = await adapter.syncGetAssetBlob(key);
      if (nativeRec) {
        memoryBlobFallback.set(key, {
          data: nativeRec.data.slice(0),
          mimeType: nativeRec.mimeType,
        });
        return nativeRec;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export async function getAssetBlob(key: string): Promise<Blob | null> {
  const rec = await getAssetBlobRecord(key);
  if (!rec) return null;
  return new Blob([rec.data], { type: rec.mimeType || 'application/octet-stream' });
}

export async function deleteAssetBlob(key: string): Promise<void> {
  memoryBlobFallback.delete(key);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ASSET_BLOBS, 'readwrite');
      tx.objectStore(STORE_ASSET_BLOBS).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    try {
      await adapter.syncDeleteAssetBlob(key);
    } catch {
      // ignore
    }
  }
}

export async function duplicateAssetBlob(
  sourceKey: string,
  targetKey: string
): Promise<boolean> {
  const rec = await getAssetBlobRecord(sourceKey);
  if (!rec) return false;
  await saveAssetBlob(targetKey, rec.data, rec.mimeType);
  return true;
}

export async function saveProjectBackup(
  project: ModProject,
  label: string,
  reason: ProjectBackupRecord['reason'] = 'manual'
): Promise<ProjectBackupRecord> {
  const snapshotJson = JSON.stringify(project);
  const cloned = JSON.parse(snapshotJson) as ModProject;
  const record: ProjectBackupRecord = {
    id: `bkp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    modId: project.manifest.modId,
    modName: project.manifest.name,
    version: project.manifest.version,
    label:
      label.trim() ||
      (reason === 'pre-build'
        ? t('core.backupPreBuild')
        : t('core.backupSnapshot')),
    reason,
    createdAt: new Date().toISOString(),
    sizeBytes: snapshotJson.length,
    project: cloned,
  };

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BACKUPS, 'readwrite');
      tx.objectStore(STORE_BACKUPS).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const raw = localStorage.getItem(LS_BACKUPS_FALLBACK);
    const list: ProjectBackupRecord[] = raw ? JSON.parse(raw) : [];
    list.unshift(record);
    localStorage.setItem(LS_BACKUPS_FALLBACK, JSON.stringify(list.slice(0, 30)));
  }

  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    await ensureNativeDirectoriesOnce();
    try {
      await adapter.syncSaveBackup(record);
    } catch {
      // ignore
    }
  }

  return record;
}

export async function listProjectBackups(
  modId?: string
): Promise<ProjectBackupRecord[]> {
  let rows: ProjectBackupRecord[] = [];
  try {
    const db = await openDatabase();
    rows = await new Promise<ProjectBackupRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_BACKUPS, 'readonly');
      const req = tx.objectStore(STORE_BACKUPS).getAll();
      req.onsuccess = () => resolve((req.result as ProjectBackupRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(LS_BACKUPS_FALLBACK);
      rows = raw ? (JSON.parse(raw) as ProjectBackupRecord[]) : [];
    } catch {
      rows = [];
    }
  }

  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    try {
      const nativeBackups = await adapter.syncListBackups(modId);
      if (nativeBackups && nativeBackups.length > 0) {
        const map = new Map<string, ProjectBackupRecord>();
        for (const r of rows) map.set(r.id, r);
        for (const nb of nativeBackups) map.set(nb.id, nb);
        rows = Array.from(map.values());
      }
    } catch {
      // ignore
    }
  }

  const filtered = modId ? rows.filter((r) => r.modId === modId) : rows;
  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteProjectBackup(backupId: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BACKUPS, 'readwrite');
      tx.objectStore(STORE_BACKUPS).delete(backupId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const raw = localStorage.getItem(LS_BACKUPS_FALLBACK);
    if (raw) {
      const rows: ProjectBackupRecord[] = JSON.parse(raw);
      localStorage.setItem(
        LS_BACKUPS_FALLBACK,
        JSON.stringify(rows.filter((r) => r.id !== backupId))
      );
    }
  }
  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    try {
      await adapter.syncDeleteBackup(backupId);
    } catch {
      // ignore
    }
  }
}

export async function saveBuildHistoryEntry(
  entry: BuildHistoryEntry
): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BUILD_HISTORY, 'readwrite');
      tx.objectStore(STORE_BUILD_HISTORY).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const raw = localStorage.getItem(LS_BUILDS_FALLBACK);
    const list: BuildHistoryEntry[] = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    localStorage.setItem(LS_BUILDS_FALLBACK, JSON.stringify(list.slice(0, 60)));
  }
}

export async function listBuildHistory(
  modId?: string
): Promise<BuildHistoryEntry[]> {
  try {
    const db = await openDatabase();
    const rows = await new Promise<BuildHistoryEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_BUILD_HISTORY, 'readonly');
      const req = tx.objectStore(STORE_BUILD_HISTORY).getAll();
      req.onsuccess = () => resolve((req.result as BuildHistoryEntry[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    const filtered = modId ? rows.filter((r) => r.modId === modId) : rows;
    return filtered.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch {
    try {
      const raw = localStorage.getItem(LS_BUILDS_FALLBACK);
      const rows: BuildHistoryEntry[] = raw ? JSON.parse(raw) : [];
      const filtered = modId ? rows.filter((r) => r.modId === modId) : rows;
      return filtered.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch {
      return [];
    }
  }
}

function syncStoredLanguageFallback(settings: EditorSettings): EditorSettings {
  let normalized = settings;
  if (!validateSupportedGameVersion(normalized.defaultGameVersion).valid) {
    normalized = { ...normalized, defaultGameVersion: DEFAULT_GAME_VERSION };
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (isSupportedLanguage(normalized.language)) {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized.language);
      } else {
        const cached = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isSupportedLanguage(cached)) {
          return { ...normalized, language: cached };
        }
      }
    }
  } catch {
    // ignore storage fallback errors
  }
  return normalized;
}

export async function loadSettings(): Promise<EditorSettings> {
  await ensureNativeDirectoriesOnce();
  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    try {
      const nativeSettings = await adapter.syncLoadSettings();
      if (nativeSettings) {
        return syncStoredLanguageFallback({
          ...DEFAULT_EDITOR_SETTINGS,
          ...nativeSettings,
        });
      }
    } catch {
      // fall through to IndexedDB
    }
  }

  try {
    const db = await openDatabase();
    return await new Promise<EditorSettings>((resolve) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const req = tx.objectStore(STORE_SETTINGS).get(SETTINGS_KEY);
      req.onsuccess = () => {
        if (req.result) {
          const merged = {
            ...DEFAULT_EDITOR_SETTINGS,
            ...(req.result as Partial<EditorSettings>),
          };
          resolve(syncStoredLanguageFallback(merged));
        } else {
          resolve(syncStoredLanguageFallback(DEFAULT_EDITOR_SETTINGS));
        }
      };
      req.onerror = () => resolve(syncStoredLanguageFallback(DEFAULT_EDITOR_SETTINGS));
    });
  } catch {
    try {
      const raw = localStorage.getItem(LS_SETTINGS_FALLBACK);
      if (!raw) return syncStoredLanguageFallback(DEFAULT_EDITOR_SETTINGS);
      const merged = {
        ...DEFAULT_EDITOR_SETTINGS,
        ...(JSON.parse(raw) as Partial<EditorSettings>),
      };
      return syncStoredLanguageFallback(merged);
    } catch {
      return syncStoredLanguageFallback(DEFAULT_EDITOR_SETTINGS);
    }
  }
}

export async function saveSettings(settings: EditorSettings): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage && isSupportedLanguage(settings.language)) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, settings.language);
    }
  } catch {
    // ignore
  }
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      tx.objectStore(STORE_SETTINGS).put(settings, SETTINGS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.setItem(LS_SETTINGS_FALLBACK, JSON.stringify(settings));
  }

  const adapter = getPlatformAdapter();
  if (adapter.platform !== 'web') {
    await ensureNativeDirectoriesOnce();
    try {
      await adapter.syncSaveSettings(settings);
    } catch {
      // ignore
    }
  }
}
