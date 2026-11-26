import React, { useMemo, useRef, useState } from 'react';
import {
  Boxes,
  Brain,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Map as MapIcon,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Unlock,
  Workflow,
} from 'lucide-react';
import {
  GraphEdgeItem,
  GraphNodeItem,
  NodeGraphCanvas,
} from '@/src/components/graphs/NodeGraphCanvas';
import {
  collectAllContentIds,
  createDefaultBehaviorGraph,
  createDefaultPrefab,
  createDefaultProceduralRule,
  createDefaultVisualLogicGraph,
  createDefaultWorldMap,
  WOA_BIOMES,
} from '@/src/core/content/contentRegistry';
import {
  BehaviorSimContext,
  simulateBehaviorGraph,
  simulateVisualLogicEvent,
  validateBehaviorGraph,
  validateVisualLogicGraph,
  VisualLogicExecutionResult,
} from '@/src/core/graphs/nodeGraphEngine';
import {
  createPrefabFromBuilding,
  duplicatePrefabDefinition,
  instantiatePrefabInWorldMap,
  makePrefabInstanceUnique,
  replacePrefabInstances,
  updatePrefabInstancesInContents,
} from '@/src/core/prefab/prefabService';
import {
  applyProceduralRuleToWorldMap,
  ProceduralRunResult,
  sampleTerrainElevation,
} from '@/src/core/procedural/proceduralGenerator';
import {
  BehaviorActionType,
  BehaviorConditionType,
  BehaviorGraphDefinition,
  BehaviorGraphNode,
  BehaviorNodeKind,
  ModAsset,
  ModContentDatabase,
  PrefabCategory,
  PrefabDefinition,
  ProceduralRuleDefinition,
  VisualLogicGraphDefinition,
  VisualLogicNode,
  VisualLogicNodeKind,
  WorldMapDefinition,
  WorldPlacedEntityKind,
  WorldPlacedObject,
} from '@/src/types/mod';

export type SdkSubTab = 'prefabs' | 'world' | 'ai_behavior' | 'logic_graph';

interface SdkStudioWorkbenchProps {
  modId: string;
  contents: ModContentDatabase;
  assets: ModAsset[];
  activeSubTab: SdkSubTab;
  selectedUid?: string | null;
  onSelectSubTab: (tab: SdkSubTab) => void;
  onSelectUid?: (uid: string | null) => void;
  onUpdateContents: (
    next: ModContentDatabase,
    opts?: { recordUndo?: boolean; historyGroupKey?: string }
  ) => void;
}

const PREFAB_CATEGORIES: PrefabCategory[] = [
  'house',
  'tree',
  'cart',
  'gate',
  'camp',
  'npc_setup',
  'decoration',
  'weapon_display',
  'furniture',
  'custom',
];

const WORLD_TOOLS: { kind: WorldPlacedEntityKind | 'select'; label: string; color: string }[] = [
  { kind: 'select', label: 'Select / Move', color: '#e2e8f0' },
  { kind: 'prefab', label: 'Prefab', color: '#f59e0b' },
  { kind: 'building', label: 'Building', color: '#fb923c' },
  { kind: 'tree', label: 'Tree', color: '#22c55e' },
  { kind: 'rock', label: 'Rock', color: '#94a3b8' },
  { kind: 'npc', label: 'NPC', color: '#38bdf8' },
  { kind: 'spawn', label: 'Spawn', color: '#ef4444' },
  { kind: 'village', label: 'Village', color: '#eab308' },
  { kind: 'cave', label: 'Cave', color: '#a855f7' },
  { kind: 'ruin', label: 'Ruin', color: '#d97706' },
  { kind: 'bandit_camp', label: 'Bandit Camp', color: '#f43f5e' },
  { kind: 'resource', label: 'Resource', color: '#14b8a6' },
  { kind: 'water_zone', label: 'Water Zone', color: '#0ea5e9' },
];

const BEHAVIOR_CONDITIONS: BehaviorConditionType[] = [
  'player_in_range',
  'health_below',
  'time_of_day',
  'has_target',
  'random_chance',
];

const BEHAVIOR_ACTIONS: BehaviorActionType[] = [
  'idle',
  'patrol',
  'chase',
  'attack',
  'flee',
  'speak',
  'cast_ability',
  'call_allies',
  'return_home',
];

export const SdkStudioWorkbench: React.FC<SdkStudioWorkbenchProps> = ({
  modId,
  contents,
  assets,
  activeSubTab,
  selectedUid,
  onSelectSubTab,
  onSelectUid,
  onUpdateContents,
}) => {
  const prefabs = useMemo(() => contents.prefabs ?? [], [contents.prefabs]);
  const worldMaps = useMemo(() => contents.worldMaps ?? [], [contents.worldMaps]);
  const proceduralRules = useMemo(
    () => contents.proceduralRules ?? [],
    [contents.proceduralRules]
  );
  const aiBehaviors = useMemo(() => contents.aiBehaviors ?? [], [contents.aiBehaviors]);
  const logicGraphs = useMemo(
    () => contents.visualLogicGraphs ?? [],
    [contents.visualLogicGraphs]
  );

  // Active selections per sub-tab
  const activePrefab =
    prefabs.find((p) => p.uid === selectedUid) ?? prefabs[0] ?? null;
  const activeWorldMap =
    worldMaps.find((w) => w.uid === selectedUid) ?? worldMaps[0] ?? null;
  const activeRule =
    proceduralRules.find((r) => r.uid === selectedUid) ??
    proceduralRules.find((r) => r.targetWorldMapId === activeWorldMap?.id) ??
    proceduralRules[0] ??
    null;
  const activeAiGraph =
    aiBehaviors.find((g) => g.uid === selectedUid) ?? aiBehaviors[0] ?? null;
  const activeLogicGraph =
    logicGraphs.find((g) => g.uid === selectedUid) ?? logicGraphs[0] ?? null;

  // World Map canvas state
  const [worldTool, setWorldTool] = useState<WorldPlacedEntityKind | 'select'>('select');
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  const [replaceTargetPrefabId, setReplaceTargetPrefabId] = useState<string>('');
  const [procSummary, setProcSummary] = useState<ProceduralRunResult | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingWorldObjRef = useRef<string | null>(null);

  // AI Graph state
  const [selectedAiNodeId, setSelectedAiNodeId] = useState<string | null>(null);
  const [selectedAiEdgeId, setSelectedAiEdgeId] = useState<string | null>(null);
  const [aiSimCtx, setAiSimCtx] = useState<BehaviorSimContext>({
    playerDistance: 10,
    healthPercent: 85,
    timeOfDay: 'day',
    hasTarget: true,
  });

  // Visual Logic state
  const [selectedLogicNodeId, setSelectedLogicNodeId] = useState<string | null>(null);
  const [selectedLogicEdgeId, setSelectedLogicEdgeId] = useState<string | null>(null);
  const [logicTriggerInput, setLogicTriggerInput] = useState('');
  const [logicResult, setLogicResult] = useState<VisualLogicExecutionResult | null>(null);
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarVal, setNewVarVal] = useState('0');

  const idIndex = useMemo(() => collectAllContentIds(contents), [contents]);
  const existingIds = useMemo(() => new Set(idIndex.keys()), [idIndex]);

  const prefabInstanceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of worldMaps) {
      for (const obj of m.objects) {
        if (obj.kind === 'prefab' && obj.refId) {
          counts.set(obj.refId, (counts.get(obj.refId) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [worldMaps]);

  const modelAssets = useMemo(
    () => assets.filter((a) => a.type === '3d-model'),
    [assets]
  );

  // ----------------------------
  // Prefabs Helpers
  // ----------------------------
  const updatePrefab = (
    nextPrefab: PrefabDefinition,
    opts?: { recordUndo?: boolean; historyGroupKey?: string }
  ) => {
    onUpdateContents(
      {
        ...contents,
        prefabs: prefabs.map((p) =>
          p.uid === nextPrefab.uid
            ? { ...nextPrefab, updatedAt: new Date().toISOString() }
            : p
        ),
      },
      opts
    );
  };

  // ----------------------------
  // World Map Helpers
  // ----------------------------
  const updateWorldMap = (
    nextMap: WorldMapDefinition,
    opts?: { recordUndo?: boolean; historyGroupKey?: string }
  ) => {
    onUpdateContents(
      {
        ...contents,
        worldMaps: worldMaps.map((m) =>
          m.uid === nextMap.uid
            ? { ...nextMap, updatedAt: new Date().toISOString() }
            : m
        ),
      },
      opts
    );
  };

  const clientToWorldXZ = (clientX: number, clientY: number, map: WorldMapDefinition) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, z: 0 };
    const rect = svg.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    const nz = Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)));
    let x = (nx - 0.5) * map.sizeMeters.width;
    let z = (nz - 0.5) * map.sizeMeters.depth;
    if (map.snapToGrid && map.gridSize > 0) {
      x = Math.round(x / map.gridSize) * map.gridSize;
      z = Math.round(z / map.gridSize) * map.gridSize;
    } else {
      x = Number(x.toFixed(1));
      z = Number(z.toFixed(1));
    }
    return { x, z };
  };

  const selectedPlacedObject =
    activeWorldMap?.objects.find((o) => o.id === selectedPlacedId) ?? null;

  // Elevation contour sample points for visual terrain grid
  const terrainSampleDots = useMemo(() => {
    if (!activeWorldMap) return [];
    const pts: { x: number; z: number; alt: number; isWater: boolean }[] = [];
    const cols = 12;
    const rows = 12;
    const seed = activeRule?.seed ?? 1337;
    for (let ix = 0; ix < cols; ix++) {
      for (let iz = 0; iz < rows; iz++) {
        const x = ((ix + 0.5) / cols - 0.5) * activeWorldMap.sizeMeters.width;
        const z = ((iz + 0.5) / rows - 0.5) * activeWorldMap.sizeMeters.depth;
        const { altitude } = sampleTerrainElevation(x, z, seed);
        pts.push({
          x,
          z,
          alt: altitude,
          isWater: altitude <= activeWorldMap.waterLevelY,
        });
      }
    }
    return pts;
  }, [activeRule?.seed, activeWorldMap]);

  // ----------------------------
  // AI Behavior Helpers
  // ----------------------------
  const aiDiagnostics = useMemo(
    () => (activeAiGraph ? validateBehaviorGraph(activeAiGraph) : []),
    [activeAiGraph]
  );

  const aiSimTrace = useMemo(
    () => (activeAiGraph ? simulateBehaviorGraph(activeAiGraph, aiSimCtx) : null),
    [activeAiGraph, aiSimCtx]
  );

  const aiCanvasNodes: GraphNodeItem[] = useMemo(() => {
    if (!activeAiGraph) return [];
    const errSet = new Set(aiDiagnostics.map((d) => d.nodeId).filter(Boolean));
    const traceSet = new Set(aiSimTrace?.visitedNodeIds ?? []);
    return activeAiGraph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      subtitle:
        n.kind === 'condition'
          ? `${n.conditionType || 'cond'} (${String(n.conditionValue ?? '')})`
          : n.kind === 'action'
            ? `${n.actionType || 'idle'}${n.actionParam ? `: ${n.actionParam}` : ''}`
            : undefined,
      position: n.position,
      portsOut: n.kind === 'condition' ? ['true', 'false'] : ['out'],
      hasError: errSet.has(n.id),
      activeTrace: traceSet.has(n.id),
    }));
  }, [activeAiGraph, aiDiagnostics, aiSimTrace]);

  const aiCanvasEdges: GraphEdgeItem[] = useMemo(() => {
    if (!activeAiGraph) return [];
    const traceSet = new Set(aiSimTrace?.visitedNodeIds ?? []);
    return activeAiGraph.edges.map((e) => ({
      ...e,
      activeTrace: traceSet.has(e.fromNodeId) && traceSet.has(e.toNodeId),
    }));
  }, [activeAiGraph, aiSimTrace]);

  const updateAiGraph = (
    nextGraph: BehaviorGraphDefinition,
    opts?: { recordUndo?: boolean; historyGroupKey?: string }
  ) => {
    onUpdateContents(
      {
        ...contents,
        aiBehaviors: aiBehaviors.map((g) =>
          g.uid === nextGraph.uid
            ? { ...nextGraph, updatedAt: new Date().toISOString() }
            : g
        ),
      },
      opts
    );
  };

  // ----------------------------
  // Visual Logic Helpers
  // ----------------------------
  const logicDiagnostics = useMemo(
    () => (activeLogicGraph ? validateVisualLogicGraph(activeLogicGraph) : []),
    [activeLogicGraph]
  );

  const logicCanvasNodes: GraphNodeItem[] = useMemo(() => {
    if (!activeLogicGraph) return [];
    const errSet = new Set(logicDiagnostics.map((d) => d.nodeId).filter(Boolean));
    const execSet = new Set(logicResult?.executedNodeIds ?? []);
    return activeLogicGraph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      subtitle: n.opCode,
      position: n.position,
      portsOut: n.kind === 'condition' ? ['true', 'false'] : ['exec'],
      hasError: errSet.has(n.id),
      activeTrace: execSet.has(n.id),
    }));
  }, [activeLogicGraph, logicDiagnostics, logicResult]);

  const logicCanvasEdges: GraphEdgeItem[] = useMemo(() => {
    if (!activeLogicGraph) return [];
    const execSet = new Set(logicResult?.executedNodeIds ?? []);
    return activeLogicGraph.edges.map((e) => ({
      ...e,
      activeTrace: execSet.has(e.fromNodeId) && execSet.has(e.toNodeId),
    }));
  }, [activeLogicGraph, logicResult]);

  const updateLogicGraph = (
    nextGraph: VisualLogicGraphDefinition,
    opts?: { recordUndo?: boolean; historyGroupKey?: string }
  ) => {
    onUpdateContents(
      {
        ...contents,
        visualLogicGraphs: logicGraphs.map((g) =>
          g.uid === nextGraph.uid
            ? { ...nextGraph, updatedAt: new Date().toISOString() }
            : g
        ),
      },
      opts
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sub-navigation bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 bg-slate-900/80 overflow-x-auto shrink-0">
        {(
          [
            { id: 'prefabs', label: `Prefabs (${prefabs.length})`, icon: Boxes },
            { id: 'world', label: `World & Procedural (${worldMaps.length})`, icon: MapIcon },
            { id: 'ai_behavior', label: `AI Behavior (${aiBehaviors.length})`, icon: Brain },
            { id: 'logic_graph', label: `Visual Logic (${logicGraphs.length})`, icon: Workflow },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectSubTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Split Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {/* ==================== PREFABS TAB ==================== */}
        {activeSubTab === 'prefabs' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Left Sidebar */}
            <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200">
                  Prefab Library
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const np = createDefaultPrefab(
                      modId,
                      existingIds,
                      modelAssets[0]?.path ?? ''
                    );
                    onUpdateContents(
                      { ...contents, prefabs: [...prefabs, np] },
                      { recordUndo: true }
                    );
                    onSelectUid?.(np.uid);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Prefab
                </button>
              </div>

              {contents.buildings.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const b = contents.buildings.find((x) => x.uid === e.target.value);
                      if (!b) return;
                      const created = createPrefabFromBuilding(modId, b);
                      onUpdateContents(
                        { ...contents, prefabs: [...prefabs, created] },
                        { recordUndo: true }
                      );
                      onSelectUid?.(created.uid);
                      e.target.value = '';
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-300"
                  >
                    <option value="">+ Capture Prefab from Building…</option>
                    {contents.buildings.map((b) => (
                      <option key={b.uid} value={b.uid}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {prefabs.length === 0 && (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    No prefabs yet. Create one or capture a 3D Viewport object as a Prefab.
                  </p>
                )}
                {prefabs.map((pf) => {
                  const selected = activePrefab?.uid === pf.uid;
                  const count = prefabInstanceCounts.get(pf.id) ?? 0;
                  return (
                    <button
                      key={pf.uid}
                      type="button"
                      onClick={() => onSelectUid?.(pf.uid)}
                      className={`w-full text-left rounded-lg border px-2.5 py-2 transition ${
                        selected
                          ? 'border-amber-500/60 bg-amber-500/10 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">{pf.name}</span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {count} placed
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">
                        {pf.category} · {pf.nodes.length} nodes
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prefab Editor */}
            <div className="lg:col-span-8 space-y-3">
              {activePrefab ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {activePrefab.name}
                      </h3>
                      <p className="text-[11px] font-mono text-slate-400">
                        {activePrefab.id} ·{' '}
                        {prefabInstanceCounts.get(activePrefab.id) ?? 0} instances in worlds
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const dup = duplicatePrefabDefinition(
                            activePrefab,
                            modId,
                            existingIds
                          );
                          onUpdateContents(
                            { ...contents, prefabs: [...prefabs, dup] },
                            { recordUndo: true }
                          );
                          onSelectUid?.(dup.uid);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextDb = updatePrefabInstancesInContents(
                            contents,
                            activePrefab
                          );
                          onUpdateContents(nextDb, { recordUndo: true });
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-200 hover:bg-sky-500/20 whitespace-nowrap"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Update Instances
                      </button>
                      {activeWorldMap && (
                        <button
                          type="button"
                          onClick={() => {
                            const res = instantiatePrefabInWorldMap(
                              activeWorldMap,
                              activePrefab,
                              { x: 0, y: 0, z: 0 }
                            );
                            onUpdateContents(
                              {
                                ...contents,
                                worldMaps: worldMaps.map((m) =>
                                  m.uid === activeWorldMap.uid ? res.map : m
                                ),
                              },
                              { recordUndo: true }
                            );
                            setSelectedPlacedId(res.placed.id);
                            onSelectSubTab('world');
                            onSelectUid?.(activeWorldMap.uid);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 whitespace-nowrap"
                        >
                          <MapIcon className="w-3.5 h-3.5" />
                          Place in World
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateContents(
                            {
                              ...contents,
                              prefabs: prefabs.filter((p) => p.uid !== activePrefab.uid),
                            },
                            { recordUndo: true }
                          );
                          onSelectUid?.(null);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                    <label className="block">
                      <span className="text-slate-400">Prefab Name</span>
                      <input
                        type="text"
                        value={activePrefab.name}
                        onChange={(e) =>
                          updatePrefab(
                            { ...activePrefab, name: e.target.value },
                            { recordUndo: true, historyGroupKey: `pf_name_${activePrefab.uid}` }
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-slate-400">Prefab ID</span>
                      <input
                        type="text"
                        value={activePrefab.id}
                        onChange={(e) =>
                          updatePrefab(
                            { ...activePrefab, id: e.target.value },
                            { recordUndo: true, historyGroupKey: `pf_id_${activePrefab.uid}` }
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-slate-400">Category</span>
                      <select
                        value={activePrefab.category}
                        onChange={(e) =>
                          updatePrefab(
                            {
                              ...activePrefab,
                              category: e.target.value as PrefabCategory,
                            },
                            { recordUndo: true }
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                      >
                        {PREFAB_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Nodes inside Prefab */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">
                        Hierarchy Nodes ({activePrefab.nodes.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const rootId = activePrefab.nodes[0]?.id ?? null;
                          updatePrefab(
                            {
                              ...activePrefab,
                              nodes: [
                                ...activePrefab.nodes,
                                {
                                  id: `pf_node_${Date.now().toString(36)}`,
                                  name: `Part_${activePrefab.nodes.length + 1}`,
                                  parentId: rootId,
                                  type: 'Mesh',
                                  modelPath: modelAssets[0]?.path ?? '',
                                  transform: {
                                    position: { x: 0, y: 0, z: 0 },
                                    rotation: { x: 0, y: 0, z: 0 },
                                    scale: { x: 1, y: 1, z: 1 },
                                  },
                                },
                              ],
                            },
                            { recordUndo: true }
                          );
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3" />
                        Add Node
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                      {activePrefab.nodes.map((node, idx) => (
                        <div
                          key={node.id}
                          className="rounded-lg border border-slate-800 bg-slate-950 p-2 grid grid-cols-1 md:grid-cols-12 gap-2 items-center text-[11px]"
                        >
                          <div className="md:col-span-3">
                            <input
                              type="text"
                              value={node.name}
                              onChange={(e) => {
                                const nextNodes = activePrefab.nodes.map((n, i) =>
                                  i === idx ? { ...n, name: e.target.value } : n
                                );
                                updatePrefab(
                                  { ...activePrefab, nodes: nextNodes },
                                  { recordUndo: true, historyGroupKey: `pf_n_${node.id}` }
                                );
                              }}
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                            />
                          </div>
                          <div className="md:col-span-4">
                            <input
                              type="text"
                              value={node.modelPath ?? ''}
                              placeholder="assets/models/..."
                              onChange={(e) => {
                                const nextNodes = activePrefab.nodes.map((n, i) =>
                                  i === idx ? { ...n, modelPath: e.target.value } : n
                                );
                                updatePrefab(
                                  { ...activePrefab, nodes: nextNodes },
                                  { recordUndo: true, historyGroupKey: `pf_m_${node.id}` }
                                );
                              }}
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-200"
                            />
                          </div>
                          <div className="md:col-span-4 flex items-center gap-1 font-mono">
                            {(['x', 'y', 'z'] as const).map((ax) => (
                              <input
                                key={ax}
                                type="number"
                                step={0.25}
                                value={node.transform.position[ax]}
                                title={`Position ${ax.toUpperCase()}`}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || 0;
                                  const nextNodes = activePrefab.nodes.map((n, i) =>
                                    i === idx
                                      ? {
                                          ...n,
                                          transform: {
                                            ...n.transform,
                                            position: { ...n.transform.position, [ax]: v },
                                          },
                                        }
                                      : n
                                  );
                                  updatePrefab(
                                    { ...activePrefab, nodes: nextNodes },
                                    { recordUndo: true, historyGroupKey: `pf_t_${node.id}` }
                                  );
                                }}
                                className="w-14 rounded border border-slate-700 bg-slate-900 px-1 py-1 text-white text-center"
                              />
                            ))}
                          </div>
                          <div className="md:col-span-1 flex justify-end">
                            {activePrefab.nodes.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  updatePrefab(
                                    {
                                      ...activePrefab,
                                      nodes: activePrefab.nodes.filter((_, i) => i !== idx),
                                    },
                                    { recordUndo: true }
                                  )
                                }
                                className="p-1 text-rose-400 hover:text-rose-200"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-xs text-slate-400">
                  Select or create a Prefab to inspect its 3D hierarchy, material overrides, and world placements.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== WORLD & PROCEDURAL TAB ==================== */}
        {activeSubTab === 'world' && (
          <div className="space-y-3">
            {/* Map selector bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={activeWorldMap?.uid ?? ''}
                  onChange={(e) => onSelectUid?.(e.target.value || null)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                >
                  {worldMaps.map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.name} ({m.sizeMeters.width}m×{m.sizeMeters.depth}m · {m.objects.length} objs)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const nm = createDefaultWorldMap(modId, existingIds);
                    onUpdateContents(
                      { ...contents, worldMaps: [...worldMaps, nm] },
                      { recordUndo: true }
                    );
                    onSelectUid?.(nm.uid);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New World Map
                </button>
              </div>
              {activeWorldMap && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1 text-slate-300">
                    <span>Grid:</span>
                    <input
                      type="number"
                      min={1}
                      max={128}
                      value={activeWorldMap.gridSize}
                      onChange={(e) =>
                        updateWorldMap(
                          {
                            ...activeWorldMap,
                            gridSize: Math.max(1, Number(e.target.value) || 8),
                          },
                          { recordUndo: true, historyGroupKey: `wm_grid_${activeWorldMap.uid}` }
                        )
                      }
                      className="w-14 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-white"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeWorldMap.snapToGrid}
                      onChange={(e) =>
                        updateWorldMap(
                          { ...activeWorldMap, snapToGrid: e.target.checked },
                          { recordUndo: true }
                        )
                      }
                    />
                    Snap
                  </label>
                  <label className="flex items-center gap-1 text-slate-300">
                    <span>Water Y:</span>
                    <input
                      type="number"
                      value={activeWorldMap.waterLevelY}
                      onChange={(e) =>
                        updateWorldMap(
                          {
                            ...activeWorldMap,
                            waterLevelY: Number(e.target.value) || 0,
                          },
                          { recordUndo: true, historyGroupKey: `wm_water_${activeWorldMap.uid}` }
                        )
                      }
                      className="w-14 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-white"
                    />
                  </label>
                </div>
              )}
            </div>

            {activeWorldMap ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {/* Interactive Top-Down Map Canvas */}
                <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2.5">
                  {/* Placement Tool Palette */}
                  <div className="flex flex-wrap items-center gap-1">
                    {WORLD_TOOLS.map((tool) => (
                      <button
                        key={tool.kind}
                        type="button"
                        onClick={() => setWorldTool(tool.kind)}
                        className={`rounded-md px-2 py-1 text-[11px] font-medium border whitespace-nowrap ${
                          worldTool === tool.kind
                            ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                            : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1"
                          style={{ backgroundColor: tool.color }}
                        />
                        {tool.label}
                      </button>
                    ))}
                  </div>

                  {/* SVG Canvas */}
                  <div dir="ltr" className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
                    <svg
                      ref={svgRef}
                      viewBox={`${-activeWorldMap.sizeMeters.width / 2} ${-activeWorldMap.sizeMeters.depth / 2} ${activeWorldMap.sizeMeters.width} ${activeWorldMap.sizeMeters.depth}`}
                      className="w-full h-[360px] cursor-crosshair select-none touch-none"
                      onPointerMove={(e) => {
                        if (!draggingWorldObjRef.current) return;
                        const { x, z } = clientToWorldXZ(e.clientX, e.clientY, activeWorldMap);
                        const alt = sampleTerrainElevation(x, z, activeRule?.seed ?? 1337).altitude;
                        updateWorldMap(
                          {
                            ...activeWorldMap,
                            objects: activeWorldMap.objects.map((o) =>
                              o.id === draggingWorldObjRef.current
                                ? { ...o, position: { x, y: alt, z } }
                                : o
                            ),
                          },
                          {
                            recordUndo: true,
                            historyGroupKey: `wobj_drag_${draggingWorldObjRef.current}`,
                          }
                        );
                      }}
                      onPointerUp={() => {
                        draggingWorldObjRef.current = null;
                      }}
                      onClick={(e) => {
                        if (worldTool === 'select') {
                          setSelectedPlacedId(null);
                          return;
                        }
                        const { x, z } = clientToWorldXZ(e.clientX, e.clientY, activeWorldMap);
                        const alt = sampleTerrainElevation(x, z, activeRule?.seed ?? 1337).altitude;
                        let refId = '';
                        let label: string = worldTool;
                        if (worldTool === 'prefab' && activePrefab) {
                          refId = activePrefab.id;
                          label = activePrefab.name;
                        } else if (worldTool === 'building' && contents.buildings[0]) {
                          refId = contents.buildings[0].id;
                          label = contents.buildings[0].name;
                        } else if (worldTool === 'npc' && contents.npcs[0]) {
                          refId = contents.npcs[0].id;
                          label = contents.npcs[0].name;
                        } else if (worldTool === 'spawn' && contents.spawns[0]) {
                          refId = contents.spawns[0].id;
                          label = contents.spawns[0].name;
                        }
                        const layerId =
                          activeWorldMap.layers.find((l) => !l.locked)?.id ??
                          activeWorldMap.layers[0]?.id ??
                          'layer_structures';
                        const newObj: WorldPlacedObject = {
                          id: `wobj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
                          name: `${label}`,
                          kind: worldTool,
                          refId,
                          layerId,
                          biome: activeWorldMap.defaultBiome || 'frontier_plains',
                          position: { x, y: alt, z },
                          rotationYDeg: 0,
                          scale: 1,
                          radius: worldTool === 'water_zone' ? 40 : 6,
                        };
                        updateWorldMap(
                          {
                            ...activeWorldMap,
                            objects: [...activeWorldMap.objects, newObj],
                          },
                          { recordUndo: true }
                        );
                        setSelectedPlacedId(newObj.id);
                      }}
                    >
                      {/* Elevation contour backdrop */}
                      {terrainSampleDots.map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.z}
                          r={activeWorldMap.sizeMeters.width / 26}
                          fill={pt.isWater ? 'rgba(14,165,233,0.16)' : `rgba(16,185,129,${Math.min(0.24, Math.max(0.03, pt.alt / 180))})`}
                        />
                      ))}

                      {/* Axes */}
                      <line
                        x1={-activeWorldMap.sizeMeters.width / 2}
                        y1={0}
                        x2={activeWorldMap.sizeMeters.width / 2}
                        y2={0}
                        stroke="rgba(148,163,184,0.22)"
                        strokeWidth={1.2}
                      />
                      <line
                        x1={0}
                        y1={-activeWorldMap.sizeMeters.depth / 2}
                        x2={0}
                        y2={activeWorldMap.sizeMeters.depth / 2}
                        stroke="rgba(148,163,184,0.22)"
                        strokeWidth={1.2}
                      />

                      {/* Placed Objects */}
                      {activeWorldMap.objects.map((obj) => {
                        const layer = activeWorldMap.layers.find((l) => l.id === obj.layerId);
                        if (layer && !layer.visible) return null;
                        if (obj.hidden) return null;
                        const isSel = selectedPlacedId === obj.id;
                        const toolMeta = WORLD_TOOLS.find((t) => t.kind === obj.kind);
                        const color = toolMeta?.color ?? '#cbd5e1';

                        if (obj.kind === 'water_zone') {
                          return (
                            <circle
                              key={obj.id}
                              cx={obj.position.x}
                              cy={obj.position.z}
                              r={Math.max(8, obj.radius)}
                              fill="rgba(14,165,233,0.22)"
                              stroke={isSel ? '#f59e0b' : '#38bdf8'}
                              strokeWidth={isSel ? 3 : 1.5}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedPlacedId(obj.id);
                              }}
                            />
                          );
                        }

                        return (
                          <g
                            key={obj.id}
                            className="cursor-grab"
                            onPointerDown={(ev) => {
                              ev.stopPropagation();
                              setSelectedPlacedId(obj.id);
                              if (!layer?.locked && !obj.locked) {
                                draggingWorldObjRef.current = obj.id;
                              }
                            }}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedPlacedId(obj.id);
                            }}
                          >
                            <circle
                              cx={obj.position.x}
                              cy={obj.position.z}
                              r={isSel ? 8 : 5.5}
                              fill={color}
                              stroke={isSel ? '#ffffff' : '#0f172a'}
                              strokeWidth={isSel ? 2.5 : 1.5}
                            />
                            {isSel && (
                              <text
                                x={obj.position.x}
                                y={obj.position.z - 11}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#fef3c7"
                                fontFamily="monospace"
                              >
                                {obj.name}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Layer Controls */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-400">Layers:</span>
                    {activeWorldMap.layers.map((layer) => (
                      <div
                        key={layer.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: layer.color }}
                        />
                        <span className="text-slate-200">{layer.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateWorldMap(
                              {
                                ...activeWorldMap,
                                layers: activeWorldMap.layers.map((l) =>
                                  l.id === layer.id ? { ...l, visible: !l.visible } : l
                                ),
                              },
                              { recordUndo: true }
                            )
                          }
                          title="Toggle Layer Visibility"
                          className="text-slate-400 hover:text-white"
                        >
                          {layer.visible ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateWorldMap(
                              {
                                ...activeWorldMap,
                                layers: activeWorldMap.layers.map((l) =>
                                  l.id === layer.id ? { ...l, locked: !l.locked } : l
                                ),
                              },
                              { recordUndo: true }
                            )
                          }
                          title="Toggle Layer Lock"
                          className="text-slate-400 hover:text-white"
                        >
                          {layer.locked ? (
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: Selected Object Inspector + Procedural Rules */}
                <div className="lg:col-span-4 space-y-3">
                  {/* Placed Object Inspector */}
                  {selectedPlacedObject && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-300">
                          Selected Placement
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            updateWorldMap(
                              {
                                ...activeWorldMap,
                                objects: activeWorldMap.objects.filter(
                                  (o) => o.id !== selectedPlacedObject.id
                                ),
                              },
                              { recordUndo: true }
                            );
                            setSelectedPlacedId(null);
                          }}
                          className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                      <label className="block">
                        <span className="text-slate-400">Name</span>
                        <input
                          type="text"
                          value={selectedPlacedObject.name}
                          onChange={(e) =>
                            updateWorldMap(
                              {
                                ...activeWorldMap,
                                objects: activeWorldMap.objects.map((o) =>
                                  o.id === selectedPlacedObject.id
                                    ? { ...o, name: e.target.value }
                                    : o
                                ),
                              },
                              { recordUndo: true, historyGroupKey: `wo_${selectedPlacedObject.id}` }
                            )
                          }
                          className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                        />
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 font-mono">
                        <label className="block">
                          <span className="text-slate-400">X</span>
                          <input
                            type="number"
                            value={selectedPlacedObject.position.x}
                            onChange={(e) =>
                              updateWorldMap(
                                {
                                  ...activeWorldMap,
                                  objects: activeWorldMap.objects.map((o) =>
                                    o.id === selectedPlacedObject.id
                                      ? {
                                          ...o,
                                          position: {
                                            ...o.position,
                                            x: Number(e.target.value) || 0,
                                          },
                                        }
                                      : o
                                  ),
                                },
                                { recordUndo: true }
                              )
                            }
                            className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-400">Z</span>
                          <input
                            type="number"
                            value={selectedPlacedObject.position.z}
                            onChange={(e) =>
                              updateWorldMap(
                                {
                                  ...activeWorldMap,
                                  objects: activeWorldMap.objects.map((o) =>
                                    o.id === selectedPlacedObject.id
                                      ? {
                                          ...o,
                                          position: {
                                            ...o.position,
                                            z: Number(e.target.value) || 0,
                                          },
                                        }
                                      : o
                                  ),
                                },
                                { recordUndo: true }
                              )
                            }
                            className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-400">Rot°</span>
                          <input
                            type="number"
                            value={selectedPlacedObject.rotationYDeg}
                            onChange={(e) =>
                              updateWorldMap(
                                {
                                  ...activeWorldMap,
                                  objects: activeWorldMap.objects.map((o) =>
                                    o.id === selectedPlacedObject.id
                                      ? { ...o, rotationYDeg: Number(e.target.value) || 0 }
                                      : o
                                  ),
                                },
                                { recordUndo: true }
                              )
                            }
                            className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-white"
                          />
                        </label>
                      </div>

                      {selectedPlacedObject.kind === 'prefab' && (
                        <div className="pt-2 border-t border-slate-800 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              const res = makePrefabInstanceUnique(
                                contents,
                                modId,
                                activeWorldMap.uid,
                                selectedPlacedObject.id
                              );
                              onUpdateContents(res.contents, { recordUndo: true });
                            }}
                            className="w-full rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 font-medium text-sky-200 hover:bg-sky-500/20"
                          >
                            Make Prefab Instance Unique
                          </button>
                          {prefabs.length > 1 && (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={replaceTargetPrefabId}
                                onChange={(e) => setReplaceTargetPrefabId(e.target.value)}
                                className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
                              >
                                <option value="">Replace with prefab…</option>
                                {prefabs
                                  .filter((p) => p.id !== selectedPlacedObject.refId)
                                  .map((p) => (
                                    <option key={p.uid} value={p.uid}>
                                      {p.name}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                disabled={!replaceTargetPrefabId}
                                onClick={() => {
                                  const targetPf = prefabs.find(
                                    (p) => p.uid === replaceTargetPrefabId
                                  );
                                  if (!targetPf || !selectedPlacedObject.refId) return;
                                  onUpdateContents(
                                    replacePrefabInstances(
                                      contents,
                                      selectedPlacedObject.refId,
                                      targetPf
                                    ),
                                    { recordUndo: true }
                                  );
                                  setReplaceTargetPrefabId('');
                                }}
                                className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-amber-200 disabled:opacity-40"
                              >
                                Swap All
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Seeded Procedural World Generator */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Procedural Generator
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nr = createDefaultProceduralRule(modId, existingIds);
                          nr.targetWorldMapId = activeWorldMap.id;
                          onUpdateContents(
                            { ...contents, proceduralRules: [...proceduralRules, nr] },
                            { recordUndo: true }
                          );
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                      >
                        <Plus className="w-3 h-3" />
                        Add Rule
                      </button>
                    </div>

                    {activeRule ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-slate-400">Seed</span>
                            <input
                              type="number"
                              value={activeRule.seed}
                              onChange={(e) =>
                                onUpdateContents(
                                  {
                                    ...contents,
                                    proceduralRules: proceduralRules.map((r) =>
                                      r.uid === activeRule.uid
                                        ? { ...r, seed: Number(e.target.value) || 1 }
                                        : r
                                    ),
                                  },
                                  { recordUndo: true }
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white"
                            />
                          </label>
                          <label className="block">
                            <span className="text-slate-400">Object Kind</span>
                            <select
                              value={activeRule.objectKind}
                              onChange={(e) =>
                                onUpdateContents(
                                  {
                                    ...contents,
                                    proceduralRules: proceduralRules.map((r) =>
                                      r.uid === activeRule.uid
                                        ? {
                                            ...r,
                                            objectKind: e.target.value as ProceduralRuleDefinition['objectKind'],
                                          }
                                        : r
                                    ),
                                  },
                                  { recordUndo: true }
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                            >
                              {WORLD_TOOLS.filter(
                                (t) => t.kind !== 'select' && t.kind !== 'water_zone'
                              ).map((t) => (
                                <option key={t.kind} value={t.kind}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <label className="block">
                            <span className="text-slate-400">Count</span>
                            <input
                              type="number"
                              min={1}
                              max={400}
                              value={activeRule.density}
                              onChange={(e) =>
                                onUpdateContents(
                                  {
                                    ...contents,
                                    proceduralRules: proceduralRules.map((r) =>
                                      r.uid === activeRule.uid
                                        ? {
                                            ...r,
                                            density: Math.min(400, Math.max(1, Number(e.target.value) || 1)),
                                          }
                                        : r
                                    ),
                                  },
                                  { recordUndo: true }
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-white"
                            />
                          </label>
                          <label className="block">
                            <span className="text-slate-400">Spacing(m)</span>
                            <input
                              type="number"
                              min={1}
                              value={activeRule.minSpacingMeters}
                              onChange={(e) =>
                                onUpdateContents(
                                  {
                                    ...contents,
                                    proceduralRules: proceduralRules.map((r) =>
                                      r.uid === activeRule.uid
                                        ? {
                                            ...r,
                                            minSpacingMeters: Math.max(0.5, Number(e.target.value) || 1),
                                          }
                                        : r
                                    ),
                                  },
                                  { recordUndo: true }
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-white"
                            />
                          </label>
                          <label className="block">
                            <span className="text-slate-400">Biome</span>
                            <select
                              value={activeRule.biomes[0] ?? 'frontier_plains'}
                              onChange={(e) =>
                                onUpdateContents(
                                  {
                                    ...contents,
                                    proceduralRules: proceduralRules.map((r) =>
                                      r.uid === activeRule.uid
                                        ? { ...r, biomes: [e.target.value] }
                                        : r
                                    ),
                                  },
                                  { recordUndo: true }
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-white"
                            >
                              {WOA_BIOMES.map((b) => (
                                <option key={b} value={b}>
                                  {b}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeRule.avoidWater}
                            onChange={(e) =>
                              onUpdateContents(
                                {
                                  ...contents,
                                  proceduralRules: proceduralRules.map((r) =>
                                    r.uid === activeRule.uid
                                      ? { ...r, avoidWater: e.target.checked }
                                      : r
                                  ),
                                },
                                { recordUndo: true }
                              )
                            }
                          />
                          Avoid Water Zones & Sea Level ({activeRule.waterMarginMeters}m margin)
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            const { map: nextMap, result } = applyProceduralRuleToWorldMap(
                              activeWorldMap,
                              activeRule
                            );
                            setProcSummary(result);
                            updateWorldMap(nextMap, { recordUndo: true });
                          }}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Run Procedural Scatter
                        </button>

                        {procSummary && (
                          <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] text-slate-300 space-y-0.5">
                            <div className="text-emerald-300">
                              Placed: {procSummary.generatedObjects.length}
                            </div>
                            <div className="text-slate-400">
                              Excluded water: {procSummary.rejectedWaterCount} · spacing:{' '}
                              {procSummary.rejectedSpacingCount} · terrain:{' '}
                              {procSummary.rejectedTerrainCount}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-500">
                        Add a procedural rule to scatter trees, rocks, prefabs, or bandit camps deterministically.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-xs text-slate-400">
                Create a World Map to start placing buildings, prefabs, water zones, and procedural scatter rules.
              </div>
            )}
          </div>
        )}

        {/* ==================== AI BEHAVIOR TAB ==================== */}
        {activeSubTab === 'ai_behavior' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={activeAiGraph?.uid ?? ''}
                  onChange={(e) => onSelectUid?.(e.target.value || null)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                >
                  {aiBehaviors.map((g) => (
                    <option key={g.uid} value={g.uid}>
                      {g.name} ({g.targetType})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const ng = createDefaultBehaviorGraph(modId, existingIds);
                    onUpdateContents(
                      { ...contents, aiBehaviors: [...aiBehaviors, ng] },
                      { recordUndo: true }
                    );
                    onSelectUid?.(ng.uid);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New AI Graph
                </button>
              </div>
              {activeAiGraph && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['condition', 'sequence', 'selector', 'action'] as BehaviorNodeKind[]).map(
                    (kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          const node: BehaviorGraphNode = {
                            id: `ai_${Date.now().toString(36)}`,
                            kind,
                            title: `New ${kind}`,
                            position: {
                              x: 180 + activeAiGraph.nodes.length * 40,
                              y: 120 + (activeAiGraph.nodes.length % 3) * 70,
                            },
                            conditionType: kind === 'condition' ? 'player_in_range' : undefined,
                            conditionValue: kind === 'condition' ? 12 : undefined,
                            actionType: kind === 'action' ? 'chase' : undefined,
                          };
                          updateAiGraph(
                            { ...activeAiGraph, nodes: [...activeAiGraph.nodes, node] },
                            { recordUndo: true }
                          );
                          setSelectedAiNodeId(node.id);
                        }}
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:border-amber-400 whitespace-nowrap"
                      >
                        + {kind}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {activeAiGraph ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-8 space-y-2">
                  <NodeGraphCanvas
                    nodes={aiCanvasNodes}
                    edges={aiCanvasEdges}
                    selectedNodeId={selectedAiNodeId}
                    selectedEdgeId={selectedAiEdgeId}
                    onSelectNode={setSelectedAiNodeId}
                    onSelectEdge={setSelectedAiEdgeId}
                    onMoveNode={(nodeId, pos, isDragging) => {
                      updateAiGraph(
                        {
                          ...activeAiGraph,
                          nodes: activeAiGraph.nodes.map((n) =>
                            n.id === nodeId ? { ...n, position: pos } : n
                          ),
                        },
                        {
                          recordUndo: !isDragging,
                          historyGroupKey: isDragging ? `ai_drag_${nodeId}` : undefined,
                        }
                      );
                    }}
                    onAddEdge={(fromNodeId, fromPort, toNodeId) => {
                      updateAiGraph(
                        {
                          ...activeAiGraph,
                          edges: [
                            ...activeAiGraph.edges,
                            {
                              id: `ae_${Date.now().toString(36)}`,
                              fromNodeId,
                              fromPort: (fromPort as 'out' | 'true' | 'false') || 'out',
                              toNodeId,
                              toPort: 'in',
                              label: fromPort !== 'out' ? fromPort : undefined,
                            },
                          ],
                        },
                        { recordUndo: true }
                      );
                    }}
                    onDeleteEdge={(edgeId) => {
                      updateAiGraph(
                        {
                          ...activeAiGraph,
                          edges: activeAiGraph.edges.filter((e) => e.id !== edgeId),
                        },
                        { recordUndo: true }
                      );
                      setSelectedAiEdgeId(null);
                    }}
                  />
                  {aiDiagnostics.length > 0 && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200 space-y-1">
                      {aiDiagnostics.map((d, i) => (
                        <div key={i}>
                          <strong>{d.level.toUpperCase()}:</strong> {d.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inspector + AI Tick Simulator */}
                <div className="lg:col-span-4 space-y-3 text-xs">
                  {selectedAiNodeId &&
                    (() => {
                      const node = activeAiGraph.nodes.find((n) => n.id === selectedAiNodeId);
                      if (!node) return null;
                      return (
                        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-300">
                              Node ({node.kind})
                            </span>
                            {node.kind !== 'start' && (
                              <button
                                type="button"
                                onClick={() => {
                                  updateAiGraph(
                                    {
                                      ...activeAiGraph,
                                      nodes: activeAiGraph.nodes.filter((n) => n.id !== node.id),
                                      edges: activeAiGraph.edges.filter(
                                        (e) =>
                                          e.fromNodeId !== node.id && e.toNodeId !== node.id
                                      ),
                                    },
                                    { recordUndo: true }
                                  );
                                  setSelectedAiNodeId(null);
                                }}
                                className="text-rose-300 hover:text-rose-200"
                              >
                                Delete Node
                              </button>
                            )}
                          </div>
                          <label className="block">
                            <span className="text-slate-400">Title</span>
                            <input
                              type="text"
                              value={node.title}
                              onChange={(e) =>
                                updateAiGraph(
                                  {
                                    ...activeAiGraph,
                                    nodes: activeAiGraph.nodes.map((n) =>
                                      n.id === node.id ? { ...n, title: e.target.value } : n
                                    ),
                                  },
                                  { recordUndo: true, historyGroupKey: `ain_${node.id}` }
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                            />
                          </label>
                          {node.kind === 'condition' && (
                            <>
                              <label className="block">
                                <span className="text-slate-400">Condition</span>
                                <select
                                  value={node.conditionType ?? 'player_in_range'}
                                  onChange={(e) =>
                                    updateAiGraph(
                                      {
                                        ...activeAiGraph,
                                        nodes: activeAiGraph.nodes.map((n) =>
                                          n.id === node.id
                                            ? {
                                                ...n,
                                                conditionType: e.target
                                                  .value as BehaviorConditionType,
                                              }
                                            : n
                                        ),
                                      },
                                      { recordUndo: true }
                                    )
                                  }
                                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                                >
                                  {BEHAVIOR_CONDITIONS.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block">
                                <span className="text-slate-400">Threshold / Value</span>
                                <input
                                  type="text"
                                  value={String(node.conditionValue ?? '')}
                                  onChange={(e) =>
                                    updateAiGraph(
                                      {
                                        ...activeAiGraph,
                                        nodes: activeAiGraph.nodes.map((n) =>
                                          n.id === node.id
                                            ? { ...n, conditionValue: e.target.value }
                                            : n
                                        ),
                                      },
                                      { recordUndo: true, historyGroupKey: `aic_${node.id}` }
                                    )
                                  }
                                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white"
                                />
                              </label>
                            </>
                          )}
                          {node.kind === 'action' && (
                            <>
                              <label className="block">
                                <span className="text-slate-400">Action</span>
                                <select
                                  value={node.actionType ?? 'idle'}
                                  onChange={(e) =>
                                    updateAiGraph(
                                      {
                                        ...activeAiGraph,
                                        nodes: activeAiGraph.nodes.map((n) =>
                                          n.id === node.id
                                            ? {
                                                ...n,
                                                actionType: e.target.value as BehaviorActionType,
                                              }
                                            : n
                                        ),
                                      },
                                      { recordUndo: true }
                                    )
                                  }
                                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                                >
                                  {BEHAVIOR_ACTIONS.map((a) => (
                                    <option key={a} value={a}>
                                      {a}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block">
                                <span className="text-slate-400">Param / Ability / Line</span>
                                <input
                                  type="text"
                                  value={node.actionParam ?? ''}
                                  onChange={(e) =>
                                    updateAiGraph(
                                      {
                                        ...activeAiGraph,
                                        nodes: activeAiGraph.nodes.map((n) =>
                                          n.id === node.id
                                            ? { ...n, actionParam: e.target.value }
                                            : n
                                        ),
                                      },
                                      { recordUndo: true, historyGroupKey: `aia_${node.id}` }
                                    )
                                  }
                                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white"
                                />
                              </label>
                            </>
                          )}
                        </div>
                      );
                    })()}

                  {/* Live AI Tick Simulator */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                    <div className="font-semibold text-emerald-300">
                      AI Decision Simulator
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-slate-400">Player Dist (m)</span>
                        <input
                          type="number"
                          value={aiSimCtx.playerDistance}
                          onChange={(e) =>
                            setAiSimCtx((prev) => ({
                              ...prev,
                              playerDistance: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white"
                        />
                      </label>
                      <label className="block">
                        <span className="text-slate-400">Health (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={aiSimCtx.healthPercent}
                          onChange={(e) =>
                            setAiSimCtx((prev) => ({
                              ...prev,
                              healthPercent: Math.min(
                                100,
                                Math.max(0, Number(e.target.value) || 0)
                              ),
                            }))
                          }
                          className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <select
                        value={aiSimCtx.timeOfDay}
                        onChange={(e) =>
                          setAiSimCtx((prev) => ({
                            ...prev,
                            timeOfDay: e.target.value as BehaviorSimContext['timeOfDay'],
                          }))
                        }
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                      >
                        <option value="dawn">dawn</option>
                        <option value="day">day</option>
                        <option value="dusk">dusk</option>
                        <option value="night">night</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-slate-300">
                        <input
                          type="checkbox"
                          checked={aiSimCtx.hasTarget}
                          onChange={(e) =>
                            setAiSimCtx((prev) => ({
                              ...prev,
                              hasTarget: e.target.checked,
                            }))
                          }
                        />
                        Has Target
                      </label>
                    </div>
                    {aiSimTrace && (
                      <div className="rounded-lg border border-emerald-500/30 bg-slate-950 p-2 font-mono text-[11px] space-y-1">
                        <div className="text-emerald-300">
                          Action: {aiSimTrace.chosenAction || 'none'}
                          {aiSimTrace.actionParam ? ` (${aiSimTrace.actionParam})` : ''}
                        </div>
                        <div className="text-slate-400 truncate">
                          Trace: {aiSimTrace.visitedNodeIds.join(' → ')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-xs text-slate-400">
                Create an AI Behavior Graph to author patrol, aggro, retreat, and ability decision trees.
              </div>
            )}
          </div>
        )}

        {/* ==================== VISUAL LOGIC GRAPHS TAB ==================== */}
        {activeSubTab === 'logic_graph' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={activeLogicGraph?.uid ?? ''}
                  onChange={(e) => {
                    onSelectUid?.(e.target.value || null);
                    setLogicResult(null);
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                >
                  {logicGraphs.map((g) => (
                    <option key={g.uid} value={g.uid}>
                      {g.name} ({g.triggerEvent})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const nl = createDefaultVisualLogicGraph(modId, existingIds);
                    onUpdateContents(
                      { ...contents, visualLogicGraphs: [...logicGraphs, nl] },
                      { recordUndo: true }
                    );
                    onSelectUid?.(nl.uid);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Logic Graph
                </button>
              </div>
              {activeLogicGraph && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    ['event', 'condition', 'action', 'variable', 'counter', 'timer'] as VisualLogicNodeKind[]
                  ).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        const defaultOp =
                          kind === 'event'
                            ? 'on_interact'
                            : kind === 'condition'
                              ? 'compare_var'
                              : kind === 'variable'
                                ? 'set_var'
                                : kind === 'counter'
                                  ? 'inc_counter'
                                  : kind === 'timer'
                                    ? 'delay_timer'
                                    : 'spawn_entity';
                        const node: VisualLogicNode = {
                          id: `lg_${Date.now().toString(36)}`,
                          kind,
                          title: `${kind}: ${defaultOp}`,
                          opCode: defaultOp,
                          params:
                            kind === 'condition'
                              ? { varName: 'count', operator: '>=', value: 1 }
                              : kind === 'counter'
                                ? { varName: 'count', mode: 'add', value: 1 }
                                : kind === 'variable'
                                  ? { varName: 'flag', mode: 'set', value: true }
                                  : {},
                          position: {
                            x: 160 + activeLogicGraph.nodes.length * 45,
                            y: 110 + (activeLogicGraph.nodes.length % 3) * 75,
                          },
                        };
                        updateLogicGraph(
                          { ...activeLogicGraph, nodes: [...activeLogicGraph.nodes, node] },
                          { recordUndo: true }
                        );
                        setSelectedLogicNodeId(node.id);
                      }}
                      className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:border-amber-400 whitespace-nowrap"
                    >
                      + {kind}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activeLogicGraph ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-8 space-y-2">
                  <NodeGraphCanvas
                    nodes={logicCanvasNodes}
                    edges={logicCanvasEdges}
                    selectedNodeId={selectedLogicNodeId}
                    selectedEdgeId={selectedLogicEdgeId}
                    onSelectNode={setSelectedLogicNodeId}
                    onSelectEdge={setSelectedLogicEdgeId}
                    onMoveNode={(nodeId, pos, isDragging) => {
                      updateLogicGraph(
                        {
                          ...activeLogicGraph,
                          nodes: activeLogicGraph.nodes.map((n) =>
                            n.id === nodeId ? { ...n, position: pos } : n
                          ),
                        },
                        {
                          recordUndo: !isDragging,
                          historyGroupKey: isDragging ? `lg_drag_${nodeId}` : undefined,
                        }
                      );
                    }}
                    onAddEdge={(fromNodeId, fromPort, toNodeId) => {
                      updateLogicGraph(
                        {
                          ...activeLogicGraph,
                          edges: [
                            ...activeLogicGraph.edges,
                            {
                              id: `le_${Date.now().toString(36)}`,
                              fromNodeId,
                              fromPort: (fromPort as 'exec' | 'true' | 'false' | 'complete' | 'value') || 'exec',
                              toNodeId,
                              toPort: 'exec',
                            },
                          ],
                        },
                        { recordUndo: true }
                      );
                    }}
                    onDeleteEdge={(edgeId) => {
                      updateLogicGraph(
                        {
                          ...activeLogicGraph,
                          edges: activeLogicGraph.edges.filter((e) => e.id !== edgeId),
                        },
                        { recordUndo: true }
                      );
                      setSelectedLogicEdgeId(null);
                    }}
                  />
                  {logicDiagnostics.length > 0 && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200 space-y-1">
                      {logicDiagnostics.map((d, i) => (
                        <div key={i}>
                          <strong>{d.level.toUpperCase()}:</strong> {d.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Variables + Node Inspector + Runner */}
                <div className="lg:col-span-4 space-y-3 text-xs">
                  {/* Graph Variables */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-cyan-300">
                        Graph Variables
                      </span>
                      <label className="flex items-center gap-1 text-slate-300">
                        <input
                          type="checkbox"
                          checked={activeLogicGraph.enabled}
                          onChange={(e) =>
                            updateLogicGraph(
                              { ...activeLogicGraph, enabled: e.target.checked },
                              { recordUndo: true }
                            )
                          }
                        />
                        Enabled
                      </label>
                    </div>
                    <div className="space-y-1 max-h-28 overflow-y-auto font-mono">
                      {Object.entries(activeLogicGraph.variables ?? {}).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-1.5">
                          <span className="text-slate-300 flex-1 truncate">{k}</span>
                          <input
                            type="text"
                            value={String(v)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const parsed: string | number | boolean =
                                raw === 'true'
                                  ? true
                                  : raw === 'false'
                                    ? false
                                    : raw !== '' && !Number.isNaN(Number(raw))
                                      ? Number(raw)
                                      : raw;
                              updateLogicGraph(
                                {
                                  ...activeLogicGraph,
                                  variables: {
                                    ...activeLogicGraph.variables,
                                    [k]: parsed,
                                  },
                                },
                                { recordUndo: true, historyGroupKey: `lgv_${k}` }
                              );
                            }}
                            className="w-24 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nextVars = { ...activeLogicGraph.variables };
                              delete nextVars[k];
                              updateLogicGraph(
                                { ...activeLogicGraph, variables: nextVars },
                                { recordUndo: true }
                              );
                            }}
                            className="text-rose-400 hover:text-rose-200"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 pt-1">
                      <input
                        type="text"
                        placeholder="varName"
                        value={newVarKey}
                        onChange={(e) => setNewVarKey(e.target.value)}
                        className="flex-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-white"
                      />
                      <input
                        type="text"
                        placeholder="0"
                        value={newVarVal}
                        onChange={(e) => setNewVarVal(e.target.value)}
                        className="w-16 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const key = newVarKey.trim();
                          if (!key) return;
                          const parsed: string | number | boolean =
                            newVarVal === 'true'
                              ? true
                              : newVarVal === 'false'
                                ? false
                                : newVarVal !== '' && !Number.isNaN(Number(newVarVal))
                                  ? Number(newVarVal)
                                  : newVarVal;
                          updateLogicGraph(
                            {
                              ...activeLogicGraph,
                              variables: { ...activeLogicGraph.variables, [key]: parsed },
                            },
                            { recordUndo: true }
                          );
                          setNewVarKey('');
                        }}
                        className="rounded bg-cyan-600 px-2 py-1 text-white hover:bg-cyan-500"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Node Inspector */}
                  {selectedLogicNodeId &&
                    (() => {
                      const node = activeLogicGraph.nodes.find(
                        (n) => n.id === selectedLogicNodeId
                      );
                      if (!node) return null;
                      return (
                        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-300">
                              {node.kind} Node
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                updateLogicGraph(
                                  {
                                    ...activeLogicGraph,
                                    nodes: activeLogicGraph.nodes.filter(
                                      (n) => n.id !== node.id
                                    ),
                                    edges: activeLogicGraph.edges.filter(
                                      (e) =>
                                        e.fromNodeId !== node.id && e.toNodeId !== node.id
                                    ),
                                  },
                                  { recordUndo: true }
                                );
                                setSelectedLogicNodeId(null);
                              }}
                              className="text-rose-300 hover:text-rose-200"
                            >
                              Delete
                            </button>
                          </div>
                          <label className="block">
                            <span className="text-slate-400">Title</span>
                            <input
                              type="text"
                              value={node.title}
                              onChange={(e) =>
                                updateLogicGraph(
                                  {
                                    ...activeLogicGraph,
                                    nodes: activeLogicGraph.nodes.map((n) =>
                                      n.id === node.id ? { ...n, title: e.target.value } : n
                                    ),
                                  },
                                  { recordUndo: true, historyGroupKey: `lgn_${node.id}` }
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                            />
                          </label>
                          <label className="block">
                            <span className="text-slate-400">opCode</span>
                            <input
                              type="text"
                              value={node.opCode}
                              onChange={(e) =>
                                updateLogicGraph(
                                  {
                                    ...activeLogicGraph,
                                    nodes: activeLogicGraph.nodes.map((n) =>
                                      n.id === node.id ? { ...n, opCode: e.target.value } : n
                                    ),
                                  },
                                  { recordUndo: true, historyGroupKey: `lgo_${node.id}` }
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white"
                            />
                          </label>
                        </div>
                      );
                    })()}

                  {/* Event Runner / Debugger */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                    <div className="font-semibold text-emerald-300">
                      Logic Event Debugger
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder={activeLogicGraph.triggerEvent || 'on_interact'}
                        value={logicTriggerInput}
                        onChange={(e) => setLogicTriggerInput(e.target.value)}
                        className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const res = simulateVisualLogicEvent(
                            activeLogicGraph,
                            logicTriggerInput.trim() || activeLogicGraph.triggerEvent
                          );
                          setLogicResult(res);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 font-semibold text-white hover:bg-emerald-500 whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Test Run
                      </button>
                    </div>
                    {logicResult && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] space-y-1 max-h-36 overflow-y-auto">
                        {logicResult.logs.map((line, idx) => (
                          <div key={idx} className="text-slate-300">
                            • {line}
                          </div>
                        ))}
                        {logicResult.logs.length === 0 && (
                          <div className="text-slate-500">
                            No matching Event trigger executed.
                          </div>
                        )}
                        <div className="text-cyan-300 pt-1 border-t border-slate-800">
                          Vars: {JSON.stringify(logicResult.variables)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-xs text-slate-400">
                Create a Visual Logic Graph to wire events, conditions, counters, timers, and gameplay actions safely without scripting.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
