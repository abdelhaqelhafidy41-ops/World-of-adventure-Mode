import { ModProject } from '@/src/types/mod';

export interface DependencyConflict {
  code: 'MISSING_DEPENDENCY' | 'VERSION_MISMATCH' | 'LOAD_ORDER_CYCLE' | 'SELF_DEPENDENCY';
  level: 'error' | 'warn';
  modId: string;
  relatedModId?: string;
  message: string;
}

export interface LoadOrderSolution {
  orderedModIds: string[];
  conflicts: DependencyConflict[];
  hasCycle: boolean;
}

interface SemverTuple {
  major: number;
  minor: number;
  patch: number;
}

function parseSemverTuple(raw: string): SemverTuple | null {
  const m = raw.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

function compareSemver(a: SemverTuple, b: SemverTuple): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function satisfiesVersionRange(version: string, range: string): boolean {
  const ver = parseSemverTuple(version);
  if (!ver) return false;
  const clean = range.trim();
  if (!clean || clean === '*') return true;

  if (clean.startsWith('^')) {
    const base = parseSemverTuple(clean.slice(1));
    if (!base) return false;
    return compareSemver(ver, base) >= 0 && ver.major === base.major;
  }
  if (clean.startsWith('~')) {
    const base = parseSemverTuple(clean.slice(1));
    if (!base) return false;
    return (
      compareSemver(ver, base) >= 0 &&
      ver.major === base.major &&
      ver.minor === base.minor
    );
  }
  if (clean.startsWith('>=')) {
    const base = parseSemverTuple(clean.slice(2));
    return base ? compareSemver(ver, base) >= 0 : false;
  }
  const exact = parseSemverTuple(clean);
  if (!exact) return false;
  return compareSemver(ver, exact) === 0;
}

export function solveWorkspaceLoadOrder(projects: ModProject[]): LoadOrderSolution {
  const conflicts: DependencyConflict[] = [];
  const byId = new Map(projects.map((p) => [p.manifest.modId, p]));
  const edges = new Map<string, Set<string>>(); // A -> B means A loads before B
  const inDegree = new Map<string, number>();

  for (const p of projects) {
    edges.set(p.manifest.modId, new Set());
    inDegree.set(p.manifest.modId, 0);
  }

  const addEdge = (beforeId: string, afterId: string) => {
    if (!byId.has(beforeId) || !byId.has(afterId) || beforeId === afterId) return;
    const set = edges.get(beforeId)!;
    if (!set.has(afterId)) {
      set.add(afterId);
      inDegree.set(afterId, (inDegree.get(afterId) ?? 0) + 1);
    }
  };

  for (const p of projects) {
    const modId = p.manifest.modId;
    for (const dep of p.manifest.dependencies ?? []) {
      if (dep.modId === modId) {
        conflicts.push({
          code: 'SELF_DEPENDENCY',
          level: 'error',
          modId,
          message: `Mod "${modId}" depends on itself.`,
        });
        continue;
      }
      if (dep.modId === 'woa.core') continue;
      const target = byId.get(dep.modId);
      if (!target) {
        conflicts.push({
          code: 'MISSING_DEPENDENCY',
          level: dep.optional ? 'warn' : 'error',
          modId,
          relatedModId: dep.modId,
          message: `${modId} requires ${dep.modId} (${dep.versionRange}), which is not in workspace.`,
        });
      } else {
        if (!satisfiesVersionRange(target.manifest.version, dep.versionRange)) {
          conflicts.push({
            code: 'VERSION_MISMATCH',
            level: 'error',
            modId,
            relatedModId: dep.modId,
            message: `${modId} requires ${dep.modId} ${dep.versionRange}, found v${target.manifest.version}.`,
          });
        }
        addEdge(dep.modId, modId);
      }
    }

    for (const afterTarget of p.manifest.loadOrder?.loadAfter ?? []) {
      if (afterTarget !== 'woa.core' && byId.has(afterTarget)) {
        addEdge(afterTarget, modId);
      }
    }
    for (const beforeTarget of p.manifest.loadOrder?.loadBefore ?? []) {
      if (beforeTarget !== 'woa.core' && byId.has(beforeTarget)) {
        addEdge(modId, beforeTarget);
      }
    }
  }

  // Kahn's topological sort with deterministic priority tie-break
  const ready = projects
    .filter((p) => (inDegree.get(p.manifest.modId) ?? 0) === 0)
    .sort((a, b) => (a.manifest.loadOrder?.priority ?? 100) - (b.manifest.loadOrder?.priority ?? 100));

  const orderedModIds: string[] = [];
  while (ready.length > 0) {
    const cur = ready.shift()!;
    orderedModIds.push(cur.manifest.modId);
    for (const nextId of edges.get(cur.manifest.modId) ?? []) {
      const nextDeg = (inDegree.get(nextId) ?? 1) - 1;
      inDegree.set(nextId, nextDeg);
      if (nextDeg === 0) {
        const nextProj = byId.get(nextId)!;
        ready.push(nextProj);
        ready.sort(
          (a, b) => (a.manifest.loadOrder?.priority ?? 100) - (b.manifest.loadOrder?.priority ?? 100)
        );
      }
    }
  }

  const hasCycle = orderedModIds.length < projects.length;
  if (hasCycle) {
    const remaining = projects
      .map((p) => p.manifest.modId)
      .filter((id) => !orderedModIds.includes(id));
    conflicts.push({
      code: 'LOAD_ORDER_CYCLE',
      level: 'error',
      modId: remaining[0] ?? 'workspace',
      message: `Circular dependency / load-order cycle detected among: ${remaining.join(', ')}.`,
    });
    orderedModIds.push(...remaining);
  }

  return {
    orderedModIds,
    conflicts,
    hasCycle,
  };
}
