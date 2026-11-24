import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react';
import { useI18n } from '@/src/i18n';
import { ConsoleEntry, LogLevel } from '@/src/types/mod';

interface ConsolePanelProps {
  logs: ConsoleEntry[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClear: () => void;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  logs,
  collapsed,
  onToggleCollapse,
  onClear,
}) => {
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | LogLevel>('all');

  const visibleLogs =
    filter === 'all' ? logs : logs.filter((entry) => entry.level === filter);

  const levelStyles: Record<LogLevel, string> = {
    info: 'text-slate-500 dark:text-slate-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    error: 'text-red-600 dark:text-red-400',
  };

  const getLevelLabel = (lvl: 'all' | LogLevel): string => {
    switch (lvl) {
      case 'all':
        return t('console.filterAll');
      case 'info':
        return t('console.info');
      case 'warn':
        return t('console.warn');
      case 'error':
        return t('console.error');
      case 'success':
        return t('console.success');
    }
  };

  return (
    <div
      className={`border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] flex flex-col shrink-0 ${
        collapsed ? 'h-9' : 'h-44'
      }`}
    >
      <div className="h-9 px-3 flex items-center justify-between gap-4 border-b border-slate-200 dark:border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-500 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
            {t('console.title')}
            <span
              dir="ltr"
              className="font-mono text-[11px] font-normal text-slate-500 tabular-nums"
            >
              ({logs.length})
            </span>
            {collapsed ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {!collapsed && (
            <div className="hidden sm:flex items-center gap-1">
              {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setFilter(lvl)}
                  className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                    filter === lvl
                      ? 'bg-slate-200 text-slate-900 dark:bg-white/15 dark:text-white font-medium'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {getLevelLabel(lvl)}
                </button>
              ))}
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            {t('console.clear')}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[11px] space-y-0.5 bg-slate-50 dark:bg-[#0B0F17]">
          {visibleLogs.length === 0 ? (
            <div className="py-4 text-slate-400 dark:text-slate-500">
              {t('console.noMatching')}
            </div>
          ) : (
            visibleLogs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2.5 leading-5">
                <span
                  dir="ltr"
                  className="text-slate-400 dark:text-slate-500 tabular-nums shrink-0"
                >
                  {entry.timestamp}
                </span>
                <span
                  className={`uppercase w-14 shrink-0 font-semibold ${levelStyles[entry.level]}`}
                >
                  {getLevelLabel(entry.level)}
                </span>
                <span
                  dir="ltr"
                  className="text-slate-500 dark:text-slate-400 shrink-0"
                >
                  [{entry.source}]
                </span>
                <span
                  dir="auto"
                  className="text-slate-800 dark:text-slate-200 break-words"
                >
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
