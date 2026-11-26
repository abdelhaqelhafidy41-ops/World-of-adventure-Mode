import { LootDropEntry, LootTableDefinition, WeatherCondition } from '@/src/types/content';
import { createSeededRng } from '@/src/core/procedural/proceduralGenerator';

export interface LootSimulationContext {
  seed?: number;
  biome?: string;
  playerLevel?: number;
  weather?: WeatherCondition;
}

export interface LootRollDrop {
  itemId: string;
  quantity: number;
  guaranteed: boolean;
}

export function simulateLootTableRoll(
  table: LootTableDefinition,
  ctx?: LootSimulationContext
): LootRollDrop[] {
  const rng = createSeededRng(ctx?.seed ?? Date.now());
  const drops = new Map<string, LootRollDrop>();

  const addDrop = (entry: LootDropEntry, guaranteed: boolean) => {
    const min = Math.max(1, Math.round(entry.minCount));
    const max = Math.max(min, Math.round(entry.maxCount));
    const qty = min + Math.floor(rng() * (max - min + 1));
    const prev = drops.get(entry.itemId);
    if (prev) {
      prev.quantity += qty;
    } else {
      drops.set(entry.itemId, {
        itemId: entry.itemId,
        quantity: qty,
        guaranteed,
      });
    }
  };

  const eligible = table.entries.filter((e) => {
    if (ctx?.biome && e.conditionBiome && e.conditionBiome !== ctx.biome) return false;
    if (
      typeof ctx?.playerLevel === 'number' &&
      typeof e.minPlayerLevel === 'number' &&
      ctx.playerLevel < e.minPlayerLevel
    ) {
      return false;
    }
    if (
      ctx?.weather &&
      ctx.weather !== 'any' &&
      e.conditionWeather &&
      e.conditionWeather !== 'any' &&
      e.conditionWeather !== ctx.weather
    ) {
      return false;
    }
    return true;
  });

  // Always drop explicitly guaranteed items
  for (const entry of eligible) {
    if (entry.guaranteed) {
      addDrop(entry, true);
    }
  }

  const minR = Math.max(0, Math.round(table.rollsMin));
  const maxR = Math.max(minR, Math.round(table.rollsMax));
  const totalRolls = minR + Math.floor(rng() * (maxR - minR + 1));

  const pool = eligible.filter((e) => !e.guaranteed);
  const totalWeight = pool.reduce(
    (sum, e) => sum + Math.max(0.1, e.weight ?? e.chance ?? 10),
    0
  );

  for (let r = 0; r < totalRolls && pool.length > 0; r++) {
    let pick = rng() * totalWeight;
    for (const entry of pool) {
      const w = Math.max(0.1, entry.weight ?? entry.chance ?? 10);
      pick -= w;
      if (pick <= 0) {
        const rollPct = rng() * 100;
        if (rollPct <= Math.max(0, Math.min(100, entry.chance))) {
          addDrop(entry, false);
        }
        break;
      }
    }
  }

  if (table.guaranteeOne && drops.size === 0 && eligible.length > 0) {
    const fallback = eligible[Math.floor(rng() * eligible.length)];
    addDrop(fallback, true);
  }

  return Array.from(drops.values());
}
