import {
  ProceduralRuleDefinition,
  WorldMapDefinition,
  WorldPlacedObject,
} from '@/src/types/content';

/** Deterministic Mulberry32 PRNG */
export function createSeededRng(seed: number): () => number {
  let state = (Math.floor(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic procedural terrain elevation for preview & altitude/slope filters */
export function sampleTerrainElevation(
  x: number,
  z: number,
  seed: number
): { altitude: number; slopeDeg: number } {
  const s = (seed % 1000) * 0.013;
  const h0 =
    Math.sin(x * 0.045 + s) * 14 +
    Math.cos(z * 0.04 + s * 1.3) * 12 +
    Math.sin((x + z) * 0.02 - s) * 8 +
    18;

  const eps = 1.5;
  const hx =
    Math.sin((x + eps) * 0.045 + s) * 14 +
    Math.cos(z * 0.04 + s * 1.3) * 12 +
    Math.sin((x + eps + z) * 0.02 - s) * 8 +
    18;
  const hz =
    Math.sin(x * 0.045 + s) * 14 +
    Math.cos((z + eps) * 0.04 + s * 1.3) * 12 +
    Math.sin((x + z + eps) * 0.02 - s) * 8 +
    18;

  const grad = Math.hypot(hx - h0, hz - h0) / eps;
  const slopeDeg = (Math.atan(grad) * 180) / Math.PI;
  return {
    altitude: Number(h0.toFixed(2)),
    slopeDeg: Number(slopeDeg.toFixed(1)),
  };
}

export function isPointInsideWaterZone(
  x: number,
  z: number,
  altitude: number,
  worldMap: WorldMapDefinition,
  marginMeters: number
): boolean {
  if (altitude <= worldMap.waterLevelY + marginMeters) {
    return true;
  }
  for (const obj of worldMap.objects) {
    if (obj.kind !== 'water_zone') continue;
    const dist = Math.hypot(x - obj.position.x, z - obj.position.z);
    if (dist <= Math.max(1, obj.radius) + marginMeters) {
      return true;
    }
  }
  return false;
}

export interface ProceduralRunResult {
  generatedObjects: WorldPlacedObject[];
  rejectedWaterCount: number;
  rejectedSpacingCount: number;
  rejectedTerrainCount: number;
}

export function generateProceduralPlacements(
  worldMap: WorldMapDefinition,
  rule: ProceduralRuleDefinition
): ProceduralRunResult {
  const rng = createSeededRng(rule.seed);
  const halfW = Math.max(20, worldMap.sizeMeters.width / 2 - 4);
  const halfD = Math.max(20, worldMap.sizeMeters.depth / 2 - 4);
  const layerId = worldMap.layers[0]?.id ?? 'layer_procedural';

  const existingCoords = worldMap.objects
    .filter((o) => o.generatedByRuleId !== rule.uid)
    .map((o) => ({ x: o.position.x, z: o.position.z, r: o.radius }));

  const generated: WorldPlacedObject[] = [];
  let rejectedWaterCount = 0;
  let rejectedSpacingCount = 0;
  let rejectedTerrainCount = 0;

  const targetCount = Math.max(1, Math.min(400, Math.round(rule.density)));
  const maxAttempts = targetCount * 14;
  const spacing = Math.max(0.5, rule.minSpacingMeters);
  const waterMargin = Math.max(0, rule.waterMarginMeters);

  const biomeList =
    rule.biomes.length > 0 ? rule.biomes : [worldMap.defaultBiome || 'meadow_plains'];

  for (let attempt = 0; attempt < maxAttempts && generated.length < targetCount; attempt++) {
    const rawX = (rng() * 2 - 1) * halfW;
    const rawZ = (rng() * 2 - 1) * halfD;
    const x = worldMap.snapToGrid && worldMap.gridSize > 0
      ? Math.round(rawX / worldMap.gridSize) * worldMap.gridSize
      : Number(rawX.toFixed(2));
    const z = worldMap.snapToGrid && worldMap.gridSize > 0
      ? Math.round(rawZ / worldMap.gridSize) * worldMap.gridSize
      : Number(rawZ.toFixed(2));

    const { altitude, slopeDeg } = sampleTerrainElevation(x, z, rule.seed);

    if (
      rule.avoidWater &&
      isPointInsideWaterZone(x, z, altitude, worldMap, waterMargin)
    ) {
      rejectedWaterCount++;
      continue;
    }

    if (
      altitude < rule.minAltitude ||
      altitude > rule.maxAltitude ||
      slopeDeg > rule.maxSlopeDeg
    ) {
      rejectedTerrainCount++;
      continue;
    }

    let tooClose = false;
    for (const pt of existingCoords) {
      if (Math.hypot(x - pt.x, z - pt.z) < spacing) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      for (const g of generated) {
        if (Math.hypot(x - g.position.x, z - g.position.z) < spacing) {
          tooClose = true;
          break;
        }
      }
    }
    if (tooClose) {
      rejectedSpacingCount++;
      continue;
    }

    const chosenBiome = biomeList[Math.floor(rng() * biomeList.length)] ?? biomeList[0];
    const scaleRange = Math.max(0, rule.scaleMax - rule.scaleMin);
    const scale = Number((rule.scaleMin + rng() * scaleRange).toFixed(2));

    generated.push({
      id: `proc_${rule.uid}_${generated.length + 1}`,
      name: `${rule.name} #${generated.length + 1}`,
      kind: rule.objectKind,
      refId: rule.targetRefId,
      layerId,
      biome: chosenBiome,
      position: { x, y: altitude, z },
      rotationYDeg: Math.round(rng() * 360),
      scale: Math.max(0.2, scale),
      radius: Number((spacing * 0.45).toFixed(2)),
      generatedByRuleId: rule.uid,
    });
  }

  return {
    generatedObjects: generated,
    rejectedWaterCount,
    rejectedSpacingCount,
    rejectedTerrainCount,
  };
}

export function applyProceduralRuleToWorldMap(
  worldMap: WorldMapDefinition,
  rule: ProceduralRuleDefinition
): { map: WorldMapDefinition; result: ProceduralRunResult } {
  const result = generateProceduralPlacements(worldMap, rule);
  const kept = worldMap.objects.filter((o) => o.generatedByRuleId !== rule.uid);
  return {
    result,
    map: {
      ...worldMap,
      objects: [...kept, ...result.generatedObjects],
      updatedAt: new Date().toISOString(),
    },
  };
}
