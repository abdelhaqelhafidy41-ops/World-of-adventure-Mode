import {
  ArmorDefinition,
  BuildingDefinition,
  ItemDefinition,
  ModAsset,
  ModManifest,
  MonsterDefinition,
  NpcDefinition,
  WeaponDefinition,
} from '@/src/types/mod';

export type SandboxPreviewMode =
  | 'arena'
  | 'model'
  | 'character'
  | 'weapon'
  | 'npc'
  | 'creature'
  | 'item'
  | 'building';

export type SandboxAnimationClip =
  | 'auto'
  | 'idle'
  | 'walk'
  | 'attack'
  | 'interact';

export type SandboxRunState = 'stopped' | 'playing';

export interface SandboxSnapshot {
  capturedAt: string;
  manifest: ModManifest;
  assets: ModAsset[];
  items: ItemDefinition[];
  weapons: WeaponDefinition[];
  armor: ArmorDefinition[];
  npcs: NpcDefinition[];
  monsters: MonsterDefinition[];
  buildings: BuildingDefinition[];
  entryScriptContent: string;
}

export interface SandboxEntitySummary {
  instanceId: string;
  kind: 'player' | 'model' | 'weapon' | 'npc' | 'creature' | 'item' | 'building';
  sourceId: string;
  name: string;
  hp?: number;
  maxHp?: number;
  collected?: boolean;
  doorOpen?: boolean;
  position: { x: number; y: number; z: number };
}

export interface SandboxInteractionPrompt {
  instanceId: string;
  kind: 'npc' | 'creature' | 'item' | 'building' | 'door' | 'interactive';
  title: string;
  actionLabel: string;
  detail: string;
  subId?: string;
}

export interface SandboxDialogueState {
  speaker: string;
  faction: string;
  mood: string;
  text: string;
  lineIndex: number;
  totalLines: number;
  questRefs: string[];
}

export interface SandboxRuntimeEvent {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}
