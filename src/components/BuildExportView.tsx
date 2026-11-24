import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FileJson,
  Filter,
  Hammer,
  ListChecks,
  MinusCircle,
  Monitor,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { ValidationPanel } from '@/src/components/panels/ValidationPanel';
import {
  WOA_MOD_API_SCHEMA,
  WOA_MOD_API_VERSION,
  WOA_PACKAGE_FORMAT_VERSION,
  buildModCompatibilityInfo,
} from '@/src/core/api/woaModApiSpec';
import {
  ExportBlockedError,
  ExportWarningsConfirmationError,
  buildModProjectAsync,
  exportModArchiveBlob,
  formatWoamodFilename,
  saveExportedPackage,
} from '@/src/core/builder/modBuilder';
import { serializeManifest } from '@/src/core/project/modScaffolder';
import { useI18n } from '@/src/i18n';
import {
  BuildHistoryEntry,
  BuildReport,
  ModProject,
  TargetPlatform,
  ValidationIssue,
} from '@/src/types/mod';

interface BuildExportViewProps {
  project: ModProject;
  allProjects: ModProject[];
  defaultTarget: TargetPlatform;
  lastBuild: BuildReport | null;
  buildHistory?: BuildHistoryEntry[];
  onBeforeBuildBackup?: () => Promise<void>;
  onBuildComplete: (report: BuildReport, recordInHistory?: boolean) => void;
  onInspectIssue?: (issue: ValidationIssue) => void;
  onLog: (
    level: 'info' | 'warn' | 'error' | 'success',
    source: string,
    message: string
  ) => void;
}

type BuildInspectorTab = 'pipeline' | 'contents' | 'pruned';

function formatByteSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BuildExportView: React.FC<BuildExportViewProps> = ({
  project,
  allProjects,
  defaultTarget,
  lastBuild,
  buildHistory = [],
  onBeforeBuildBackup,
  onBuildComplete,
  onInspectIssue,
  onLog,
}) => {
  const { t, language } = useI18n();
  const [target, setTarget] = useState<TargetPlatform>(defaultTarget);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<BuildInspectorTab>('pipeline');
  const [pendingWarningReport, setPendingWarningReport] =
    useState<BuildReport | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const compatInfo = buildModCompatibilityInfo(project.manifest, target);

  const targetFilename = formatWoamodFilename(
    project.manifest.name,
    project.manifest.modId
  );

  const runBuild = useCallback(
    async (emitLog = true) => {
      void language;
      setIsBuilding(true);
      try {
        if (emitLog && onBeforeBuildBackup) {
          await onBeforeBuildBackup();
        }
        const report = await buildModProjectAsync(project, target, allProjects);
        onBuildComplete(report, emitLog);
        const val = report.validationReport;
        if (emitLog) {
          if (report.buildStatus === 'passed') {
            onLog(
              'success',
              'Builder',
              t('app.logBuiltPassed', {
                filename: report.packageFileName,
                size: formatByteSize(report.packagedBytes),
                assets: report.assetCount,
                objects: report.registeredObjectCount,
                ms: report.durationMs,
              })
            );
          } else if (report.buildStatus === 'passed_with_warnings') {
            onLog(
              'warn',
              'Builder',
              t('app.logBuiltWarnings', {
                filename: report.packageFileName,
                size: formatByteSize(report.packagedBytes),
                count: report.warnings.length,
              })
            );
          } else {
            onLog(
              'error',
              'Builder',
              t('app.logBuiltBlocked', {
                filename: report.packageFileName,
                count: val?.errorCount ?? 0,
              })
            );
          }
        }
        return report;
      } finally {
        setIsBuilding(false);
      }
    },
    [project, target, allProjects, onBeforeBuildBackup, onBuildComplete, onLog, language, t]
  );

  useEffect(() => {
    void runBuild(false);
  }, [runBuild]);

  const executeExport = async (confirmWarnings: boolean, promptSaveDialog = true) => {
    setIsExporting(true);
    setSavedNotice(null);
    try {
      if (onBeforeBuildBackup) {
        await onBeforeBuildBackup();
      }
      const { blob, filename, report } = await exportModArchiveBlob(
        project,
        target,
        {
          allProjects,
          confirmWarnings,
        }
      );
      onBuildComplete(report, true);
      setPendingWarningReport(null);
      const saveResult = await saveExportedPackage(blob, filename, {
        promptSaveDialog,
      });
      if (saveResult.cancelled) {
        return;
      }
      setSavedNotice(saveResult.locationLabel);
      onLog(
        confirmWarnings ? 'warn' : 'success',
        'Exporter',
        confirmWarnings
          ? t('app.logExportedWarnings', {
              filename,
              size: formatByteSize(blob.size),
              count: report.warnings.length,
            })
          : t('app.logExportedVerified', {
              filename,
              size: formatByteSize(blob.size),
            })
      );
      if (saveResult.locationLabel && saveResult.locationLabel !== filename) {
        onLog(
          'info',
          'Exporter',
          t('build.savedToLocation', { location: saveResult.locationLabel })
        );
      }
    } catch (err) {
      if (err instanceof ExportBlockedError) {
        onBuildComplete(err.report);
        onLog('error', 'Exporter', err.message);
      } else if (err instanceof ExportWarningsConfirmationError) {
        onBuildComplete(err.report);
        setPendingWarningReport(err.report);
      } else {
        onLog(
          'error',
          'Exporter',
          err instanceof Error ? err.message : t('build.exportFailed')
        );
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportManifestOnly = async () => {
    const blob = new Blob([serializeManifest(project.manifest)], {
      type: 'application/json',
    });
    const res = await saveExportedPackage(blob, 'mod.manifest.json', {
      promptSaveDialog: true,
    });
    if (!res.cancelled) {
      onLog('info', 'Exporter', t('app.logDownloadedManifest'));
    }
  };

  const handleDownloadBuildReport = async () => {
    if (!lastBuild) return;
    const payload = {
      modName: lastBuild.modName,
      modId: lastBuild.modId,
      version: lastBuild.version,
      targetPlatform: lastBuild.targetPlatform,
      packageFileName: lastBuild.packageFileName,
      buildStatus: lastBuild.buildStatus,
      fileSizeBytes: lastBuild.packagedBytes,
      uncompressedBytes: lastBuild.estimatedBundleBytes,
      assetCount: lastBuild.assetCount,
      registeredObjectCount: lastBuild.registeredObjectCount,
      fileCount: lastBuild.fileCount,
      dependencies: lastBuild.dependencies,
      warnings: lastBuild.warnings.map((w) => ({
        code: w.code,
        file: w.file,
        object: w.object,
        property: w.property,
        problem: w.problem,
        suggestion: w.suggestion,
      })),
      pipelineSteps: lastBuild.pipelineSteps,
      prunedFiles: lastBuild.prunedFiles,
      packagedPaths: lastBuild.packagedPaths,
      timestamp: lastBuild.timestamp,
      durationMs: lastBuild.durationMs,
    };
    const reportBlob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const reportName = lastBuild.packageFileName.replace(/\.woamod$/i, '.build-report.json');
    const res = await saveExportedPackage(reportBlob, reportName, {
      promptSaveDialog: true,
    });
    if (!res.cancelled) {
      onLog('info', 'Builder', t('app.logDownloadedReport', { name: reportName }));
    }
  };

  const validationReport = lastBuild?.validationReport ?? null;
  const errorCount = validationReport?.errorCount ?? 0;
  const warningCount = lastBuild?.warnings.length ?? validationReport?.warningCount ?? 0;
  const exportBlocked = lastBuild ? !lastBuild.success || errorCount > 0 : false;
  const displayFilename = lastBuild?.packageFileName ?? targetFilename;

  const statusLabel = !lastBuild
    ? t('build.statusPending')
    : lastBuild.buildStatus === 'blocked'
      ? t('build.statusBlocked')
      : lastBuild.buildStatus === 'passed_with_warnings'
        ? t('build.statusWarnings')
        : t('build.statusPassed');

  const targets: {
    id: TargetPlatform;
    label: string;
    detail: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'universal',
      label: t('platform.universal'),
      detail: t('build.platformUniversalDesc'),
      icon: <Hammer className="w-4 h-4" />,
    },
    {
      id: 'windows',
      label: t('platform.windows'),
      detail: t('build.platformWindowsDesc'),
      icon: <Monitor className="w-4 h-4" />,
    },
    {
      id: 'android',
      label: t('platform.android'),
      detail: t('build.platformAndroidDesc'),
      icon: <Smartphone className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 pb-20 md:pb-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Bar */}
        <div className="pb-6 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t('build.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <span dir="auto">{project.manifest.name}</span> ·{' '}
              <span dir="ltr" className="font-mono">{project.manifest.modId}</span> ·{' '}
              <span dir="ltr" className="font-mono">v{project.manifest.version}</span> ·{' '}
              {t('build.headerOutputLabel')}{' '}
              <span dir="ltr" className="font-mono text-slate-800 dark:text-slate-200">
                {displayFilename}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isBuilding}
              onClick={() => void runBuild(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-[#121823] dark:text-slate-100 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <Hammer className="w-3.5 h-3.5" />
              {isBuilding ? t('build.buildingBtn') : t('nav.buildMod')}
            </button>

            <button
              type="button"
              disabled={isExporting || isBuilding || exportBlocked}
              onClick={() => void executeExport(false)}
              title={
                exportBlocked
                  ? t('build.exportBlockedTooltip', { count: errorCount })
                  : t('build.exportReadyTooltip', { filename: displayFilename })
              }
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
                exportBlocked
                  ? 'bg-red-600/15 text-red-700 border border-red-500/30 dark:text-red-300 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting
                ? t('build.exportingBtn')
                : exportBlocked
                  ? t('build.exportBlockedErrors', { count: errorCount })
                  : t('build.exportNamedBtn', { filename: displayFilename })}
            </button>
          </div>
        </div>

        {savedNotice && (
          <div className="px-4 py-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-xs text-blue-800 dark:text-blue-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
            <span dir="auto">{t('build.savedToLocation', { location: savedNotice })}</span>
          </div>
        )}

        {/* Build Gate Status Banner */}
        {lastBuild && (
          <div
            className={`px-4 py-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 text-xs ${
              exportBlocked
                ? 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200'
                : warningCount > 0
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {exportBlocked ? (
                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              ) : warningCount > 0 ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <span>
                {exportBlocked
                  ? t('build.bannerBlocked', { count: errorCount, filename: displayFilename })
                  : warningCount > 0
                    ? t('build.bannerWarnings', {
                        filename: displayFilename,
                        size: formatByteSize(lastBuild.packagedBytes),
                        count: warningCount,
                      })
                    : t('build.bannerPassed', {
                        filename: displayFilename,
                        size: formatByteSize(lastBuild.packagedBytes),
                      })}
              </span>
            </div>

            <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] opacity-85">
              <span>{t('build.packagedFilesCount', { count: lastBuild.fileCount })}</span>
              <span>{t('build.assetsCount', { count: lastBuild.assetCount })}</span>
              <span dir="ltr">{lastBuild.durationMs} ms</span>
            </div>
          </div>
        )}

        {/* Build Report Card */}
        {lastBuild && (
          <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('build.reportTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  {t('build.reportSubtitle', {
                    time: new Date(lastBuild.timestamp).toLocaleTimeString(),
                    target: lastBuild.targetPlatform.toUpperCase(),
                    ms: lastBuild.durationMs,
                  })}
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadBuildReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-[#0B0F17] dark:text-slate-200 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
              >
                <FileJson className="w-3.5 h-3.5" />
                {t('build.downloadReportBtn')}
              </button>
            </div>

            {/* Required Report Fields */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/10 border-b border-slate-200 dark:border-white/10">
              <div className="p-4 space-y-1">
                <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('build.colStatus')}
                </dt>
                <dd
                  className={`text-sm font-semibold flex items-center gap-1.5 ${
                    lastBuild.buildStatus === 'blocked'
                      ? 'text-red-600 dark:text-red-400'
                      : lastBuild.buildStatus === 'passed_with_warnings'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {lastBuild.buildStatus === 'blocked' ? (
                    <XCircle className="w-4 h-4 shrink-0" />
                  ) : lastBuild.buildStatus === 'passed_with_warnings' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>{statusLabel}</span>
                </dd>
              </div>

              <div className="p-4 space-y-1">
                <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('build.colModName')}
                </dt>
                <dd dir="auto" className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {lastBuild.modName}
                </dd>
                <div dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  {lastBuild.packageFileName}
                </div>
              </div>

              <div className="p-4 space-y-1">
                <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('build.colModIdVer')}
                </dt>
                <dd dir="ltr" className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {lastBuild.modId}
                </dd>
                <div dir="ltr" className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  v{lastBuild.version}
                </div>
              </div>

              <div className="p-4 space-y-1">
                <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('build.colFileSize')}
                </dt>
                <dd dir="ltr" className="text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {lastBuild.success
                    ? formatByteSize(lastBuild.packagedBytes)
                    : t('build.notPackaged')}
                </dd>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {lastBuild.success
                    ? `${formatByteSize(lastBuild.estimatedBundleBytes)} (${t('build.summaryRawSize')})`
                    : t('build.resolveErrorsToPkg')}
                </div>
              </div>
            </dl>

            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/10">
              <div className="p-4 space-y-1">
                <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('build.colAssetCount')}
                </dt>
                <dd dir="ltr" className="text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {lastBuild.assetCount}
                </dd>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {t('build.unusedExcluded', {
                    count: lastBuild.prunedFiles.filter((p) => p.reason === 'unused-asset').length,
                  })}
                </div>
              </div>

              <div className="p-4 space-y-1">
                <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('build.colRegisteredObj')}
                </dt>
                <dd dir="ltr" className="text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {lastBuild.registeredObjectCount}
                </dd>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('build.objTypesHint')}
                </div>
              </div>

              <div className="p-4 space-y-1.5">
                <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('build.colDeps', { count: lastBuild.dependencies.length })}
                </dt>
                <dd className="text-xs text-slate-800 dark:text-slate-200">
                  {lastBuild.dependencies.length === 0 ? (
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('build.standaloneNoDeps')}
                    </span>
                  ) : (
                    <ul className="space-y-1">
                      {lastBuild.dependencies.map((dep) => (
                        <li
                          key={dep.modId}
                          dir="ltr"
                          className="font-mono text-[11px] flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{dep.modId}</span>
                          <span className="text-slate-500 dark:text-slate-400 shrink-0">
                            {dep.versionRange}
                            {dep.optional ? ` (${t('apiDocs.optionalShort')})` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>

              <div className="p-4 space-y-1.5">
                <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('build.colWarnings', { count: lastBuild.warnings.length })}
                </dt>
                <dd className="text-xs text-slate-800 dark:text-slate-200">
                  {lastBuild.warnings.length === 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {t('build.zeroWarnings')}
                    </span>
                  ) : (
                    <ul className="space-y-1">
                      {lastBuild.warnings.slice(0, 2).map((w) => (
                        <li
                          key={w.id}
                          className="text-[11px] text-amber-700 dark:text-amber-300 truncate"
                          title={w.problem}
                        >
                          <span dir="ltr" className="font-mono">{w.code}</span>: {w.problem}
                        </li>
                      ))}
                      {lastBuild.warnings.length > 2 && (
                        <li className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t('build.moreWarningsBelow', { count: lastBuild.warnings.length - 2 })}
                        </li>
                      )}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {/* Target Platform Selection */}
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('build.targetPlatform')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {targets.map((tgt) => {
              const active = target === tgt.id;
              return (
                <button
                  key={tgt.id}
                  type="button"
                  onClick={() => setTarget(tgt.id)}
                  className={`text-start p-4 rounded-lg border transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-600/10'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <span className={active ? 'text-blue-500' : 'text-slate-400'}>
                      {tgt.icon}
                    </span>
                    {tgt.label}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {tgt.detail}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Build Pipeline, Archive Structure & Pruned Files */}
        {lastBuild && (
          <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] overflow-hidden">
            <div className="px-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 overflow-x-auto">
                {(
                  [
                    {
                      id: 'pipeline',
                      label: t('build.tabPipeline', { count: lastBuild.pipelineSteps.length }),
                      icon: <ListChecks className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'contents',
                      label: t('build.tabContents', { count: lastBuild.packagedPaths.length }),
                      icon: <Archive className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'pruned',
                      label: t('build.tabPruned', { count: lastBuild.prunedFiles.length }),
                      icon: <Filter className="w-3.5 h-3.5" />,
                    },
                  ] as const
                ).map((tab) => {
                  const active = inspectorTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setInspectorTab(tab.id)}
                      className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      {active && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
                      )}
                    </button>
                  );
                })}
              </div>

              <span dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400 py-2">
                {lastBuild.packageFileName}
              </span>
            </div>

            {inspectorTab === 'pipeline' && (
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {lastBuild.pipelineSteps.map((step) => (
                  <div
                    key={step.step}
                    className="px-4 py-2.5 flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span dir="ltr" className="font-mono text-[11px] tabular-nums text-slate-400 mt-0.5 w-4 shrink-0">
                        {step.step}.
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {step.label}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {step.detail}
                        </p>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1.5 shrink-0 font-medium text-[11px]">
                      {step.status === 'passed' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {t('build.stepPassed')}
                          </span>
                        </>
                      ) : step.status === 'warning' ? (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-amber-700 dark:text-amber-400">
                            {t('build.stepWarning')}
                          </span>
                        </>
                      ) : step.status === 'failed' ? (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-red-700 dark:text-red-400">
                            {t('build.stepFailed')}
                          </span>
                        </>
                      ) : (
                        <>
                          <MinusCircle className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-500 dark:text-slate-400">
                            {t('build.stepSkipped')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {inspectorTab === 'contents' && (
              <div className="p-4 space-y-3">
                {lastBuild.packagedPaths.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('build.noContentsBlocked')}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('build.verifiedLayoutNote', { filename: lastBuild.packageFileName })}
                    </p>
                    <div dir="ltr" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pe-1">
                      {lastBuild.packagedPaths.map((p) => (
                        <div
                          key={p}
                          className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate"
                          title={p}
                        >
                          {p}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {inspectorTab === 'pruned' && (
              <div className="p-4">
                {lastBuild.prunedFiles.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('build.noPrunedFiles')}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-white/10 border border-slate-200 dark:border-white/10 rounded-md overflow-hidden">
                    {lastBuild.prunedFiles.map((item) => (
                      <div
                        key={`${item.reason}_${item.path}`}
                        className="px-3 py-2 flex items-center justify-between gap-3 text-xs bg-slate-50 dark:bg-[#0B0F17]"
                      >
                        <span dir="ltr" className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                          {item.path}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          {item.reason === 'dev-only'
                            ? t('build.pruneReasonDev')
                            : item.reason === 'unused-asset'
                              ? t('build.pruneReasonUnused')
                              : t('build.pruneReasonUnsupported')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Comprehensive Validation Panel */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('build.validationReportTitle')}
            </h2>
            <button
              type="button"
              onClick={handleExportManifestOnly}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <FileJson className="w-3.5 h-3.5" />
              {t('build.downloadManifestOnly')}
            </button>
          </div>

          <ValidationPanel
            report={validationReport}
            isValidating={isBuilding}
            onRunValidation={() => void runBuild(true)}
            onInspectIssue={onInspectIssue}
          />
        </section>

        {/* Mod API & Backward Compatibility Guarantee */}
        <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('build.compatHeader')}
            </h2>
            <span dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {WOA_MOD_API_SCHEMA} v{WOA_MOD_API_VERSION} · Format v{WOA_PACKAGE_FORMAT_VERSION}
            </span>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]">
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">{t('build.compatGameRange')}</dt>
              <dd dir="ltr" className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-100">
                {compatInfo.minGameVersion} – {compatInfo.maxGameVersion}
              </dd>
            </div>
            <div className="p-3 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]">
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">{t('build.compatExecModel')}</dt>
              <dd className="mt-1 font-semibold text-emerald-700 dark:text-emerald-400">
                {t('build.compatExecValue')}
              </dd>
            </div>
            <div className="p-3 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]">
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">{t('build.compatBackward')}</dt>
              <dd dir="ltr" className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-100">
                {compatInfo.compatiblePackageFormats.map((v) => `v${v}`).join(' & ')}
              </dd>
            </div>
            <div className="p-3 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]">
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">{t('build.compatEmbeddedFile')}</dt>
              <dd dir="ltr" className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-100">
                compatibility.json
              </dd>
            </div>
          </dl>
        </section>

        {/* Build History */}
        <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('build.historyTitle', { count: buildHistory.length })}
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('build.historyLocalNote')}
            </span>
          </div>
          {buildHistory.length === 0 ? (
            <div className="p-5 text-xs text-slate-500 dark:text-slate-400">
              {t('build.historyEmpty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-4 font-medium">{t('build.histTimestamp')}</th>
                    <th className="py-2 px-4 font-medium">{t('build.histVersion')}</th>
                    <th className="py-2 px-4 font-medium">{t('build.histTarget')}</th>
                    <th className="py-2 px-4 font-medium">{t('build.histStatus')}</th>
                    <th className="py-2 px-4 font-medium text-end">{t('build.histSize')}</th>
                    <th className="py-2 px-4 font-medium text-end">{t('build.histAssets')}</th>
                    <th className="py-2 px-4 font-medium text-end">{t('build.histObjects')}</th>
                    <th className="py-2 px-4 font-medium text-end">{t('build.histDuration')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                  {buildHistory.map((h) => (
                    <tr key={h.id}>
                      <td dir="ltr" className="py-2 px-4 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                        {new Date(h.timestamp).toLocaleString()}
                      </td>
                      <td dir="ltr" className="py-2 px-4 font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        v{h.version}
                      </td>
                      <td dir="ltr" className="py-2 px-4 uppercase font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {h.targetPlatform}
                      </td>
                      <td className="py-2 px-4">
                        <span
                          className={`font-medium ${
                            h.buildStatus === 'blocked'
                              ? 'text-red-600 dark:text-red-400'
                              : h.buildStatus === 'passed_with_warnings'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {h.buildStatus === 'blocked'
                            ? t('build.histBlocked', { count: h.errorCount })
                            : h.buildStatus === 'passed_with_warnings'
                              ? t('build.histWarnings', { count: h.warningCount })
                              : t('build.stepPassed')}
                        </span>
                      </td>
                      <td dir="ltr" className="py-2 px-4 text-end font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {h.packagedBytes > 0 ? formatByteSize(h.packagedBytes) : '—'}
                      </td>
                      <td dir="ltr" className="py-2 px-4 text-end font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {h.assetCount}
                      </td>
                      <td dir="ltr" className="py-2 px-4 text-end font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {h.registeredObjectCount}
                      </td>
                      <td dir="ltr" className="py-2 px-4 text-end font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {h.durationMs} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Warning Confirmation Modal before Exporting */}
      {pendingWarningReport?.validationReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-[#121823] overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('build.warningModalTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('build.warningModalDesc', {
                    count: pendingWarningReport.warnings.length,
                    filename: pendingWarningReport.packageFileName,
                  })}
                </p>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-white/10">
              {pendingWarningReport.warnings.map((warn) => (
                <div key={warn.id} className="px-5 py-3 text-xs space-y-1">
                  <div dir="ltr" className="font-mono text-[11px] text-amber-700 dark:text-amber-400">
                    {warn.code} · {warn.file} · {warn.property}
                  </div>
                  <p className="text-slate-800 dark:text-slate-200">
                    {warn.problem}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {t('build.suggestionPrefix', { text: warn.suggestion })}
                  </p>
                </div>
              ))}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingWarningReport(null)}
                className="px-4 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-[#121823] dark:text-slate-200 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
              >
                {t('build.reviewWarningsBtn')}
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void executeExport(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-amber-600 text-white hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                {isExporting
                  ? t('build.exportingBtn')
                  : t('build.exportNamedBtn', { filename: pendingWarningReport.packageFileName })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
