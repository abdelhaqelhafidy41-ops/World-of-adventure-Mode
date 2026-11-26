import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  CURRENT_GAME_VERSION,
  CURRENT_MOD_CONTENT_SCHEMA_VERSION,
  MIN_SUPPORTED_GAME_VERSION,
} from '@/src/core/api/woaModApiSpec';
import { APP_VERSION } from '@/src/core/version';
import { useI18n } from '@/src/i18n';
import {
  ModValidationReport,
  ValidationCategory,
  ValidationIssue,
} from '@/src/types/mod';

interface ValidationPanelProps {
  report: ModValidationReport | null;
  isValidating?: boolean;
  onRunValidation: () => void;
  onInspectIssue?: (issue: ValidationIssue) => void;
  compact?: boolean;
}

const CATEGORY_ORDER: (ValidationCategory | 'all')[] = [
  'all',
  'manifest',
  'identifiers',
  'assets',
  'models',
  'textures',
  'audio',
  'data',
  'dependencies',
  'properties',
  'security',
];

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  report,
  isValidating = false,
  onRunValidation,
  onInspectIssue,
  compact = false,
}) => {
  const { t } = useI18n();
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ValidationCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getCategoryLabel = (cat: ValidationCategory | 'all'): string => {
    switch (cat) {
      case 'all':
        return t('validation.cat.all');
      case 'manifest':
        return t('validation.cat.manifest');
      case 'identifiers':
        return t('validation.cat.identifiers');
      case 'assets':
        return t('validation.cat.assets');
      case 'models':
        return t('validation.cat.models');
      case 'textures':
        return t('validation.cat.textures');
      case 'audio':
        return t('validation.cat.audio');
      case 'data':
        return t('validation.cat.data');
      case 'dependencies':
        return t('validation.cat.dependencies');
      case 'properties':
        return t('validation.cat.properties');
      case 'security':
        return t('validation.cat.security');
    }
  };

  const filteredIssues = useMemo(() => {
    if (!report) return [];
    const q = searchQuery.trim().toLowerCase();
    return report.issues.filter((issue) => {
      if (severityFilter !== 'all' && issue.severity !== severityFilter) {
        return false;
      }
      if (categoryFilter !== 'all' && issue.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        issue.file.toLowerCase().includes(q) ||
        issue.object.toLowerCase().includes(q) ||
        issue.property.toLowerCase().includes(q) ||
        issue.problem.toLowerCase().includes(q) ||
        issue.suggestion.toLowerCase().includes(q) ||
        issue.code.toLowerCase().includes(q)
      );
    });
  }, [report, severityFilter, categoryFilter, searchQuery]);

  const categoryCounts = useMemo(() => {
    const map = new Map<ValidationCategory, number>();
    if (!report) return map;
    for (const issue of report.issues) {
      map.set(issue.category, (map.get(issue.category) ?? 0) + 1);
    }
    return map;
  }, [report]);

  return (
    <div className="flex flex-col rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] overflow-hidden">
      {/* Header Summary Strip */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {!report ? (
            <>
              <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t('validation.statusPending')}
              </span>
            </>
          ) : report.errorCount > 0 ? (
            <>
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                {t('validation.statusBlocked', { count: report.errorCount })}
              </span>
            </>
          ) : report.warningCount > 0 ? (
            <>
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {t('validation.statusReadyWarnings', { count: report.warningCount })}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {t('validation.statusAllPassed')}
              </span>
            </>
          )}

          {report && (
            <span className="hidden sm:inline text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              ·{' '}
              {t('validation.checkedSummary', {
                files: report.checkedFiles,
                assets: report.checkedAssets,
                objects: report.checkedObjects,
                ms: report.durationMs,
              })}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={isValidating}
          onClick={onRunValidation}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-[#0B0F17] dark:text-slate-200 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`}
          />
          {isValidating ? t('validation.running') : t('validation.runBtn')}
        </button>
      </div>

      {/* Authoritative Game / App / Schema Compatibility Strip */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-[#0B0F17]/70 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span>{t('validation.metaGameVer')}:</span>
          <strong dir="ltr" className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {report?.currentGameVersion ?? CURRENT_GAME_VERSION}
          </strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span>{t('validation.metaMinGameVer')}:</span>
          <strong dir="ltr" className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {report?.minSupportedGameVersion ?? MIN_SUPPORTED_GAME_VERSION}
          </strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span>{t('validation.metaCreatorVer')}:</span>
          <strong dir="ltr" className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {report?.modCreatorVersion ?? APP_VERSION}
          </strong>
        </span>
        {report?.version && (
          <span className="inline-flex items-center gap-1.5">
            <span>{t('validation.metaModVer')}:</span>
            <strong dir="ltr" className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {report.version}
            </strong>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span>{t('validation.metaSchemaVer')}:</span>
          <strong dir="ltr" className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
            v{report?.contentSchemaVersion ?? CURRENT_MOD_CONTENT_SCHEMA_VERSION}
          </strong>
        </span>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-0.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823]">
            {(
              [
                {
                  id: 'all',
                  label: t('validation.filterAll', { count: report?.issues.length ?? 0 }),
                },
                {
                  id: 'error',
                  label: t('validation.filterErrors', { count: report?.errorCount ?? 0 }),
                },
                {
                  id: 'warning',
                  label: t('validation.filterWarnings', { count: report?.warningCount ?? 0 }),
                },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setSeverityFilter(btn.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  severityFilter === btn.id
                    ? 'bg-slate-900 text-white dark:bg-white/15 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as ValidationCategory | 'all')
            }
            className="px-2.5 py-1.5 text-xs rounded border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-[#121823] dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CATEGORY_ORDER.map((cat) => {
              const count =
                cat === 'all'
                  ? report?.issues.length ?? 0
                  : categoryCounts.get(cat) ?? 0;
              return (
                <option key={cat} value={cat}>
                  {getCategoryLabel(cat)}
                  {report ? ` (${count})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('validation.searchPlaceholder')}
            className="w-full ps-8 pe-2.5 py-1.5 text-xs rounded border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-[#121823] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Results List */}
      {!report ? (
        <div className="p-8 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('validation.emptyClickRun')}
          </p>
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="p-8 text-center space-y-1.5">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {report.issues.length === 0
              ? t('validation.noIssuesTitle')
              : t('validation.emptyNoMatch')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {report.issues.length === 0
              ? t('validation.emptyZeroDesc')
              : t('validation.emptyNoMatchDesc')}
          </p>
        </div>
      ) : (
        <div
          className={`divide-y divide-slate-200 dark:divide-white/10 ${
            compact ? 'max-h-[460px] overflow-y-auto' : ''
          }`}
        >
          {filteredIssues.map((issue) => {
            const isError = issue.severity === 'error';
            return (
              <div
                key={issue.id}
                className="px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {isError ? (
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    )}

                    <div className="min-w-0 flex-1 space-y-2">
                      {/* Header line: Severity · Code · Category */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span
                          className={`font-semibold ${
                            isError
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {isError
                            ? t('validation.severityError')
                            : t('validation.severityWarning')}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">
                          ·
                        </span>
                        <span
                          dir="ltr"
                          className="font-mono text-[11px] text-slate-600 dark:text-slate-300"
                        >
                          {issue.code}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {getCategoryLabel(issue.category)}
                        </span>
                      </div>

                      {/* Structured Issue Breakdown */}
                      <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                            {t('validation.fileCol')}
                          </dt>
                          <dd
                            dir="ltr"
                            className="font-mono text-slate-900 dark:text-slate-100 truncate"
                          >
                            {issue.file}
                          </dd>
                        </div>

                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                            {t('validation.objectCol')}
                          </dt>
                          <dd
                            dir="auto"
                            className="text-slate-900 dark:text-slate-100 truncate"
                          >
                            {issue.object}
                          </dd>
                        </div>

                        <div className="min-w-0">
                          <dt className="text-[11px] text-slate-500 dark:text-slate-400">
                            {t('validation.propertyCol')}
                          </dt>
                          <dd
                            dir="ltr"
                            className="font-mono text-slate-900 dark:text-slate-100 truncate"
                          >
                            {issue.property}
                          </dd>
                        </div>
                      </dl>

                      <div className="space-y-1 text-xs pt-0.5">
                        <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
                          <span className="font-medium text-slate-500 dark:text-slate-400">
                            {t('validation.problemPrefix')}{' '}
                          </span>
                          <span dir="auto">{issue.problem}</span>
                        </p>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {t('validation.solutionPrefix')}{' '}
                          </span>
                          <span dir="auto">{issue.suggestion}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {onInspectIssue && (
                    <button
                      type="button"
                      onClick={() => onInspectIssue(issue)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
                    >
                      {t('validation.inspectBtn')}
                      <ArrowUpRight className="w-3 h-3 rtl:-scale-x-100" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
