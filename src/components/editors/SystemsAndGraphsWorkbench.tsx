import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  Check,
  Copy,
  Download,
  FileCode2,
  GitBranch,
  Globe,
  HardDriveDownload,
  History,
  Layers,
  Link2,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Unlink,
} from 'lucide-react';
import { AnyWorkbenchKind } from '@/src/components/content/ContentEditorsWorkbench';
import {
  getWoaCompatibilityMatrix,
  WOA_MOD_API_SCHEMA,
  WOA_MOD_API_VERSION,
  WOA_PACKAGE_FORMAT_VERSION,
} from '@/src/core/api/woaModApiSpec';
import { triggerBlobDownload } from '@/src/core/builder/modBuilder';
import {
  extractObjectPart,
  resolveProjectContents,
} from '@/src/core/content/contentRegistry';
import {
  generateModHtmlDocs,
  generateModMarkdownDocs,
} from '@/src/core/docs/modDocGenerator';
import { useI18n } from '@/src/i18n';
import {
  ModAsset,
  ModContentDatabase,
  ModDependency,
  ModManifest,
  ModProject,
  ProjectBackupRecord,
} from '@/src/types/mod';

export type SystemsSubTab =
  | 'quest-graph'
  | 'asset-graph'
  | 'localization'
  | 'deps-order'
  | 'docs-backups';

interface SystemsAndGraphsWorkbenchProps {
  project: ModProject;
  allProjects: ModProject[];
  backups: ProjectBackupRecord[];
  onUpdateManifest: (patch: Partial<ModManifest>) => void;
  onUpdateContents: (next: ModContentDatabase) => void;
  onSaveFile: (path: string, content: string) => void;
  onUpsertLocalizationFile: (locale: string, content: string) => void;
  onBumpVersion: (part: 'patch' | 'minor' | 'major', summary: string) => void;
  onCreateBackup: (label: string) => Promise<void>;
  onRestoreBackup: (backup: ProjectBackupRecord) => Promise<void>;
  onDeleteBackup: (backupId: string) => Promise<void>;
  onExportWorkspaceProject: () => Promise<void>;
  onFocusContent: (kind: AnyWorkbenchKind, uid: string) => void;
  onSelectAsset: (assetId: string) => void;
  onLog: (
    level: 'info' | 'warn' | 'error' | 'success',
    source: string,
    message: string
  ) => void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseLocaleEntries(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
      else if (v != null) out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

function pickLocaleText(
  locale: string,
  base: string,
  map?: Record<string, string>
): string {
  if (locale === 'en') {
    return map?.en ?? base;
  }
  return map?.[locale] ?? '';
}

function collectExpectedLocalizationEntries(
  project: ModProject,
  contents: ModContentDatabase,
  locale: string
): Record<string, string> {
  const modId = project.manifest.modId;
  const map: Record<string, string> = {
    [`mod.${modId}.name`]: pickLocaleText(
      locale,
      project.manifest.name,
      project.manifest.translations?.name
    ),
    [`mod.${modId}.description`]: pickLocaleText(
      locale,
      project.manifest.description,
      project.manifest.translations?.description
    ),
  };

  contents.items.forEach((item) => {
    const slug = extractObjectPart(item.id);
    map[`item.${modId}.${slug}.name`] = pickLocaleText(
      locale,
      item.name,
      item.translations?.name
    );
    map[`item.${modId}.${slug}.description`] = pickLocaleText(
      locale,
      item.description,
      item.translations?.description
    );
  });
  contents.weapons.forEach((weapon) => {
    const slug = extractObjectPart(weapon.id);
    map[`weapon.${modId}.${slug}.name`] = pickLocaleText(
      locale,
      weapon.name,
      weapon.translations?.name
    );
    map[`weapon.${modId}.${slug}.description`] = pickLocaleText(
      locale,
      weapon.description,
      weapon.translations?.description
    );
  });
  contents.armor.forEach((armor) => {
    const slug = extractObjectPart(armor.id);
    map[`armor.${modId}.${slug}.name`] = pickLocaleText(
      locale,
      armor.name,
      armor.translations?.name
    );
    map[`armor.${modId}.${slug}.description`] = pickLocaleText(
      locale,
      armor.description,
      armor.translations?.description
    );
  });
  contents.npcs.forEach((npc) => {
    const slug = extractObjectPart(npc.id);
    map[`npc.${modId}.${slug}.name`] = pickLocaleText(
      locale,
      npc.name,
      npc.translations?.name
    );
    map[`npc.${modId}.${slug}.description`] = pickLocaleText(
      locale,
      npc.description,
      npc.translations?.description
    );
  });
  contents.monsters.forEach((monster) => {
    const slug = extractObjectPart(monster.id);
    map[`monster.${modId}.${slug}.name`] = pickLocaleText(
      locale,
      monster.name,
      monster.translations?.name
    );
    map[`monster.${modId}.${slug}.description`] = pickLocaleText(
      locale,
      monster.description,
      monster.translations?.description
    );
  });
  contents.quests.forEach((quest) => {
    const slug = extractObjectPart(quest.id);
    map[`quest.${modId}.${slug}.name`] = pickLocaleText(
      locale,
      quest.name,
      quest.translations?.name
    );
    map[`quest.${modId}.${slug}.description`] = pickLocaleText(
      locale,
      quest.description,
      quest.translations?.description
    );
  });
  contents.buildings.forEach((b) => {
    const slug = extractObjectPart(b.id);
    map[`building.${modId}.${slug}.name`] = pickLocaleText(
      locale,
      b.name,
      b.translations?.name
    );
    map[`building.${modId}.${slug}.description`] = pickLocaleText(
      locale,
      b.description,
      b.translations?.description
    );
  });
  (contents.worldObjects ?? []).forEach((wo) => {
    const slug = extractObjectPart(wo.id);
    map[`world_object.${modId}.${slug}.name`] = pickLocaleText(
      locale,
      wo.name,
      wo.translations?.name
    );
    map[`world_object.${modId}.${slug}.prompt`] = pickLocaleText(
      locale,
      wo.interactionPrompt,
      wo.promptTranslations
    );
  });
  (contents.dialogues ?? []).forEach((dlg) => {
    const slug = extractObjectPart(dlg.id);
    map[`dialogue.${modId}.${slug}.title`] = pickLocaleText(
      locale,
      dlg.name,
      dlg.translations?.name
    );
  });

  return map;
}

export const SystemsAndGraphsWorkbench: React.FC<SystemsAndGraphsWorkbenchProps> = ({
  project,
  allProjects,
  backups,
  onUpdateManifest,
  onUpdateContents,
  onSaveFile,
  onUpsertLocalizationFile,
  onBumpVersion,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  onExportWorkspaceProject,
  onFocusContent,
  onSelectAsset,
  onLog,
}) => {
  const { t } = useI18n();
  const [subTab, setSubTab] = useState<SystemsSubTab>('quest-graph');

  const contents = useMemo(() => resolveProjectContents(project), [project]);

  // --- 1. Quest Graph State ---
  const [selectedQuestUid, setSelectedQuestUid] = useState<string | null>(
    contents.quests[0]?.uid ?? null
  );
  const [prereqDraftId, setPrereqDraftId] = useState('');

  useEffect(() => {
    if (
      contents.quests.length > 0 &&
      !contents.quests.some((q) => q.uid === selectedQuestUid)
    ) {
      setSelectedQuestUid(contents.quests[0].uid);
    }
  }, [contents.quests, selectedQuestUid]);

  const selectedQuest =
    contents.quests.find((q) => q.uid === selectedQuestUid) ?? null;

  const questGraphLayout = useMemo(() => {
    const quests = contents.quests;
    const byId = new Map(quests.map((q) => [q.id, q]));
    const depthMap = new Map<string, number>();

    const computeDepth = (id: string, stack = new Set<string>()): number => {
      if (depthMap.has(id)) return depthMap.get(id)!;
      if (stack.has(id)) return 0;
      const q = byId.get(id);
      if (!q) return 0;
      const nextStack = new Set(stack);
      nextStack.add(id);

      let maxParent = -1;
      for (const pId of q.chain.prerequisiteQuestIds) {
        if (byId.has(pId)) {
          maxParent = Math.max(maxParent, computeDepth(pId, nextStack));
        }
      }
      for (const other of quests) {
        if (other.chain.nextQuestId === q.id && other.id !== q.id) {
          maxParent = Math.max(maxParent, computeDepth(other.id, nextStack));
        }
      }
      const d = maxParent + 1;
      depthMap.set(id, d);
      return d;
    };

    quests.forEach((q) => computeDepth(q.id));

    const columns = new Map<number, typeof quests>();
    quests.forEach((q) => {
      const col = depthMap.get(q.id) ?? 0;
      const list = columns.get(col) ?? [];
      list.push(q);
      columns.set(col, list);
    });

    const nodeWidth = 210;
    const nodeHeight = 76;
    const colGap = 270;
    const rowGap = 104;
    const padX = 28;
    const padY = 28;

    const positions = new Map<string, { x: number; y: number }>();
    let maxCol = 0;
    let maxRowCount = 1;

    Array.from(columns.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([colIdx, list]) => {
        maxCol = Math.max(maxCol, colIdx);
        maxRowCount = Math.max(maxRowCount, list.length);
        list.forEach((q, rowIdx) => {
          positions.set(q.id, {
            x: padX + colIdx * colGap,
            y: padY + rowIdx * rowGap,
          });
        });
      });

    const edges: {
      id: string;
      fromId: string;
      toId: string;
      kind: 'prereq' | 'next';
    }[] = [];
    const seen = new Set<string>();

    quests.forEach((q) => {
      q.chain.prerequisiteQuestIds.forEach((prereqId) => {
        if (!byId.has(prereqId)) return;
        const key = `${prereqId}->${q.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ id: key, fromId: prereqId, toId: q.id, kind: 'prereq' });
        }
      });
      if (q.chain.nextQuestId && byId.has(q.chain.nextQuestId)) {
        const key = `${q.id}->${q.chain.nextQuestId}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            id: key,
            fromId: q.id,
            toId: q.chain.nextQuestId,
            kind: 'next',
          });
        }
      }
    });

    return {
      width: Math.max(620, padX * 2 + (maxCol + 1) * colGap - 40),
      height: Math.max(260, padY * 2 + maxRowCount * rowGap),
      nodeWidth,
      nodeHeight,
      positions,
      edges,
    };
  }, [contents.quests]);

  // --- 2. Asset Dependency Graph ---
  const assetGraph = useMemo(() => {
    const assetByPath = new Map<string, ModAsset>();
    project.assets.forEach((a) => assetByPath.set(a.path, a));

    interface ContentRefNode {
      uid: string;
      kind: AnyWorkbenchKind;
      label: string;
      id: string;
      refs: { field: string; path: string; broken: boolean; assetId?: string }[];
    }

    const contentNodes: ContentRefNode[] = [];
    const referencedAssetPaths = new Set<string>();

    const pushNode = (
      uid: string,
      kind: AnyWorkbenchKind,
      label: string,
      id: string,
      rawRefs: { field: string; path?: string }[]
    ) => {
      const refs = rawRefs
        .filter((r) => Boolean(r.path && r.path.trim().length > 0))
        .map((r) => {
          const p = (r.path ?? '').trim();
          if (p.startsWith('woa:')) {
            return { field: r.field, path: p, broken: false };
          }
          const matched = assetByPath.get(p);
          if (matched) referencedAssetPaths.add(matched.path);
          return {
            field: r.field,
            path: p,
            broken: !matched,
            assetId: matched?.id,
          };
        });
      if (refs.length > 0) {
        contentNodes.push({ uid, kind, label, id, refs });
      }
    };

    contents.items.forEach((i) =>
      pushNode(i.uid, 'item', i.name, i.id, [{ field: 'icon', path: i.icon }])
    );
    contents.weapons.forEach((w) =>
      pushNode(w.uid, 'weapon', w.name, w.id, [
        { field: 'model', path: w.model },
        { field: 'icon', path: w.icon },
        { field: 'sound', path: w.sound },
      ])
    );
    contents.armor.forEach((a) =>
      pushNode(a.uid, 'armor', a.name, a.id, [
        { field: 'model', path: a.model },
        { field: 'icon', path: a.icon },
      ])
    );
    contents.npcs.forEach((n) =>
      pushNode(n.uid, 'npc', n.name, n.id, [{ field: 'model', path: n.model }])
    );
    contents.monsters.forEach((m) =>
      pushNode(m.uid, 'monster', m.name, m.id, [{ field: 'model', path: m.model }])
    );
    contents.buildings.forEach((b) =>
      pushNode(b.uid, 'building', b.name, b.id, [
        { field: 'model', path: b.model },
        ...b.pieces.map((p, idx) => ({
          field: `piece[${idx}]`,
          path: p.model,
        })),
      ])
    );
    (contents.audioCues ?? []).forEach((ac) =>
      pushNode(ac.uid, 'audio', ac.name, ac.id, [
        { field: 'assetPath', path: ac.assetPath },
      ])
    );
    (contents.materials ?? []).forEach((mat) =>
      pushNode(mat.uid, 'material', mat.name, mat.id, [
        { field: 'albedo', path: mat.albedoTexture },
        { field: 'normal', path: mat.normalTexture },
      ])
    );
    (contents.worldObjects ?? []).forEach((wo) =>
      pushNode(wo.uid, 'world_object', wo.name, wo.id, [
        { field: 'model', path: wo.model },
      ])
    );

    const unusedAssets = project.assets.filter(
      (a) => !referencedAssetPaths.has(a.path)
    );
    const brokenRefs = contentNodes.flatMap((cn) =>
      cn.refs
        .filter((r) => r.broken)
        .map((r) => ({ content: cn, ref: r }))
    );

    return {
      contentNodes,
      unusedAssets,
      brokenRefs,
      referencedCount: referencedAssetPaths.size,
    };
  }, [project.assets, contents]);

  // --- 3. Localization Editor State ---
  const localeFiles = useMemo(
    () =>
      project.files
        .filter(
          (f) =>
            f.type !== 'folder' &&
            f.path.startsWith('localization/') &&
            f.path.endsWith('.json')
        )
        .sort((a, b) => a.path.localeCompare(b.path)),
    [project.files]
  );

  const [activeLocale, setActiveLocale] = useState<string>('en');
  const [newLocaleCode, setNewLocaleCode] = useState('');
  const [localeSearch, setLocaleSearch] = useState('');
  const [newLocKey, setNewLocKey] = useState('');
  const [newLocVal, setNewLocVal] = useState('');
  const [localeDraft, setLocaleDraft] = useState<Record<string, string>>({});
  const [localeDirty, setLocaleDirty] = useState(false);

  useEffect(() => {
    const targetPath = `localization/${activeLocale}.json`;
    const file = localeFiles.find((f) => f.path === targetPath);
    if (file) {
      setLocaleDraft(parseLocaleEntries(file.content));
      setLocaleDirty(false);
    } else if (localeFiles.length > 0) {
      const firstCode = localeFiles[0].name.replace(/\.json$/i, '');
      setActiveLocale(firstCode);
    } else {
      setLocaleDraft(
        collectExpectedLocalizationEntries(project, contents, activeLocale)
      );
      setLocaleDirty(false);
    }
  }, [activeLocale, localeFiles, project, contents]);

  const expectedKeys = useMemo(
    () => collectExpectedLocalizationEntries(project, contents, activeLocale),
    [project, contents, activeLocale]
  );

  const filteredLocaleKeys = useMemo(() => {
    const q = localeSearch.trim().toLowerCase();
    return Object.keys(localeDraft)
      .sort()
      .filter((k) => {
        if (!q) return true;
        return (
          k.toLowerCase().includes(q) ||
          (localeDraft[k] ?? '').toLowerCase().includes(q)
        );
      });
  }, [localeDraft, localeSearch]);

  const handleSyncMissingLocaleKeys = () => {
    let added = 0;
    const next = { ...localeDraft };
    for (const [k, val] of Object.entries(expectedKeys)) {
      if (!(k in next)) {
        next[k] = val;
        added += 1;
      }
    }
    setLocaleDraft(next);
    if (added > 0) {
      setLocaleDirty(true);
      onLog(
        'info',
        t('workspace.tabSystems'),
        t('systems.locSyncedLog', { count: added, locale: activeLocale })
      );
    } else {
      onLog(
        'info',
        t('workspace.tabSystems'),
        t('systems.locAlreadyHasAllLog', {
          locale: activeLocale,
          count: Object.keys(expectedKeys).length,
        })
      );
    }
  };

  const handleSaveLocale = () => {
    const sorted: Record<string, string> = {};
    Object.keys(localeDraft)
      .sort()
      .forEach((k) => {
        sorted[k] = localeDraft[k];
      });
    onUpsertLocalizationFile(activeLocale, JSON.stringify(sorted, null, 2));
    setLocaleDirty(false);
  };

  const handleCreateLocale = () => {
    const clean = newLocaleCode
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    if (!clean) return;
    const seeded = collectExpectedLocalizationEntries(project, contents, clean);
    onUpsertLocalizationFile(clean, JSON.stringify(seeded, null, 2));
    onLog(
      'success',
      t('workspace.tabSystems'),
      t('systems.locCreatedLog', { locale: clean })
    );
    setActiveLocale(clean);
    setNewLocaleCode('');
  };

  // --- 4. Dependencies, Load Order & Versioning State ---
  const [depModId, setDepModId] = useState('');
  const [depVersionRange, setDepVersionRange] = useState('^1.0.0');
  const [depOptional, setDepOptional] = useState(false);
  const [loadAfterDraft, setLoadAfterDraft] = useState('');
  const [loadBeforeDraft, setLoadBeforeDraft] = useState('');
  const [releaseSummary, setReleaseSummary] = useState('');

  const loadOrder = project.manifest.loadOrder ?? {
    priority: 100,
    loadAfter: ['woa.core'],
    loadBefore: [],
  };

  const resolvedWorkspaceOrder = useMemo(() => {
    const list = [...allProjects];
    return list.sort((a, b) => {
      const aAfterB = (a.manifest.loadOrder?.loadAfter ?? []).includes(
        b.manifest.modId
      );
      const bAfterA = (b.manifest.loadOrder?.loadAfter ?? []).includes(
        a.manifest.modId
      );
      const aBeforeB = (a.manifest.loadOrder?.loadBefore ?? []).includes(
        b.manifest.modId
      );
      const bBeforeA = (b.manifest.loadOrder?.loadBefore ?? []).includes(
        a.manifest.modId
      );
      if (aAfterB || bBeforeA) return 1;
      if (bAfterA || aBeforeB) return -1;
      return (
        (a.manifest.loadOrder?.priority ?? 100) -
        (b.manifest.loadOrder?.priority ?? 100)
      );
    });
  }, [allProjects]);

  const handleAddDependency = () => {
    const cleanId = depModId.trim();
    if (!cleanId || cleanId === project.manifest.modId) return;
    const current = project.manifest.dependencies ?? [];
    if (current.some((d) => d.modId === cleanId)) return;
    const nextDeps: ModDependency[] = [
      ...current,
      {
        modId: cleanId,
        versionRange: depVersionRange.trim() || '^1.0.0',
        optional: depOptional,
      },
    ];
    onUpdateManifest({ dependencies: nextDeps });
    setDepModId('');
  };

  // --- 5. Docs & Backups State ---
  const [backupLabel, setBackupLabel] = useState('');
  const [docsCopied, setDocsCopied] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);

  const generatedMarkdown = useMemo(() => generateModMarkdownDocs(project), [project]);

  const subTabs: { id: SystemsSubTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'quest-graph',
      label: t('systems.questTabLabel', { count: contents.quests.length }),
      icon: <GitBranch className="w-3.5 h-3.5" />,
    },
    {
      id: 'asset-graph',
      label:
        assetGraph.brokenRefs.length > 0
          ? t('systems.assetTabBroken', { count: assetGraph.brokenRefs.length })
          : t('systems.assetTabOk', { count: project.assets.length }),
      icon: <Network className="w-3.5 h-3.5" />,
    },
    {
      id: 'localization',
      label: t('systems.locTabLabel', { count: localeFiles.length }),
      icon: <Globe className="w-3.5 h-3.5" />,
    },
    {
      id: 'deps-order',
      label: t('systems.depsTabLabel'),
      icon: <Layers className="w-3.5 h-3.5" />,
    },
    {
      id: 'docs-backups',
      label: t('systems.docsTabLabel', { count: backups.length }),
      icon: <BookOpen className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-[#0B0F17]">
      {/* Top Sub-Navigation Strip */}
      <div className="shrink-0 px-3 py-2 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-1.5">
          {subTabs.map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-[#121823] dark:text-slate-300 dark:border-white/10 dark:hover:bg-white/5'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        <span
          dir="ltr"
          className="hidden xl:inline-block text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0"
        >
          {t('systems.apiSchemaBadge', {
            schema: WOA_MOD_API_SCHEMA,
            ver: WOA_PACKAGE_FORMAT_VERSION,
          })}
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
        {/* TAB 1: QUEST GRAPH EDITOR */}
        {subTab === 'quest-graph' && (
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t('systems.questGraphTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('systems.questGraphSub')}
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                  {t('systems.legendMainQuest')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                  {t('systems.legendSideQuest')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-slate-400 inline-block" />
                  {t('systems.legendChainEdge')}
                </span>
              </div>
            </div>

            {contents.quests.length === 0 ? (
              <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-8 text-center space-y-2">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {t('systems.questGraphEmptyTitle')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('systems.questGraphEmptyDesc')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* SVG DAG Canvas */}
                <div
                  dir="ltr"
                  className="xl:col-span-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] overflow-auto"
                >
                  <svg
                    width={questGraphLayout.width}
                    height={questGraphLayout.height}
                    className="block select-none"
                  >
                    <defs>
                      <marker
                        id="woa-quest-arrow"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7"
                        refY="4"
                        orient="auto"
                      >
                        <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b" />
                      </marker>
                      <marker
                        id="woa-quest-arrow-active"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7"
                        refY="4"
                        orient="auto"
                      >
                        <path d="M 0 0 L 8 4 L 0 8 z" fill="#3b82f6" />
                      </marker>
                    </defs>

                    {/* Edges */}
                    {questGraphLayout.edges.map((edge) => {
                      const from = questGraphLayout.positions.get(edge.fromId);
                      const to = questGraphLayout.positions.get(edge.toId);
                      if (!from || !to) return null;
                      const x1 = from.x + questGraphLayout.nodeWidth;
                      const y1 = from.y + questGraphLayout.nodeHeight / 2;
                      const x2 = to.x;
                      const y2 = to.y + questGraphLayout.nodeHeight / 2;
                      const mx = (x1 + x2) / 2;
                      const isHighlighted =
                        selectedQuest &&
                        (selectedQuest.id === edge.fromId ||
                          selectedQuest.id === edge.toId);

                      return (
                        <path
                          key={edge.id}
                          d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke={isHighlighted ? '#3b82f6' : '#64748b'}
                          strokeWidth={isHighlighted ? 2.2 : 1.5}
                          strokeDasharray={edge.kind === 'prereq' ? undefined : '5 3'}
                          markerEnd={
                            isHighlighted
                              ? 'url(#woa-quest-arrow-active)'
                              : 'url(#woa-quest-arrow)'
                          }
                        />
                      );
                    })}

                    {/* Nodes */}
                    {contents.quests.map((q) => {
                      const pos = questGraphLayout.positions.get(q.id);
                      if (!pos) return null;
                      const selected = q.uid === selectedQuestUid;
                      const accent =
                        q.questType === 'main' ? '#3b82f6' : '#10b981';

                      return (
                        <g
                          key={q.uid}
                          transform={`translate(${pos.x}, ${pos.y})`}
                          onClick={() => setSelectedQuestUid(q.uid)}
                          className="cursor-pointer"
                        >
                          <rect
                            width={questGraphLayout.nodeWidth}
                            height={questGraphLayout.nodeHeight}
                            rx={8}
                            fill={selected ? '#1e293b' : '#0f172a'}
                            stroke={selected ? '#60a5fa' : '#334155'}
                            strokeWidth={selected ? 2 : 1}
                          />
                          <rect
                            x={0}
                            y={0}
                            width={questGraphLayout.nodeWidth}
                            height={4}
                            rx={2}
                            fill={accent}
                          />
                          <text
                            x={12}
                            y={24}
                            fill="#f8fafc"
                            fontSize={12}
                            fontWeight={600}
                          >
                            {q.name.length > 24
                              ? `${q.name.slice(0, 23)}…`
                              : q.name}
                          </text>
                          <text
                            x={12}
                            y={42}
                            fill="#94a3b8"
                            fontSize={10}
                            fontFamily="ui-monospace, monospace"
                          >
                            {extractObjectPart(q.id)}
                          </text>
                          <text x={12} y={60} fill="#cbd5e1" fontSize={10}>
                            {q.questType.toUpperCase()} · Lv.{q.recommendedLevel} ·{' '}
                            {q.objectives.length} obj · {q.rewards.xp} XP
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Selected Quest Node Inspector */}
                <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-4">
                  {selectedQuest ? (
                    <>
                      <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/10">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {selectedQuest.name}
                          </div>
                          <div
                            dir="ltr"
                            className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate text-start"
                          >
                            {selectedQuest.id}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onFocusContent('quest', selectedQuest.uid)}
                          className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
                        >
                          {t('systems.openInEditor')}
                        </button>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('systems.questTrackLabel')}
                        </label>
                        <select
                          value={selectedQuest.questType}
                          onChange={(e) => {
                            const questType = e.target.value as 'main' | 'side';
                            onUpdateContents({
                              ...contents,
                              quests: contents.quests.map((q) =>
                                q.uid === selectedQuest.uid ? { ...q, questType } : q
                              ),
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                        >
                          <option value="main">{t('form.mainQuest')}</option>
                          <option value="side">{t('form.sideQuest')}</option>
                        </select>
                      </div>

                      {/* Prerequisite Quests */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                          {t('systems.prereqQuestsCount', {
                            count: selectedQuest.chain.prerequisiteQuestIds.length,
                          })}
                        </div>
                        <div className="flex gap-1.5">
                          <select
                            value={prereqDraftId}
                            onChange={(e) => setPrereqDraftId(e.target.value)}
                            className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                          >
                            <option value="">{t('systems.selectPrereqOption')}</option>
                            {contents.quests
                              .filter(
                                (q) =>
                                  q.id !== selectedQuest.id &&
                                  !selectedQuest.chain.prerequisiteQuestIds.includes(
                                    q.id
                                  )
                              )
                              .map((q) => (
                                <option key={q.uid} value={q.id}>
                                  {q.name} ({extractObjectPart(q.id)})
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={!prereqDraftId}
                            onClick={() => {
                              if (!prereqDraftId) return;
                              onUpdateContents({
                                ...contents,
                                quests: contents.quests.map((q) =>
                                  q.uid === selectedQuest.uid
                                    ? {
                                        ...q,
                                        chain: {
                                          ...q.chain,
                                          prerequisiteQuestIds: [
                                            ...q.chain.prerequisiteQuestIds,
                                            prereqDraftId,
                                          ],
                                        },
                                      }
                                    : q
                                ),
                              });
                              setPrereqDraftId('');
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 whitespace-nowrap shrink-0"
                          >
                            {t('systems.linkBtn')}
                          </button>
                        </div>

                        {selectedQuest.chain.prerequisiteQuestIds.length > 0 && (
                          <div className="space-y-1">
                            {selectedQuest.chain.prerequisiteQuestIds.map((pid) => (
                              <div
                                key={pid}
                                className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] flex items-center justify-between gap-2 text-xs"
                              >
                                <span dir="ltr" className="font-mono text-[11px] truncate">
                                  {pid}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateContents({
                                      ...contents,
                                      quests: contents.quests.map((q) =>
                                        q.uid === selectedQuest.uid
                                          ? {
                                              ...q,
                                              chain: {
                                                ...q.chain,
                                                prerequisiteQuestIds:
                                                  q.chain.prerequisiteQuestIds.filter(
                                                    (x) => x !== pid
                                                  ),
                                              },
                                            }
                                          : q
                                      ),
                                    })
                                  }
                                  className="text-slate-400 hover:text-red-500"
                                  title={t('systems.unlinkPrereqTooltip')}
                                >
                                  <Unlink className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Next Quest in Chain */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {t('systems.nextQuestLabel')}
                        </label>
                        <select
                          value={selectedQuest.chain.nextQuestId}
                          onChange={(e) =>
                            onUpdateContents({
                              ...contents,
                              quests: contents.quests.map((q) =>
                                q.uid === selectedQuest.uid
                                  ? {
                                      ...q,
                                      chain: {
                                        ...q.chain,
                                        nextQuestId: e.target.value,
                                      },
                                    }
                                  : q
                              ),
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                        >
                          <option value="">{t('systems.noneEndBranch')}</option>
                          {contents.quests
                            .filter((q) => q.id !== selectedQuest.id)
                            .map((q) => (
                              <option key={q.uid} value={q.id}>
                                {q.name} ({extractObjectPart(q.id)})
                              </option>
                            ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('systems.selectQuestNodeHint')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ASSET DEPENDENCY GRAPH */}
        {subTab === 'asset-graph' && (
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-3.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('systems.contentNodesLabel')}
                </div>
                <div
                  dir="ltr"
                  className="mt-1 text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 text-start"
                >
                  {assetGraph.contentNodes.length}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-3.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('systems.boundAssetsLabel')}
                </div>
                <div
                  dir="ltr"
                  className="mt-1 text-lg font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 text-start"
                >
                  {assetGraph.referencedCount} / {project.assets.length}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-3.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('systems.unusedAssetsLabel')}
                </div>
                <div
                  dir="ltr"
                  className="mt-1 text-lg font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400 text-start"
                >
                  {assetGraph.unusedAssets.length}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-3.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('systems.brokenRefsLabel')}
                </div>
                <div
                  dir="ltr"
                  className={`mt-1 text-lg font-mono font-semibold tabular-nums text-start ${
                    assetGraph.brokenRefs.length > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {assetGraph.brokenRefs.length}
                </div>
              </div>
            </div>

            {/* Visual Bipartite Dependency SVG */}
            <div
              dir="ltr"
              className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] overflow-auto p-4"
            >
              {(() => {
                const leftNodes = assetGraph.contentNodes.slice(0, 24);
                const rightAssets = project.assets.slice(0, 24);
                const missingPaths = Array.from(
                  new Set(assetGraph.brokenRefs.map((b) => b.ref.path))
                ).slice(0, 10);
                const rightCount = rightAssets.length + missingPaths.length;
                const rowH = 44;
                const svgH = Math.max(240, Math.max(leftNodes.length, rightCount) * rowH + 40);
                const svgW = 860;

                const rightPos = new Map<string, { x: number; y: number }>();
                rightAssets.forEach((a, idx) =>
                  rightPos.set(a.path, { x: 580, y: 24 + idx * rowH })
                );
                missingPaths.forEach((p, idx) =>
                  rightPos.set(p, {
                    x: 580,
                    y: 24 + (rightAssets.length + idx) * rowH,
                  })
                );

                return (
                  <svg width={svgW} height={svgH} className="block select-none">
                    {leftNodes.map((cn, idx) => {
                      const y1 = 24 + idx * rowH + 17;
                      return cn.refs.map((r, rIdx) => {
                        const target = rightPos.get(r.path);
                        if (!target) return null;
                        const y2 = target.y + 17;
                        return (
                          <path
                            key={`${cn.uid}_${rIdx}`}
                            d={`M 270 ${y1} C 410 ${y1}, 440 ${y2}, 580 ${y2}`}
                            fill="none"
                            stroke={r.broken ? '#ef4444' : '#3b82f6'}
                            strokeOpacity={r.broken ? 0.9 : 0.45}
                            strokeWidth={r.broken ? 2 : 1.4}
                            strokeDasharray={r.broken ? '4 3' : undefined}
                          />
                        );
                      });
                    })}

                    {leftNodes.map((cn, idx) => {
                      const y = 24 + idx * rowH;
                      const hasBroken = cn.refs.some((r) => r.broken);
                      return (
                        <g
                          key={cn.uid}
                          transform={`translate(16, ${y})`}
                          onClick={() => onFocusContent(cn.kind, cn.uid)}
                          className="cursor-pointer"
                        >
                          <rect
                            width={254}
                            height={34}
                            rx={6}
                            fill="#0f172a"
                            stroke={hasBroken ? '#ef4444' : '#334155'}
                          />
                          <text
                            x={10}
                            y={15}
                            fill="#f8fafc"
                            fontSize={11}
                            fontWeight={600}
                          >
                            {cn.label.length > 26
                              ? `${cn.label.slice(0, 25)}…`
                              : cn.label}
                          </text>
                          <text
                            x={10}
                            y={28}
                            fill="#94a3b8"
                            fontSize={9}
                            fontFamily="ui-monospace, monospace"
                          >
                            {t('systems.nodeRefsCount', {
                              kind: cn.kind,
                              count: cn.refs.length,
                            })}
                          </text>
                        </g>
                      );
                    })}

                    {rightAssets.map((a) => {
                      const pos = rightPos.get(a.path)!;
                      const used = assetGraph.contentNodes.some((cn) =>
                        cn.refs.some((r) => r.path === a.path)
                      );
                      return (
                        <g
                          key={a.id}
                          transform={`translate(${pos.x}, ${pos.y})`}
                          onClick={() => onSelectAsset(a.id)}
                          className="cursor-pointer"
                        >
                          <rect
                            width={264}
                            height={34}
                            rx={6}
                            fill="#0f172a"
                            stroke={used ? '#10b981' : '#f59e0b'}
                          />
                          <text
                            x={10}
                            y={15}
                            fill="#f8fafc"
                            fontSize={11}
                            fontWeight={600}
                          >
                            {a.name.length > 28 ? `${a.name.slice(0, 27)}…` : a.name}
                          </text>
                          <text
                            x={10}
                            y={28}
                            fill={used ? '#34d399' : '#fbbf24'}
                            fontSize={9}
                            fontFamily="ui-monospace, monospace"
                          >
                            {a.path.length > 36 ? `…${a.path.slice(-35)}` : a.path}
                          </text>
                        </g>
                      );
                    })}

                    {missingPaths.map((mp) => {
                      const pos = rightPos.get(mp)!;
                      return (
                        <g key={mp} transform={`translate(${pos.x}, ${pos.y})`}>
                          <rect
                            width={264}
                            height={34}
                            rx={6}
                            fill="#450a0a"
                            stroke="#ef4444"
                          />
                          <text x={10} y={15} fill="#fecaca" fontSize={11} fontWeight={600}>
                            {t('systems.missingAssetFile')}
                          </text>
                          <text
                            x={10}
                            y={28}
                            fill="#fca5a5"
                            fontSize={9}
                            fontFamily="ui-monospace, monospace"
                          >
                            {mp.length > 36 ? `…${mp.slice(-35)}` : mp}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>

            {assetGraph.brokenRefs.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-2">
                <div className="text-xs font-semibold text-red-700 dark:text-red-300">
                  {t('systems.brokenRefsTitle', {
                    count: assetGraph.brokenRefs.length,
                  })}
                </div>
                <div className="divide-y divide-red-500/20">
                  {assetGraph.brokenRefs.map((b, idx) => (
                    <div
                      key={`${b.content.uid}_${idx}`}
                      className="py-1.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-slate-700 dark:text-slate-300">
                        {b.content.label} (<span dir="ltr" className="font-mono">{b.ref.field}</span>) →{' '}
                        <span dir="ltr" className="font-mono text-red-600 dark:text-red-400">
                          {b.ref.path}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onFocusContent(b.content.kind, b.content.uid)}
                        className="text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
                      >
                        {t('systems.fixRefBtn')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LOCALIZATION EDITOR */}
        {subTab === 'localization' && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t('systems.locHeaderTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('systems.locSubtitle')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncMissingLocaleKeys}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-[#121823] dark:text-slate-200 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('systems.syncKeysBtn')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveLocale}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 whitespace-nowrap shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  {localeDirty
                    ? t('systems.saveLocaleDirty', { locale: activeLocale })
                    : t('systems.saveLocaleSaved', { locale: activeLocale })}
                </button>
              </div>
            </div>

            {/* Locale Tabs + Add Locale */}
            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {localeFiles.map((f) => {
                  const code = f.name.replace(/\.json$/i, '');
                  const active = code === activeLocale;
                  return (
                    <button
                      key={f.path}
                      type="button"
                      dir="ltr"
                      onClick={() => setActiveLocale(code)}
                      className={`px-3 py-1 text-xs font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5'
                      }`}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  dir="ltr"
                  value={newLocaleCode}
                  onChange={(e) => setNewLocaleCode(e.target.value)}
                  placeholder={t('systems.locNewLocalePlaceholder')}
                  className="w-44 px-2.5 py-1 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={!newLocaleCode.trim()}
                  onClick={handleCreateLocale}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('systems.locAddLocale')}
                </button>
              </div>
            </div>

            {/* Search + Add Custom Key */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={localeSearch}
                  onChange={(e) => setLocaleSearch(e.target.value)}
                  placeholder={t('systems.locSearchPlaceholder')}
                  className="w-full ps-8 pe-3 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  dir="ltr"
                  value={newLocKey}
                  onChange={(e) => setNewLocKey(e.target.value)}
                  placeholder={t('systems.locCustomKeyPlaceholder')}
                  className="w-36 px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                />
                <input
                  type="text"
                  dir={activeLocale === 'ar' ? 'rtl' : 'auto'}
                  value={newLocVal}
                  onChange={(e) => setNewLocVal(e.target.value)}
                  placeholder={t('systems.locCustomValPlaceholder')}
                  className="w-40 px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={!newLocKey.trim()}
                  onClick={() => {
                    const k = newLocKey.trim();
                    if (!k) return;
                    setLocaleDraft((prev) => ({ ...prev, [k]: newLocVal }));
                    setLocaleDirty(true);
                    setNewLocKey('');
                    setNewLocVal('');
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium rounded bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  {t('systems.locAddRow')}
                </button>
              </div>
            </div>

            {/* Key-Value Table */}
            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] divide-y divide-slate-200 dark:divide-white/10">
              {filteredLocaleKeys.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('systems.locEmptyHint')}
                </div>
              ) : (
                filteredLocaleKeys.map((key) => (
                  <div
                    key={key}
                    className="p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-center"
                  >
                    <div
                      dir="ltr"
                      className="md:col-span-5 font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate text-start"
                      title={key}
                    >
                      {key}
                    </div>
                    <div className="md:col-span-6">
                      <input
                        type="text"
                        dir={activeLocale === 'ar' ? 'rtl' : 'auto'}
                        value={localeDraft[key] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLocaleDraft((prev) => ({ ...prev, [key]: val }));
                          setLocaleDirty(true);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setLocaleDraft((prev) => {
                            const copy = { ...prev };
                            delete copy[key];
                            return copy;
                          });
                          setLocaleDirty(true);
                        }}
                        className="p-1 text-slate-400 hover:text-red-500"
                        title={t('content.removeTooltip')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: DEPENDENCIES, LOAD ORDER & VERSION MANAGEMENT */}
        {subTab === 'deps-order' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Dependency Manager */}
            <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-5 space-y-4">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('systems.depsManagerTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('systems.depsManagerDesc')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    dir="ltr"
                    list="woa-workspace-mods-list"
                    value={depModId}
                    onChange={(e) => setDepModId(e.target.value)}
                    placeholder={t('systems.depsTargetPlaceholder')}
                    className="w-full px-3 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                  />
                  <datalist id="woa-workspace-mods-list">
                    <option value="woa.core" />
                    {allProjects
                      .filter((p) => p.manifest.modId !== project.manifest.modId)
                      .map((p) => (
                        <option key={p.id} value={p.manifest.modId}>
                          {p.manifest.name}
                        </option>
                      ))}
                  </datalist>
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    dir="ltr"
                    value={depVersionRange}
                    onChange={(e) => setDepVersionRange(e.target.value)}
                    placeholder="^1.0.0"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                  />
                </div>
                <label className="sm:col-span-2 flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={depOptional}
                    onChange={(e) => setDepOptional(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  {t('systems.depOptional')}
                </label>
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    disabled={!depModId.trim()}
                    onClick={handleAddDependency}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    {t('common.add')}
                  </button>
                </div>
              </div>

              {(project.manifest.dependencies ?? []).length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('systems.depsStandaloneDesc')}
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-white/10 border border-slate-200 dark:border-white/10 rounded">
                  {(project.manifest.dependencies ?? []).map((dep) => (
                    <div
                      key={dep.modId}
                      className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          dir="ltr"
                          className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate"
                        >
                          {dep.modId}
                        </span>
                        <span
                          dir="ltr"
                          className="font-mono text-slate-500 dark:text-slate-400"
                        >
                          {dep.versionRange}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {dep.optional
                            ? t('systems.depOptional')
                            : t('systems.depRequiredBadge')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateManifest({
                            dependencies: (
                              project.manifest.dependencies ?? []
                            ).filter((d) => d.modId !== dep.modId),
                          })
                        }
                        className="text-slate-400 hover:text-red-500"
                        title={t('inspector.depRemoveTooltip')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Load-Order Editor */}
            <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t('systems.loadOrderTitle')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('systems.loadOrderDesc')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t('systems.loadPriorityLabel')}
                  </span>
                  <input
                    type="number"
                    dir="ltr"
                    min={0}
                    max={1000}
                    value={loadOrder.priority}
                    onChange={(e) =>
                      onUpdateManifest({
                        loadOrder: {
                          ...loadOrder,
                          priority: Math.max(
                            0,
                            Math.min(1000, Number(e.target.value) || 0)
                          ),
                        },
                      })
                    }
                    className="w-24 px-2.5 py-1 text-xs font-mono tabular-nums rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Load After */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('systems.loadAfterCount', {
                      count: loadOrder.loadAfter.length,
                    })}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      dir="ltr"
                      list="woa-workspace-mods-list"
                      value={loadAfterDraft}
                      onChange={(e) => setLoadAfterDraft(e.target.value)}
                      placeholder={t('systems.loadAfterPlaceholder')}
                      className="flex-1 px-2.5 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                    />
                    <button
                      type="button"
                      disabled={!loadAfterDraft.trim()}
                      onClick={() => {
                        const clean = loadAfterDraft.trim();
                        if (!clean || loadOrder.loadAfter.includes(clean)) return;
                        onUpdateManifest({
                          loadOrder: {
                            ...loadOrder,
                            loadAfter: [...loadOrder.loadAfter, clean],
                          },
                        });
                        setLoadAfterDraft('');
                      }}
                      className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 whitespace-nowrap shrink-0"
                    >
                      {t('common.add')}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {loadOrder.loadAfter.map((id) => (
                      <div
                        key={id}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] flex items-center justify-between text-xs font-mono"
                      >
                        <span dir="ltr">{id}</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateManifest({
                              loadOrder: {
                                ...loadOrder,
                                loadAfter: loadOrder.loadAfter.filter(
                                  (x) => x !== id
                                ),
                              },
                            })
                          }
                          className="text-slate-400 hover:text-red-500"
                          title={t('content.removeTooltip')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Load Before */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('systems.loadBeforeCount', {
                      count: loadOrder.loadBefore.length,
                    })}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      dir="ltr"
                      list="woa-workspace-mods-list"
                      value={loadBeforeDraft}
                      onChange={(e) => setLoadBeforeDraft(e.target.value)}
                      placeholder={t('systems.loadBeforePlaceholder')}
                      className="flex-1 px-2.5 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                    />
                    <button
                      type="button"
                      disabled={!loadBeforeDraft.trim()}
                      onClick={() => {
                        const clean = loadBeforeDraft.trim();
                        if (!clean || loadOrder.loadBefore.includes(clean)) return;
                        onUpdateManifest({
                          loadOrder: {
                            ...loadOrder,
                            loadBefore: [...loadOrder.loadBefore, clean],
                          },
                        });
                        setLoadBeforeDraft('');
                      }}
                      className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 whitespace-nowrap shrink-0"
                    >
                      {t('common.add')}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {loadOrder.loadBefore.map((id) => (
                      <div
                        key={id}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] flex items-center justify-between text-xs font-mono"
                      >
                        <span dir="ltr">{id}</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateManifest({
                              loadOrder: {
                                ...loadOrder,
                                loadBefore: loadOrder.loadBefore.filter(
                                  (x) => x !== id
                                ),
                              },
                            })
                          }
                          className="text-slate-400 hover:text-red-500"
                          title={t('content.removeTooltip')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Resolved Load Order Preview */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/10">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                  {t('systems.simulatedOrderTitle', {
                    count: resolvedWorkspaceOrder.length + 1,
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    dir="ltr"
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-[11px] font-mono text-slate-600 dark:text-slate-300"
                  >
                    1. woa.core ({t('systems.baseGameLabel')})
                  </div>
                  {resolvedWorkspaceOrder.map((p, idx) => (
                    <div
                      key={p.id}
                      dir="ltr"
                      className={`px-2.5 py-1 rounded border text-[11px] font-mono ${
                        p.id === project.id
                          ? 'border-blue-500/50 bg-blue-600/10 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {idx + 2}. {p.manifest.modId} (
                      {t('systems.priorityShort', {
                        priority: p.manifest.loadOrder?.priority ?? 100,
                      })}
                      )
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Version Management & Compatibility Bounds */}
            <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t('systems.versionMgmtTitle')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('systems.currentModVerLabel')}{' '}
                    <span
                      dir="ltr"
                      className="font-mono font-semibold text-slate-900 dark:text-slate-100 inline-block"
                    >
                      {t('systems.versionBadgeLine', {
                        ver: project.manifest.version,
                        api: WOA_MOD_API_VERSION,
                        pkg: WOA_PACKAGE_FORMAT_VERSION,
                      })}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t('systems.minGameVer')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={project.manifest.minGameVersion ?? '1.8.0'}
                    onChange={(e) =>
                      onUpdateManifest({ minGameVersion: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t('systems.maxGameVer')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={project.manifest.maxGameVersion ?? '2.0.x'}
                    onChange={(e) =>
                      onUpdateManifest({ maxGameVersion: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t('systems.supportedPkgFormats')}
                  </label>
                  <div
                    dir="ltr"
                    className="px-2.5 py-1.5 text-xs font-mono rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-slate-600 dark:text-slate-300 text-start"
                  >
                    {t('systems.pkgFormatsCompatValue', {
                      ver: WOA_PACKAGE_FORMAT_VERSION,
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
                <input
                  type="text"
                  dir="auto"
                  value={releaseSummary}
                  onChange={(e) => setReleaseSummary(e.target.value)}
                  placeholder={t('systems.releaseNotePlaceholder')}
                  className="flex-1 px-3 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  {(['patch', 'minor', 'major'] as const).map((part) => (
                    <button
                      key={part}
                      type="button"
                      onClick={() => {
                        onBumpVersion(
                          part,
                          releaseSummary.trim() ||
                            t('systems.defaultBumpSummary', { part })
                        );
                        setReleaseSummary('');
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-[#0B0F17] dark:text-slate-200 dark:hover:bg-white/5 capitalize whitespace-nowrap shrink-0"
                    >
                      {t('systems.bumpPart', { part })}
                    </button>
                  ))}
                </div>
              </div>

              {(project.manifest.changelog ?? []).length > 0 && (
                <div className="divide-y divide-slate-200 dark:divide-white/10 border border-slate-200 dark:border-white/10 rounded">
                  {(project.manifest.changelog ?? []).map((entry) => (
                    <div
                      key={entry.id}
                      className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          dir="ltr"
                          className="font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0"
                        >
                          v{entry.version}
                        </span>
                        <span className="text-slate-700 dark:text-slate-200 truncate">
                          {entry.summary}
                        </span>
                      </div>
                      <span
                        dir="ltr"
                        className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0"
                      >
                        {entry.date.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Backward Compatibility Note */}
              <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                {t('systems.formatGuaranteesPrefix')}{' '}
                {getWoaCompatibilityMatrix()
                  .map((r) => `${r.label} (${r.gameVersions})`)
                  .join(' · ')}
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: DOCUMENTATION GENERATOR & PROJECT BACKUPS */}
        {subTab === 'docs-backups' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Project Backups & Import/Export Bundle */}
            <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t('systems.backupsPortableTitle')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('systems.backupsPortableDesc')}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isExportingZip}
                  onClick={async () => {
                    setIsExportingZip(true);
                    try {
                      await onExportWorkspaceProject();
                    } finally {
                      setIsExportingZip(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Archive className="w-3.5 h-3.5" />
                  {isExportingZip
                    ? t('systems.exportingZip')
                    : t('systems.exportProjZip')}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  dir="auto"
                  value={backupLabel}
                  onChange={(e) => setBackupLabel(e.target.value)}
                  placeholder={t('systems.snapshotLabelPlaceholder')}
                  className="flex-1 px-3 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={isCreatingBackup}
                  onClick={async () => {
                    setIsCreatingBackup(true);
                    try {
                      await onCreateBackup(backupLabel);
                      setBackupLabel('');
                    } finally {
                      setIsCreatingBackup(false);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-[#0B0F17] dark:text-slate-100 dark:hover:bg-white/5 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <History className="w-3.5 h-3.5" />
                  {isCreatingBackup
                    ? t('systems.savingBackup')
                    : t('systems.createBackupBtn')}
                </button>
              </div>

              {backups.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('systems.backupsEmptyHint')}
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-white/10 border border-slate-200 dark:border-white/10 rounded">
                  {backups.map((b) => (
                    <div
                      key={b.id}
                      className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {b.label}
                        </div>
                        <div
                          dir="ltr"
                          className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 text-start"
                        >
                          v{b.version} · {b.reason} · {formatBytes(b.sizeBytes)} ·{' '}
                          {new Date(b.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void onRestoreBackup(b)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {t('systems.restoreSnapshot')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(b, null, 2)], {
                              type: 'application/json',
                            });
                            triggerBlobDownload(
                              blob,
                              `${b.modId}-v${b.version}.woabackup.json`
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
                        >
                          <HardDriveDownload className="w-3 h-3" />
                          {t('systems.downloadBtn')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteBackup(b.id)}
                          className="p-1 text-slate-400 hover:text-red-500"
                          title={t('systems.deleteSnapshotTooltip')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Documentation Generator */}
            <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t('systems.docGenTitle')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('systems.docGenDesc')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(generatedMarkdown);
                      setDocsCopied(true);
                      setTimeout(() => setDocsCopied(false), 1600);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
                  >
                    {docsCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {docsCopied ? t('common.copied') : t('systems.copyMdBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSaveFile('README.md', generatedMarkdown);
                      onLog(
                        'success',
                        t('workspace.tabSystems'),
                        t('systems.readmeSavedLog')
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('systems.saveReadmeBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([generatedMarkdown], {
                        type: 'text/markdown',
                      });
                      triggerBlobDownload(blob, `${project.manifest.modId}-docs.md`);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('systems.downloadMdExt')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const html = generateModHtmlDocs(project);
                      const blob = new Blob([html], { type: 'text/html' });
                      triggerBlobDownload(blob, `${project.manifest.modId}-docs.html`);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 whitespace-nowrap shrink-0"
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    {t('systems.downloadHtmlExt')}
                  </button>
                </div>
              </div>

              <pre
                dir="ltr"
                className="p-5 text-xs font-mono leading-relaxed text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#0B0F17] max-h-96 overflow-y-auto whitespace-pre-wrap text-start"
              >
                {generatedMarkdown}
              </pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
