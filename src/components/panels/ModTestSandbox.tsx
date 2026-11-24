import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Backpack,
  Box,
  Building2,
  ChevronDown,
  ChevronUp,
  Compass,
  Hand,
  MessageSquare,
  Package,
  Play,
  RotateCcw,
  Shield,
  Skull,
  Square,
  Sword,
  User,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { SandboxAudioEngine } from '@/src/core/audio/sandboxAudio';
import { resolveProjectContents } from '@/src/core/content/contentRegistry';
import { ModTestEngine } from '@/src/core/three/ModTestEngine';
import { useI18n } from '@/src/i18n';
import { usePlatform } from '@/src/platform';
import {
  EditorSettings,
  LogLevel,
  ModProject,
  NpcDefinition,
} from '@/src/types/mod';
import {
  SandboxAnimationClip,
  SandboxDialogueState,
  SandboxEntitySummary,
  SandboxInteractionPrompt,
  SandboxPreviewMode,
  SandboxRunState,
  SandboxSnapshot,
} from '@/src/types/sandbox';

interface ModTestSandboxProps {
  project: ModProject;
  settings: EditorSettings;
  onLog: (level: LogLevel, source: string, message: string) => void;
}

function createIsolatedSnapshot(project: ModProject): SandboxSnapshot {
  const resolved = resolveProjectContents(project);
  const entryScript =
    project.files.find((f) => f.path === project.manifest.entryPoint)?.content ?? '';

  return structuredClone({
    capturedAt: new Date().toISOString(),
    manifest: project.manifest,
    assets: project.assets,
    items: resolved.items,
    weapons: resolved.weapons,
    armor: resolved.armor,
    npcs: resolved.npcs,
    monsters: resolved.monsters,
    buildings: resolved.buildings,
    entryScriptContent: entryScript,
  });
}

type DockTab = 'controls' | 'animation' | 'audio' | 'entities';

export const ModTestSandbox: React.FC<ModTestSandboxProps> = ({
  project,
  settings,
  onLog,
}) => {
  const { t, language } = useI18n();
  const platformInfo = usePlatform();
  const useTouchControls = platformInfo.isTouchPrimary || platformInfo.formFactor !== 'desktop';
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ModTestEngine | null>(null);
  const audioRef = useRef<SandboxAudioEngine | null>(null);
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;
  const tRef = useRef(t);
  tRef.current = t;
  const langRef = useRef(language);
  langRef.current = language;

  // Isolated ephemeral snapshot — never writes back to project
  const [snapshot, setSnapshot] = useState<SandboxSnapshot>(() =>
    createIsolatedSnapshot(project)
  );
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const [runState, setRunState] = useState<SandboxRunState>('stopped');
  const [previewMode, setPreviewMode] = useState<SandboxPreviewMode>('arena');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [equippedWeaponId, setEquippedWeaponId] = useState<string>(
    () => snapshot.weapons[0]?.id ?? ''
  );

  const [showCollision, setShowCollision] = useState(true);
  const [followCamera, setFollowCamera] = useState(true);
  const [animClip, setAnimClip] = useState<SandboxAnimationClip>('auto');
  const [animSpeed, setAnimSpeed] = useState<number>(1);
  const [gltfClips, setGltfClips] = useState<string[]>([]);
  const [gltfClipIdx, setGltfClipIdx] = useState(0);
  const [muted, setMuted] = useState(false);

  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>('controls');
  const [contextLost, setContextLost] = useState(false);

  // Ephemeral gameplay state (strictly isolated from mod project)
  const [entities, setEntities] = useState<SandboxEntitySummary[]>([]);
  const [collidingWith, setCollidingWith] = useState<string | null>(null);
  const [nearbyPrompt, setNearbyPrompt] = useState<SandboxInteractionPrompt | null>(
    null
  );
  const [dialogue, setDialogue] = useState<SandboxDialogueState | null>(null);
  const [dialogueCursorByNpc, setDialogueCursorByNpc] = useState<Record<string, number>>(
    {}
  );
  const [bagItemIds, setBagItemIds] = useState<string[]>([]);
  const [runtimeErrorsCount, setRuntimeErrorsCount] = useState(0);
  const [lastCombatFeedback, setLastCombatFeedback] = useState<string | null>(null);
  const [selectedAudioRef, setSelectedAudioRef] = useState<string>('');

  const modeTabs: {
    id: SandboxPreviewMode;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { id: 'arena', label: t('sandbox.modeArena'), icon: <Compass className="w-3.5 h-3.5" /> },
    { id: 'model', label: t('sandbox.modeModel'), icon: <Box className="w-3.5 h-3.5" /> },
    { id: 'character', label: t('sandbox.modeCharacter'), icon: <User className="w-3.5 h-3.5" /> },
    { id: 'weapon', label: t('sandbox.modeWeapon'), icon: <Sword className="w-3.5 h-3.5" /> },
    { id: 'npc', label: t('sandbox.modeNpc'), icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'creature', label: t('sandbox.modeCreature'), icon: <Skull className="w-3.5 h-3.5" /> },
    { id: 'item', label: t('sandbox.modeItem'), icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'building', label: t('sandbox.modeBuilding'), icon: <Building2 className="w-3.5 h-3.5" /> },
  ];

  const getEntityDisplayName = useCallback(
    (entry: { name: string; translations?: { name?: { en?: string; ar?: string } } }) =>
      (entry.translations?.name?.[langRef.current] ?? '').trim() || entry.name,
    []
  );

  const audioAssets = useMemo(
    () => snapshot.assets.filter((a) => a.type === 'audio'),
    [snapshot.assets]
  );

  const entityChoices = useMemo(() => {
    switch (previewMode) {
      case 'model':
        return snapshot.assets
          .filter((a) => a.type === '3d-model')
          .map((a) => ({ id: a.id, label: `${a.name} (${a.format})` }));
      case 'weapon':
        return snapshot.weapons.map((w) => ({
          id: w.id,
          label: (w.translations?.name?.[language] ?? '').trim() || w.name,
        }));
      case 'npc':
        return snapshot.npcs.map((n) => ({
          id: n.id,
          label: (n.translations?.name?.[language] ?? '').trim() || n.name,
        }));
      case 'creature':
        return snapshot.monsters.map((m) => ({
          id: m.id,
          label: (m.translations?.name?.[language] ?? '').trim() || m.name,
        }));
      case 'item':
        return snapshot.items.map((i) => ({
          id: i.id,
          label: (i.translations?.name?.[language] ?? '').trim() || i.name,
        }));
      case 'building':
        return snapshot.buildings.map((b) => ({
          id: b.id,
          label: (b.translations?.name?.[language] ?? '').trim() || b.name,
        }));
      default:
        return [];
    }
  }, [previewMode, snapshot, language]);

  // Keep selectedEntityId aligned when mode or snapshot changes
  useEffect(() => {
    if (entityChoices.length > 0) {
      const stillValid = entityChoices.some((c) => c.id === selectedEntityId);
      if (!stillValid) {
        setSelectedEntityId(entityChoices[0].id);
      }
    } else if (selectedEntityId !== '') {
      setSelectedEntityId('');
    }
  }, [entityChoices, selectedEntityId]);

  const playSoundSafely = useCallback(async (soundRef: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.playSoundReference(soundRef, snapshotRef.current.assets);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : `Failed to play audio "${soundRef}".`;
      setRuntimeErrorsCount((c) => c + 1);
      onLogRef.current('error', 'Runtime Sandbox', msg);
    }
  }, []);

  const handleNpcDialogue = useCallback(
    (npc: NpcDefinition) => {
      const speaker = getEntityDisplayName(npc);
      setDialogueCursorByNpc((prev) => {
        const idx = prev[npc.id] ?? 0;
        const lines = npc.dialogue;
        const line = lines[idx % Math.max(1, lines.length)];
        const localizedLineText =
          (line?.textTranslations?.[langRef.current] ?? '').trim() || line?.text;
        setDialogue({
          speaker,
          faction: npc.faction || 'Neutral',
          mood: line?.speakerMood ?? 'neutral',
          text: localizedLineText ?? tRef.current('sandbox.noDialogueConfigured'),
          lineIndex: lines.length > 0 ? (idx % lines.length) + 1 : 0,
          totalLines: lines.length,
          questRefs: npc.questReferences,
        });
        return { ...prev, [npc.id]: idx + 1 };
      });
      onLogRef.current(
        'info',
        'Sandbox Test',
        tRef.current('sandbox.talkedNpcLog', { name: speaker })
      );
    },
    [getEntityDisplayName]
  );

  // Initialize Three.js Sandbox Engine & Web Audio Engine once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const audio = new SandboxAudioEngine();
    audioRef.current = audio;

    const engine = new ModTestEngine(container, {
      onRuntimeError: (msg) => {
        setRuntimeErrorsCount((c) => c + 1);
        onLogRef.current('error', 'Runtime Sandbox', msg);
      },
      onRuntimeLog: (level, msg) => {
        if (level === 'error') setRuntimeErrorsCount((c) => c + 1);
        onLogRef.current(level, 'Sandbox Test', msg);
      },
      onCollisionStateChange: setCollidingWith,
      onNearbyPromptChange: setNearbyPrompt,
      onEntitiesChanged: setEntities,
      onTriggerSound: (soundRef) => {
        void playSoundSafely(soundRef);
      },
      onNpcInteracted: handleNpcDialogue,
      onItemCollected: (item) => {
        const name = getEntityDisplayName(item);
        setBagItemIds((prev) => [...prev, item.id]);
        setLastCombatFeedback(tRef.current('sandbox.pickedUpToast', { name }));
        onLogRef.current(
          'success',
          'Sandbox Test',
          tRef.current('sandbox.pickedUpLog', { name, id: item.id })
        );
      },
      onBuildingDoorToggled: (building, doorId, open) => {
        const buildingName = getEntityDisplayName(building);
        onLogRef.current(
          'info',
          'Sandbox Test',
          tRef.current('sandbox.doorStateLog', {
            building: buildingName,
            doorId,
            state: open
              ? tRef.current('sandbox.doorOpened')
              : tRef.current('sandbox.doorClosed'),
          })
        );
      },
      onBuildingObjectActivated: (building, objId) => {
        const obj = building.interactiveObjects.find((o) => o.id === objId);
        onLogRef.current(
          'success',
          'Sandbox Test',
          tRef.current('sandbox.activatedObjLog', {
            obj: obj?.name ?? objId,
            building: getEntityDisplayName(building),
          })
        );
      },
      onCreatureHit: (creature, damage, isCrit, remainingHp) => {
        setLastCombatFeedback(
          tRef.current('sandbox.hitFeedback', {
            name: getEntityDisplayName(creature),
            damage,
            crit: isCrit ? tRef.current('sandbox.critSuffix') : '',
            hp: remainingHp,
          })
        );
      },
      onCreatureDefeated: (creature) => {
        const name = getEntityDisplayName(creature);
        setLastCombatFeedback(tRef.current('sandbox.defeatedToast', { name }));
        onLogRef.current(
          'success',
          'Sandbox Test',
          tRef.current('sandbox.defeatedLog', {
            name,
            count: creature.loot.length,
          })
        );
      },
      onPlayerDamaged: (damage, sourceName, playerHp) => {
        setLastCombatFeedback(
          tRef.current('sandbox.playerHitToast', {
            source: sourceName,
            damage,
            hp: playerHp,
          })
        );
      },
      onGltfClipsDetected: (clips) => {
        setGltfClips(clips);
        setGltfClipIdx(0);
      },
      onContextLost: () => {
        setContextLost(true);
        onLogRef.current('warn', 'Runtime Sandbox', tRef.current('sandbox.contextLostOverlay'));
      },
      onContextRestored: () => {
        setContextLost(false);
        onLogRef.current('info', 'Runtime Sandbox', tRef.current('viewport.contextRestoredLog'));
      },
    });

    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
  }, [handleNpcDialogue, playSoundSafely, getEntityDisplayName]);

  // Sync theme, lowPowerMode, collision, camera, animation, held keys
  useEffect(() => {
    engineRef.current?.setTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    engineRef.current?.setLowPowerMode(settings.lowPowerMode);
  }, [settings.lowPowerMode]);

  useEffect(() => {
    engineRef.current?.setShowCollision(showCollision);
  }, [showCollision]);

  useEffect(() => {
    engineRef.current?.setFollowCamera(followCamera);
  }, [followCamera]);

  useEffect(() => {
    engineRef.current?.setAnimationState(animClip, animSpeed);
  }, [animClip, animSpeed]);

  useEffect(() => {
    engineRef.current?.setHeldKeys(bagItemIds);
  }, [bagItemIds]);

  // Load sandbox scene from isolated snapshot whenever snapshot/mode/entity/weapon changes
  useEffect(() => {
    void engineRef.current?.loadSandboxScene(
      snapshot,
      previewMode,
      selectedEntityId || null,
      equippedWeaponId || null
    );
  }, [snapshot, previewMode, selectedEntityId, equippedWeaponId]);

  // Keyboard bindings during Play Test (WASD / Arrows / Space / E / F)
  useEffect(() => {
    if (runState !== 'playing') return;

    const isInputFocused = (el: EventTarget | null) =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused(e.target)) return;
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') {
        engineRef.current?.setInputState({ forward: true });
      } else if (code === 'KeyS' || code === 'ArrowDown') {
        engineRef.current?.setInputState({ backward: true });
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        engineRef.current?.setInputState({ left: true });
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        engineRef.current?.setInputState({ right: true });
      } else if (code === 'Space') {
        e.preventDefault();
        engineRef.current?.setInputState({ jump: true });
      } else if (code === 'KeyE') {
        engineRef.current?.triggerInteract();
      } else if (code === 'KeyF') {
        engineRef.current?.triggerAttack();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') {
        engineRef.current?.setInputState({ forward: false });
      } else if (code === 'KeyS' || code === 'ArrowDown') {
        engineRef.current?.setInputState({ backward: false });
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        engineRef.current?.setInputState({ left: false });
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        engineRef.current?.setInputState({ right: false });
      } else if (code === 'Space') {
        engineRef.current?.setInputState({ jump: false });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [runState]);

  const runRuntimePrecheck = useCallback((snap: SandboxSnapshot) => {
    let issuesFound = 0;
    const reportErr = (msg: string) => {
      issuesFound++;
      setRuntimeErrorsCount((c) => c + 1);
      onLogRef.current('error', 'Runtime Sandbox', msg);
    };

    if (!snap.entryScriptContent.includes('onModLoad')) {
      reportErr(
        tRef.current('sandbox.errMissingHook', { file: snap.manifest.entryPoint })
      );
    }

    const assetPaths = new Set(snap.assets.map((a) => a.path));
    for (const w of snap.weapons) {
      if (w.model && !w.model.startsWith('woa:') && !assetPaths.has(w.model)) {
        reportErr(
          tRef.current('sandbox.errMissingWeaponModel', {
            name: w.name,
            model: w.model,
          })
        );
      }
      if (w.sound && !w.sound.startsWith('woa:') && !assetPaths.has(w.sound)) {
        reportErr(
          tRef.current('sandbox.errMissingWeaponSound', {
            name: w.name,
            sound: w.sound,
          })
        );
      }
    }

    for (const npc of snap.npcs) {
      if (npc.model && !npc.model.startsWith('woa:') && !assetPaths.has(npc.model)) {
        reportErr(
          tRef.current('sandbox.errMissingNpcModel', {
            name: npc.name,
            model: npc.model,
          })
        );
      }
    }

    for (const m of snap.monsters) {
      if (m.model && !m.model.startsWith('woa:') && !assetPaths.has(m.model)) {
        reportErr(
          tRef.current('sandbox.errMissingCreatureModel', {
            name: m.name,
            model: m.model,
          })
        );
      }
    }

    return issuesFound;
  }, []);

  const handlePlayTest = () => {
    const fresh = createIsolatedSnapshot(project);
    setSnapshot(fresh);
    setDialogue(null);
    setLastCombatFeedback(null);
    setRuntimeErrorsCount(0);

    const modDisplayName =
      (fresh.manifest.translations?.name?.[language] ?? '').trim() ||
      fresh.manifest.name;

    const errCount = runRuntimePrecheck(fresh);
    setRunState('playing');
    engineRef.current?.setRunState('playing');
    onLog(
      errCount > 0 ? 'warn' : 'success',
      'Sandbox Test',
      errCount > 0
        ? t('sandbox.playStartedErrors', { name: modDisplayName, count: errCount })
        : t('sandbox.playStartedClean', { name: modDisplayName })
    );
  };

  const handleStopTest = () => {
    setRunState('stopped');
    engineRef.current?.setRunState('stopped');
    audioRef.current?.stopAll();
    onLog('info', 'Sandbox Test', t('sandbox.stoppedSimLog'));
  };

  const handleResetTestEnvironment = () => {
    setRunState('stopped');
    engineRef.current?.setRunState('stopped');
    audioRef.current?.stopAll();

    const fresh = createIsolatedSnapshot(project);
    const modDisplayName =
      (fresh.manifest.translations?.name?.[language] ?? '').trim() ||
      fresh.manifest.name;

    setSnapshot(fresh);
    setEquippedWeaponId(fresh.weapons[0]?.id ?? '');
    setBagItemIds([]);
    setDialogue(null);
    setDialogueCursorByNpc({});
    setCollidingWith(null);
    setNearbyPrompt(null);
    setLastCombatFeedback(null);
    setRuntimeErrorsCount(0);
    setAnimClip('auto');
    setAnimSpeed(1);

    onLog(
      'info',
      'Sandbox Test',
      t('sandbox.resetEnvLog', { name: modDisplayName })
    );
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };

  const playerSummary = entities.find((e) => e.kind === 'player');
  const activeWeapon =
    snapshot.weapons.find((w) => w.id === equippedWeaponId) ?? snapshot.weapons[0];

  const holdPad = (dir: 'forward' | 'backward' | 'left' | 'right', down: boolean) => {
    if (runState !== 'playing' && down) {
      setRunState('playing');
      engineRef.current?.setRunState('playing');
    }
    engineRef.current?.setInputState({ [dir]: down });
  };

  const holdJump = (down: boolean) => {
    if (down && runState === 'stopped') {
      setRunState('playing');
      engineRef.current?.setRunState('playing');
    }
    engineRef.current?.setInputState({ jump: down });
  };

  const getEntityKindLabel = (kind: SandboxEntitySummary['kind']): string => {
    switch (kind) {
      case 'npc':
        return t('sandbox.entityKind.npc');
      case 'creature':
        return t('sandbox.entityKind.monster');
      case 'item':
        return t('sandbox.entityKind.item');
      case 'building':
        return t('sandbox.entityKind.building');
      case 'weapon':
        return t('sandbox.entityKind.weapon');
      default:
        return kind;
    }
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-[#0C1320] overflow-hidden">
      {/* Top Sandbox Controls Toolbar */}
      <div className="shrink-0 px-3 py-2 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          {runState === 'stopped' ? (
            <button
              type="button"
              onClick={handlePlayTest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              {t('sandbox.playTest')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopTest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-500 transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              {t('sandbox.stopTest')}
            </button>
          )}

          <button
            type="button"
            onClick={handleResetTestEnvironment}
            title={t('sandbox.resetEnvTooltip')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-[#0B0F17] dark:text-slate-200 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('sandbox.resetEnvBtn')}
          </button>
        </div>

        {/* Sandbox Preview Mode Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {modeTabs.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setPreviewMode(m.id)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                previewMode === m.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>

        {/* Collision & Audio Toggles */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowCollision((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              showCollision
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            {t('sandbox.toggleCollision')}
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            title={muted ? t('sandbox.unmuteAudio') : t('sandbox.muteAudio')}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              muted
                ? 'text-red-500 bg-red-500/10'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            {muted ? t('sandbox.mutedLabel') : t('sandbox.audioLabel')}
          </button>
        </div>
      </div>

      {/* Unobstructed 3D Sandbox Viewport — canvas remains LTR */}
      <div className="relative flex-1 min-h-0 touch-pan-canvas" dir="ltr">
        <div ref={mountRef} className="w-full h-full touch-pan-canvas" />

        {/* Minimal Top-Start Sandbox Telemetry Badge */}
        <div className="pointer-events-none absolute top-3 start-3 flex flex-col gap-1.5 max-w-sm">
          <div className="px-3 py-1.5 rounded border border-white/15 bg-[#0E131D]/92 text-[11px] text-slate-200 flex items-center gap-3 tabular-nums">
            <span className="font-semibold text-white">
              {runState === 'playing'
                ? t('sandbox.statusRunning')
                : t('sandbox.statusReady')}
            </span>
            <span className="text-slate-400">|</span>
            <span>
              {t('sandbox.hudHp')} {playerSummary?.hp ?? 100}/{playerSummary?.maxHp ?? 100}
            </span>
            <span className="inline-flex items-center gap-1 text-sky-300">
              <Backpack className="w-3 h-3" />
              {bagItemIds.length}
            </span>
            {runtimeErrorsCount > 0 && (
              <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                <AlertOctagon className="w-3 h-3" />
                {t('sandbox.errorsBadge', { count: runtimeErrorsCount })}
              </span>
            )}
          </div>

          {collidingWith && (
            <div
              dir="auto"
              className="px-2.5 py-1 rounded border border-red-500/40 bg-red-950/90 text-[11px] text-red-200 font-medium"
            >
              {t('sandbox.collisionContact', { name: collidingWith })}
            </div>
          )}

          {lastCombatFeedback && (
            <div
              dir="auto"
              className="px-2.5 py-1 rounded border border-amber-500/35 bg-[#1B140C]/92 text-[11px] text-amber-200"
            >
              {lastCombatFeedback}
            </div>
          )}
        </div>

        {/* Proximity Interaction Prompt (Bottom-Center above Dock) */}
        {nearbyPrompt && (
          <div
            dir="auto"
            className="absolute left-1/2 -translate-x-1/2 z-20 transition-all"
            style={{ bottom: hudCollapsed ? '48px' : '188px' }}
          >
            <button
              type="button"
              onClick={() => engineRef.current?.triggerInteract()}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded border border-sky-400/40 bg-[#0E131D]/95 text-xs text-slate-100 hover:bg-[#162032] shadow-lg whitespace-nowrap shrink-0"
            >
              <Hand className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold">[E] {nearbyPrompt.actionLabel}</span>
              <span className="text-slate-400">· {nearbyPrompt.title}</span>
            </button>
          </div>
        )}

        {/* Active NPC Dialogue Overlay */}
        {dialogue && (
          <div
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            className="absolute top-3 end-3 z-20 w-72 rounded-lg border border-sky-500/30 bg-[#0E131D]/95 p-3 text-xs text-slate-100 shadow-lg space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-sky-300">
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span dir="auto">{dialogue.speaker}</span>
              </div>
              <button
                type="button"
                onClick={() => setDialogue(null)}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                {t('common.close')}
              </button>
            </div>
            <div className="text-[11px] text-slate-400">
              {t('sandbox.dialogueMeta', {
                faction: dialogue.faction,
                mood: dialogue.mood,
                index: dialogue.lineIndex,
                total: Math.max(1, dialogue.totalLines),
              })}
            </div>
            <p dir="auto" className="text-slate-200 leading-relaxed">
              {dialogue.text}
            </p>
            {dialogue.questRefs.length > 0 && (
              <div dir="ltr" className="text-[11px] font-mono text-amber-300 truncate">
                {t('sandbox.questLinked', { id: dialogue.questRefs.join(', ') })}
              </div>
            )}
          </div>
        )}

        {/* Collapsible Unified Bottom Control Dock */}
        <div
          dir={language === 'ar' ? 'rtl' : 'ltr'}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(900px,95%)] flex flex-col items-center"
        >
          <button
            type="button"
            onClick={() => setHudCollapsed((c) => !c)}
            className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded-t border border-b-0 border-white/15 bg-[#101520]/95 text-slate-300 hover:text-white"
          >
            {hudCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                {t('sandbox.showControls')}
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                {t('sandbox.hideControls')}
              </>
            )}
          </button>

          {!hudCollapsed && (
            <div className="w-full rounded-lg border border-white/15 bg-[#101520]/95 text-slate-100 shadow-2xl overflow-hidden">
              {/* Dock Sub-Tabs + Subject Selector */}
              <div className="px-3 py-1.5 border-b border-white/10 bg-[#0B0F17] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'controls', label: t('sandbox.dockControls') },
                      { id: 'animation', label: t('sandbox.dockAnimations') },
                      { id: 'audio', label: t('sandbox.dockAudio', { count: audioAssets.length }) },
                      { id: 'entities', label: t('sandbox.dockSpawned', { count: entities.length }) },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDockTab(tab.id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                        dockTab === tab.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                  {entityChoices.length > 0 && (
                    <label className="flex items-center gap-1.5 text-slate-400">
                      <span>{t('sandbox.targetLabel')}</span>
                      <select
                        value={selectedEntityId}
                        onChange={(e) => setSelectedEntityId(e.target.value)}
                        className="px-2 py-0.5 rounded border border-white/15 bg-[#121823] text-slate-100 max-w-[180px]"
                      >
                        {entityChoices.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {snapshot.weapons.length > 0 && (
                    <label className="flex items-center gap-1.5 text-slate-400">
                      <span>{t('sandbox.weaponLabel')}</span>
                      <select
                        value={equippedWeaponId}
                        onChange={(e) => setEquippedWeaponId(e.target.value)}
                        className="px-2 py-0.5 rounded border border-white/15 bg-[#121823] text-slate-100 max-w-[160px]"
                      >
                        {snapshot.weapons.map((w) => (
                          <option key={w.id} value={w.id}>
                            {getEntityDisplayName(w)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>

              {/* Dock Content */}
              <div className="p-3 text-xs">
                {dockTab === 'controls' && (
                  <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                    {/* Touch / Mouse Movement Pad — kept LTR so Left/Right directions never invert */}
                    <div className="flex items-center gap-3">
                      <div
                        dir="ltr"
                        className={`grid grid-cols-3 gap-1 shrink-0 touch-none ${
                          useTouchControls ? 'w-32' : 'w-24'
                        }`}
                      >
                        <div />
                        <button
                          type="button"
                          onPointerDown={() => holdPad('forward', true)}
                          onPointerUp={() => holdPad('forward', false)}
                          onPointerLeave={() => holdPad('forward', false)}
                          onPointerCancel={() => holdPad('forward', false)}
                          title={t('sandbox.moveForward')}
                          className={`${
                            useTouchControls ? 'min-h-[42px]' : 'p-1.5'
                          } rounded border border-white/15 bg-[#182132] hover:bg-blue-600/30 active:bg-blue-600/45 flex items-center justify-center touch-none`}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <div />
                        <button
                          type="button"
                          onPointerDown={() => holdPad('left', true)}
                          onPointerUp={() => holdPad('left', false)}
                          onPointerLeave={() => holdPad('left', false)}
                          onPointerCancel={() => holdPad('left', false)}
                          title={t('sandbox.moveLeft')}
                          className={`${
                            useTouchControls ? 'min-h-[42px]' : 'p-1.5'
                          } rounded border border-white/15 bg-[#182132] hover:bg-blue-600/30 active:bg-blue-600/45 flex items-center justify-center touch-none`}
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onPointerDown={() => holdPad('backward', true)}
                          onPointerUp={() => holdPad('backward', false)}
                          onPointerLeave={() => holdPad('backward', false)}
                          onPointerCancel={() => holdPad('backward', false)}
                          title={t('sandbox.moveBackward')}
                          className={`${
                            useTouchControls ? 'min-h-[42px]' : 'p-1.5'
                          } rounded border border-white/15 bg-[#182132] hover:bg-blue-600/30 active:bg-blue-600/45 flex items-center justify-center touch-none`}
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onPointerDown={() => holdPad('right', true)}
                          onPointerUp={() => holdPad('right', false)}
                          onPointerLeave={() => holdPad('right', false)}
                          onPointerCancel={() => holdPad('right', false)}
                          title={t('sandbox.moveRight')}
                          className={`${
                            useTouchControls ? 'min-h-[42px]' : 'p-1.5'
                          } rounded border border-white/15 bg-[#182132] hover:bg-blue-600/30 active:bg-blue-600/45 flex items-center justify-center touch-none`}
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-400 space-y-0.5 hidden sm:block">
                        <div className="text-slate-200 font-medium">
                          {t(
                            platformInfo.isTouchPrimary
                              ? 'sandbox.touchHelpLine1'
                              : 'sandbox.controlsHelpLine1'
                          )}
                        </div>
                        <div>
                          {t(
                            platformInfo.isTouchPrimary
                              ? 'sandbox.touchHelpLine2'
                              : 'sandbox.controlsHelpLine2'
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onPointerDown={() => holdJump(true)}
                        onPointerUp={() => holdJump(false)}
                        onPointerLeave={() => holdJump(false)}
                        onPointerCancel={() => holdJump(false)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[40px] sm:min-h-0 touch-target rounded bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white font-semibold whitespace-nowrap shrink-0 touch-none"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                        {t('sandbox.jumpBtn')}
                      </button>

                      <button
                        type="button"
                        onClick={() => engineRef.current?.triggerAttack()}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[40px] sm:min-h-0 touch-target rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold whitespace-nowrap shrink-0"
                      >
                        <Sword className="w-3.5 h-3.5" />
                        {t('sandbox.attackBtn')}
                        {activeWeapon ? ` (${activeWeapon.damage} ${t('sandbox.dmgShort')})` : ''}
                      </button>

                      <button
                        type="button"
                        onClick={() => engineRef.current?.triggerInteract()}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[40px] sm:min-h-0 touch-target rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold whitespace-nowrap shrink-0"
                      >
                        <Hand className="w-3.5 h-3.5" />
                        {t('sandbox.interactBtn')}
                      </button>

                      <button
                        type="button"
                        onClick={() => setFollowCamera((f) => !f)}
                        className={`px-2.5 py-1.5 min-h-[40px] sm:min-h-0 rounded border text-[11px] font-medium whitespace-nowrap shrink-0 ${
                          followCamera
                            ? 'border-blue-500/40 bg-blue-600/15 text-blue-300'
                            : 'border-white/15 text-slate-300 hover:text-white'
                        }`}
                      >
                        {t('sandbox.cameraFollow', {
                          state: followCamera
                            ? t('sandbox.cameraOn')
                            : t('sandbox.cameraFree'),
                        })}
                      </button>
                    </div>
                  </div>
                )}

                {dockTab === 'animation' && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'auto', label: t('sandbox.animAutoGameplay') },
                          { id: 'idle', label: t('sandbox.animIdle') },
                          { id: 'walk', label: t('sandbox.animWalk') },
                          { id: 'attack', label: t('sandbox.animAttackSwing') },
                          { id: 'interact', label: t('sandbox.animInteractWave') },
                        ] as const
                      ).map((clip) => (
                        <button
                          key={clip.id}
                          type="button"
                          onClick={() => setAnimClip(clip.id)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                            animClip === clip.id
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-white/15 bg-[#182132] text-slate-300 hover:text-white'
                          }`}
                        >
                          {clip.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 text-[11px]">
                      <label className="flex items-center gap-1.5 text-slate-400">
                        <span>{t('sandbox.animSpeed')}</span>
                        <select
                          dir="ltr"
                          value={animSpeed}
                          onChange={(e) => setAnimSpeed(Number(e.target.value))}
                          className="px-2 py-0.5 rounded border border-white/15 bg-[#121823] text-slate-100 tabular-nums"
                        >
                          <option value={0.5}>0.5x</option>
                          <option value={1}>1.0x</option>
                          <option value={1.5}>1.5x</option>
                          <option value={2}>2.0x</option>
                        </select>
                      </label>

                      {gltfClips.length > 0 && (
                        <label className="flex items-center gap-1.5 text-slate-400">
                          <span>{t('sandbox.gltfClip')}</span>
                          <select
                            dir="ltr"
                            value={gltfClipIdx}
                            onChange={(e) => {
                              const idx = Number(e.target.value);
                              setGltfClipIdx(idx);
                              engineRef.current?.setGltfClipIndex(idx);
                            }}
                            className="px-2 py-0.5 rounded border border-white/15 bg-[#121823] text-slate-100"
                          >
                            {gltfClips.map((name, idx) => (
                              <option key={`${name}_${idx}`} value={idx}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {dockTab === 'audio' && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {audioAssets.length > 0 ? (
                        <>
                          <select
                            value={selectedAudioRef || audioAssets[0].path}
                            onChange={(e) => setSelectedAudioRef(e.target.value)}
                            className="px-2.5 py-1 text-xs rounded border border-white/15 bg-[#121823] text-slate-100"
                          >
                            {audioAssets.map((a) => (
                              <option key={a.id} value={a.path}>
                                {a.name} ({a.format})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              void playSoundSafely(
                                selectedAudioRef || audioAssets[0].path
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium whitespace-nowrap shrink-0"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            {t('sandbox.playAudioAsset')}
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {t('sandbox.noAudioHint')}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { ref: activeWeapon?.sound || 'woa:sfx_swing', label: t('sandbox.sfxWeapon') },
                        { ref: 'woa:sfx_impact', label: t('sandbox.sfxImpact') },
                        { ref: 'woa:sfx_pickup', label: t('sandbox.sfxPickup') },
                        { ref: 'woa:sfx_door', label: t('sandbox.sfxDoor') },
                        { ref: 'woa:sfx_dialogue', label: t('sandbox.sfxDialogue') },
                      ].map((cue) => (
                        <button
                          key={cue.ref}
                          type="button"
                          onClick={() => void playSoundSafely(cue.ref)}
                          className="px-2 py-1 text-[11px] rounded border border-white/15 bg-[#182132] text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
                        >
                          {cue.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {dockTab === 'entities' && (
                  <div className="flex flex-wrap items-center gap-2 max-h-20 overflow-y-auto">
                    {entities.map((ent) => (
                      <div
                        key={ent.instanceId}
                        className="px-2.5 py-1 rounded border border-white/10 bg-[#0B0F17] text-[11px] flex items-center gap-2 tabular-nums"
                      >
                        <span className="text-slate-400 uppercase font-mono text-[10px]">
                          {getEntityKindLabel(ent.kind)}
                        </span>
                        <span dir="auto" className="text-slate-100 font-medium">
                          {ent.name}
                        </span>
                        {ent.kind === 'creature' && ent.maxHp && (
                          <span dir="ltr" className="text-amber-400 font-mono">
                            {ent.hp}/{ent.maxHp}
                          </span>
                        )}
                        {ent.collected && (
                          <span className="text-emerald-400">
                            {t('sandbox.collectedBadge')}
                          </span>
                        )}
                      </div>
                    ))}
                    {entities.length === 0 && (
                      <span className="text-slate-400 text-[11px]">
                        {t('sandbox.noActiveEntities')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {contextLost && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B0F17]/90 p-4">
            <div className="px-4 py-3 rounded border border-amber-500/30 bg-[#121823] text-xs text-amber-300 text-center">
              {t('sandbox.contextLostOverlay')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
