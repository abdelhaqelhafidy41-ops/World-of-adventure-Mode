import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Copy,
  Download,
  Edit3,
  FolderOpen,
  MoreVertical,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { ContextMenu, ContextMenuItem } from '@/src/components/common/ContextMenu';
import { validateModId } from '@/src/core/project/modScaffolder';
import { useI18n } from '@/src/i18n';
import {
  AndroidAccessDeniedError,
  getPlatformAdapter,
  reportAndroidAccessError,
  usePlatform,
} from '@/src/platform';
import { ModProject } from '@/src/types/mod';

interface ProjectManagerViewProps {
  projects: ModProject[];
  activeProjectId: string | null;
  onCreateMod: () => void;
  onOpenProject: (project: ModProject) => void;
  onImportFiles: (file: File) => Promise<void>;
  onExportProjectZip: (project: ModProject) => Promise<void>;
  onDuplicateProject: (project: ModProject) => void;
  onRenameProject?: (
    project: ModProject,
    newName: string,
    newModId: string
  ) => Promise<void> | void;
  onBackupProject?: (project: ModProject) => Promise<void> | void;
  onDeleteProject: (modId: string) => void;
  onLoadStarterSample: () => void;
}

export const ProjectManagerView: React.FC<ProjectManagerViewProps> = ({
  projects,
  activeProjectId,
  onCreateMod,
  onOpenProject,
  onImportFiles,
  onExportProjectZip,
  onDuplicateProject,
  onRenameProject,
  onBackupProject,
  onDeleteProject,
  onLoadStarterSample,
}) => {
  const { t, language } = useI18n();
  const platformInfo = usePlatform();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [confirmDeleteProject, setConfirmDeleteProject] =
    useState<ModProject | null>(null);
  const [renameTarget, setRenameTarget] = useState<ModProject | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameModId, setRenameModId] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    project: ModProject;
    x: number;
    y: number;
  } | null>(null);

  const filtered = projects.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const arName = p.manifest.translations?.name?.ar?.toLowerCase() ?? '';
    return (
      p.manifest.name.toLowerCase().includes(q) ||
      arName.includes(q) ||
      p.manifest.modId.toLowerCase().includes(q) ||
      p.manifest.author.toLowerCase().includes(q) ||
      p.manifest.categories.some((c) => c.toLowerCase().includes(q))
    );
  });

  const processImportedFile = async (file: File) => {
    setImportError(null);
    try {
      await onImportFiles(file);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : t('projects.openError')
      );
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processImportedFile(file);
  };

  const handleImportClick = async () => {
    if (platformInfo.platform !== 'web') {
      try {
        const picked = await getPlatformAdapter().pickImportFiles({
          title: t('projects.importBtn'),
          accept: ['.woamod', '.zip', '.json'],
          multiple: false,
        });
        if (picked.length > 0) {
          await processImportedFile(picked[0]);
        }
        return;
      } catch (err) {
        if (err instanceof AndroidAccessDeniedError) {
          reportAndroidAccessError(err.operation, err, {
            permanentlyDenied: err.permanentlyDenied,
            retryAction: () => void handleImportClick(),
          });
        }
        setImportError(
          err instanceof Error ? err.message : t('projects.openError')
        );
        return;
      }
    }
    fileInputRef.current?.click();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processImportedFile(file);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const translateCategory = (cat: string): string => {
    const key = `cat.${cat}` as Parameters<typeof t>[0];
    const translated = t(key);
    return translated === key ? cat : translated;
  };

  const openRenameDialog = (proj: ModProject) => {
    setRenameTarget(proj);
    setRenameName(proj.manifest.name);
    setRenameModId(proj.manifest.modId);
    setRenameError(null);
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !onRenameProject) return;
    const cleanName = renameName.trim();
    const cleanModId = renameModId.trim();
    if (!cleanName) {
      setRenameError(t('val.nameRequired'));
      return;
    }
    const modIdErr = validateModId(cleanModId);
    if (modIdErr) {
      setRenameError(modIdErr);
      return;
    }
    if (
      cleanModId !== renameTarget.manifest.modId &&
      projects.some((p) => p.id !== renameTarget.id && p.manifest.modId === cleanModId)
    ) {
      setRenameError(t('createMod.errDuplicateId', { modId: cleanModId }));
      return;
    }
    await onRenameProject(renameTarget, cleanName, cleanModId);
    setRenameTarget(null);
    setActionNotice(
      t('projects.renamedNotice', { name: cleanName, modId: cleanModId })
    );
  };

  const handleTriggerBackup = async (proj: ModProject) => {
    if (!onBackupProject) return;
    await onBackupProject(proj);
    setActionNotice(t('app.backupCreatedNotice', { name: proj.manifest.name }));
  };

  const buildMenuItems = (proj: ModProject): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: 'open',
        label: t('ctx.open'),
        icon: <FolderOpen className="w-3.5 h-3.5" />,
        onSelect: () => onOpenProject(proj),
      },
      ...(onRenameProject
        ? [
            {
              id: 'rename',
              label: t('projects.renameBtn'),
              icon: <Edit3 className="w-3.5 h-3.5" />,
              onSelect: () => openRenameDialog(proj),
            },
          ]
        : []),
      ...(onBackupProject
        ? [
            {
              id: 'backup',
              label: t('projects.backupBtn'),
              icon: <Archive className="w-3.5 h-3.5" />,
              onSelect: () => void handleTriggerBackup(proj),
            },
          ]
        : []),
      {
        id: 'export',
        label: t('ctx.exportZip'),
        icon: <Download className="w-3.5 h-3.5" />,
        onSelect: () => void onExportProjectZip(proj),
      },
      {
        id: 'duplicate',
        label: t('ctx.duplicate'),
        icon: <Copy className="w-3.5 h-3.5" />,
        onSelect: () => onDuplicateProject(proj),
      },
    ];
    if (platformInfo.platform === 'windows') {
      items.push({
        id: 'folder',
        label: t('ctx.showInFolder'),
        icon: <FolderOpen className="w-3.5 h-3.5" />,
        onSelect: () => {
          void getPlatformAdapter()
            .getStorageInfo()
            .then((info) => {
              const targetPath = `${info.subdirectories.Projects}/${proj.id}/.woa-project.json`;
              return window.woaDesktop?.showItemInFolder(targetPath);
            });
        },
      });
    }
    items.push({
      id: 'delete',
      label: t('ctx.delete'),
      icon: <Trash2 className="w-3.5 h-3.5" />,
      danger: true,
      onSelect: () => setConfirmDeleteProject(proj),
    });
    return items;
  };

  return (
    <div
      className="relative flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-10"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragActive(false);
        }
      }}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="pointer-events-none fixed inset-4 z-40 rounded-xl border-2 border-dashed border-blue-500 bg-blue-600/10 backdrop-blur-xs flex items-center justify-center">
          <div className="px-6 py-4 rounded-lg bg-[#0E131D]/95 border border-blue-500/40 text-sm font-semibold text-white flex items-center gap-3 shadow-xl">
            <Upload className="w-5 h-5 text-blue-400" />
            <span>{t('projects.dropToImport')}</span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Hero / Primary Actions */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-white/10">
          <div className="max-w-2xl">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {t('projects.title')}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('projects.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onCreateMod}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 min-h-[42px] touch-target"
            >
              <Plus className="w-4 h-4" />
              {t('projects.newModBtn')}
            </button>

            <button
              type="button"
              onClick={() => void handleImportClick()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-[#121823] dark:text-slate-200 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 min-h-[42px] touch-target"
            >
              <Upload className="w-4 h-4" />
              {t('projects.importBtn')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".woamod,.woaproj.zip,.zip,.json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </section>

        {importError && (
          <div className="px-4 py-3 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-300">
            {importError}
          </div>
        )}

        {actionNotice && (
          <div className="px-4 py-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
            <span dir="auto">{actionNotice}</span>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="text-[11px] underline opacity-80 hover:opacity-100"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        {/* Recent Mods Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {t('projects.recentMods')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t('projects.totalProjects', { count: projects.length })}
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('projects.searchPlaceholder')}
                className="w-full ps-9 pe-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 min-h-[40px]"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-10 text-center">
              <FolderOpen className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {projects.length === 0
                  ? t('projects.emptyTitle')
                  : t('projects.noMatchTitle')}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {projects.length === 0
                  ? t('projects.emptyDesc')
                  : t('projects.noMatchDesc')}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onCreateMod}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors min-h-[40px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('projects.newModBtn')}
                </button>
                {projects.length === 0 && (
                  <button
                    type="button"
                    onClick={onLoadStarterSample}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition-colors min-h-[40px]"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('projects.loadSampleBtn')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Mobile / Small Tablet Card List (< md) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
                {filtered.map((proj) => {
                  const isCurrent = proj.id === activeProjectId;
                  return (
                    <div
                      key={proj.id}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ project: proj, x: e.clientX, y: e.clientY });
                      }}
                      className={`rounded-lg border p-4 bg-white dark:bg-[#121823] space-y-3 transition-colors ${
                        isCurrent
                          ? 'border-blue-500/60 ring-1 ring-blue-500/20'
                          : 'border-slate-200 dark:border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenProject(proj)}
                          className="text-start min-w-0 flex-1"
                        >
                          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                            <span dir="auto" className="truncate">{proj.manifest.name}</span>
                            {isCurrent && (
                              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                {t('projects.activeBadge')}
                              </span>
                            )}
                          </div>
                          <div dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5 text-start">
                            {proj.manifest.modId} · v{proj.manifest.version}
                          </div>
                        </button>

                        <button
                          type="button"
                          aria-label={t('ctx.moreActions')}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setContextMenu({
                              project: proj,
                              x: rect.left,
                              y: rect.bottom + 6,
                            });
                          }}
                          className="p-2 -m-1 rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 min-h-[40px] min-w-[40px] flex items-center justify-center"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
                        <span className="truncate">
                          <span dir="ltr" className="font-mono text-[11px]">
                            {t('projects.gameVerBadge', {
                              version: proj.manifest.supportedGameVersion,
                            })}
                          </span>{' '}
                          ·{' '}
                          {proj.manifest.categories
                            .map((c) => translateCategory(c))
                            .join(' · ')}
                        </span>
                        <span className="tabular-nums text-[11px]">
                          {formatDate(proj.lastOpenedAt)}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenProject(proj)}
                          className="flex-1 py-2 px-3 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors min-h-[40px]"
                        >
                          {t('projects.openAction')}
                        </button>
                        {onRenameProject && (
                          <button
                            type="button"
                            onClick={() => openRenameDialog(proj)}
                            title={t('projects.renameBtn')}
                            aria-label={t('projects.renameBtn')}
                            className="p-2 rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 min-h-[40px] min-w-[40px] flex items-center justify-center"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {onBackupProject && (
                          <button
                            type="button"
                            onClick={() => void handleTriggerBackup(proj)}
                            title={t('projects.backupBtn')}
                            aria-label={t('projects.backupBtn')}
                            className="p-2 rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 min-h-[40px] min-w-[40px] flex items-center justify-center"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void onExportProjectZip(proj)}
                          title={t('projects.exportZipTooltip')}
                          aria-label={t('projects.exportZipTooltip')}
                          className="p-2 rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 min-h-[40px] min-w-[40px] flex items-center justify-center"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View (>= md) */}
              <div className="hidden md:block rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4 text-start">{t('projects.colMod')}</th>
                        <th className="py-3 px-4 text-start">{t('projects.colVersion')}</th>
                        <th className="py-3 px-4 text-start">{t('projects.colGameVer')}</th>
                        <th className="py-3 px-4 text-start">{t('projects.colCategories')}</th>
                        <th className="py-3 px-4 text-start">{t('projects.colUpdated')}</th>
                        <th className="py-3 px-4 text-end">{t('projects.colActions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-sm">
                      {filtered.map((proj) => {
                        const isCurrent = proj.id === activeProjectId;
                        return (
                          <tr
                            key={proj.id}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({
                                project: proj,
                                x: e.clientX,
                                y: e.clientY,
                              });
                            }}
                            className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="py-3.5 px-4">
                              <button
                                type="button"
                                onClick={() => onOpenProject(proj)}
                                className="text-start group"
                              >
                                <div className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex flex-wrap items-center gap-2">
                                  <span dir="auto">{proj.manifest.name}</span>
                                  {proj.manifest.translations?.name?.ar &&
                                    proj.manifest.translations.name.ar !==
                                      proj.manifest.name && (
                                      <span
                                        dir="rtl"
                                        className="text-xs font-normal text-slate-500 dark:text-slate-400"
                                      >
                                        ({proj.manifest.translations.name.ar})
                                      </span>
                                    )}
                                  {isCurrent && (
                                    <span className="text-xs font-normal text-blue-600 dark:text-blue-400">
                                      {t('projects.activeBadge')}
                                    </span>
                                  )}
                                </div>
                                <div
                                  dir="ltr"
                                  className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 text-start"
                                >
                                  {proj.manifest.modId} · {proj.manifest.author}
                                </div>
                              </button>
                            </td>
                            <td
                              dir="ltr"
                              className="py-3.5 px-4 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 text-start"
                            >
                              v{proj.manifest.version}
                            </td>
                            <td
                              dir="ltr"
                              className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap text-start"
                            >
                              {proj.manifest.supportedGameVersion}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400">
                              {proj.manifest.categories
                                .map((c) => translateCategory(c))
                                .join(' · ')}
                            </td>
                            <td className="py-3.5 px-4 text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {formatDate(proj.lastOpenedAt)}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onOpenProject(proj)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-900 text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
                                >
                                  {t('projects.openAction')}
                                </button>
                                {onRenameProject && (
                                  <button
                                    type="button"
                                    onClick={() => openRenameDialog(proj)}
                                    title={t('projects.renameBtn')}
                                    aria-label={t('projects.renameBtn')}
                                    className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {onBackupProject && (
                                  <button
                                    type="button"
                                    onClick={() => void handleTriggerBackup(proj)}
                                    title={t('projects.backupBtn')}
                                    aria-label={t('projects.backupBtn')}
                                    className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
                                  >
                                    <Archive className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void onExportProjectZip(proj)}
                                  title={t('projects.exportZipTooltip')}
                                  aria-label={t('projects.exportZipTooltip')}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDuplicateProject(proj)}
                                  title={t('projects.duplicateTooltip')}
                                  aria-label={t('projects.duplicateTooltip')}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteProject(proj)}
                                  title={t('projects.deleteTooltip')}
                                  aria-label={t('projects.deleteTooltip')}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-500/10 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <ContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        items={contextMenu ? buildMenuItems(contextMenu.project) : []}
        onClose={() => setContextMenu(null)}
      />

      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => void handleConfirmRename(e)}
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-[#121823] overflow-hidden shadow-xl"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center gap-2.5">
              <Edit3 className="w-4 h-4 text-blue-500 shrink-0" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('projects.renameTitle')}
              </h3>
            </div>
            <div className="p-5 space-y-4 text-xs">
              {renameError && (
                <div className="px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300">
                  {renameError}
                </div>
              )}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('projects.renameNameLabel')}
                </label>
                <input
                  type="text"
                  dir="auto"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('projects.renameModIdLabel')}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={renameModId}
                  onChange={(e) => setRenameModId(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-md border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="px-3.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-[#121823] dark:text-slate-200 dark:hover:bg-white/5"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500"
              >
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmDeleteProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-[#121823] overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('projects.deleteTitle')}
              </h3>
            </div>
            <div className="px-5 py-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('projects.deleteConfirmDesc', {
                name: confirmDeleteProject.manifest.name,
                modId: confirmDeleteProject.manifest.modId,
              })}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteProject(null)}
                className="px-3.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-[#121823] dark:text-slate-200 dark:hover:bg-white/5"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProject(confirmDeleteProject.id);
                  setConfirmDeleteProject(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-500"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
