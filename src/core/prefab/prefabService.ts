import {
  BuildingDefinition,
  ModAsset,
  ModContentDatabase,
  PrefabCategory,
  PrefabDefinition,
  PrefabNodeItem,
  SceneHierarchyNode,
  WorldMapDefinition,
  WorldPlacedObject,
} from '@/src/types/mod';

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 36) || 'prefab'
  );
}

export function createPrefabFromAsset(
  modId: string,
  asset: ModAsset,
  opts?: {
    name?: string;
    category?: PrefabCategory;
    selectedNodeIds?: string[];
    hierarchy?: SceneHierarchyNode[];
    materials?: string[];
    textures?: string[];
    animations?: string[];
  }
): PrefabDefinition {
  const now = new Date().toISOString();
  const label = opts?.name?.trim() || `${asset.name} Prefab`;
  const slug = slugify(label);
  const selectedSet =
    opts?.selectedNodeIds && opts.selectedNodeIds.length > 0
      ? new Set(opts.selectedNodeIds)
      : null;

  const nodes: PrefabNodeItem[] = [];
  const snapshots = asset.sceneState?.nodeSnapshots ?? {};

  const walk = (treeNodes: SceneHierarchyNode[], parentId: string | null) => {
    for (const node of treeNodes) {
      const include = !selectedSet || selectedSet.has(node.id);
      if (include) {
        const snap = snapshots[node.id];
        nodes.push({
          id: node.id,
          name: node.name,
          parentId: selectedSet && parentId && !selectedSet.has(parentId) ? null : parentId,
          type: node.type,
          modelPath: asset.path,
          texturePath: snap?.materialOverride?.textureAssetId || undefined,
          transform: snap?.transform
            ? {
                position: { ...snap.transform.position },
                rotation: { ...snap.transform.rotation },
                scale: { ...snap.transform.scale },
              }
            : {
                position: { ...asset.transform.position },
                rotation: { ...asset.transform.rotation },
                scale: { ...asset.transform.scale },
              },
          properties: {
            visible: node.visible,
            locked: Boolean(node.locked),
            ...(node.collection ? { collection: node.collection } : {}),
            ...(snap?.materialOverride?.color ? { color: snap.materialOverride.color } : {}),
            ...(typeof snap?.materialOverride?.roughness === 'number'
              ? { roughness: snap.materialOverride.roughness }
              : {}),
            ...(typeof snap?.materialOverride?.metalness === 'number'
              ? { metalness: snap.materialOverride.metalness }
              : {}),
          },
        });
      }
      if (node.children.length > 0) {
        walk(node.children, node.id);
      }
    }
  };

  if (opts?.hierarchy && opts.hierarchy.length > 0) {
    walk(opts.hierarchy, null);
  }

  if (nodes.length === 0) {
    nodes.push({
      id: `pf_root_${Date.now().toString(36)}`,
      name: asset.name,
      parentId: null,
      type: 'Object3D',
      modelPath: asset.path,
      transform: {
        position: { ...asset.transform.position },
        rotation: { ...asset.transform.rotation },
        scale: { ...asset.transform.scale },
      },
      properties: {
        color: asset.material.color,
        roughness: asset.material.roughness,
        metalness: asset.material.metalness,
      },
    });
  }

  const textures = Array.from(
    new Set([
      ...(opts?.textures ?? []),
      ...nodes.map((n) => n.texturePath).filter((x): x is string => Boolean(x)),
    ])
  );

  return {
    uid: `prefab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    id: `${modId}:${slug}`,
    name: label,
    description: `Reusable 3D prefab captured from ${asset.name}.`,
    category: opts?.category ?? 'custom',
    sourceAssetId: asset.id,
    tags: [asset.modCategory?.toLowerCase() || 'prop'],
    nodes,
    materials: [...(opts?.materials ?? [])],
    textures,
    animations: [...(opts?.animations ?? [])],
    references: {
      assetPaths: [asset.path, ...textures],
      contentIds: [],
    },
    instanceCount: 0,
    updatedAt: now,
  };
}

export function createPrefabFromBuilding(
  modId: string,
  building: BuildingDefinition
): PrefabDefinition {
  const now = new Date().toISOString();
  const slug = slugify(`${building.name}_prefab`);
  const nodes: PrefabNodeItem[] = [
    {
      id: `pf_bldg_root`,
      name: building.name,
      parentId: null,
      type: 'Group',
      modelPath: building.model || undefined,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      properties: {
        footprintWidth: building.footprint.width,
        footprintDepth: building.footprint.depth,
        collisionEnabled: building.collision.enabled,
      },
    },
    ...building.pieces.map((p) => ({
      id: p.id,
      name: p.name,
      parentId: 'pf_bldg_root',
      type: 'Mesh' as const,
      modelPath: p.model || building.model || undefined,
      transform: {
        position: { ...p.position },
        rotation: { ...p.rotationDeg },
        scale: { x: p.scale, y: p.scale, z: p.scale },
      },
    })),
    ...building.doors.map((d) => ({
      id: d.id,
      name: d.name,
      parentId: 'pf_bldg_root',
      type: 'Object3D' as const,
      modelPath: d.model || undefined,
      transform: {
        position: { ...d.position },
        rotation: { x: 0, y: d.rotationYDeg, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      properties: {
        locked: d.locked,
        keyItemId: d.keyItemId,
      },
    })),
  ];

  const assetPaths = Array.from(
    new Set(
      [building.model, ...building.pieces.map((p) => p.model), ...building.doors.map((d) => d.model)]
        .filter((p): p is string => Boolean(p && p.trim()))
    )
  );

  return {
    uid: `prefab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    id: `${modId}:${slug}`,
    name: `${building.name} Prefab`,
    description: `Architectural prefab generated from ${building.name}.`,
    category: building.category === 'house' ? 'house' : 'decoration',
    sourceBuildingId: building.uid,
    tags: ['building', building.category],
    nodes,
    materials: [],
    textures: [],
    animations: [],
    references: {
      assetPaths,
      contentIds: [building.id],
    },
    instanceCount: 0,
    updatedAt: now,
  };
}

export function duplicatePrefabDefinition(
  prefab: PrefabDefinition,
  modId: string,
  existingIds: Set<string>,
  suffix = 'Copy'
): PrefabDefinition {
  const now = new Date().toISOString();
  const baseSlug = slugify(`${prefab.name}_${suffix}`);
  let candidateId = `${modId}:${baseSlug}`;
  let idx = 2;
  while (existingIds.has(candidateId)) {
    candidateId = `${modId}:${baseSlug}_${idx++}`;
  }
  return {
    ...prefab,
    uid: `prefab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    id: candidateId,
    name: `${prefab.name} ${suffix}`,
    tags: [...prefab.tags],
    nodes: prefab.nodes.map((n) => ({
      ...n,
      transform: {
        position: { ...n.transform.position },
        rotation: { ...n.transform.rotation },
        scale: { ...n.transform.scale },
      },
      properties: n.properties ? { ...n.properties } : undefined,
    })),
    materials: [...prefab.materials],
    textures: [...prefab.textures],
    animations: [...prefab.animations],
    references: {
      assetPaths: [...prefab.references.assetPaths],
      contentIds: [...prefab.references.contentIds],
    },
    instanceCount: 0,
    updatedAt: now,
  };
}

export function instantiatePrefabInWorldMap(
  map: WorldMapDefinition,
  prefab: PrefabDefinition,
  position: { x: number; y: number; z: number },
  layerId?: string
): { map: WorldMapDefinition; placed: WorldPlacedObject } {
  const resolvedLayer =
    layerId && map.layers.some((l) => l.id === layerId)
      ? layerId
      : map.layers[0]?.id ?? 'layer_structures';
  const placed: WorldPlacedObject = {
    id: `wobj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: prefab.name,
    kind: 'prefab',
    refId: prefab.id,
    layerId: resolvedLayer,
    biome: map.defaultBiome || 'meadow_plains',
    position: { ...position },
    rotationYDeg: 0,
    scale: 1,
    radius: 2,
  };
  return {
    placed,
    map: {
      ...map,
      objects: [...map.objects, placed],
      updatedAt: new Date().toISOString(),
    },
  };
}

export function updatePrefabInstancesInContents(
  contents: ModContentDatabase,
  prefab: PrefabDefinition
): ModContentDatabase {
  const maps = (contents.worldMaps ?? []).map((worldMap) => ({
    ...worldMap,
    objects: worldMap.objects.map((obj) =>
      obj.kind === 'prefab' && obj.refId === prefab.id
        ? { ...obj, name: prefab.name }
        : obj
    ),
  }));
  return {
    ...contents,
    worldMaps: maps,
  };
}

export function makePrefabInstanceUnique(
  contents: ModContentDatabase,
  modId: string,
  worldMapUid: string,
  objectId: string
): { contents: ModContentDatabase; newPrefab?: PrefabDefinition } {
  const maps = contents.worldMaps ?? [];
  const targetMap = maps.find((m) => m.uid === worldMapUid);
  const placed = targetMap?.objects.find((o) => o.id === objectId);
  if (!targetMap || !placed) return { contents };

  const prefabs = contents.prefabs ?? [];
  const sourcePrefab = prefabs.find((p) => p.id === placed.refId);
  if (!sourcePrefab) return { contents };

  const existingIds = new Set(prefabs.map((p) => p.id));
  const uniquePrefab = duplicatePrefabDefinition(
    sourcePrefab,
    modId,
    existingIds,
    'Unique'
  );

  return {
    newPrefab: uniquePrefab,
    contents: {
      ...contents,
      prefabs: [...prefabs, uniquePrefab],
      worldMaps: maps.map((m) =>
        m.uid === worldMapUid
          ? {
              ...m,
              objects: m.objects.map((o) =>
                o.id === objectId
                  ? { ...o, refId: uniquePrefab.id, name: uniquePrefab.name }
                  : o
              ),
              updatedAt: new Date().toISOString(),
            }
          : m
      ),
    },
  };
}

export function replacePrefabInstances(
  contents: ModContentDatabase,
  fromPrefabId: string,
  toPrefab: PrefabDefinition
): ModContentDatabase {
  return {
    ...contents,
    worldMaps: (contents.worldMaps ?? []).map((m) => ({
      ...m,
      objects: m.objects.map((o) =>
        o.kind === 'prefab' && o.refId === fromPrefabId
          ? { ...o, refId: toPrefab.id, name: toPrefab.name }
          : o
      ),
    })),
  };
}
