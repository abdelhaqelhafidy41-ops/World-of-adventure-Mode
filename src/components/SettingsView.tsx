import React, { useEffect, useState } from 'react';
import {
  FolderOpen,
  Globe,
  HardDrive,
  Info,
  Keyboard,
  Monitor,
  RotateCcw,
  Smartphone,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { SUPPORTED_GAME_VERSIONS } from '@/src/core/project/modScaffolder';
import { DEFAULT_EDITOR_SETTINGS } from '@/src/core/storage/modRepository';
import { APP_VERSION } from '@/src/core/version';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';
import { useI18n } from '@/src/i18n';
import {
  STORAGE_SUBDIRS,
  StorageLocationInfo,
  getPlatformAdapter,
  usePlatform,
} from '@/src/platform';
import { EditorSettings, TargetPlatform } from '@/src/types/mod';

interface SettingsViewProps {
  settings: EditorSettings;
  projectCount: number;
  onUpdateSettings: (patch: Partial<EditorSettings>) => void;
  onRestoreSampleProject: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  projectCount,
  onUpdateSettings,
  onRestoreSampleProject,
}) => {
  const { t, language, languages, setLanguage } = useI18n();
  const isOnline = useOnlineStatus();
  const { isInstalled } = usePWAInstall();
  const platformInfo = usePlatform();
  const [storageInfo, setStorageInfo] = useState<StorageLocationInfo | null>(null);

  useEffect(() => {
    let active = true;
    void getPlatformAdapter()
      .getStorageInfo()
      .then((info) => {
        if (active) setStorageInfo(info);
      });
    return () => {
      active = false;
    };
  }, [platformInfo.platform]);

  const handleOpenFolder = () => {
    void getPlatformAdapter().openStorageFolder();
  };

  const handlePickSafDirectory = async () => {
    const picked = await getPlatformAdapter().pickStorageDirectory();
    if (picked) {
      const updated = await getPlatformAdapter().getStorageInfo();
      setStorageInfo(updated);
    }
  };

  const runtimeLabel =
    platformInfo.platform === 'windows'
      ? t('settings.platformWindows')
      : platformInfo.platform === 'android'
        ? t('settings.platformAndroid')
        : t('settings.platformWeb');

  const storageModeLabel =
    storageInfo?.mode === 'native-documents'
      ? t('settings.storageModeNativeDocs')
      : storageInfo?.mode === 'android-saf'
        ? t('settings.storageModeSaf')
        : storageInfo?.mode === 'android-appdata'
          ? t('settings.storageModeAppData')
          : t('settings.storageModeIndexedDb');

  const toggleItems = [
    {
      key: 'viewportGrid',
      label: t('settings.viewportGridLabel'),
      desc: t('settings.viewportGridDesc'),
    },
    {
      key: 'viewportAxes',
      label: t('settings.viewportAxesLabel'),
      desc: t('settings.viewportAxesDesc'),
    },
    {
      key: 'showShadows',
      label: t('settings.shadowsLabel'),
      desc: t('settings.shadowsDesc'),
    },
    {
      key: 'lowPowerMode',
      label: t('settings.lowPowerLabel'),
      desc: t('settings.lowPowerDesc'),
    },
    {
      key: 'snapToGrid',
      label: t('settings.snapLabel'),
      desc: t('settings.snapDesc'),
    },
    {
      key: 'autoSave',
      label: t('settings.autoSaveLabel'),
      desc: t('settings.autoSaveDesc'),
    },
    {
      key: 'autoBackupOnBuild',
      label: t('settings.autoBackupLabel'),
      desc: t('settings.autoBackupDesc'),
    },
  ] as const;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="pb-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t('settings.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t('settings.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onUpdateSettings(DEFAULT_EDITOR_SETTINGS);
              setLanguage(DEFAULT_EDITOR_SETTINGS.language ?? 'en');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('settings.resetDefaults')}
          </button>
        </div>

        {/* Platform & Storage */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-500" />
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.platformSection')}
            </h2>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('settings.detectedRuntime')}
                </div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  {platformInfo.platform === 'android' ? (
                    <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : platformInfo.platform === 'windows' ? (
                    <Monitor className="w-4 h-4 text-blue-500 shrink-0" />
                  ) : (
                    <Globe className="w-4 h-4 text-sky-500 shrink-0" />
                  )}
                  <span>{runtimeLabel}</span>
                </div>
              </div>

              <div className="p-3 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('settings.storageMode')}
                </div>
                <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {storageModeLabel}
                </div>
              </div>
            </div>

            {storageInfo && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t('settings.storagePath')}
                </div>
                <div
                  dir="ltr"
                  className="px-3 py-2 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] font-mono text-[11px] text-slate-800 dark:text-slate-200 break-all"
                >
                  {storageInfo.rootPath}
                </div>

                {storageInfo.safTreeLabel && (
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    {t('settings.safActiveLabel', { label: storageInfo.safTreeLabel })}
                  </div>
                )}

                <div className="pt-1">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                    {t('settings.storageSubdirsLabel')}
                  </div>
                  <div dir="ltr" className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {STORAGE_SUBDIRS.map((sub) => (
                      <div
                        key={sub}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate"
                        title={storageInfo.subdirectories[sub]}
                      >
                        {sub}/
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {platformInfo.platform === 'windows' && (
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-[#0B0F17] dark:text-slate-200 dark:hover:bg-white/5 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t('settings.openFolderBtn')}
                </button>
              )}

              {platformInfo.hasStorageAccessFramework && (
                <button
                  type="button"
                  onClick={() => void handlePickSafDirectory()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors min-h-[40px]"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t('settings.chooseSafFolderBtn')}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Language */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-500" />
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.languageTitle')}
            </h2>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('settings.languageDesc')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {languages.map((langDef) => {
                const active = language === langDef.code;
                return (
                  <button
                    key={langDef.code}
                    type="button"
                    onClick={() => {
                      setLanguage(langDef.code);
                      onUpdateSettings({ language: langDef.code });
                    }}
                    className={`text-start p-3.5 rounded-md border transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-600/10'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-white/10 dark:bg-[#0B0F17] dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {langDef.nativeName}
                      </span>
                      <span className="text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400">
                        {langDef.dir.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {langDef.code === 'ar'
                        ? t('settings.languageOptionArDesc')
                        : t('settings.languageOptionEnDesc')}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
              {t('settings.languageNote')}
            </p>
          </div>
        </section>

        {/* Appearance */}
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.appearanceTitle')}
          </h2>
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {t('settings.themeLabel')}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {settings.theme === 'dark'
                  ? t('settings.themeDark')
                  : t('settings.themeLight')}
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10">
              {(['dark', 'light'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onUpdateSettings({ theme: mode })}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors min-h-[34px] ${
                    settings.theme === mode
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-blue-600 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {mode === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Project Defaults */}
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('createMod.stepDetails')}
          </h2>
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('settings.defaultAuthorLabel')}
                </label>
                <input
                  type="text"
                  dir="auto"
                  value={settings.defaultAuthor}
                  onChange={(e) =>
                    onUpdateSettings({ defaultAuthor: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('createMod.gameVersionLabel')}
                </label>
                <select
                  value={settings.defaultGameVersion}
                  onChange={(e) =>
                    onUpdateSettings({ defaultGameVersion: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SUPPORTED_GAME_VERSIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('settings.defaultPlatformLabel')}
              </label>
              <select
                value={settings.defaultTargetPlatform}
                onChange={(e) =>
                  onUpdateSettings({
                    defaultTargetPlatform: e.target.value as TargetPlatform,
                  })
                }
                className="w-full sm:w-64 px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="universal">{t('platform.universal')}</option>
                <option value="windows">{t('platform.windows')}</option>
                <option value="android">{t('platform.android')}</option>
              </select>
            </div>
          </div>
        </section>

        {/* Viewport & Storage */}
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.sectionViewportStorage')}
          </h2>
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] divide-y divide-slate-200 dark:divide-white/5">
            {toggleItems.map((item) => (
              <label
                key={item.key}
                className="p-4 flex items-center justify-between gap-4 cursor-pointer min-h-[56px]"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.label}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {item.desc}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings[item.key]}
                  onChange={(e) =>
                    onUpdateSettings({ [item.key]: e.target.checked })
                  }
                  className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                />
              </label>
            ))}

            <div className="p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t('settings.localStoreLabel')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {t('settings.localStoreDesc', { count: projectCount })}
                </div>
              </div>
              <button
                type="button"
                onClick={onRestoreSampleProject}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
              >
                {t('settings.restoreSampleBtn')}
              </button>
            </div>
          </div>
        </section>

        {/* Keyboard Shortcuts */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-blue-500" />
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.shortcutsTitle')}
            </h2>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] divide-y divide-slate-200 dark:divide-white/5 text-xs">
            {[
              { label: t('settings.shortcutSave'), keys: 'Ctrl / Cmd + S' },
              { label: t('settings.shortcutOrbit'), keys: 'Drag / Wheel' },
              { label: t('settings.shortcutSandboxMove'), keys: 'WASD / Arrows / Space' },
              { label: t('settings.shortcutSandboxInteract'), keys: 'E / F' },
            ].map((row) => (
              <div key={row.label} className="px-4 py-3 flex items-center justify-between gap-4">
                <span className="text-slate-700 dark:text-slate-300">{row.label}</span>
                <kbd
                  dir="ltr"
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#0B0F17] font-mono text-[11px] text-slate-700 dark:text-slate-300"
                >
                  {row.keys}
                </kbd>
              </div>
            ))}
          </div>
        </section>

        {/* PWA & About */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.pwaTitle')}
            </h2>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-emerald-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-amber-500" />
                )}
                {isOnline ? t('settings.pwaOnline') : t('settings.pwaOffline')}
              </span>
              <span dir="ltr" className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {t('settings.versionBadge', { version: APP_VERSION })}
                {platformInfo.platform === 'web' && isInstalled
                  ? ` · ${t('settings.pwaInstalled')}`
                  : ''}
              </span>
            </div>
            <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-1">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {t('settings.aboutTitle')}
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('settings.aboutDesc')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
