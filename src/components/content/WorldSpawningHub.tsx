import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Package,
  Search,
  Shield,
  Skull,
  Sparkles,
  Sword,
  Users,
} from 'lucide-react';
import {
  createDefaultSpawnConfig,
  validateAllContents,
} from '@/src/core/content/contentRegistry';
import { type TranslationKey, useI18n } from '@/src/i18n';
import {
  ArmorDefinition,
  BuildingDefinition,
  ContentSpawnConfig,
  ItemDefinition,
  ModContentDatabase,
  MonsterDefinition,
  NpcDefinition,
  WeaponDefinition,
  WorldObjectDefinition,
  WorldSpawnContentKind,
} from '@/src/types/mod';

interface WorldSpawningHubProps {
  modId: string;
  contents: ModContentDatabase;
  onUpdateContents: (next: ModContentDatabase) => void;
  onOpenEntrySpawn: (kind: WorldSpawnContentKind, uid: string) => void;
}

interface SpawnableRow {
  kind: WorldSpawnContentKind;
  uid: string;
  id: string;
  name: string;
  spawnConfig?: ContentSpawnConfig;
}

const KIND_ORDER: WorldSpawnContentKind[] = [
  'npc',
  'monster',
  'weapon',
  'item',
  'armor',
  'building',
  'world_object',
];

function kindIcon(kind: WorldSpawnContentKind): React.ReactNode {
  switch (kind) {
    case 'item':
      return <Package className="w-3.5 h-3.5 text-emerald-500" />;
    case 'weapon':
      return <Sword className="w-3.5 h-3.5 text-purple-500" />;
    case 'armor':
      return <Shield className="w-3.5 h-3.5 text-slate-400" />;
    case 'npc':
      return <Users className="w-3.5 h-3.5 text-sky-500" />;
    case 'monster':
      return <Skull className="w-3.5 h-3.5 text-orange-500" />;
    case 'building':
      return <Building2 className="w-3.5 h-3.5 text-amber-500" />;
    case 'world_object':
      return <Sparkles className="w-3.5 h-3.5 text-teal-500" />;
  }
}

export const WorldSpawningHub: React.FC<WorldSpawningHubProps> = ({
  modId,
  contents,
  onUpdateContents,
  onOpenEntrySpawn,
}) => {
  const { t, language } = useI18n();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | WorldSpawnContentKind>('all');
  const [onlyEnabled, setOnlyEnabled] = useState(false);

  const validation = useMemo(
    () => validateAllContents(contents, modId),
    [contents, modId]
  );

  const allRows = useMemo<SpawnableRow[]>(() => {
    const rows: SpawnableRow[] = [];
    const pushList = <
      T extends {
        uid: string;
        id: string;
        name: string;
        translations?: { name?: Record<string, string> };
        spawnConfig?: ContentSpawnConfig;
      },
    >(
      kind: WorldSpawnContentKind,
      list: T[]
    ) => {
      for (const entry of list) {
        rows.push({
          kind,
          uid: entry.uid,
          id: entry.id,
          name: entry.translations?.name?.[language]?.trim() || entry.name || entry.id,
          spawnConfig: entry.spawnConfig,
        });
      }
    };

    pushList('npc', contents.npcs);
    pushList('monster', contents.monsters);
    pushList('weapon', contents.weapons);
    pushList('item', contents.items);
    pushList('armor', contents.armor);
    pushList('building', contents.buildings);
    pushList('world_object', contents.worldObjects ?? []);
    return rows;
  }, [contents, language]);

  const stats = useMemo(() => {
    let enabledCount = 0;
    let totalLocations = 0;
    let spawnErrorCount = 0;

    for (const row of allRows) {
      if (row.spawnConfig?.enabled) {
        enabledCount++;
        totalLocations += row.spawnConfig.locations.length;
      }
      const issues = validation.byUid.get(row.uid) ?? [];
      spawnErrorCount += issues.filter(
        (i) => i.level === 'error' && i.field.startsWith('spawnConfig')
      ).length;
    }

    return {
      totalEntries: allRows.length,
      enabledCount,
      totalLocations,
      spawnErrorCount,
    };
  }, [allRows, validation]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false;
      if (onlyEnabled && !row.spawnConfig?.enabled) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) || row.id.toLowerCase().includes(q)
      );
    });
  }, [allRows, kindFilter, onlyEnabled, search]);

  const handleToggleRow = (row: SpawnableRow, enabled: boolean) => {
    const now = new Date().toISOString();
    const buildNextConfig = (curr?: ContentSpawnConfig): ContentSpawnConfig => {
      if (curr) return { ...curr, enabled };
      return createDefaultSpawnConfig(row.kind, undefined, undefined, undefined, enabled);
    };

    if (row.kind === 'item') {
      onUpdateContents({
        ...contents,
        items: contents.items.map((e: ItemDefinition) =>
          e.uid === row.uid
            ? { ...e, spawnConfig: buildNextConfig(e.spawnConfig), updatedAt: now }
            : e
        ),
      });
    } else if (row.kind === 'weapon') {
      onUpdateContents({
        ...contents,
        weapons: contents.weapons.map((e: WeaponDefinition) =>
          e.uid === row.uid
            ? { ...e, spawnConfig: buildNextConfig(e.spawnConfig), updatedAt: now }
            : e
        ),
      });
    } else if (row.kind === 'armor') {
      onUpdateContents({
        ...contents,
        armor: contents.armor.map((e: ArmorDefinition) =>
          e.uid === row.uid
            ? { ...e, spawnConfig: buildNextConfig(e.spawnConfig), updatedAt: now }
            : e
        ),
      });
    } else if (row.kind === 'npc') {
      onUpdateContents({
        ...contents,
        npcs: contents.npcs.map((e: NpcDefinition) =>
          e.uid === row.uid
            ? { ...e, spawnConfig: buildNextConfig(e.spawnConfig), updatedAt: now }
            : e
        ),
      });
    } else if (row.kind === 'monster') {
      onUpdateContents({
        ...contents,
        monsters: contents.monsters.map((e: MonsterDefinition) =>
          e.uid === row.uid
            ? { ...e, spawnConfig: buildNextConfig(e.spawnConfig), updatedAt: now }
            : e
        ),
      });
    } else if (row.kind === 'building') {
      onUpdateContents({
        ...contents,
        buildings: contents.buildings.map((e: BuildingDefinition) =>
          e.uid === row.uid
            ? { ...e, spawnConfig: buildNextConfig(e.spawnConfig), updatedAt: now }
            : e
        ),
      });
    } else {
      onUpdateContents({
        ...contents,
        worldObjects: (contents.worldObjects ?? []).map((e: WorldObjectDefinition) =>
          e.uid === row.uid
            ? { ...e, spawnConfig: buildNextConfig(e.spawnConfig), updatedAt: now }
            : e
        ),
      });
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-[#0B0F17]">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-500" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {t('worldSpawning.hubTitle')}
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
              {t('worldSpawning.hubSubtitle')}
            </p>
          </div>

          <div
            dir="ltr"
            className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums"
          >
            <div className="px-3 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520]">
              <span className="text-slate-500 dark:text-slate-400">
                {t('worldSpawning.metricTotal')}:
              </span>{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {stats.totalEntries}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520]">
              <span className="text-slate-500 dark:text-slate-400">
                {t('worldSpawning.metricEnabled')}:
              </span>{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {stats.enabledCount}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520]">
              <span className="text-slate-500 dark:text-slate-400">
                {t('worldSpawning.metricLocations')}:
              </span>{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {stats.totalLocations}
              </span>
            </div>
            {stats.spawnErrorCount > 0 && (
              <div className="px-3 py-1.5 rounded border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300">
                {t('worldSpawning.metricErrors', { count: stats.spawnErrorCount })}
              </div>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setKindFilter('all')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                kindFilter === 'all'
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] text-slate-600 dark:text-slate-300 hover:border-slate-300'
              }`}
            >
              {t('worldSpawning.filterAll')}
            </button>
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                  kindFilter === k
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] text-slate-600 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                {kindIcon(k)}
                <span>{t(`content.kind.${k}` as TranslationKey)}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyEnabled}
                onChange={(e) => setOnlyEnabled(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>{t('worldSpawning.onlyEnabled')}</span>
            </label>

            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('worldSpawning.searchPlaceholder')}
                className="w-full ps-8 pe-2.5 py-1.5 text-xs rounded border border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-[#101520] dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Entries List */}
        {filteredRows.length === 0 ? (
          <div className="p-8 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] text-center space-y-2">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {allRows.length === 0
                ? t('worldSpawning.emptyTitle')
                : t('worldSpawning.noMatchTitle')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {allRows.length === 0
                ? t('worldSpawning.emptyDesc')
                : t('worldSpawning.noMatchDesc')}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#101520] divide-y divide-slate-200 dark:divide-white/10">
            {filteredRows.map((row) => {
              const enabled = Boolean(row.spawnConfig?.enabled);
              const locs = row.spawnConfig?.locations ?? [];
              const firstLoc = locs[0];
              const rowIssues = (validation.byUid.get(row.uid) ?? []).filter((i) =>
                i.field.startsWith('spawnConfig')
              );
              const errCount = rowIssues.filter((i) => i.level === 'error').length;

              return (
                <div
                  key={`${row.kind}:${row.uid}`}
                  className="p-3 sm:px-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {kindIcon(row.kind)}
                      <span dir="auto" className="text-xs font-semibold text-slate-900 dark:text-white">
                        {row.name}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {row.id}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t(`content.kind.${row.kind}` as TranslationKey)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                      {enabled && row.spawnConfig ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            {errCount > 0 ? (
                              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            {t(`spawnEditor.mode.${row.spawnConfig.mode}` as TranslationKey)}
                          </span>
                          <span dir="ltr" className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {t('spawnEditor.locationsSummaryCount', { count: locs.length })}
                            {firstLoc
                              ? ` · (${firstLoc.position.x}, ${firstLoc.position.y}, ${firstLoc.position.z})`
                              : ''}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">
                          {t('worldSpawning.manualInventoryOnly')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => handleToggleRow(row, e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{t('worldSpawning.autoSpawnLabel')}</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => onOpenEntrySpawn(row.kind, row.uid)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500"
                    >
                      <span>{t('worldSpawning.editCoordsBtn')}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
