import { buildModCompatibilityInfo } from '@/src/core/api/woaModApiSpec';
import { resolveProjectContents } from '@/src/core/content/contentRegistry';
import { ModProject } from '@/src/types/mod';

export function generateModMarkdownDocs(project: ModProject): string {
  const { manifest, assets, files } = project;
  const contents = resolveProjectContents(project);
  const compat = buildModCompatibilityInfo(manifest, 'universal');
  const animations = contents.animations ?? [];
  const audioCues = contents.audioCues ?? [];
  const materials = contents.materials ?? [];
  const lootTables = contents.lootTables ?? [];
  const dialogues = contents.dialogues ?? [];
  const worldObjects = contents.worldObjects ?? [];
  const locales = files
    .filter((f) => f.path.startsWith('localization/') && f.path.endsWith('.json'))
    .map((f) => f.name.replace('.json', ''));

  const lines: string[] = [];

  lines.push(`# ${manifest.name}`);
  lines.push('');
  lines.push(manifest.description || 'Custom modification for World of Adventure.');
  lines.push('');
  lines.push('## Mod Overview & Compatibility');
  lines.push('');
  lines.push(`- **Mod ID**: \`${manifest.modId}\``);
  lines.push(`- **Version**: \`${manifest.version}\``);
  lines.push(`- **Author**: ${manifest.author}`);
  lines.push(
    `- **Supported WoA Version**: ${manifest.supportedGameVersion} (${
      compat.maxGameVersion
        ? `min \`${compat.minGameVersion}\` – max \`${compat.maxGameVersion}\``
        : `min \`${compat.minGameVersion}\`+`
    })`
  );
  lines.push(`- **Mod API**: \`${compat.modApiSchema}\` v${compat.modApiVersion} (Package Format v${compat.packageFormatVersion})`);
  lines.push(`- **Execution Model**: Data-driven (requires native code: \`false\`)`);
  lines.push(`- **Target Platforms**: ${manifest.targetPlatforms.join(', ')}`);
  lines.push(`- **Categories**: ${manifest.categories.join(', ')}`);
  if (locales.length > 0) {
    lines.push(`- **Localizations**: ${locales.join(', ')}`);
  }
  lines.push('');

  lines.push('## Dependencies & Load Order');
  lines.push('');
  lines.push(`- **Load Priority**: ${manifest.loadOrder?.priority ?? 100}`);
  if ((manifest.loadOrder?.loadAfter ?? []).length > 0) {
    lines.push(`- **Load After**: ${(manifest.loadOrder?.loadAfter ?? []).join(', ')}`);
  }
  if ((manifest.loadOrder?.loadBefore ?? []).length > 0) {
    lines.push(`- **Load Before**: ${(manifest.loadOrder?.loadBefore ?? []).join(', ')}`);
  }
  if ((manifest.dependencies ?? []).length === 0) {
    lines.push('- **Dependencies**: Standalone (no external mod dependencies)');
  } else {
    manifest.dependencies?.forEach((d) => {
      lines.push(`- \`${d.modId}\` \`${d.versionRange}\`${d.optional ? ' *(optional)*' : ''}`);
    });
  }
  lines.push('');

  lines.push('## Content Summary');
  lines.push('');
  lines.push(`| Domain | Count | Registry File |`);
  lines.push(`| --- | ---: | --- |`);
  lines.push(`| Items | ${contents.items.length} | \`data/items.json\` |`);
  lines.push(`| Weapons | ${contents.weapons.length} | \`data/weapons.json\` |`);
  lines.push(`| Armor | ${contents.armor.length} | \`data/armor.json\` |`);
  lines.push(`| Characters / NPCs | ${contents.npcs.length} | \`data/npcs.json\` |`);
  lines.push(`| Creatures / Monsters | ${contents.monsters.length} | \`data/monsters.json\` |`);
  lines.push(`| Quests | ${contents.quests.length} | \`data/quests.json\` |`);
  lines.push(`| Crafting Recipes | ${contents.recipes.length} | \`data/recipes.json\` |`);
  lines.push(`| Buildings | ${contents.buildings.length} | \`data/buildings.json\` |`);
  lines.push(`| Spawns | ${contents.spawns.length} | \`data/spawns.json\` |`);
  lines.push(`| World Objects | ${worldObjects.length} | \`data/world_objects.json\` |`);
  lines.push(`| Loot Tables | ${lootTables.length} | \`data/loot_tables.json\` |`);
  lines.push(`| Dialogue Trees | ${dialogues.length} | \`data/dialogues.json\` |`);
  lines.push(`| Animations | ${animations.length} | \`data/animations.json\` |`);
  lines.push(`| Audio Cues | ${audioCues.length} | \`data/audio.json\` |`);
  lines.push(`| Materials | ${materials.length} | \`data/materials.json\` |`);
  lines.push(`| Bundled Assets | ${assets.length} | \`assets/\` |`);
  lines.push('');

  const appendSection = (title: string, rows: { id: string; name: string; detail: string }[]) => {
    if (rows.length === 0) return;
    lines.push(`## ${title}`);
    lines.push('');
    rows.forEach((r) => {
      lines.push(`- **${r.name}** (\`${r.id}\`) — ${r.detail}`);
    });
    lines.push('');
  };

  appendSection(
    'Items',
    contents.items.map((i) => ({
      id: i.id,
      name: i.name,
      detail: `${i.rarity} ${i.category}, stack ${i.stackSize}, value ${i.value}g. ${i.description}`,
    }))
  );
  appendSection(
    'Weapons',
    contents.weapons.map((w) => ({
      id: w.id,
      name: w.name,
      detail: `${w.damage} dmg, ${w.attackSpeed}/s, reach ${w.range}m, crit ${w.criticalChance}%. ${w.description}`,
    }))
  );
  appendSection(
    'Armor',
    contents.armor.map((a) => ({
      id: a.id,
      name: a.name,
      detail: `Slot: ${a.slot}, Defense ${a.defense}, Durability ${a.durability}. ${a.description}`,
    }))
  );
  appendSection(
    'Characters / NPCs',
    contents.npcs.map((n) => ({
      id: n.id,
      name: n.name,
      detail: `${n.behaviorType}, HP ${n.health}, Faction ${n.faction}. ${n.description}`,
    }))
  );
  appendSection(
    'Creatures / Monsters',
    contents.monsters.map((m) => ({
      id: m.id,
      name: m.name,
      detail: `HP ${m.health}, DMG ${m.damage}, Behavior ${m.attackBehavior}. ${m.description}`,
    }))
  );
  appendSection(
    'Quests',
    contents.quests.map((q) => ({
      id: q.id,
      name: q.name,
      detail: `${q.questType.toUpperCase()} (${q.chapterOrRegion}, Lv.${q.recommendedLevel}), ${q.objectives.length} objective(s), Reward ${q.rewards.xp} XP / ${q.rewards.gold}g.`,
    }))
  );
  appendSection(
    'Crafting Recipes',
    contents.recipes.map((r) => ({
      id: r.id,
      name: r.name,
      detail: `Station: ${r.station}, produces ${r.outputQuantity}x \`${r.outputItemId}\` in ${r.craftTimeSeconds}s.`,
    }))
  );
  appendSection(
    'Buildings & World Objects',
    [
      ...contents.buildings.map((b) => ({
        id: b.id,
        name: b.name,
        detail: `Building (${b.category}), ${b.footprint.width}x${b.footprint.height}x${b.footprint.depth}m, ${b.interactiveObjects.length} interactive hooks.`,
      })),
      ...worldObjects.map((wo) => ({
        id: wo.id,
        name: wo.name,
        detail: `World Object (${wo.objectType}) in ${wo.biome}. Prompt: "${wo.interactionPrompt}".`,
      })),
    ]
  );

  if ((manifest.changelog ?? []).length > 0) {
    lines.push('## Version History & Changelog');
    lines.push('');
    manifest.changelog?.forEach((c) => {
      lines.push(`- **v${c.version}** (${c.date.slice(0, 10)}): ${c.summary}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export function generateModHtmlDocs(project: ModProject): string {
  const md = generateModMarkdownDocs(project);
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en" dir="auto">
<head>
  <meta charset="utf-8" />
  <title>${project.manifest.name} · Mod Documentation</title>
  <style>
    body { font-family: system-ui, -apple-system, 'IBM Plex Sans Arabic', 'Cairo', sans-serif; background: #0b0f17; color: #e2e8f0; max-width: 900px; margin: 40px auto; padding: 0 24px; line-height: 1.6; }
    pre { white-space: pre-wrap; background: #121823; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 24px; font-family: ui-monospace, 'IBM Plex Sans Arabic', monospace; font-size: 13px; }
    h1 { font-size: 20px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1 dir="auto">${project.manifest.name} (${project.manifest.modId})</h1>
  <pre dir="auto">${escaped}</pre>
</body>
</html>`;
}
