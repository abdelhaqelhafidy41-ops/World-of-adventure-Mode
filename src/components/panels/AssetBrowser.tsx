import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Check,
  Copy,
  Eye,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MoreVertical,
  Music,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuItem,
  useLongPress,
} from '@/src/components/common/ContextMenu';
import { ACCEPTED_ASSET_INPUT_EXTENSIONS } from '@/src/core/assets/assetPipeline';
import { getAssetBlob } from '@/src/core/storage/modRepository';
import { useI18n } from '@/src/i18n';
import {
  AndroidAccessDeniedError,
  getPlatformAdapter,
  reportAndroidAccessError,
  usePlatform,
} from '@/src/platform';
import { AssetPresetKind, ModAsset } from '@/src/types/mod';

interface AssetBrowserProps {
  assets: ModAsset[];
  activeAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
  onImportFiles: (files: FileList | File[]) => Promise<void>;
  onAddProceduralAsset: (name: string, preset: AssetPresetKind) => void;
  onRenameAsset: (assetId: string, newName: string) => void;
  onReplaceAsset: (assetId: string, file: File) => Promise<void>;
  onDuplicateAsset: (assetId: string) => Promise<void>;
  onDeleteAsset: (assetId: string) => Promise<void>;
}

type AssetFilter = 'all' | '3d-model' | 'texture' | 'audio';

const PRESET_KEY_BY_KIND: Record<AssetPresetKind, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  'relic-sword': 'assets.preset.sword',
  'crystal-obelisk': 'assets.preset.gem',
  'frontier-crate': 'assets.preset.crate',
  'clockwork-sentinel': 'assets.preset.creature',
  'beacon-pedestal': 'assets.preset.pillar',
};

const PRESET_KINDS: AssetPresetKind[] = [
  'relic-sword',
  'crystal-obelisk',
  'frontier-crate',
  'clockwork-sentinel',
  'beacon-pedestal',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const TextureThumbnail: React.FC<{ asset: ModAsset }> = ({ asset }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (!asset.blobKey) return;

    getAssetBlob(asset.blobKey).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setThumbUrl(objectUrl);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.blobKey, asset.updatedAt]);

  if (!thumbUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
        <ImageIcon className="w-4 h-4" />
      </div>
    );
  }

  return (
    <img
      src={thumbUrl}
      alt={asset.name}
      referrerPolicy="no-referrer"
      className="w-full h-full object-cover"
    />
  );
};

interface LongPressWrapperProps {
  onLongPress: (x: number, y: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onClick: () => void;
  className: string;
  children: React.ReactNode;
}

const AssetCardShell: React.FC<LongPressWrapperProps> = ({
  onLongPress,
  onContextMenu,
  onClick,
  className,
  children,
}) => {
  const longPressHandlers = useLongPress(onLongPress);
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...longPressHandlers}
      className={className}
    >
      {children}
    </div>
  );
};

export const AssetBrowser: React.FC<AssetBrowserProps> = ({
  assets,
  activeAssetId,
  onSelectAsset,
  onImportFiles,
  onAddProceduralAsset,
  onRenameAsset,
  onReplaceAsset,
  onDuplicateAsset,
  onDeleteAsset,
}) => {
  const { t } = useI18n();
  const platformInfo = usePlatform();
  const importInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [dragActive, setDragActive] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showProcedural, setShowProcedural] = useState(false);
  const [procName, setProcName] = useState('');
  const [procPreset, setProcPreset] = useState<AssetPresetKind>('beacon-pedestal');

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    asset: ModAsset;
    x: number;
    y: number;
  } | null>(null);

  const counts = {
    all: assets.length,
    '3d-model': assets.filter((a) => a.type === '3d-model').length,
    texture: assets.filter((a) => a.type === 'texture').length,
    audio: assets.filter((a) => a.type === 'audio').length,
  };

  const filtered = assets.filter((a) => {
    if (filter !== 'all' && a.type !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.path.toLowerCase().includes(q) ||
      a.format.toLowerCase().includes(q) ||
      (a.extractedMaterials?.some((m) => m.name.toLowerCase().includes(q)) ?? false)
    );
  });

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    setImportError(null);
    try {
      await onImportFiles(fileList);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t('app.assetImportFailed', { error: '' }));
    }
  };

  const handleImportButtonClick = async () => {
    if (platformInfo.platform !== 'web') {
      try {
        const picked = await getPlatformAdapter().pickImportFiles({
          title: t('common.import'),
          accept: ACCEPTED_ASSET_INPUT_EXTENSIONS.split(','),
          multiple: true,
        });
        if (picked.length > 0) {
          await handleFilesSelected(picked);
        }
        return;
      } catch (err) {
        if (err instanceof AndroidAccessDeniedError) {
          reportAndroidAccessError(err.operation, err, {
            permanentlyDenied: err.permanentlyDenied,
            retryAction: () => void handleImportButtonClick(),
          });
        }
        setImportError(err instanceof Error ? err.message : t('app.assetImportFailed', { error: '' }));
        return;
      }
    }
    importInputRef.current?.click();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleProceduralCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!procName.trim()) return;
    onAddProceduralAsset(procName.trim(), procPreset);
    setProcName('');
    setShowProcedural(false);
  };

  const startRename = (asset: ModAsset) => {
    setRenamingId(asset.id);
    setRenameDraft(asset.name);
  };

  const commitRename = (assetId: string) => {
    if (renameDraft.trim()) {
      onRenameAsset(assetId, renameDraft.trim());
    }
    setRenamingId(null);
  };

  const triggerReplace = async (assetId: string) => {
    if (platformInfo.platform !== 'web') {
      try {
        const picked = await getPlatformAdapter().pickImportFiles({
          title: t('assets.replaceAction'),
          accept: ACCEPTED_ASSET_INPUT_EXTENSIONS.split(','),
          multiple: false,
        });
        if (picked[0]) {
          await onReplaceAsset(assetId, picked[0]);
        }
        return;
      } catch (err) {
        if (err instanceof AndroidAccessDeniedError) {
          reportAndroidAccessError(err.operation, err, {
            permanentlyDenied: err.permanentlyDenied,
            retryAction: () => void triggerReplace(assetId),
          });
        }
        setImportError(err instanceof Error ? err.message : 'Unable to replace asset.');
        return;
      }
    }
    setReplaceTargetId(assetId);
    replaceInputRef.current?.click();
  };

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = replaceTargetId;
    e.target.value = '';
    setReplaceTargetId(null);
    if (!file || !targetId) return;
    setImportError(null);
    try {
      await onReplaceAsset(targetId, file);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to replace asset.');
    }
  };

  const buildAssetMenuItems = (asset: ModAsset): ContextMenuItem[] => [
    {
      id: 'preview',
      label: t('ctx.preview'),
      icon: <Eye className="w-3.5 h-3.5" />,
      onSelect: () => onSelectAsset(asset.id),
    },
    {
      id: 'rename',
      label: t('ctx.rename'),
      icon: <Pencil className="w-3.5 h-3.5" />,
      onSelect: () => startRename(asset),
    },
    {
      id: 'replace',
      label: t('ctx.replace'),
      icon: <RefreshCw className="w-3.5 h-3.5" />,
      onSelect: () => void triggerReplace(asset.id),
    },
    {
      id: 'duplicate',
      label: t('ctx.duplicate'),
      icon: <Copy className="w-3.5 h-3.5" />,
      onSelect: () => void onDuplicateAsset(asset.id),
    },
    {
      id: 'delete',
      label: t('ctx.delete'),
      icon: <Trash2 className="w-3.5 h-3.5" />,
      danger: true,
      onSelect: () => void onDeleteAsset(asset.id),
    },
  ];

  const renderThumbnail = (asset: ModAsset, sizeClass: string) => {
    if (asset.type === 'texture') {
      return (
        <div
          className={`${sizeClass} rounded overflow-hidden border border-slate-200 dark:border-white/10 shrink-0`}
        >
          <TextureThumbnail asset={asset} />
        </div>
      );
    }
    if (asset.type === 'audio') {
      return (
        <div
          className={`${sizeClass} rounded flex items-center justify-center bg-amber-500/15 border border-amber-500/30 text-amber-500 shrink-0`}
        >
          <Music className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div
        className={`${sizeClass} rounded flex items-center justify-center border border-black/10 dark:border-white/15 shrink-0`}
        style={{ backgroundColor: asset.material.color }}
      >
        <Box className="w-4 h-4 text-white drop-shadow" />
      </div>
    );
  };

  const formatSubline = (asset: ModAsset) => {
    if (asset.type === '3d-model') {
      const dims = asset.dimensions
        ? `${asset.dimensions.width}×${asset.dimensions.height}×${asset.dimensions.depth}`
        : `${asset.triangleEstimate} tris`;
      return `${asset.format} · ${dims}`;
    }
    if (asset.type === 'texture') {
      const res = asset.resolution
        ? `${asset.resolution.width}×${asset.resolution.height}px`
        : formatBytes(asset.sizeBytes);
      return `${asset.format} · ${res}`;
    }
    if (asset.type === 'audio') {
      const dur =
        asset.durationSeconds && asset.durationSeconds > 0
          ? `${asset.durationSeconds.toFixed(1)}s`
          : formatBytes(asset.sizeBytes);
      return `${asset.format} · ${dur}`;
    }
    return `${asset.format} · ${formatBytes(asset.sizeBytes)}`;
  };

  return (
    <div
      className={`flex flex-col h-full overflow-hidden relative ${
        dragActive ? 'ring-2 ring-inset ring-blue-500 bg-blue-500/5' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      {/* Header + Import & Starter Controls */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
          {t('assets.title')}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void handleImportButtonClick()}
            title={t('assets.dropHint')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors whitespace-nowrap min-h-[32px] touch-target"
          >
            <Upload className="w-3 h-3" />
            {t('common.import')}
          </button>
          <button
            type="button"
            onClick={() => setShowProcedural((v) => !v)}
            title={t('assets.newAssetTitle')}
            className="p-1.5 rounded border border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <input
          ref={importInputRef}
          type="file"
          multiple
          accept={ACCEPTED_ASSET_INPUT_EXTENSIONS}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void handleFilesSelected(e.target.files);
            }
            e.target.value = '';
          }}
          className="hidden"
        />

        <input
          ref={replaceInputRef}
          type="file"
          accept={ACCEPTED_ASSET_INPUT_EXTENSIONS}
          onChange={handleReplaceFileChange}
          className="hidden"
        />
      </div>

      {/* Optional starter procedural creator */}
      {showProcedural && (
        <form
          onSubmit={handleProceduralCreate}
          className="p-2.5 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] space-y-2 shrink-0"
        >
          <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
            {t('assets.newAssetTitle')}
          </div>
          <input
            type="text"
            required
            dir="auto"
            value={procName}
            onChange={(e) => setProcName(e.target.value)}
            placeholder={t('assets.newAssetName')}
            className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={procPreset}
            onChange={(e) => setProcPreset(e.target.value as AssetPresetKind)}
            className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {PRESET_KINDS.map((preset) => (
              <option key={preset} value={preset}>
                {t('assets.newAssetPreset')}: {t(PRESET_KEY_BY_KIND[preset])}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setShowProcedural(false)}
              className="px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="px-2.5 py-1 text-[11px] font-medium rounded bg-blue-600 text-white hover:bg-blue-500"
            >
              {t('common.create')}
            </button>
          </div>
        </form>
      )}

      {/* Search + Filter Bar + View Switcher */}
      <div className="p-2 border-b border-slate-200 dark:border-white/10 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('assets.searchPlaceholder')}
              className="w-full ps-7 pe-2 py-1.5 text-xs rounded border border-slate-200 bg-slate-50 text-slate-900 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setViewMode((v) => (v === 'list' ? 'grid' : 'list'))}
            className="p-1.5 rounded border border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            {viewMode === 'list' ? (
              <LayoutGrid className="w-3.5 h-3.5" />
            ) : (
              <List className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {(
            [
              { id: 'all', label: t('assets.filterAll') },
              { id: '3d-model', label: t('assets.filterModels') },
              { id: 'texture', label: t('assets.filterTextures') },
              { id: 'audio', label: t('assets.filterAudio') },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`py-1.5 px-1 text-[10px] font-medium rounded transition-colors tabular-nums truncate ${
                filter === tab.id
                  ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-[#0B0F17] dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label} ({counts[tab.id]})
            </button>
          ))}
        </div>
      </div>

      {/* Unsupported / Error feedback */}
      {importError && (
        <div className="px-2.5 py-2 bg-red-500/10 border-b border-red-500/20 text-[11px] text-red-600 dark:text-red-300 flex items-start justify-between gap-2 shrink-0">
          <span>{importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="text-red-500 hover:text-red-400 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Asset List / Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="py-8 px-3 text-center space-y-2 border border-dashed border-slate-200 dark:border-white/10 rounded-md">
            <Upload className="w-5 h-5 text-slate-400 mx-auto" />
            <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              {t('assets.empty')}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('assets.dropHint')}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((asset) => {
              const active = asset.id === activeAssetId;
              return (
                <AssetCardShell
                  key={asset.id}
                  onClick={() => onSelectAsset(asset.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ asset, x: e.clientX, y: e.clientY });
                  }}
                  onLongPress={(x, y) => setContextMenu({ asset, x, y })}
                  className={`group relative rounded-md border p-2 cursor-pointer transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-600/10'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0E131D] hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  <div className="aspect-square w-full mb-1.5 relative">
                    {renderThumbnail(asset, 'w-full h-full')}
                    <button
                      type="button"
                      aria-label={t('ctx.moreActions')}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setContextMenu({ asset, x: rect.left, y: rect.bottom + 4 });
                      }}
                      className="absolute top-1 end-1 p-1 rounded bg-black/60 text-white hover:bg-black/80"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div dir="auto" className="text-[11px] font-medium text-slate-900 dark:text-slate-100 truncate">
                    {asset.name}
                  </div>
                  <div dir="ltr" className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate tabular-nums">
                    {asset.format} · {formatBytes(asset.sizeBytes)}
                  </div>
                </AssetCardShell>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((asset) => {
              const active = asset.id === activeAssetId;
              const isRenaming = renamingId === asset.id;
              return (
                <AssetCardShell
                  key={asset.id}
                  onClick={() => {
                    if (!isRenaming) onSelectAsset(asset.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ asset, x: e.clientX, y: e.clientY });
                  }}
                  onLongPress={(x, y) => setContextMenu({ asset, x, y })}
                  className={`group rounded-md border p-2 cursor-pointer transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-600/10'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0E131D] hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {renderThumbnail(asset, 'w-8 h-8')}
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            autoFocus
                            dir="auto"
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename(asset.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            className="w-full px-1.5 py-0.5 text-xs rounded border border-blue-500 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => commitRename(asset.id)}
                            className="p-0.5 text-emerald-500 hover:bg-emerald-500/10 rounded"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="p-0.5 text-slate-400 hover:bg-white/10 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div dir="auto" className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                            {asset.name}
                          </div>
                          <div dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate tabular-nums">
                            {formatSubline(asset)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick action strip (always visible on touch devices, or when selected/hovered) */}
                  {!isRenaming && (
                    <div
                      className={`mt-2 pt-1.5 border-t border-slate-200/70 dark:border-white/5 items-center justify-between gap-1 ${
                        active || platformInfo.isTouchPrimary
                          ? 'flex'
                          : 'hidden group-hover:flex'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span dir="ltr" className="text-[10px] font-mono text-slate-400 truncate">
                        {asset.path.split('/').slice(0, -1).join('/')}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          title={t('assets.previewAction')}
                          onClick={() => onSelectAsset(asset.id)}
                          className="p-1.5 rounded text-slate-500 hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={t('assets.renameTooltip')}
                          onClick={() => startRename(asset)}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={t('assets.replaceAction')}
                          onClick={() => void triggerReplace(asset.id)}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={t('assets.duplicateTooltip')}
                          onClick={() => void onDuplicateAsset(asset.id)}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={t('assets.deleteTooltip')}
                          onClick={() => void onDeleteAsset(asset.id)}
                          className="p-1.5 rounded text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </AssetCardShell>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom supported formats footer hint */}
      <div dir="ltr" className="px-3 py-1.5 border-t border-slate-200 dark:border-white/10 text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate shrink-0">
        GLB · GLTF · OBJ · PNG · JPG · WAV · OGG · MP3
      </div>

      <ContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        items={contextMenu ? buildAssetMenuItems(contextMenu.asset) : []}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
};
