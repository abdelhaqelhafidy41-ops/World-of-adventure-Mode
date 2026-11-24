import React, { useEffect, useRef, useState } from 'react';
import {
  Grid,
  Music,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getAssetBlob } from '@/src/core/storage/modRepository';
import { useI18n } from '@/src/i18n';
import { ModAsset } from '@/src/types/mod';

interface AssetMediaPreviewProps {
  asset: ModAsset;
}

export const AssetMediaPreview: React.FC<AssetMediaPreviewProps> = ({ asset }) => {
  const { t } = useI18n();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [checkerboard, setCheckerboard] = useState(true);

  // Audio playback state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(asset.durationSeconds ?? 0);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setMediaUrl(null);
    setZoom(1);
    setIsPlaying(false);
    setCurrentTime(0);

    if (!asset.blobKey) return;

    getAssetBlob(asset.blobKey).then((blob) => {
      if (!active || !blob) return;
      url = URL.createObjectURL(blob);
      setMediaUrl(url);
    });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset.id, asset.blobKey, asset.updatedAt]);

  if (asset.type === 'texture') {
    return (
      <div className="flex flex-col h-full bg-slate-100 dark:bg-[#0E131D] overflow-hidden">
        <div className="h-10 shrink-0 px-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
            {t('media.textureTitle')} ·{' '}
            <span dir="ltr" className="font-mono">
              {asset.path}
            </span>
          </div>
          <div dir="ltr" className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
              className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 w-11 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
              className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title={t('systems.zoomReset')}
              className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCheckerboard((c) => !c)}
              className={`p-1.5 rounded transition-colors ${
                checkerboard
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-600/10'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div
          className="flex-1 overflow-auto flex items-center justify-center p-6"
          style={
            checkerboard
              ? {
                  backgroundImage:
                    'linear-gradient(45deg, rgba(148,163,184,0.14) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.14) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.14) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.14) 75%)',
                  backgroundSize: '24px 24px',
                  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
                }
              : undefined
          }
        >
          {mediaUrl ? (
            <img
              src={mediaUrl}
              alt={asset.name}
              referrerPolicy="no-referrer"
              style={{ transform: `scale(${zoom})` }}
              className="max-w-full max-h-full object-contain rounded shadow-lg transition-transform duration-150"
            />
          ) : (
            <div className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs">
              {asset.blobKey ? t('viewport.loadingModel') : t('media.missingFileWarning')}
            </div>
          )}
        </div>

        <div dir="ltr" className="px-4 py-2 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] flex items-center justify-between text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          <span>
            {asset.format}
            {asset.resolution
              ? ` · ${asset.resolution.width} × ${asset.resolution.height} px`
              : ''}
          </span>
          <span>{(asset.sizeBytes / 1024).toFixed(1)} KB</span>
        </div>
      </div>
    );
  }

  // Audio preview
  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      await el.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const tenths = Math.floor((s % 1) * 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-[#0E131D] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <Music className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div dir="auto" className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {asset.name}
            </div>
            <div dir="ltr" className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate tabular-nums">
              {asset.format} · {(asset.sizeBytes / 1024).toFixed(1)} KB
            </div>
          </div>
        </div>

        {mediaUrl && (
          <audio
            ref={audioRef}
            src={mediaUrl}
            loop={loop}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d)) setDuration(d);
            }}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => setIsPlaying(false)}
          />
        )}

        <div dir="ltr" className="space-y-2">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.05}
            value={currentTime}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              setCurrentTime(next);
              if (audioRef.current) audioRef.current.currentTime = next;
            }}
            className="w-full accent-blue-600"
          />
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={!mediaUrl}
            onClick={togglePlay}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                {t('media.pauseAudio')}
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                {t('media.playAudio')}
              </>
            )}
          </button>

          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {t('form.loopAudio')}
          </label>
        </div>
      </div>
    </div>
  );
};
