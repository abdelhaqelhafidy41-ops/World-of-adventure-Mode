import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

export interface GraphNodeItem {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  position: { x: number; y: number };
  portsOut?: string[];
  badge?: string;
  hasError?: boolean;
  activeTrace?: boolean;
}

export interface GraphEdgeItem {
  id: string;
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
  label?: string;
  activeTrace?: boolean;
}

interface NodeGraphCanvasProps {
  nodes: GraphNodeItem[];
  edges: GraphEdgeItem[];
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  readOnly?: boolean;
  heightClass?: string;
  onSelectNode?: (nodeId: string | null) => void;
  onSelectEdge?: (edgeId: string | null) => void;
  onMoveNode?: (
    nodeId: string,
    position: { x: number; y: number },
    isDragging: boolean
  ) => void;
  onAddEdge?: (
    fromNodeId: string,
    fromPort: string,
    toNodeId: string,
    toPort: string
  ) => void;
  onDeleteEdge?: (edgeId: string) => void;
}

const NODE_WIDTH = 204;
const NODE_HEIGHT = 76;

const KIND_ACCENT: Record<string, string> = {
  start: 'border-emerald-500/70 bg-emerald-950/50 text-emerald-200',
  event: 'border-emerald-500/70 bg-emerald-950/50 text-emerald-200',
  condition: 'border-amber-500/70 bg-amber-950/50 text-amber-200',
  sequence: 'border-sky-500/70 bg-sky-950/50 text-sky-200',
  selector: 'border-violet-500/70 bg-violet-950/50 text-violet-200',
  action: 'border-rose-500/70 bg-rose-950/50 text-rose-200',
  variable: 'border-cyan-500/70 bg-cyan-950/50 text-cyan-200',
  timer: 'border-orange-500/70 bg-orange-950/50 text-orange-200',
  counter: 'border-indigo-500/70 bg-indigo-950/50 text-indigo-200',
  dialogue: 'border-sky-500/70 bg-sky-950/50 text-sky-200',
  quest: 'border-amber-500/70 bg-amber-950/50 text-amber-200',
};

export const NodeGraphCanvas: React.FC<NodeGraphCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  readOnly = false,
  heightClass = 'h-[420px]',
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onAddEdge,
  onDeleteEdge,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [zoom, setZoom] = useState(1);
  const [pendingFrom, setPendingFrom] = useState<{
    nodeId: string;
    port: string;
  } | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);

  const dragStateRef = useRef<{
    mode: 'pan' | 'node';
    nodeId?: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNodeItem>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const getOutPortCoords = useCallback(
    (node: GraphNodeItem, portName: string) => {
      const ports = node.portsOut && node.portsOut.length > 0 ? node.portsOut : ['out'];
      const idx = Math.max(0, ports.indexOf(portName));
      const ratio = ports.length === 1 ? 0.5 : (idx + 1) / (ports.length + 1);
      return {
        x: node.position.x + NODE_WIDTH,
        y: node.position.y + NODE_HEIGHT * ratio,
      };
    },
    []
  );

  const getInPortCoords = useCallback((node: GraphNodeItem) => {
    return {
      x: node.position.x,
      y: node.position.y + NODE_HEIGHT * 0.5,
    };
  }, []);

  const fitView = useCallback(() => {
    if (nodes.length === 0) {
      setPan({ x: 24, y: 24 });
      setZoom(1);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
    }
    const w = Math.max(120, maxX - minX);
    const h = Math.max(100, maxY - minY);
    const cw = rect?.width ?? 700;
    const ch = rect?.height ?? 400;
    const nextZoom = Math.min(1.15, Math.max(0.45, Math.min((cw - 80) / w, (ch - 80) / h)));
    setZoom(Number(nextZoom.toFixed(2)));
    setPan({
      x: Math.round((cw - w * nextZoom) / 2 - minX * nextZoom),
      y: Math.round((ch - h * nextZoom) / 2 - minY * nextZoom),
    });
  }, [nodes]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingFrom(null);
        setCursorWorld(null);
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedEdgeId &&
        !readOnly
      ) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          onDeleteEdge?.(selectedEdgeId);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDeleteEdge, readOnly, selectedEdgeId]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pendingFrom) {
      setCursorWorld(clientToWorld(e.clientX, e.clientY));
    }
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (Math.hypot(dx, dy) > 2) drag.moved = true;

    if (drag.mode === 'pan') {
      setPan({ x: drag.origX + dx, y: drag.origY + dy });
    } else if (drag.mode === 'node' && drag.nodeId && !readOnly) {
      const nextPos = {
        x: Math.round(drag.origX + dx / zoom),
        y: Math.round(drag.origY + dy / zoom),
      };
      onMoveNode?.(drag.nodeId, nextPos, true);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    if (drag.mode === 'node' && drag.nodeId && drag.moved && !readOnly) {
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      onMoveNode?.(
        drag.nodeId,
        {
          x: Math.round(drag.origX + dx / zoom),
          y: Math.round(drag.origY + dy / zoom),
        },
        false
      );
    }
    dragStateRef.current = null;
  };

  const buildCurvePath = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): string => {
    const dx = Math.max(48, Math.abs(x2 - x1) * 0.52);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div
      ref={containerRef}
      dir="ltr"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg === '1') {
          if (pendingFrom) {
            setPendingFrom(null);
            setCursorWorld(null);
            return;
          }
          onSelectNode?.(null);
          onSelectEdge?.(null);
          dragStateRef.current = {
            mode: 'pan',
            startClientX: e.clientX,
            startClientY: e.clientY,
            origX: pan.x,
            origY: pan.y,
            moved: false,
          };
        }
      }}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom((z) => Number(Math.min(1.8, Math.max(0.4, z * factor)).toFixed(2)));
      }}
      className={`relative w-full ${heightClass} rounded-xl border border-slate-800 bg-slate-950 overflow-hidden select-none touch-none`}
      style={{
        backgroundImage:
          'radial-gradient(rgba(148,163,184,0.16) 1px, transparent 1px)',
        backgroundSize: `${Math.round(20 * zoom)}px ${Math.round(20 * zoom)}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Top toolbar */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/95 px-1.5 py-1 shadow-lg">
        <button
          type="button"
          onClick={() => setZoom((z) => Number(Math.max(0.4, z - 0.1).toFixed(2)))}
          title="Zoom Out"
          className="p-1 rounded text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="px-1.5 text-[11px] font-mono tabular-nums text-slate-300">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Number(Math.min(1.8, z + 0.1).toFixed(2)))}
          title="Zoom In"
          className="p-1 rounded text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={fitView}
          title="Fit Graph"
          className="p-1 rounded text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        {selectedEdgeId && !readOnly && onDeleteEdge && (
          <button
            type="button"
            onClick={() => onDeleteEdge(selectedEdgeId)}
            title="Delete Selected Wire"
            className="ml-1 inline-flex items-center gap-1 rounded bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[11px] font-medium text-rose-200 hover:bg-rose-500/30 whitespace-nowrap"
          >
            <Trash2 className="w-3 h-3" />
            Unlink
          </button>
        )}
      </div>

      {pendingFrom && (
        <div className="absolute top-2.5 left-2.5 z-20 rounded-lg border border-amber-500/50 bg-slate-900/95 px-2.5 py-1 text-[11px] text-amber-200 shadow-lg flex items-center gap-2">
          <span>
            Wiring from <strong>{pendingFrom.nodeId}</strong> ({pendingFrom.port}) → click an input port
          </span>
          <button
            type="button"
            onClick={() => {
              setPendingFrom(null);
              setCursorWorld(null);
            }}
            className="text-slate-400 hover:text-white underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* World Transform Layer */}
      <div
        data-canvas-bg="1"
        className="absolute inset-0 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* SVG Edge Layer */}
        <svg
          width="4000"
          height="4000"
          viewBox="-1000 -1000 4000 4000"
          className="absolute -left-[1000px] -top-[1000px] pointer-events-none overflow-visible"
        >
          <defs>
            <marker
              id="woa-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#64748b" />
            </marker>
            <marker
              id="woa-arrow-active"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#f59e0b" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const fromNode = nodeMap.get(edge.fromNodeId);
            const toNode = nodeMap.get(edge.toNodeId);
            if (!fromNode || !toNode) return null;
            const p1 = getOutPortCoords(fromNode, edge.fromPort);
            const p2 = getInPortCoords(toNode);
            const d = buildCurvePath(p1.x, p1.y, p2.x, p2.y);
            const isSel = selectedEdgeId === edge.id;
            const stroke = edge.activeTrace
              ? '#10b981'
              : isSel
                ? '#f59e0b'
                : edge.fromPort === 'false'
                  ? '#f43f5e'
                  : edge.fromPort === 'true'
                    ? '#22c55e'
                    : '#64748b';

            const midX = (p1.x + p2.x) * 0.5;
            const midY = (p1.y + p2.y) * 0.5;
            return (
              <g key={edge.id} className="pointer-events-auto cursor-pointer">
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelectEdge?.(edge.id);
                    onSelectNode?.(null);
                  }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isSel || edge.activeTrace ? 2.8 : 2}
                  strokeDasharray={edge.fromPort === 'false' ? '5 4' : undefined}
                  markerEnd={
                    isSel || edge.activeTrace
                      ? 'url(#woa-arrow-active)'
                      : 'url(#woa-arrow)'
                  }
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelectEdge?.(edge.id);
                    onSelectNode?.(null);
                  }}
                />
                {(edge.label || edge.fromPort !== 'out') && (
                  <g
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelectEdge?.(edge.id);
                    }}
                  >
                    <rect
                      x={midX - 24}
                      y={midY - 9}
                      width={48}
                      height={18}
                      rx={4}
                      fill="#0f172a"
                      stroke={stroke}
                      strokeWidth={1}
                    />
                    <text
                      x={midX}
                      y={midY + 3.5}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#e2e8f0"
                      fontFamily="monospace"
                    >
                      {edge.label || edge.fromPort}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {pendingFrom && cursorWorld && (() => {
            const fromNode = nodeMap.get(pendingFrom.nodeId);
            if (!fromNode) return null;
            const p1 = getOutPortCoords(fromNode, pendingFrom.port);
            return (
              <path
                d={buildCurvePath(p1.x, p1.y, cursorWorld.x, cursorWorld.y)}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            );
          })()}
        </svg>

        {/* HTML Node Cards */}
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const portsOut =
            node.portsOut && node.portsOut.length > 0 ? node.portsOut : ['out'];
          const accent =
            KIND_ACCENT[node.kind] ??
            'border-slate-700 bg-slate-900 text-slate-100';

          return (
            <div
              key={node.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectNode?.(node.id);
                onSelectEdge?.(null);
                if (readOnly) return;
                dragStateRef.current = {
                  mode: 'node',
                  nodeId: node.id,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  origX: node.position.x,
                  origY: node.position.y,
                  moved: false,
                };
              }}
              style={{
                left: node.position.x,
                top: node.position.y,
                width: NODE_WIDTH,
                minHeight: NODE_HEIGHT,
              }}
              className={`absolute rounded-lg border px-3 py-2 shadow-lg transition-shadow cursor-grab active:cursor-grabbing ${accent} ${
                isSelected
                  ? 'ring-2 ring-amber-400 shadow-amber-500/20'
                  : node.activeTrace
                    ? 'ring-2 ring-emerald-400 shadow-emerald-500/20'
                    : node.hasError
                      ? 'ring-2 ring-rose-500'
                      : 'hover:border-slate-500'
              }`}
            >
              {/* Input Port */}
              {!readOnly && node.kind !== 'start' && node.kind !== 'event' && (
                <button
                  type="button"
                  title="Connect to Input"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pendingFrom && pendingFrom.nodeId !== node.id) {
                      onAddEdge?.(
                        pendingFrom.nodeId,
                        pendingFrom.port,
                        node.id,
                        'in'
                      );
                      setPendingFrom(null);
                      setCursorWorld(null);
                    }
                  }}
                  className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${
                    pendingFrom && pendingFrom.nodeId !== node.id
                      ? 'bg-amber-400 border-slate-950 scale-110'
                      : 'bg-slate-900 border-slate-400 hover:border-amber-400'
                  }`}
                />
              )}

              {/* Header */}
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider opacity-80">
                  {node.badge || node.kind}
                </span>
                <span className="text-[10px] font-mono opacity-60 truncate max-w-[78px]">
                  {node.id}
                </span>
              </div>
              <div className="text-xs font-semibold text-white truncate">
                {node.title}
              </div>
              {node.subtitle && (
                <div className="mt-0.5 text-[10px] text-slate-300/80 font-mono truncate">
                  {node.subtitle}
                </div>
              )}

              {/* Output Ports */}
              {!readOnly &&
                portsOut.map((portName, idx) => {
                  const topPct =
                    portsOut.length === 1
                      ? 50
                      : Math.round(((idx + 1) / (portsOut.length + 1)) * 100);
                  const isActivePort =
                    pendingFrom?.nodeId === node.id &&
                    pendingFrom?.port === portName;
                  return (
                    <button
                      key={portName}
                      type="button"
                      title={`Wire from ${portName}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingFrom({ nodeId: node.id, port: portName });
                        setCursorWorld(getOutPortCoords(node, portName));
                      }}
                      style={{ top: `${topPct}%` }}
                      className={`absolute -right-2.5 -translate-y-1/2 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] transition ${
                        isActivePort
                          ? 'bg-amber-400 border-slate-950 text-slate-950 scale-110'
                          : portName === 'false'
                            ? 'bg-rose-950 border-rose-400 text-rose-200 hover:scale-110'
                            : portName === 'true'
                              ? 'bg-emerald-950 border-emerald-400 text-emerald-200 hover:scale-110'
                              : 'bg-slate-900 border-slate-400 text-slate-200 hover:border-amber-400 hover:scale-110'
                      }`}
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
