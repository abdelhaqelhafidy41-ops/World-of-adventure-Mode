import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Flag,
  Pause,
  Play,
  Plus,
  Repeat,
  Square,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  AnimationConfigEntry,
  AnimationKeyframe,
  AnimationStatePreset,
  AnimationTimelineEvent,
} from '@/src/types/mod';

interface AnimationTimelineEditorProps {
  animation: AnimationConfigEntry;
  onChange: (
    next: AnimationConfigEntry,
    opts?: { recordUndo?: boolean; historyGroupKey?: string }
  ) => void;
  onScrubPose?: (pose: {
    position: { x: number; y: number; z: number };
    rotationDeg: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  }) => void;
  onStopScrub?: () => void;
  onTriggerSoundCue?: (soundCueId: string) => void;
}

const STATE_PRESETS: AnimationStatePreset[] = [
  'idle',
  'walk',
  'run',
  'attack',
  'interact',
  'sit',
  'sleep',
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateKeyframes(
  keyframes: AnimationKeyframe[],
  timeNorm: number
): {
  position: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
} {
  if (keyframes.length === 0) {
    return {
      position: { x: 0, y: 0, z: 0 },
      rotationDeg: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
  }
  const sorted = [...keyframes].sort((a, b) => a.timeNormalized - b.timeNormalized);
  if (timeNorm <= sorted[0].timeNormalized) {
    return {
      position: { ...sorted[0].position },
      rotationDeg: { ...sorted[0].rotationDeg },
      scale: { ...sorted[0].scale },
    };
  }
  const last = sorted[sorted.length - 1];
  if (timeNorm >= last.timeNormalized) {
    return {
      position: { ...last.position },
      rotationDeg: { ...last.rotationDeg },
      scale: { ...last.scale },
    };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (timeNorm >= a.timeNormalized && timeNorm <= b.timeNormalized) {
      const span = Math.max(0.0001, b.timeNormalized - a.timeNormalized);
      const u = (timeNorm - a.timeNormalized) / span;
      return {
        position: {
          x: Number(lerp(a.position.x, b.position.x, u).toFixed(3)),
          y: Number(lerp(a.position.y, b.position.y, u).toFixed(3)),
          z: Number(lerp(a.position.z, b.position.z, u).toFixed(3)),
        },
        rotationDeg: {
          x: Number(lerp(a.rotationDeg.x, b.rotationDeg.x, u).toFixed(2)),
          y: Number(lerp(a.rotationDeg.y, b.rotationDeg.y, u).toFixed(2)),
          z: Number(lerp(a.rotationDeg.z, b.rotationDeg.z, u).toFixed(2)),
        },
        scale: {
          x: Number(lerp(a.scale.x, b.scale.x, u).toFixed(3)),
          y: Number(lerp(a.scale.y, b.scale.y, u).toFixed(3)),
          z: Number(lerp(a.scale.z, b.scale.z, u).toFixed(3)),
        },
      };
    }
  }
  return {
    position: { ...last.position },
    rotationDeg: { ...last.rotationDeg },
    scale: { ...last.scale },
  };
}

function buildPresetKeyframes(preset: AnimationStatePreset): {
  durationSeconds: number;
  loop: boolean;
  keyframes: AnimationKeyframe[];
  events: AnimationTimelineEvent[];
} {
  const mk = (
    id: string,
    t: number,
    px = 0,
    py = 0,
    pz = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1
  ): AnimationKeyframe => ({
    id,
    timeNormalized: t,
    position: { x: px, y: py, z: pz },
    rotationDeg: { x: rx, y: ry, z: rz },
    scale: { x: sx, y: sy, z: sz },
  });

  switch (preset) {
    case 'attack':
      return {
        durationSeconds: 0.75,
        loop: false,
        keyframes: [
          mk('kf_1', 0, 0, 0, 0, -15, -25, 0),
          mk('kf_2', 0.32, 0, 0.08, -0.1, -55, -40, 12),
          mk('kf_3', 0.55, 0.12, -0.05, 0.25, 65, 35, -18),
          mk('kf_4', 1, 0, 0, 0, 0, 0, 0),
        ],
        events: [
          { id: 'ev_hit', timeNormalized: 0.5, eventType: 'hit', payload: 'melee_arc' },
          { id: 'ev_sfx', timeNormalized: 0.45, eventType: 'sound', payload: 'swing' },
        ],
      };
    case 'walk':
      return {
        durationSeconds: 1.0,
        loop: true,
        keyframes: [
          mk('kf_1', 0, 0, 0, 0, 6, 0, -4),
          mk('kf_2', 0.25, 0, 0.06, 0, 0, 4, 0),
          mk('kf_3', 0.5, 0, 0, 0, -6, 0, 4),
          mk('kf_4', 0.75, 0, 0.06, 0, 0, -4, 0),
          mk('kf_5', 1, 0, 0, 0, 6, 0, -4),
        ],
        events: [
          { id: 'ev_step_l', timeNormalized: 0.25, eventType: 'footstep', payload: 'left' },
          { id: 'ev_step_r', timeNormalized: 0.75, eventType: 'footstep', payload: 'right' },
        ],
      };
    case 'run':
      return {
        durationSeconds: 0.65,
        loop: true,
        keyframes: [
          mk('kf_1', 0, 0, 0, 0.08, 16, 0, -8),
          mk('kf_2', 0.25, 0, 0.12, 0.1, 10, 8, 0),
          mk('kf_3', 0.5, 0, 0, 0.08, 16, 0, 8),
          mk('kf_4', 0.75, 0, 0.12, 0.1, 10, -8, 0),
          mk('kf_5', 1, 0, 0, 0.08, 16, 0, -8),
        ],
        events: [
          { id: 'ev_step_1', timeNormalized: 0.22, eventType: 'footstep', payload: 'left_sprint' },
          { id: 'ev_step_2', timeNormalized: 0.72, eventType: 'footstep', payload: 'right_sprint' },
        ],
      };
    case 'interact':
      return {
        durationSeconds: 1.1,
        loop: false,
        keyframes: [
          mk('kf_1', 0),
          mk('kf_2', 0.45, 0, -0.1, 0.18, 28, -10, 0),
          mk('kf_3', 1),
        ],
        events: [
          { id: 'ev_int', timeNormalized: 0.45, eventType: 'custom', payload: 'interact_trigger' },
        ],
      };
    case 'sit':
      return {
        durationSeconds: 1.4,
        loop: true,
        keyframes: [
          mk('kf_1', 0, 0, -0.35, -0.08, -12, 0, 0),
          mk('kf_2', 0.5, 0, -0.37, -0.08, -10, 3, 0),
          mk('kf_3', 1, 0, -0.35, -0.08, -12, 0, 0),
        ],
        events: [],
      };
    case 'sleep':
      return {
        durationSeconds: 2.2,
        loop: true,
        keyframes: [
          mk('kf_1', 0, 0, -0.45, 0, -88, 0, 0, 1, 1, 1),
          mk('kf_2', 0.5, 0, -0.43, 0, -88, 0, 0, 1.02, 1.03, 1.02),
          mk('kf_3', 1, 0, -0.45, 0, -88, 0, 0, 1, 1, 1),
        ],
        events: [],
      };
    case 'idle':
    default:
      return {
        durationSeconds: 1.8,
        loop: true,
        keyframes: [
          mk('kf_1', 0, 0, 0, 0, 0, 0, 0, 1, 1, 1),
          mk('kf_2', 0.5, 0, 0.04, 0, 2, 0, 0, 1.01, 1.01, 1.01),
          mk('kf_3', 1, 0, 0, 0, 0, 0, 0, 1, 1, 1),
        ],
        events: [],
      };
  }
}

export const AnimationTimelineEditor: React.FC<AnimationTimelineEditorProps> = ({
  animation,
  onChange,
  onScrubPose,
  onStopScrub,
  onTriggerSoundCue,
}) => {
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedKfId, setSelectedKfId] = useState<string | null>(
    animation.keyframes?.[0]?.id ?? null
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingKfIdRef = useRef<string | null>(null);
  const lastFiredRef = useRef<number>(0);

  const durationSeconds = Math.max(0.1, animation.durationSeconds ?? 1.2);
  const keyframes = useMemo(
    () => animation.keyframes ?? [],
    [animation.keyframes]
  );
  const events = useMemo(() => animation.events ?? [], [animation.events]);

  const applyPoseAt = useCallback(
    (tNorm: number) => {
      if (!onScrubPose) return;
      onScrubPose(interpolateKeyframes(keyframes, tNorm));
    },
    [keyframes, onScrubPose]
  );

  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      setPlayhead((prev) => {
        const speed = Math.max(0.1, animation.speed || 1);
        let next = prev + (dt * speed) / durationSeconds;
        for (const ev of events) {
          if (prev < ev.timeNormalized && next >= ev.timeNormalized) {
            if (
              ev.eventType === 'sound' &&
              animation.soundCueId &&
              now - lastFiredRef.current > 150
            ) {
              lastFiredRef.current = now;
              onTriggerSoundCue?.(animation.soundCueId);
            }
          }
        }
        if (next >= 1) {
          if (animation.loop) {
            next = next % 1;
          } else {
            next = 1;
            setPlaying(false);
          }
        }
        applyPoseAt(next);
        return Number(next.toFixed(4));
      });
      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    animation.loop,
    animation.soundCueId,
    animation.speed,
    applyPoseAt,
    durationSeconds,
    events,
    onTriggerSoundCue,
    playing,
  ]);

  const selectedKeyframe =
    keyframes.find((k) => k.id === selectedKfId) ?? null;
  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const clientToNorm = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, Number(((clientX - rect.left) / rect.width).toFixed(3))));
  };

  const addKeyframeAtPlayhead = () => {
    const interp = interpolateKeyframes(keyframes, playhead);
    const nf: AnimationKeyframe = {
      id: `kf_${Date.now().toString(36)}`,
      timeNormalized: Number(playhead.toFixed(3)),
      position: interp.position,
      rotationDeg: interp.rotationDeg,
      scale: interp.scale,
    };
    const nextList = [...keyframes, nf].sort(
      (a, b) => a.timeNormalized - b.timeNormalized
    );
    setSelectedKfId(nf.id);
    setSelectedEventId(null);
    onChange({ ...animation, keyframes: nextList }, { recordUndo: true });
  };

  const addEventAtPlayhead = () => {
    const ne: AnimationTimelineEvent = {
      id: `ev_${Date.now().toString(36)}`,
      timeNormalized: Number(playhead.toFixed(3)),
      eventType: 'hit',
      payload: 'trigger',
    };
    const nextEvents = [...events, ne].sort(
      (a, b) => a.timeNormalized - b.timeNormalized
    );
    setSelectedEventId(ne.id);
    setSelectedKfId(null);
    onChange({ ...animation, events: nextEvents }, { recordUndo: true });
  };

  const applyPreset = (preset: AnimationStatePreset) => {
    const built = buildPresetKeyframes(preset);
    setSelectedKfId(built.keyframes[0]?.id ?? null);
    setSelectedEventId(null);
    setPlayhead(0);
    onChange(
      {
        ...animation,
        statePreset: preset,
        durationSeconds: built.durationSeconds,
        loop: built.loop,
        keyframes: built.keyframes,
        events: built.events,
      },
      { recordUndo: true }
    );
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-3">
      {/* Transport + Preset Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (!playing) {
                if (playhead >= 0.99) setPlayhead(0);
                setPlaying(true);
              } else {
                setPlaying(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setPlayhead(0);
              onStopScrub?.();
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            <Square className="w-3 h-3" />
            Stop
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({ ...animation, loop: !animation.loop }, { recordUndo: true })
            }
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${
              animation.loop
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            Loop
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-400">
            <span>State:</span>
            <select
              value={animation.statePreset ?? 'idle'}
              onChange={(e) => applyPreset(e.target.value as AnimationStatePreset)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            >
              {STATE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => applyPreset(animation.statePreset ?? 'idle')}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-amber-500/50 whitespace-nowrap"
          >
            <Wand2 className="w-3 h-3 text-amber-400" />
            Preset Keys
          </button>
          <label className="flex items-center gap-1 text-[11px] text-slate-400">
            <span>Dur(s):</span>
            <input
              type="number"
              step={0.05}
              min={0.1}
              max={30}
              value={durationSeconds}
              onChange={(e) =>
                onChange(
                  { ...animation, durationSeconds: Math.max(0.1, Number(e.target.value) || 1) },
                  { recordUndo: true, historyGroupKey: `anim_dur_${animation.uid}` }
                )
              }
              className="w-16 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-xs font-mono text-white"
            />
          </label>
        </div>
      </div>

      {/* Interactive Timeline Scrubber */}
      <div
        dir="ltr"
        ref={trackRef}
        onPointerMove={(e) => {
          if (!draggingKfIdRef.current) return;
          const t = clientToNorm(e.clientX);
          const nextKfs = keyframes
            .map((kf) =>
              kf.id === draggingKfIdRef.current ? { ...kf, timeNormalized: t } : kf
            )
            .sort((a, b) => a.timeNormalized - b.timeNormalized);
          onChange(
            { ...animation, keyframes: nextKfs },
            { recordUndo: true, historyGroupKey: `kf_drag_${draggingKfIdRef.current}` }
          );
          setPlayhead(t);
          applyPoseAt(t);
        }}
        onPointerUp={() => {
          draggingKfIdRef.current = null;
        }}
        onPointerLeave={() => {
          draggingKfIdRef.current = null;
        }}
        onClick={(e) => {
          const t = clientToNorm(e.clientX);
          setPlayhead(t);
          applyPoseAt(t);
        }}
        className="relative rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 cursor-pointer select-none"
      >
        <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500 mb-1.5">
          <span>0.00s</span>
          <span>{(durationSeconds * 0.25).toFixed(2)}s</span>
          <span className="text-amber-300">
            {(playhead * durationSeconds).toFixed(2)}s ({Math.round(playhead * 100)}%)
          </span>
          <span>{(durationSeconds * 0.75).toFixed(2)}s</span>
          <span>{durationSeconds.toFixed(2)}s</span>
        </div>

        {/* Playhead vertical cursor */}
        <div
          style={{ left: `${playhead * 100}%` }}
          className="absolute top-6 bottom-1 w-0.5 bg-amber-400 pointer-events-none z-10"
        />

        {/* Keyframes lane */}
        <div className="relative h-7 rounded bg-slate-900/90 border border-slate-800/80 mb-1.5">
          <span className="absolute left-1.5 top-1 text-[9px] font-mono uppercase text-slate-500 pointer-events-none">
            Keys ({keyframes.length})
          </span>
          {keyframes.map((kf) => {
            const isSel = selectedKfId === kf.id;
            return (
              <button
                key={kf.id}
                type="button"
                title={`Keyframe @ ${Math.round(kf.timeNormalized * 100)}%`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  draggingKfIdRef.current = kf.id;
                  setSelectedKfId(kf.id);
                  setSelectedEventId(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedKfId(kf.id);
                  setSelectedEventId(null);
                  setPlayhead(kf.timeNormalized);
                  applyPoseAt(kf.timeNormalized);
                }}
                style={{ left: `${kf.timeNormalized * 100}%` }}
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rotate-45 border transition ${
                  isSel
                    ? 'bg-amber-400 border-slate-950 scale-110'
                    : 'bg-sky-500/80 border-sky-200 hover:bg-amber-300'
                }`}
              />
            );
          })}
        </div>

        {/* Events lane */}
        <div className="relative h-6 rounded bg-slate-900/60 border border-slate-800/60">
          <span className="absolute left-1.5 top-1 text-[9px] font-mono uppercase text-slate-500 pointer-events-none">
            Events ({events.length})
          </span>
          {events.map((ev) => {
            const isSel = selectedEventId === ev.id;
            return (
              <button
                key={ev.id}
                type="button"
                title={`${ev.eventType}: ${ev.payload}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEventId(ev.id);
                  setSelectedKfId(null);
                  setPlayhead(ev.timeNormalized);
                }}
                style={{ left: `${ev.timeNormalized * 100}%` }}
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 px-1 rounded text-[9px] font-mono border ${
                  isSel
                    ? 'bg-emerald-500 text-slate-950 border-white'
                    : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                }`}
              >
                {ev.eventType}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Keyframe / Event Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addKeyframeAtPlayhead}
          className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-200 hover:bg-sky-500/20 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Keyframe @ {Math.round(playhead * 100)}%
        </button>
        <button
          type="button"
          onClick={addEventAtPlayhead}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 whitespace-nowrap"
        >
          <Flag className="w-3.5 h-3.5" />
          Add Event Marker
        </button>
      </div>

      {/* Selected Keyframe Inspector */}
      {selectedKeyframe && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-300">
              Keyframe @ {Math.round(selectedKeyframe.timeNormalized * 100)}%
            </span>
            <button
              type="button"
              onClick={() => {
                onChange(
                  {
                    ...animation,
                    keyframes: keyframes.filter((k) => k.id !== selectedKeyframe.id),
                  },
                  { recordUndo: true }
                );
                setSelectedKfId(null);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <label key={`pos_${axis}`} className="block">
                <span className="text-slate-400">Pos {axis.toUpperCase()}</span>
                <input
                  type="number"
                  step={0.02}
                  value={selectedKeyframe.position[axis]}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    const nextKfs = keyframes.map((k) =>
                      k.id === selectedKeyframe.id
                        ? { ...k, position: { ...k.position, [axis]: val } }
                        : k
                    );
                    onChange(
                      { ...animation, keyframes: nextKfs },
                      { recordUndo: true, historyGroupKey: `kf_${selectedKeyframe.id}` }
                    );
                  }}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 font-mono text-white"
                />
              </label>
            ))}
            {(['x', 'y', 'z'] as const).map((axis) => (
              <label key={`rot_${axis}`} className="block">
                <span className="text-slate-400">Rot° {axis.toUpperCase()}</span>
                <input
                  type="number"
                  step={1}
                  value={selectedKeyframe.rotationDeg[axis]}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    const nextKfs = keyframes.map((k) =>
                      k.id === selectedKeyframe.id
                        ? { ...k, rotationDeg: { ...k.rotationDeg, [axis]: val } }
                        : k
                    );
                    onChange(
                      { ...animation, keyframes: nextKfs },
                      { recordUndo: true, historyGroupKey: `kf_${selectedKeyframe.id}` }
                    );
                  }}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 font-mono text-white"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Selected Event Inspector */}
      {selectedEvent && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-300">
              Event Marker @ {Math.round(selectedEvent.timeNormalized * 100)}%
            </span>
            <button
              type="button"
              onClick={() => {
                onChange(
                  {
                    ...animation,
                    events: events.filter((ev) => ev.id !== selectedEvent.id),
                  },
                  { recordUndo: true }
                );
                setSelectedEventId(null);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <label className="block">
              <span className="text-slate-400">Type</span>
              <select
                value={selectedEvent.eventType}
                onChange={(e) => {
                  const nextEvents = events.map((ev) =>
                    ev.id === selectedEvent.id
                      ? {
                          ...ev,
                          eventType: e.target.value as AnimationTimelineEvent['eventType'],
                        }
                      : ev
                  );
                  onChange({ ...animation, events: nextEvents }, { recordUndo: true });
                }}
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-white"
              >
                <option value="hit">hit</option>
                <option value="sound">sound</option>
                <option value="particle">particle</option>
                <option value="footstep">footstep</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label className="block">
              <span className="text-slate-400">Time (0..1)</span>
              <input
                type="number"
                step={0.02}
                min={0}
                max={1}
                value={selectedEvent.timeNormalized}
                onChange={(e) => {
                  const t = Math.min(1, Math.max(0, Number(e.target.value) || 0));
                  const nextEvents = events.map((ev) =>
                    ev.id === selectedEvent.id ? { ...ev, timeNormalized: t } : ev
                  );
                  onChange({ ...animation, events: nextEvents }, { recordUndo: true });
                }}
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 font-mono text-white"
              />
            </label>
            <label className="block">
              <span className="text-slate-400">Payload</span>
              <input
                type="text"
                value={selectedEvent.payload}
                onChange={(e) => {
                  const nextEvents = events.map((ev) =>
                    ev.id === selectedEvent.id ? { ...ev, payload: e.target.value } : ev
                  );
                  onChange(
                    { ...animation, events: nextEvents },
                    { recordUndo: true, historyGroupKey: `ev_${selectedEvent.id}` }
                  );
                }}
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 font-mono text-white"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
