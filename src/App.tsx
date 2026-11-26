/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Settings, X } from 'lucide-react';
import { BuildExportView } from '@/src/components/BuildExportView';
import { CreateModModal } from '@/src/components/CreateModModal';
import { ModApiDocsView } from '@/src/components/ModApiDocsView';
import { ProjectManagerView } from '@/src/components/ProjectManagerView';
import { SettingsView } from '@/src/components/SettingsView';
import { AppView, TopBar } from '@/src/components/TopBar';
import { WorkspaceView } from '@/src/components/WorkspaceView';
import {
  CURRENT_MOD_CONTENT_SCHEMA_VERSION,
} from '@/src/core/api/woaModApiSpec';
import {
  deriveAssetModCategoryFromContext,
  getFileExtension,
  getUniqueAssetPath,
  importLocalAssetFile,
  sanitizeFileName,
  serializeWoa3dAsset,
} from '@/src/core/assets/assetPipeline';
import {
  CONTENT_FILE_PATHS,
  EXTENDED_CONFIG_FILE_PATHS,
  resolveProjectContents,
  syncContentFilesInProject,
} from '@/src/core/content/contentRegistry';
import {
  buildModProjectAsync,
  exportWorkspaceProjectZip,
  formatProjectZipFilename,
  importModFromFile,
  saveExportedPackage,
} from '@/src/core/builder/modBuilder';
import {
  createModProject,
  createStarterSampleProject,
  serializeManifest,
} from '@/src/core/project/modScaffolder';
import {
  DEFAULT_EDITOR_SETTINGS,
  deleteProject,
  deleteProjectBackup,
  duplicateAssetBlob,
  listBuildHistory,
  listProjectBackups,
  listProjects,
  loadSettings,
  loadStorageConfig,
  renameProject,
  saveBuildHistoryEntry,
  saveProject,
  saveProjectBackup,
  saveSettings,
  saveStorageConfig,
} from '@/src/core/storage/modRepository';
import {
  AssetPresetKind,
  BuildHistoryEntry,
  BuildReport,
  ConsoleEntry,
  CreateModInput,
  EditorSettings,
  LogLevel,
  ModAsset,
  ModChangelogEntry,
  ModContentDatabase,
  ModFileNode,
  ModManifest,
  ModProject,
  ProjectBackupRecord,
  ValidationIssue,
} from '@/src/types/mod';
import { useI18n } from '@/src/i18n';
import {
  AndroidAccessDeniedError,
  type AndroidAccessIssue,
  clearAndroidAccessIssue,
  getPlatformAdapter,
  openAndroidAppSettings,
  reportAndroidAccessError,
  reportAndroidSafRevoked,
  subscribeAndroidAccessIssue,
  useBackNavigation,
  usePlatform,
} from '@/src/platform';

const SEEDED_FLAG_KEY = 'woa_mod_creator_seeded_v1';

function formatTimestamp(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

export default function App() {
  const { t, setLanguage } = useI18n();
  const platformInfo = usePlatform();
  const [projects, setProjects] = useState<ModProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>('projects');
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS);
  const [createOpen, setCreateOpen] = useState(false);
  const [lastBuild, setLastBuild] = useState<BuildReport | null>(null);
  const [backups, setBackups] = useState<ProjectBackupRecord[]>([]);
  const [buildHistory, setBuildHistory] = useState<BuildHistoryEntry[]>([]);
  const [undoStack, setUndoStack] = useState<ModProject[]>([]);
  const [redoStack, setRedoStack] = useState<ModProject[]>([]);
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, ModProject>>({});
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const projectsRef = useRef<ModProject[]>(projects);
  projectsRef.current = projects;
  const historyGroupRef = useRef<{ key: string; timestamp: number } | null>(null);
  const [pendingIssueFocus, setPendingIssueFocus] = useState<{
    issue: ValidationIssue;
    token: number;
  } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [androidAccessIssue, setAndroidAccessIssue] = useState<AndroidAccessIssue | null>(null);
  const [logs, setLogs] = useState<ConsoleEntry[]>(() => [
    {
      id: 'init_1',
      timestamp: formatTimestamp(),
      level: 'info',
      source: 'Core',
      message: t('app.logInitialized'),
    },
  ]);

  const appendLog = useCallback(
    (level: LogLevel, source: string, message: string) => {
      setLogs((prev) => [
        ...prev.slice(-199),
        {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: formatTimestamp(),
          level,
          source,
          message,
        },
      ]);
    },
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  useEffect(() => {
    if (platformInfo.platform !== 'android') {
      setAndroidAccessIssue(null);
      return;
    }
    return subscribeAndroidAccessIssue(setAndroidAccessIssue);
  }, [platformInfo.platform]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [loadedSettings, loadedProjects, loadedStorageConfig] = await Promise.all([
        loadSettings(),
        listProjects(),
        loadStorageConfig(),
      ]);
      if (!mounted) return;

      setSettings(loadedSettings);
      if (loadedSettings.language) {
        setLanguage(loadedSettings.language);
      }

      let initialProjects = loadedProjects.map((proj) =>
        proj.contents
          ? proj
          : syncContentFilesInProject(proj, resolveProjectContents(proj))
      );
      const alreadySeeded = localStorage.getItem(SEEDED_FLAG_KEY) === '1';
      if (initialProjects.length === 0 && !alreadySeeded) {
        const sample = createStarterSampleProject();
        await saveProject(sample);
        localStorage.setItem(SEEDED_FLAG_KEY, '1');
        initialProjects = [sample];
      }

      setProjects(initialProjects);
      const initialSaved: Record<string, ModProject> = {};
      initialProjects.forEach((p) => {
        initialSaved[p.id] = p;
      });
      setSavedSnapshots(initialSaved);
      if (initialProjects.length > 0) {
        const preferred = loadedStorageConfig.lastOpenedProjectId
          ? initialProjects.find((p) => p.id === loadedStorageConfig.lastOpenedProjectId)
          : null;
        setActiveProjectId(preferred ? preferred.id : initialProjects[0].id);
      }
      setIsLoaded(true);

      // Silently verify SAF directory health if previously granted (never prompts on startup)
      const adapter = getPlatformAdapter();
      if (adapter.platform === 'android' && adapter.checkStorageFolderAccess) {
        const access = await adapter.checkStorageFolderAccess();
        if (mounted && access.revoked) {
          reportAndroidSafRevoked(async () => {
            await adapter.pickStorageDirectory();
          });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [setLanguage]);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const hasUnsavedChanges = Boolean(
    activeProject &&
      savedSnapshots[activeProject.id] &&
      savedSnapshots[activeProject.id] !== activeProject
  );

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    historyGroupRef.current = null;
    if (!activeProjectId) {
      setBackups([]);
      setBuildHistory([]);
      return;
    }
    let mounted = true;
    void Promise.all([
      listProjectBackups(activeProjectId),
      listBuildHistory(activeProjectId),
    ]).then(([loadedBackups, loadedHistory]) => {
      if (!mounted) return;
      setBackups(loadedBackups);
      setBuildHistory(loadedHistory);
    });
    return () => {
      mounted = false;
    };
  }, [activeProjectId]);

  const persistProjectUpdate = useCallback(
    (
      updated: ModProject,
      options?: { recordUndo?: boolean; historyGroupKey?: string }
    ) => {
      const shouldRecordUndo = options?.recordUndo !== false;
      const current = projectsRef.current.find((p) => p.id === updated.id);
      if (shouldRecordUndo && current && current.id === activeProjectId) {
        const groupKey = options?.historyGroupKey;
        const now = Date.now();
        const canCoalesce =
          Boolean(groupKey) &&
          historyGroupRef.current?.key === groupKey &&
          now - (historyGroupRef.current?.timestamp ?? 0) < 900;

        if (canCoalesce) {
          historyGroupRef.current = { key: groupKey!, timestamp: now };
          setRedoStack([]);
        } else {
          historyGroupRef.current = groupKey
            ? { key: groupKey, timestamp: now }
            : null;
          setUndoStack((stack) => [...stack.slice(-34), current]);
          setRedoStack([]);
        }
      } else if (shouldRecordUndo) {
        historyGroupRef.current = null;
      }

      setProjects((prev) => {
        const exists = prev.some((p) => p.id === updated.id);
        const next = exists
          ? prev.map((p) => (p.id === updated.id ? updated : p))
          : [updated, ...prev];
        projectsRef.current = next;
        return next;
      });
      if (settings.autoSave) {
        void saveProject(updated).then(() => {
          setLastSavedAt(formatTimestamp());
          setSavedSnapshots((prev) => ({ ...prev, [updated.id]: updated }));
        });
      }
    },
    [activeProjectId, settings.autoSave]
  );

  const handleUndo = useCallback(() => {
    if (!activeProject || undoStack.length === 0) return;
    historyGroupRef.current = null;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-34), activeProject]);
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === previous.id ? previous : p));
      projectsRef.current = next;
      return next;
    });
    if (settings.autoSave) {
      void saveProject(previous).then(() => {
        setLastSavedAt(formatTimestamp());
        setSavedSnapshots((prev) => ({ ...prev, [previous.id]: previous }));
      });
    }
    appendLog('info', 'History', t('app.logUndid'));
  }, [activeProject, undoStack, settings.autoSave, appendLog, t]);

  const handleRedo = useCallback(() => {
    if (!activeProject || redoStack.length === 0) return;
    historyGroupRef.current = null;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-34), activeProject]);
    setProjects((prev) => {
      const updatedList = prev.map((p) => (p.id === next.id ? next : p));
      projectsRef.current = updatedList;
      return updatedList;
    });
    if (settings.autoSave) {
      void saveProject(next).then(() => {
        setLastSavedAt(formatTimestamp());
        setSavedSnapshots((prev) => ({ ...prev, [next.id]: next }));
      });
    }
    appendLog('info', 'History', t('app.logRedid'));
  }, [activeProject, redoStack, settings.autoSave, appendLog, t]);

  const handleManualSave = useCallback(() => {
    if (!activeProject) return;
    const snapshot = activeProject;
    void saveProject(snapshot).then(() => {
      setLastSavedAt(formatTimestamp());
      setSavedSnapshots((prev) => ({ ...prev, [snapshot.id]: snapshot }));
      appendLog(
        'success',
        'Storage',
        t('app.savedProject', { name: snapshot.manifest.name })
      );
    });
  }, [activeProject, appendLog, t]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        handleManualSave();
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(target?.isContentEditable || target?.closest?.('[contenteditable="true"]'));
      const inDialog = Boolean(
        target?.closest?.('[role="dialog"], [aria-modal="true"]') ||
          document.querySelector('[role="dialog"], [aria-modal="true"]')
      );
      if (isEditable || inDialog) {
        return;
      }
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleManualSave, handleUndo, handleRedo]);

  const handleCreateMod = async (input: CreateModInput) => {
    await getPlatformAdapter().ensureFirstTimeStorageSetup?.();
    const project = createModProject(input);
    await saveProject(project);
    await saveStorageConfig({ lastOpenedProjectId: project.id });
    setProjects((prev) => [project, ...prev]);
    setSavedSnapshots((prev) => ({ ...prev, [project.id]: project }));
    setActiveProjectId(project.id);
    setCreateOpen(false);
    setLastBuild(null);
    setActiveView('workspace');
    appendLog(
      'success',
      'Scaffolder',
      t('app.createdProject', {
        name: project.manifest.name,
        modId: project.manifest.modId,
      })
    );
  };

  const handleOpenProject = async (project: ModProject) => {
    const touched: ModProject = {
      ...project,
      lastOpenedAt: new Date().toISOString(),
    };
    await saveProject(touched);
    await saveStorageConfig({ lastOpenedProjectId: touched.id });
    setProjects((prev) => prev.map((p) => (p.id === touched.id ? touched : p)));
    setSavedSnapshots((prev) => ({ ...prev, [touched.id]: touched }));
    setActiveProjectId(touched.id);
    setLastBuild(null);
    setActiveView('workspace');
    appendLog(
      'info',
      'Project',
      t('app.openedProject', {
        name: touched.manifest.name,
        modId: touched.manifest.modId,
      })
    );
  };

  const handleImportProjectFile = async (file: File) => {
    await getPlatformAdapter().ensureFirstTimeStorageSetup?.();
    const imported = await importModFromFile(file);
    await saveProject(imported);
    await saveStorageConfig({ lastOpenedProjectId: imported.id });
    setProjects((prev) => {
      const filtered = prev.filter((p) => p.id !== imported.id);
      return [imported, ...filtered];
    });
    setActiveProjectId(imported.id);
    setLastBuild(null);
    setActiveView('workspace');
    appendLog(
      'success',
      'Importer',
      t('app.importedProject', {
        name: imported.manifest.name,
        modId: imported.manifest.modId,
      })
    );
  };

  const handleDuplicateProject = async (project: ModProject) => {
    const suffix = Math.floor(100 + Math.random() * 900);
    const copyId = `${project.manifest.modId}_copy_${suffix}`;
    const now = new Date().toISOString();
    const copyManifest: ModManifest = {
      ...project.manifest,
      modId: copyId,
      name: `${project.manifest.name} ${t('app.duplicateSuffix')}`,
      createdAt: now,
      updatedAt: now,
    };

    const clonedAssets: ModAsset[] = [];
    const oldToNewBlob = new Map<string, string>();
    for (const a of project.assets) {
      if (a.blobKey) {
        const newBlobKey = `${copyId}/${a.id}`;
        await duplicateAssetBlob(a.blobKey, newBlobKey);
        oldToNewBlob.set(a.id, newBlobKey);
        clonedAssets.push({ ...a, blobKey: newBlobKey });
      } else {
        clonedAssets.push({ ...a });
      }
    }

    const sourceContents = resolveProjectContents(project);
    const oldPrefix = `${project.manifest.modId}:`;
    const newPrefix = `${copyId}:`;
    const remapId = (id: string) =>
      id.startsWith(oldPrefix) ? `${newPrefix}${id.slice(oldPrefix.length)}` : id;

    const clonedContents: ModContentDatabase = {
      items: sourceContents.items.map((e) => ({ ...e, id: remapId(e.id) })),
      weapons: sourceContents.weapons.map((e) => ({
        ...e,
        id: remapId(e.id),
        projectile: {
          ...e.projectile,
          projectileId: remapId(e.projectile.projectileId),
        },
      })),
      armor: sourceContents.armor.map((e) => ({ ...e, id: remapId(e.id) })),
      npcs: sourceContents.npcs.map((e) => ({
        ...e,
        id: remapId(e.id),
        loot: e.loot.map((l) => ({ ...l, itemId: remapId(l.itemId) })),
        questReferences: e.questReferences.map(remapId),
      })),
      monsters: sourceContents.monsters.map((e) => ({
        ...e,
        id: remapId(e.id),
        loot: e.loot.map((l) => ({ ...l, itemId: remapId(l.itemId) })),
      })),
      quests: sourceContents.quests.map((e) => ({
        ...e,
        id: remapId(e.id),
        giverNpcId: remapId(e.giverNpcId),
        objectives: e.objectives.map((o) => ({ ...o, targetId: remapId(o.targetId) })),
        rewards: {
          ...e.rewards,
          items: e.rewards.items.map((ri) => ({ ...ri, itemId: remapId(ri.itemId) })),
        },
        dialogue: e.dialogue.map((d) => ({ ...d, speakerNpcId: remapId(d.speakerNpcId) })),
        chain: {
          prerequisiteQuestIds: e.chain.prerequisiteQuestIds.map(remapId),
          nextQuestId: remapId(e.chain.nextQuestId),
        },
      })),
      recipes: sourceContents.recipes.map((e) => ({
        ...e,
        id: remapId(e.id),
        outputItemId: remapId(e.outputItemId),
        ingredients: e.ingredients.map((i) => ({ ...i, itemId: remapId(i.itemId) })),
      })),
      buildings: sourceContents.buildings.map((e) => ({
        ...e,
        id: remapId(e.id),
        materials: e.materials.map((m) => ({ ...m, itemId: remapId(m.itemId) })),
        doors: e.doors.map((d) => ({ ...d, keyItemId: remapId(d.keyItemId) })),
        interactiveObjects: e.interactiveObjects.map((io) => ({
          ...io,
          targetId: remapId(io.targetId),
        })),
      })),
      spawns: sourceContents.spawns.map((e) => ({
        ...e,
        id: remapId(e.id),
        entityId: remapId(e.entityId),
        conditions: {
          ...e.conditions,
          requiredQuestId: remapId(e.conditions.requiredQuestId),
        },
      })),
      animations: (sourceContents.animations ?? []).map((e) => ({
        ...e,
        id: remapId(e.id),
      })),
      audioCues: (sourceContents.audioCues ?? []).map((e) => ({
        ...e,
        id: remapId(e.id),
      })),
      materials: (sourceContents.materials ?? []).map((e) => ({
        ...e,
        id: remapId(e.id),
      })),
      lootTables: (sourceContents.lootTables ?? []).map((e) => ({
        ...e,
        id: remapId(e.id),
        entries: e.entries.map((le) => ({ ...le, itemId: remapId(le.itemId) })),
      })),
      dialogues: (sourceContents.dialogues ?? []).map((e) => ({
        ...e,
        id: remapId(e.id),
        npcId: remapId(e.npcId),
        nodes: e.nodes.map((n) => ({
          ...n,
          speakerNpcId: remapId(n.speakerNpcId),
          questTriggerId: n.questTriggerId
            ? remapId(n.questTriggerId)
            : undefined,
        })),
      })),
      worldObjects: (sourceContents.worldObjects ?? []).map((e) => ({
        ...e,
        id: remapId(e.id),
        materialConfigId: remapId(e.materialConfigId),
        audioCueId: remapId(e.audioCueId),
        lootTableId: remapId(e.lootTableId),
        questId: remapId(e.questId),
      })),
    };

    const rawCopy: ModProject = {
      ...project,
      id: copyId,
      manifest: copyManifest,
      assets: clonedAssets,
      files: project.files.map((f) =>
        f.path === 'mod.manifest.json'
          ? { ...f, content: serializeManifest(copyManifest), updatedAt: now }
          : { ...f }
      ),
      lastOpenedAt: now,
    };
    const copy = syncContentFilesInProject(rawCopy, clonedContents);
    await saveProject(copy);
    setProjects((prev) => [copy, ...prev]);
    setSavedSnapshots((prev) => ({ ...prev, [copy.id]: copy }));
    appendLog(
      'info',
      'Project',
      t('app.duplicatedProject', {
        name: project.manifest.name,
        modId: copyId,
      })
    );
  };

  const handleDeleteProject = async (modId: string) => {
    const target = projects.find((p) => p.id === modId);
    await deleteProject(modId);
    let nextActiveId: string | null = activeProjectId;
    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== modId);
      if (activeProjectId === modId) {
        nextActiveId = remaining[0]?.id ?? null;
        setActiveProjectId(nextActiveId);
      }
      return remaining;
    });
    await saveStorageConfig({ lastOpenedProjectId: nextActiveId });
    appendLog(
      'warn',
      'Project',
      t('app.deletedProject', { name: target?.manifest.name ?? modId })
    );
  };

  const handleRenameProject = async (
    project: ModProject,
    newName: string,
    newModId: string
  ) => {
    const trimmedName = newName.trim();
    const trimmedModId = newModId.trim();
    if (!trimmedName || !trimmedModId) return;

    const oldProjectId = project.id;
    const oldModId = project.manifest.modId;
    const now = new Date().toISOString();
    const modIdChanged = trimmedModId !== oldModId;

    const updatedManifest: ModManifest = {
      ...project.manifest,
      modId: trimmedModId,
      name: trimmedName,
      updatedAt: now,
    };

    let updatedContents = resolveProjectContents(project);
    if (modIdChanged) {
      const oldPrefix = `${oldModId}:`;
      const newPrefix = `${trimmedModId}:`;
      const remapId = (id: string) =>
        id.startsWith(oldPrefix) ? `${newPrefix}${id.slice(oldPrefix.length)}` : id;

      updatedContents = {
        items: updatedContents.items.map((e) => ({ ...e, id: remapId(e.id) })),
        weapons: updatedContents.weapons.map((e) => ({
          ...e,
          id: remapId(e.id),
          projectile: {
            ...e.projectile,
            projectileId: remapId(e.projectile.projectileId),
          },
        })),
        armor: updatedContents.armor.map((e) => ({ ...e, id: remapId(e.id) })),
        npcs: updatedContents.npcs.map((e) => ({
          ...e,
          id: remapId(e.id),
          loot: e.loot.map((l) => ({ ...l, itemId: remapId(l.itemId) })),
          questReferences: e.questReferences.map(remapId),
        })),
        monsters: updatedContents.monsters.map((e) => ({
          ...e,
          id: remapId(e.id),
          loot: e.loot.map((l) => ({ ...l, itemId: remapId(l.itemId) })),
        })),
        quests: updatedContents.quests.map((e) => ({
          ...e,
          id: remapId(e.id),
          giverNpcId: remapId(e.giverNpcId),
          objectives: e.objectives.map((o) => ({ ...o, targetId: remapId(o.targetId) })),
          rewards: {
            ...e.rewards,
            items: e.rewards.items.map((ri) => ({ ...ri, itemId: remapId(ri.itemId) })),
          },
          dialogue: e.dialogue.map((d) => ({ ...d, speakerNpcId: remapId(d.speakerNpcId) })),
          chain: {
            prerequisiteQuestIds: e.chain.prerequisiteQuestIds.map(remapId),
            nextQuestId: remapId(e.chain.nextQuestId),
          },
        })),
        recipes: updatedContents.recipes.map((e) => ({
          ...e,
          id: remapId(e.id),
          outputItemId: remapId(e.outputItemId),
          ingredients: e.ingredients.map((i) => ({ ...i, itemId: remapId(i.itemId) })),
        })),
        buildings: updatedContents.buildings.map((e) => ({
          ...e,
          id: remapId(e.id),
          materials: e.materials.map((m) => ({ ...m, itemId: remapId(m.itemId) })),
          doors: e.doors.map((d) => ({ ...d, keyItemId: remapId(d.keyItemId) })),
          interactiveObjects: e.interactiveObjects.map((io) => ({
            ...io,
            targetId: remapId(io.targetId),
          })),
        })),
        spawns: updatedContents.spawns.map((e) => ({
          ...e,
          id: remapId(e.id),
          entityId: remapId(e.entityId),
          conditions: {
            ...e.conditions,
            requiredQuestId: remapId(e.conditions.requiredQuestId),
          },
        })),
        animations: (updatedContents.animations ?? []).map((e) => ({
          ...e,
          id: remapId(e.id),
        })),
        audioCues: (updatedContents.audioCues ?? []).map((e) => ({
          ...e,
          id: remapId(e.id),
        })),
        materials: (updatedContents.materials ?? []).map((e) => ({
          ...e,
          id: remapId(e.id),
        })),
        lootTables: (updatedContents.lootTables ?? []).map((e) => ({
          ...e,
          id: remapId(e.id),
          entries: e.entries.map((le) => ({ ...le, itemId: remapId(le.itemId) })),
        })),
        dialogues: (updatedContents.dialogues ?? []).map((e) => ({
          ...e,
          id: remapId(e.id),
          npcId: remapId(e.npcId),
          nodes: e.nodes.map((n) => ({
            ...n,
            speakerNpcId: remapId(n.speakerNpcId),
            questTriggerId: n.questTriggerId ? remapId(n.questTriggerId) : undefined,
          })),
        })),
        worldObjects: (updatedContents.worldObjects ?? []).map((e) => ({
          ...e,
          id: remapId(e.id),
          materialConfigId: remapId(e.materialConfigId),
          audioCueId: remapId(e.audioCueId),
          lootTableId: remapId(e.lootTableId),
          questId: remapId(e.questId),
        })),
      };
    }

    const baseProject: ModProject = {
      ...project,
      id: modIdChanged ? trimmedModId : project.id,
      manifest: updatedManifest,
      files: project.files.map((f) =>
        f.path === 'mod.manifest.json' || f.path === 'mod.json'
          ? { ...f, content: serializeManifest(updatedManifest), updatedAt: now }
          : { ...f }
      ),
      lastOpenedAt: now,
    };

    const syncedProject = syncContentFilesInProject(baseProject, updatedContents);
    const saved = await renameProject(oldProjectId, syncedProject);

    setProjects((prev) =>
      prev.map((p) => (p.id === oldProjectId ? saved : p))
    );
    setSavedSnapshots((prev) => ({ ...prev, [saved.id]: saved }));
    if (activeProjectId === oldProjectId) {
      setActiveProjectId(saved.id);
    }
    appendLog(
      'success',
      'Project',
      t('app.renamedProject', {
        name: saved.manifest.name,
        modId: saved.manifest.modId,
      })
    );
  };

  const handleQuickBackupProject = async (project: ModProject) => {
    await getPlatformAdapter().ensureFirstTimeStorageSetup?.();
    const saved = await saveProjectBackup(
      project,
      `Snapshot v${project.manifest.version}`,
      'manual'
    );
    if (project.id === activeProjectId) {
      setBackups((prev) => [saved, ...prev]);
    }
    appendLog(
      'success',
      'Backup',
      t('app.backupCreatedNotice', { name: project.manifest.name })
    );
  };

  const handleLoadStarterSample = async () => {
    const sample = createStarterSampleProject();
    await saveProject(sample);
    setProjects((prev) => {
      const filtered = prev.filter((p) => p.id !== sample.id);
      return [sample, ...filtered];
    });
    setSavedSnapshots((prev) => ({ ...prev, [sample.id]: sample }));
    setActiveProjectId(sample.id);
    appendLog('info', 'Project', t('app.logLoadedSample', { name: sample.manifest.name }));
  };

  const handleUpdateSettings = (patch: Partial<EditorSettings>) => {
    if (patch.language) {
      setLanguage(patch.language);
    }
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  };

  const handleSelectAsset = useCallback(
    (assetId: string) => {
      if (!activeProject || activeProject.activeAssetId === assetId) return;
      persistProjectUpdate(
        { ...activeProject, activeAssetId: assetId },
        { recordUndo: false }
      );
    },
    [activeProject, persistProjectUpdate]
  );

  const handleUpdateAsset = (
    assetId: string,
    patch: Partial<ModAsset>,
    options?: { recordUndo?: boolean; historyGroupKey?: string }
  ) => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const nextAssets = activeProject.assets.map((a) =>
      a.id === assetId ? { ...a, ...patch } : a
    );
    const updatedAsset = nextAssets.find((a) => a.id === assetId);
    const nextFiles = activeProject.files.map((f) =>
      f.assetId === assetId && updatedAsset && !updatedAsset.isImported
        ? {
            ...f,
            content: serializeWoa3dAsset(updatedAsset),
            updatedAt: now,
          }
        : f
    );
    persistProjectUpdate(
      {
        ...activeProject,
        assets: nextAssets,
        files: nextFiles,
      },
      options
    );
  };

  const handleImportAssetFiles = async (fileList: FileList | File[]) => {
    if (!activeProject) return;
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) return;

    let currentPaths = activeProject.files.map((f) => f.path);
    const importedAssets: ModAsset[] = [];
    const importedNodes: ModFileNode[] = [];
    const errors: string[] = [];

    for (const file of filesArray) {
      try {
        const { asset, fileNode } = await importLocalAssetFile(
          activeProject.id,
          file,
          currentPaths
        );
        currentPaths.push(fileNode.path);
        importedAssets.push(asset);
        importedNodes.push(fileNode);
        appendLog(
          'success',
          'Assets',
          t('app.importedAsset', {
            category: asset.type,
            name: file.name,
            path: fileNode.path,
          })
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : t('app.assetImportFailed', { error: file.name });
        errors.push(msg);
        appendLog('error', 'Assets', msg);
      }
    }

    if (importedAssets.length > 0) {
      persistProjectUpdate({
        ...activeProject,
        assets: [...activeProject.assets, ...importedAssets],
        files: [...activeProject.files, ...importedNodes],
        activeAssetId: importedAssets[importedAssets.length - 1].id,
      });
    }

    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }
  };

  const handleAddProceduralAsset = (name: string, preset: AssetPresetKind) => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'asset';
    const existingPaths = activeProject.files.map((f) => f.path);
    const unique = getUniqueAssetPath('assets/models', `${slug}.woa3d`, existingPaths);
    const assetId = `asset_${Date.now()}`;

    const derivedCategory = deriveAssetModCategoryFromContext({
      preset,
      modCategories: activeProject.manifest.categories,
    });

    const newAsset: ModAsset = {
      id: assetId,
      name,
      path: unique.path,
      type: '3d-model',
      preset,
      format: 'WOA3D',
      sizeBytes: 16400,
      triangleEstimate: 1120,
      modCategory: derivedCategory,
      pivotMode: 'bottom-center',
      collision: { shape: 'box', scale: 1, offsetY: 0 },
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      material: {
        color: '#475569',
        accentColor: '#3B82F6',
        roughness: 0.35,
        metalness: 0.65,
        emissiveIntensity: 0.35,
        wireframe: false,
      },
      metadata: { lodLevels: 2, castShadows: true },
      createdAt: now,
    };

    const newFile: ModFileNode = {
      id: `file_${assetId}`,
      name: unique.fileName,
      path: unique.path,
      parentPath: 'assets/models',
      type: 'asset-3d',
      assetId,
      content: serializeWoa3dAsset({
        ...newAsset,
        schemaVersion: CURRENT_MOD_CONTENT_SCHEMA_VERSION,
      }),
      updatedAt: now,
    };

    persistProjectUpdate({
      ...activeProject,
      assets: [...activeProject.assets, newAsset],
      files: [...activeProject.files, newFile],
      activeAssetId: assetId,
    });
    appendLog(
      'info',
      'Assets',
      t('app.createdAsset', { name, path: newAsset.path })
    );
  };

  const handleRenameAsset = (assetId: string, newName: string) => {
    if (!activeProject) return;
    const target = activeProject.assets.find((a) => a.id === assetId);
    if (!target) return;

    const now = new Date().toISOString();
    const ext = getFileExtension(target.path) || 'woa3d';
    const dir = target.path.split('/').slice(0, -1).join('/') || 'assets/models';
    const otherPaths = activeProject.files
      .filter((f) => f.assetId !== assetId)
      .map((f) => f.path);
    const desiredFile = sanitizeFileName(newName, ext);
    const unique = getUniqueAssetPath(dir, desiredFile, otherPaths);

    const nextAssets = activeProject.assets.map((a) =>
      a.id === assetId
        ? { ...a, name: newName, path: unique.path, updatedAt: now }
        : a
    );
    const nextFiles = activeProject.files.map((f) =>
      f.assetId === assetId
        ? { ...f, name: unique.fileName, path: unique.path, updatedAt: now }
        : f
    );

    persistProjectUpdate({
      ...activeProject,
      assets: nextAssets,
      files: nextFiles,
    });
    appendLog('info', 'Assets', t('app.renamedAsset', { name: newName }));
  };

  const handleReplaceAsset = async (assetId: string, file: File) => {
    if (!activeProject) return;
    const target = activeProject.assets.find((a) => a.id === assetId);
    if (!target) return;

    const existingPaths = activeProject.files.map((f) => f.path);
    const { asset: replaced, fileNode } = await importLocalAssetFile(
      activeProject.id,
      file,
      existingPaths,
      target
    );

    const nextAssets = activeProject.assets.map((a) =>
      a.id === assetId ? replaced : a
    );
    const hasFileNode = activeProject.files.some((f) => f.assetId === assetId);
    const nextFiles = hasFileNode
      ? activeProject.files.map((f) => (f.assetId === assetId ? fileNode : f))
      : [...activeProject.files, fileNode];

    persistProjectUpdate({
      ...activeProject,
      assets: nextAssets,
      files: nextFiles,
      activeAssetId: assetId,
    });
    appendLog(
      'success',
      'Assets',
      t('app.replacedAsset', { name: target.name, path: fileNode.path })
    );
  };

  const handleDuplicateAsset = async (assetId: string) => {
    if (!activeProject) return;
    const source = activeProject.assets.find((a) => a.id === assetId);
    if (!source) return;

    const now = new Date().toISOString();
    const newId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const ext = getFileExtension(source.path) || 'woa3d';
    const dir = source.path.split('/').slice(0, -1).join('/') || 'assets/models';
    const stem = source.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'asset';
    const existingPaths = activeProject.files.map((f) => f.path);
    const unique = getUniqueAssetPath(dir, `${stem}_copy.${ext}`, existingPaths);

    let newBlobKey: string | undefined;
    if (source.blobKey) {
      newBlobKey = `${activeProject.id}/${newId}`;
      await duplicateAssetBlob(source.blobKey, newBlobKey);
    }

    const clonedName = `${source.name} ${t('app.duplicateSuffix')}`;
    const clonedAsset: ModAsset = {
      ...source,
      id: newId,
      name: clonedName,
      path: unique.path,
      blobKey: newBlobKey,
      createdAt: now,
      updatedAt: now,
    };

    const sourceFile = activeProject.files.find((f) => f.assetId === assetId);
    const clonedFile: ModFileNode = {
      id: `file_${newId}`,
      name: unique.fileName,
      path: unique.path,
      parentPath: dir,
      type:
        sourceFile?.type ??
        (source.type === 'texture'
          ? 'texture'
          : source.type === 'audio'
            ? 'audio'
            : 'asset-3d'),
      assetId: newId,
      content: sourceFile?.content,
      updatedAt: now,
    };

    persistProjectUpdate({
      ...activeProject,
      assets: [...activeProject.assets, clonedAsset],
      files: [...activeProject.files, clonedFile],
      activeAssetId: newId,
    });
    appendLog('info', 'Assets', t('app.duplicatedAsset', { name: clonedName }));
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!activeProject) return;
    const target = activeProject.assets.find((a) => a.id === assetId);
    if (!target) return;

    const nextAssets = activeProject.assets.filter((a) => a.id !== assetId);
    const nextFiles = activeProject.files.filter((f) => f.assetId !== assetId);

    persistProjectUpdate({
      ...activeProject,
      assets: nextAssets,
      files: nextFiles,
      activeAssetId:
        activeProject.activeAssetId === assetId
          ? nextAssets[0]?.id ?? null
          : activeProject.activeAssetId,
    });
    appendLog('warn', 'Assets', t('app.deletedAsset', { name: target.name }));
  };

  const handleUpdateManifest = (patch: Partial<ModManifest>) => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const nextManifest: ModManifest = {
      ...activeProject.manifest,
      ...patch,
      updatedAt: now,
    };
    const nextFiles = activeProject.files.map((f) =>
      f.path === 'mod.manifest.json'
        ? { ...f, content: serializeManifest(nextManifest), updatedAt: now }
        : f
    );
    persistProjectUpdate({
      ...activeProject,
      manifest: nextManifest,
      files: nextFiles,
    });
  };

  const handleSaveFile = (path: string, content: string) => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    let nextManifest = activeProject.manifest;
    if (path === 'mod.manifest.json' || path === 'mod.json') {
      try {
        nextManifest = {
          ...activeProject.manifest,
          ...JSON.parse(content),
          updatedAt: now,
        };
      } catch {
        // FileEditorPanel prevents saving invalid JSON
      }
    }
    const nextFiles = activeProject.files.map((f) =>
      f.path === path ? { ...f, content, updatedAt: now } : f
    );
    const exists = activeProject.files.some((f) => f.path === path);
    const updatedFiles = exists
      ? nextFiles
      : [
          ...nextFiles,
          {
            id: `file_${Date.now()}`,
            name: path.split('/').pop() ?? path,
            path,
            parentPath: path.includes('/')
              ? path.split('/').slice(0, -1).join('/')
              : null,
            type: path.endsWith('.md') ? ('doc' as const) : ('data' as const),
            content,
            updatedAt: now,
          },
        ];
    const isContentDataFile =
      Object.values(CONTENT_FILE_PATHS).includes(path) ||
      Object.values(EXTENDED_CONFIG_FILE_PATHS).includes(path);
    const updatedProject: ModProject = {
      ...activeProject,
      manifest: nextManifest,
      files: updatedFiles,
      ...(isContentDataFile ? { contents: undefined } : {}),
    };
    const finalProject = isContentDataFile
      ? syncContentFilesInProject(updatedProject, resolveProjectContents(updatedProject))
      : updatedProject;
    persistProjectUpdate(finalProject);
    appendLog('success', 'Editor', t('app.logFileSaved', { path }));
  };

  const handleUpsertLocalizationFile = (locale: string, content: string) => {
    if (!activeProject) return;
    const now = new Date().toISOString();
    const path = `localization/${locale}.json`;
    const hasFolder = activeProject.files.some((f) => f.path === 'localization');
    const hasFile = activeProject.files.some((f) => f.path === path);
    let nextFiles = [...activeProject.files];
    if (!hasFolder) {
      nextFiles.push({
        id: `dir_localization_${Date.now()}`,
        name: 'localization',
        path: 'localization',
        parentPath: null,
        type: 'folder',
        updatedAt: now,
      });
    }
    if (hasFile) {
      nextFiles = nextFiles.map((f) =>
        f.path === path ? { ...f, content, updatedAt: now } : f
      );
    } else {
      nextFiles.push({
        id: `file_loc_${locale}_${Date.now()}`,
        name: `${locale}.json`,
        path,
        parentPath: 'localization',
        type: 'data',
        content,
        updatedAt: now,
      });
    }
    persistProjectUpdate({
      ...activeProject,
      files: nextFiles,
    });
    appendLog('success', 'Localization', t('app.logFileSaved', { path }));
  };

  const handleUpdateContents = (nextContents: ModContentDatabase) => {
    if (!activeProject) return;
    const synced = syncContentFilesInProject(activeProject, nextContents);
    persistProjectUpdate(synced);
  };

  const handleAddFile = (
    parentPath: string,
    fileName: string,
    kind: 'script' | 'data'
  ) => {
    if (!activeProject) return;
    const path = `${parentPath}/${fileName}`;
    if (activeProject.files.some((f) => f.path === path)) {
      appendLog('warn', 'Explorer', t('app.logFileExists', { path }));
      return;
    }
    const now = new Date().toISOString();
    const starterContent =
      kind === 'script'
        ? `// ${fileName}\nexport function initModule(): void {\n  // Hook logic here\n}\n`
        : JSON.stringify({ entries: [] }, null, 2);

    persistProjectUpdate({
      ...activeProject,
      files: [
        ...activeProject.files,
        {
          id: `file_${Date.now()}`,
          name: fileName,
          path,
          parentPath,
          type: kind,
          content: starterContent,
          updatedAt: now,
        },
      ],
    });
    appendLog('info', 'Explorer', t('app.logFileCreated', { path }));
  };

  const handleDeleteFile = (path: string) => {
    if (!activeProject) return;
    const target = activeProject.files.find((f) => f.path === path);
    if (!target) return;
    if (target.assetId) {
      void handleDeleteAsset(target.assetId);
      return;
    }
    const nextFiles = activeProject.files.filter((f) => f.path !== path);
    persistProjectUpdate({
      ...activeProject,
      files: nextFiles,
    });
    appendLog('warn', 'Explorer', t('app.logFileDeleted', { path }));
  };

  const handleBumpVersion = (
    part: 'patch' | 'minor' | 'major',
    summary: string
  ) => {
    if (!activeProject) return;
    const parts = activeProject.manifest.version
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
    let [major = 0, minor = 1, patch = 0] = parts;
    if (part === 'major') {
      major += 1;
      minor = 0;
      patch = 0;
    } else if (part === 'minor') {
      minor += 1;
      patch = 0;
    } else {
      patch += 1;
    }
    const nextVersion = `${major}.${minor}.${patch}`;
    const entry: ModChangelogEntry = {
      id: `chg_${Date.now()}`,
      version: nextVersion,
      date: new Date().toISOString(),
      summary,
    };
    handleUpdateManifest({
      version: nextVersion,
      changelog: [entry, ...(activeProject.manifest.changelog ?? [])],
    });
    appendLog(
      'success',
      'Versioning',
      t('app.logVersionBumped', { version: nextVersion })
    );
  };

  const handleCreateBackup = useCallback(
    async (label: string, reason: ProjectBackupRecord['reason'] = 'manual') => {
      if (!activeProject) return;
      await getPlatformAdapter().ensureFirstTimeStorageSetup?.();
      const saved = await saveProjectBackup(
        activeProject,
        label || `Snapshot v${activeProject.manifest.version}`,
        reason
      );
      setBackups((prev) => [saved, ...prev]);
      appendLog('success', 'Backup', t('app.snapshotSaved', { label: saved.label }));
    },
    [activeProject, appendLog, t]
  );

  const handleRestoreBackup = async (backup: ProjectBackupRecord) => {
    const now = new Date().toISOString();
    const restored: ModProject = syncContentFilesInProject(
      {
        ...backup.project,
        id: backup.project.manifest.modId,
        lastOpenedAt: now,
      },
      resolveProjectContents(backup.project)
    );
    persistProjectUpdate(restored);
    await saveProject(restored);
    await saveStorageConfig({ lastOpenedProjectId: restored.id });
    setActiveProjectId(restored.id);
    appendLog('warn', 'Backup', t('app.snapshotRestored', { label: backup.label }));
  };

  const handleDeleteBackup = async (backupId: string) => {
    await deleteProjectBackup(backupId);
    setBackups((prev) => prev.filter((b) => b.id !== backupId));
    appendLog('info', 'Backup', t('app.logBackupRemoved'));
  };

  const handleExportProjectZip = async (targetProject: ModProject) => {
    try {
      await getPlatformAdapter().ensureFirstTimeStorageSetup?.();
      const blob = await exportWorkspaceProjectZip(targetProject);
      const filename = formatProjectZipFilename(
        targetProject.manifest.name,
        targetProject.manifest.modId
      );
      const saved = await saveExportedPackage(blob, filename, { promptSaveDialog: true });
      if (saved.cancelled) return;
      appendLog(
        'success',
        'Exporter',
        saved.locationLabel !== filename
          ? t('build.savedToLocation', { location: saved.locationLabel })
          : t('app.exportedBackup', { filename })
      );
    } catch (err) {
      if (err instanceof AndroidAccessDeniedError) {
        reportAndroidAccessError(err.operation, err, {
          permanentlyDenied: err.permanentlyDenied,
          retryAction: () => void handleExportProjectZip(targetProject),
        });
      }
      appendLog(
        'error',
        'Exporter',
        err instanceof Error ? err.message : t('build.exportFailed')
      );
    }
  };

  const handleRecordBuildComplete = useCallback(
    (report: BuildReport, recordInHistory = true) => {
      setLastBuild(report);
      if (!recordInHistory) return;
      const entry: BuildHistoryEntry = {
        id: report.id,
        modId: report.modId,
        modName: report.modName,
        version: report.version,
        targetPlatform: report.targetPlatform,
        buildStatus: report.buildStatus,
        packageFileName: report.packageFileName,
        packagedBytes: report.packagedBytes,
        assetCount: report.assetCount,
        registeredObjectCount: report.registeredObjectCount,
        warningCount: report.warnings.length,
        errorCount: report.validationReport?.errorCount ?? 0,
        durationMs: report.durationMs,
        timestamp: report.timestamp,
      };
      setBuildHistory((prev) => [entry, ...prev.slice(0, 49)]);
      void saveBuildHistoryEntry(entry);
    },
    []
  );

  const handleQuickBuild = async () => {
    if (!activeProject) return;
    if (settings.autoBackupOnBuild) {
      await handleCreateBackup(
        `Pre-build v${activeProject.manifest.version}`,
        'pre-build'
      );
    }
    const report = await buildModProjectAsync(
      activeProject,
      settings.defaultTargetPlatform,
      projects
    );
    handleRecordBuildComplete(report, true);
    const val = report.validationReport;
    const size = `${(report.packagedBytes / 1024).toFixed(1)} KB`;
    if (report.buildStatus === 'passed') {
      appendLog(
        'success',
        'Builder',
        t('app.logBuiltPassed', {
          filename: report.packageFileName,
          size,
          assets: report.assetCount,
          objects: report.registeredObjectCount,
          ms: report.durationMs,
        })
      );
    } else if (report.buildStatus === 'passed_with_warnings') {
      appendLog(
        'warn',
        'Builder',
        t('app.logBuiltWarnings', {
          filename: report.packageFileName,
          size,
          count: report.warnings.length,
        })
      );
    } else {
      appendLog(
        'error',
        'Builder',
        t('app.logBuiltBlocked', {
          filename: report.packageFileName,
          count: val?.errorCount ?? 0,
        })
      );
    }
    setActiveView('build');
  };

  const handleInspectIssueFromBuild = (issue: ValidationIssue) => {
    setPendingIssueFocus({ issue, token: Date.now() });
    setActiveView('workspace');
  };

  const handleBeforeBuildBackup = useCallback(async () => {
    if (!activeProject) return;
    await handleCreateBackup(
      `Pre-build v${activeProject.manifest.version}`,
      'pre-build'
    );
  }, [activeProject, handleCreateBackup]);

  const handleSaveBeforeExport = useCallback(async () => {
    if (!activeProject) return;
    const snapshot = activeProject;
    await saveProject(snapshot);
    setLastSavedAt(formatTimestamp());
    setSavedSnapshots((prev) => ({ ...prev, [snapshot.id]: snapshot }));
  }, [activeProject]);

  useBackNavigation(() => {
    if (createOpen) {
      setCreateOpen(false);
      return true;
    }
    if (activeView !== 'projects') {
      setActiveView('projects');
      return true;
    }
    return false;
  });

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100">
      <TopBar
        activeView={activeView}
        onNavigate={(view) => {
          if ((view === 'workspace' || view === 'build') && !activeProject) {
            setActiveView('projects');
            return;
          }
          setActiveView(view);
        }}
        activeProjectName={activeProject?.manifest.name ?? null}
        onCreateMod={() => setCreateOpen(true)}
        onBuildMod={handleQuickBuild}
      />

      {platformInfo.platform === 'android' && androidAccessIssue && (
        <div
          dir="auto"
          role="alert"
          className="shrink-0 px-4 py-3 border-b border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {t('android.accessTitle')}
              </div>
              <div className="font-medium">{androidAccessIssue.message}</div>
              <div className="text-[11px] opacity-90">{androidAccessIssue.explanation}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {androidAccessIssue.canRetry && androidAccessIssue.retryAction && (
              <button
                type="button"
                onClick={() => {
                  const retry = androidAccessIssue.retryAction;
                  clearAndroidAccessIssue();
                  void retry?.();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {androidAccessIssue.id.startsWith('android_saf_revoked')
                  ? t('android.reconnectFolderBtn')
                  : t('android.retryAccess')}
              </button>
            )}
            {androidAccessIssue.canOpenSettings && (
              <button
                type="button"
                onClick={() => void openAndroidAppSettings()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-amber-600/30 bg-white/80 text-slate-900 hover:bg-white dark:border-white/15 dark:bg-[#121823] dark:text-slate-100 dark:hover:bg-white/10 whitespace-nowrap"
              >
                <Settings className="w-3.5 h-3.5" />
                {t('android.openSettings')}
              </button>
            )}
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={clearAndroidAccessIssue}
              className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {!isLoaded ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          {t('app.loading')}
        </div>
      ) : activeView === 'projects' ? (
        <ProjectManagerView
          projects={projects}
          activeProjectId={activeProject?.id ?? null}
          onCreateMod={() => setCreateOpen(true)}
          onOpenProject={handleOpenProject}
          onImportFiles={handleImportProjectFile}
          onExportProjectZip={handleExportProjectZip}
          onDuplicateProject={handleDuplicateProject}
          onRenameProject={handleRenameProject}
          onBackupProject={handleQuickBackupProject}
          onDeleteProject={handleDeleteProject}
          onLoadStarterSample={handleLoadStarterSample}
        />
      ) : activeView === 'workspace' && activeProject ? (
        <WorkspaceView
          project={activeProject}
          allProjects={projects}
          backups={backups}
          settings={settings}
          logs={logs}
          pendingIssueFocus={pendingIssueFocus}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          hasUnsavedChanges={hasUnsavedChanges}
          lastSavedAt={lastSavedAt}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onManualSave={handleManualSave}
          onUpdateSettings={handleUpdateSettings}
          onSelectAsset={handleSelectAsset}
          onUpdateAsset={handleUpdateAsset}
          onUpdateContents={handleUpdateContents}
          onImportAssetFiles={handleImportAssetFiles}
          onAddProceduralAsset={handleAddProceduralAsset}
          onRenameAsset={handleRenameAsset}
          onReplaceAsset={handleReplaceAsset}
          onDuplicateAsset={handleDuplicateAsset}
          onDeleteAsset={handleDeleteAsset}
          onUpdateManifest={handleUpdateManifest}
          onSaveFile={handleSaveFile}
          onUpsertLocalizationFile={handleUpsertLocalizationFile}
          onAddFile={handleAddFile}
          onDeleteFile={handleDeleteFile}
          onBumpVersion={handleBumpVersion}
          onCreateBackup={(label) => handleCreateBackup(label, 'manual')}
          onRestoreBackup={handleRestoreBackup}
          onDeleteBackup={handleDeleteBackup}
          onExportWorkspaceProject={() => handleExportProjectZip(activeProject)}
          onOpenBuild={handleQuickBuild}
          onLog={appendLog}
          onClearLogs={() => setLogs([])}
        />
      ) : activeView === 'build' && activeProject ? (
        <BuildExportView
          project={activeProject}
          allProjects={projects}
          defaultTarget={settings.defaultTargetPlatform}
          lastBuild={lastBuild}
          buildHistory={buildHistory}
          onSaveBeforeExport={handleSaveBeforeExport}
          onBeforeBuildBackup={
            settings.autoBackupOnBuild ? handleBeforeBuildBackup : undefined
          }
          onBuildComplete={handleRecordBuildComplete}
          onInspectIssue={handleInspectIssueFromBuild}
          onLog={appendLog}
        />
      ) : activeView === 'api' ? (
        <ModApiDocsView />
      ) : (
        <SettingsView
          settings={settings}
          projectCount={projects.length}
          onUpdateSettings={handleUpdateSettings}
          onRestoreSampleProject={handleLoadStarterSample}
        />
      )}

      <CreateModModal
        open={createOpen}
        defaultAuthor={settings.defaultAuthor}
        defaultGameVersion={settings.defaultGameVersion}
        existingModIds={projects.map((p) => p.manifest.modId)}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateMod}
      />
    </div>
  );
}
