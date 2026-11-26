import {
  BehaviorGraphDefinition,
  DialogueTreeDefinition,
  QuestDefinition,
  VisualLogicGraphDefinition,
} from '@/src/types/content';

export interface GraphDiagnostic {
  code: string;
  level: 'error' | 'warn';
  nodeId?: string;
  message: string;
}

function detectDirectedCycle(
  nodeIds: string[],
  edges: { from: string; to: string }[]
): string[] {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (adj.has(e.from) && adj.has(e.to)) {
      adj.get(e.from)!.push(e.to);
    }
  }

  const state = new Map<string, 0 | 1 | 2>(); // 0=unvisited, 1=visiting, 2=done
  const cycleNodes: string[] = [];

  const dfs = (id: string): boolean => {
    state.set(id, 1);
    for (const next of adj.get(id) ?? []) {
      const st = state.get(next) ?? 0;
      if (st === 1) {
        cycleNodes.push(next);
        return true;
      }
      if (st === 0 && dfs(next)) {
        cycleNodes.push(id);
        return true;
      }
    }
    state.set(id, 2);
    return false;
  };

  for (const id of nodeIds) {
    if ((state.get(id) ?? 0) === 0) {
      dfs(id);
    }
  }
  return cycleNodes;
}

function findUnreachableNodes(
  startIds: string[],
  nodeIds: string[],
  edges: { from: string; to: string }[]
): string[] {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
  }
  const visited = new Set<string>();
  const queue = [...startIds.filter((id) => adj.has(id))];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return nodeIds.filter((id) => !visited.has(id));
}

export function validateBehaviorGraph(graph: BehaviorGraphDefinition): GraphDiagnostic[] {
  const issues: GraphDiagnostic[] = [];
  const nodeIds = graph.nodes.map((n) => n.id);
  const nodeSet = new Set(nodeIds);
  const starts = graph.nodes.filter((n) => n.kind === 'start');

  if (starts.length === 0) {
    issues.push({
      code: 'AI_MISSING_START',
      level: 'error',
      message: 'Behavior graph requires a Start node.',
    });
  } else if (starts.length > 1) {
    issues.push({
      code: 'AI_MULTIPLE_STARTS',
      level: 'warn',
      nodeId: starts[1].id,
      message: 'Behavior graph has multiple Start nodes; only the first is executed.',
    });
  }

  for (const edge of graph.edges) {
    if (!nodeSet.has(edge.fromNodeId) || !nodeSet.has(edge.toNodeId)) {
      issues.push({
        code: 'AI_DANGLING_EDGE',
        level: 'error',
        message: `Connection ${edge.id} points to a missing node.`,
      });
    }
  }

  const cycles = detectDirectedCycle(
    nodeIds,
    graph.edges.map((e) => ({ from: e.fromNodeId, to: e.toNodeId }))
  );
  if (cycles.length > 0) {
    issues.push({
      code: 'AI_CYCLE_DETECTED',
      level: 'error',
      nodeId: cycles[0],
      message: `Circular loop detected in AI graph (${cycles.join(' -> ')}).`,
    });
  }

  if (starts.length > 0) {
    const unreachable = findUnreachableNodes(
      [starts[0].id],
      nodeIds,
      graph.edges.map((e) => ({ from: e.fromNodeId, to: e.toNodeId }))
    );
    for (const uid of unreachable) {
      issues.push({
        code: 'AI_UNREACHABLE_NODE',
        level: 'warn',
        nodeId: uid,
        message: `Node "${uid}" is disconnected from Start and will never run.`,
      });
    }
  }

  return issues;
}

export function validateVisualLogicGraph(
  graph: VisualLogicGraphDefinition
): GraphDiagnostic[] {
  const issues: GraphDiagnostic[] = [];
  const nodeIds = graph.nodes.map((n) => n.id);
  const nodeSet = new Set(nodeIds);
  const events = graph.nodes.filter((n) => n.kind === 'event');

  if (events.length === 0) {
    issues.push({
      code: 'LOGIC_MISSING_EVENT',
      level: 'error',
      message: 'Logic graph needs at least one Event trigger node.',
    });
  }

  for (const edge of graph.edges) {
    if (!nodeSet.has(edge.fromNodeId) || !nodeSet.has(edge.toNodeId)) {
      issues.push({
        code: 'LOGIC_BROKEN_WIRE',
        level: 'error',
        message: `Logic edge ${edge.id} references a deleted node.`,
      });
    }
  }

  const cycles = detectDirectedCycle(
    nodeIds,
    graph.edges.map((e) => ({ from: e.fromNodeId, to: e.toNodeId }))
  );
  if (cycles.length > 0) {
    issues.push({
      code: 'LOGIC_INFINITE_CYCLE',
      level: 'error',
      nodeId: cycles[0],
      message: `Infinite execution loop detected (${cycles.join(' -> ')}). Use a Timer node instead.`,
    });
  }

  if (events.length > 0) {
    const unreachable = findUnreachableNodes(
      events.map((e) => e.id),
      nodeIds,
      graph.edges.map((e) => ({ from: e.fromNodeId, to: e.toNodeId }))
    );
    for (const uid of unreachable) {
      issues.push({
        code: 'LOGIC_UNREACHABLE_NODE',
        level: 'warn',
        nodeId: uid,
        message: `Logic node "${uid}" has no active execution path from an Event node.`,
      });
    }
  }

  return issues;
}

export function validateDialogueTreeGraph(tree: DialogueTreeDefinition): GraphDiagnostic[] {
  const issues: GraphDiagnostic[] = [];
  const nodeIds = tree.nodes.map((n) => n.id);
  const nodeSet = new Set(nodeIds);

  if (!nodeSet.has(tree.rootNodeId)) {
    issues.push({
      code: 'DIALOGUE_MISSING_ROOT',
      level: 'error',
      message: `Dialogue root node "${tree.rootNodeId}" does not exist.`,
    });
  }

  const edges: { from: string; to: string }[] = [];
  for (const node of tree.nodes) {
    for (const choice of node.choices) {
      if (choice.nextNodeId && !nodeSet.has(choice.nextNodeId)) {
        issues.push({
          code: 'DIALOGUE_BROKEN_CHOICE',
          level: 'error',
          nodeId: node.id,
          message: `Choice "${choice.label}" links to missing node "${choice.nextNodeId}".`,
        });
      } else if (choice.nextNodeId) {
        edges.push({ from: node.id, to: choice.nextNodeId });
      }
    }
  }

  if (nodeSet.has(tree.rootNodeId)) {
    const unreachable = findUnreachableNodes([tree.rootNodeId], nodeIds, edges);
    for (const uid of unreachable) {
      issues.push({
        code: 'DIALOGUE_ORPHAN_NODE',
        level: 'warn',
        nodeId: uid,
        message: `Dialogue node "${uid}" is unreachable from root.`,
      });
    }
  }

  return issues;
}

export function validateQuestChainCycles(quests: QuestDefinition[]): GraphDiagnostic[] {
  const issues: GraphDiagnostic[] = [];
  const idSet = new Set(quests.map((q) => q.id));
  const edges: { from: string; to: string }[] = [];

  for (const q of quests) {
    if (q.chain.nextQuestId) {
      if (!idSet.has(q.chain.nextQuestId)) {
        issues.push({
          code: 'QUEST_BROKEN_NEXT',
          level: 'warn',
          nodeId: q.uid,
          message: `Quest "${q.name}" nextQuestId "${q.chain.nextQuestId}" does not exist.`,
        });
      } else {
        edges.push({ from: q.id, to: q.chain.nextQuestId });
      }
    }
    for (const pre of q.chain.prerequisiteQuestIds) {
      if (idSet.has(pre)) {
        edges.push({ from: pre, to: q.id });
      }
    }
  }

  const cycles = detectDirectedCycle(
    quests.map((q) => q.id),
    edges
  );
  if (cycles.length > 0) {
    issues.push({
      code: 'QUEST_CHAIN_CYCLE',
      level: 'error',
      message: `Quest chain cycle detected: ${cycles.join(' -> ')}.`,
    });
  }

  return issues;
}

export interface BehaviorSimContext {
  playerDistance: number;
  healthPercent: number;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  hasTarget: boolean;
}

export interface BehaviorSimTrace {
  visitedNodeIds: string[];
  chosenAction: string | null;
  actionParam?: string;
}

export function simulateBehaviorGraph(
  graph: BehaviorGraphDefinition,
  ctx: BehaviorSimContext
): BehaviorSimTrace {
  const start = graph.nodes.find((n) => n.kind === 'start');
  if (!start) return { visitedNodeIds: [], chosenAction: null };

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const visited: string[] = [];
  const maxSteps = Math.max(12, graph.nodes.length * 2);

  const stepNode = (nodeId: string, depth: number): BehaviorSimTrace | null => {
    if (depth > maxSteps || visited.includes(nodeId)) return null;
    const node = nodeMap.get(nodeId);
    if (!node) return null;
    visited.push(nodeId);

    if (node.kind === 'action') {
      return {
        visitedNodeIds: [...visited],
        chosenAction: node.actionType || 'idle',
        actionParam: node.actionParam,
      };
    }

    const outgoing = graph.edges.filter((e) => e.fromNodeId === nodeId);

    if (node.kind === 'condition') {
      let passed = false;
      const numVal = Number(node.conditionValue ?? 0);
      if (node.conditionType === 'player_in_range') {
        passed = ctx.playerDistance <= (numVal || 8);
      } else if (node.conditionType === 'health_below') {
        passed = ctx.healthPercent <= (numVal || 25);
      } else if (node.conditionType === 'time_of_day') {
        passed = String(node.conditionValue || 'night') === ctx.timeOfDay;
      } else if (node.conditionType === 'has_target') {
        passed = ctx.hasTarget;
      } else {
        passed = true;
      }

      const branchEdges = outgoing.filter((e) =>
        passed ? e.fromPort === 'true' || e.fromPort === 'out' : e.fromPort === 'false'
      );
      for (const e of branchEdges) {
        const res = stepNode(e.toNodeId, depth + 1);
        if (res && res.chosenAction) return res;
      }
      return null;
    }

    for (const e of outgoing) {
      const res = stepNode(e.toNodeId, depth + 1);
      if (res && res.chosenAction) return res;
    }
    return null;
  };

  return stepNode(start.id, 0) ?? { visitedNodeIds: visited, chosenAction: 'idle' };
}

export interface VisualLogicExecutionResult {
  executedNodeIds: string[];
  actionsTriggered: { opCode: string; params: Record<string, string | number | boolean> }[];
  variables: Record<string, string | number | boolean>;
  logs: string[];
}

export function simulateVisualLogicEvent(
  graph: VisualLogicGraphDefinition,
  triggerEvent?: string,
  initialVars?: Record<string, string | number | boolean>
): VisualLogicExecutionResult {
  const vars: Record<string, string | number | boolean> = {
    ...(graph.variables ?? {}),
    ...(initialVars ?? {}),
  };
  const executedNodeIds: string[] = [];
  const actionsTriggered: {
    opCode: string;
    params: Record<string, string | number | boolean>;
  }[] = [];
  const logs: string[] = [];

  if (!graph.enabled) {
    logs.push(`Graph "${graph.name}" is disabled.`);
    return { executedNodeIds, actionsTriggered, variables: vars, logs };
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const startNodes = graph.nodes.filter(
    (n) =>
      n.kind === 'event' &&
      (!triggerEvent || n.opCode === triggerEvent || graph.triggerEvent === triggerEvent)
  );
  const visited = new Set<string>();
  const maxOps = Math.max(24, graph.nodes.length * 3);

  const evalCompare = (
    left: unknown,
    op: string,
    right: unknown
  ): boolean => {
    const lNum = Number(left);
    const rNum = Number(right);
    const bothNum =
      left !== '' && right !== '' && !Number.isNaN(lNum) && !Number.isNaN(rNum);
    switch (op) {
      case '==':
        return String(left) === String(right);
      case '!=':
        return String(left) !== String(right);
      case '>':
        return bothNum && lNum > rNum;
      case '<':
        return bothNum && lNum < rNum;
      case '>=':
        return bothNum && lNum >= rNum;
      case '<=':
        return bothNum && lNum <= rNum;
      default:
        return Boolean(left);
    }
  };

  const runFrom = (nodeId: string) => {
    if (visited.has(nodeId) || executedNodeIds.length >= maxOps) return;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) return;
    executedNodeIds.push(nodeId);

    const outgoing = graph.edges.filter((e) => e.fromNodeId === nodeId);

    if (node.kind === 'condition') {
      const varKey = String(node.params.varName ?? 'count');
      const op = String(node.params.operator ?? '>=');
      const cmpVal = node.params.value ?? 1;
      const result = evalCompare(vars[varKey], op, cmpVal);
      logs.push(`Condition [${varKey} ${op} ${String(cmpVal)}] => ${String(result)}`);
      const nextEdges = outgoing.filter((e) =>
        result ? e.fromPort === 'true' || e.fromPort === 'exec' : e.fromPort === 'false'
      );
      nextEdges.forEach((e) => runFrom(e.toNodeId));
      return;
    }

    if (node.kind === 'variable' || node.kind === 'counter') {
      const varKey = String(node.params.varName ?? 'counter');
      const mode = String(node.params.mode ?? (node.kind === 'counter' ? 'add' : 'set'));
      const val = node.params.value ?? 1;
      if (mode === 'add') {
        vars[varKey] = Number(vars[varKey] ?? 0) + Number(val);
      } else {
        vars[varKey] = val;
      }
      logs.push(`${node.kind.toUpperCase()} ${varKey} = ${String(vars[varKey])}`);
    } else if (node.kind === 'timer') {
      const delay = Number(node.params.delaySeconds ?? 1);
      logs.push(`Timer "${node.title}" scheduled (${delay}s).`);
    } else if (node.kind === 'action') {
      actionsTriggered.push({ opCode: node.opCode, params: { ...node.params } });
      logs.push(`Action "${node.opCode}" (${JSON.stringify(node.params)})`);
    }

    outgoing.forEach((e) => runFrom(e.toNodeId));
  };

  startNodes.forEach((s) => runFrom(s.id));

  return { executedNodeIds, actionsTriggered, variables: vars, logs };
}
