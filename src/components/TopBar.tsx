import React, { useState } from 'react';
import { Download, Hammer, Plus, WifiOff } from 'lucide-react';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useI18n } from '@/src/i18n';
import { usePlatform } from '@/src/platform';

export type AppView = 'projects' | 'workspace' | 'build' | 'api' | 'settings';

interface TopBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  activeProjectName: string | null;
  onCreateMod: () => void;
  onBuildMod: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onNavigate,
  activeProjectName,
  onCreateMod,
  onBuildMod,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const { t } = useI18n();
  const platformInfo = usePlatform();
  const isWebRuntime = platformInfo.platform === 'web';
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const navItems: { id: AppView; label: string; requiresProject?: boolean }[] = [
    { id: 'projects', label: t('nav.projects') },
    { id: 'workspace', label: t('nav.workspace'), requiresProject: true },
    { id: 'build', label: t('nav.build'), requiresProject: true },
    { id: 'api', label: t('nav.apiDocs') },
    { id: 'settings', label: t('nav.settings') },
  ];

  return (
    <>
      <header className="min-h-14 pt-safe shrink-0 border-b border-slate-200 bg-white px-4 lg:px-6 flex items-center justify-between gap-4 sm:gap-8 dark:border-white/10 dark:bg-[#101520]">
        {/* Zone 1: Brand title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded min-h-[40px] flex items-center"
          >
            {t('app.fullName')}
          </button>
          {activeProjectName && activeView !== 'projects' && (
            <span
              dir="auto"
              className="hidden xl:inline-block text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]"
            >
              / {activeProjectName}
            </span>
          )}
        </div>

        {/* Zone 2: Single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const disabled = Boolean(item.requiresProject && !activeProjectName);
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => onNavigate(item.id)}
                className={`relative py-4 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  disabled
                    ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                    : active
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary action + offline / install */}
        <div className="flex items-center gap-3 shrink-0">
          {!isOnline && (
            <span
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap shrink-0"
              title={t('nav.localOffline')}
            >
              <WifiOff className="w-3.5 h-3.5" />
              {t('nav.localOffline')}
            </span>
          )}

          {isWebRuntime && !isInstalled && isInstallable && (
            <button
              type="button"
              onClick={install}
              title={t('nav.installAppTooltip')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {t('nav.installApp')}
            </button>
          )}

          {isWebRuntime && !isInstalled && !isInstallable && isIOS && (
            <button
              type="button"
              onClick={() => setShowIOSGuide(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {t('nav.installShort')}
            </button>
          )}

          {activeProjectName && activeView === 'workspace' ? (
            <button
              type="button"
              onClick={onBuildMod}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 min-h-[38px] touch-target"
            >
              <Hammer className="w-3.5 h-3.5" />
              {t('nav.buildMod')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onCreateMod}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 min-h-[38px] touch-target"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('nav.newMod')}
            </button>
          )}
        </div>
      </header>

      {/* Mobile bottom navigation bar (<= md) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-safe border-t border-slate-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#101520]/95 flex items-center justify-around px-1.5"
      >
        {navItems.map((item) => {
          const disabled = Boolean(item.requiresProject && !activeProjectName);
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onNavigate(item.id)}
              className={`min-h-[48px] flex-1 px-1.5 py-2 text-xs font-medium whitespace-nowrap truncate rounded transition-colors ${
                disabled
                  ? 'text-slate-400 dark:text-slate-600'
                  : active
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#121823]">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('nav.iosGuideTitle')}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('nav.iosGuideBody')}
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
