import type { AppLanguage, LocalizedTextMap } from '@/src/i18n/types';
import type { ModContentDatabase } from './content';
export * from './content';

export type ModCategory =
  | 'Items'
  | 'Weapons'
  | 'Biomes'
  | 'Entities'
  | 'Blocks'
  | 'Quests'
  | 'Audio'
  | 'UI';

export type AssetModCategory =
  | 'Weapon'
  | 'Item'
  | 'Character'
  | 'NPC'
  | 'Animal'
  | 'Monster'
  | 'Building'
  | 'Decoration';

export const ASSET_MOD_CATEGORIES: AssetModCategory[] = [
  'Weapon',
  'Item',
  'Character',
  'NPC',
  'Animal',
  'Monster',
  'Building',
  'Decoration',
];

export type TargetPlatform = 'universal' | 'windows' | 'android';

export type ModNodeType =
  | 'folder'
  | 'manifest'
  | 'asset-3d'
  | 'texture'
  | 'script'
  | 'data'
  | 'audio'
  | 'doc';

export type AssetPresetKind =
  | 'relic-sword'
  | 'crystal-obelisk'
  | 'frontier-crate'
  | 'clockwork-sentinel'
  | 'beacon-pedestal';

export type PivotMode = 'bottom-center' | 'center';
export type CollisionShape = 'none' | 'box' | 'sphere' | 'capsule';
export type LightingPreset = 'studio' | 'daylight' | 'forge' | 'night';
export type MaterialPreviewMode = 'pbr' | 'unlit' | 'clay' | 'normals' | 'wireframe';

export interface AssetCollisionConfig {
  shape: CollisionShape;
  scale: number;
  offsetY: number;
}

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface AssetTransform {
  position: Vec3Tuple;
  rotation: Vec3Tuple; // degrees in UI, converted to radians in Three.js
  scale: Vec3Tuple;
}

export interface AssetMaterialConfig {
  color: string;
  accentColor: string;
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
  wireframe: boolean;
}

export interface ModelDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface ExtractedMaterialInfo {
  name: string;
  type: string;
  color: string;
  roughness?: number;
  metalness?: number;
  hasTexture: boolean;
}

export type SceneStructureOp =
  | {
      kind: 'duplicate';
      newId: string;
      sourceId: string;
      name: string;
      isInstance?: boolean;
    }
  | {
      kind: 'group';
      newId: string;
      name: string;
      childIds: string[];
    }
  | {
      kind: 'ungroup';
      groupId: string;
    }
  | {
      kind: 'delete';
      nodeId: string;
    }
  | {
      kind: 'applyTransform';
      nodeId: string;
      target: 'all' | 'position' | 'rotation' | 'scale';
    }
  | {
      kind: 'centerPivot';
      nodeId: string;
    }
  | {
      kind: 'resetPivot';
      nodeId: string;
    }
  | {
      kind: 'makeUnique';
      nodeId: string;
    }
  | {
      kind: 'pasteJson';
      newId: string;
      objectJson: Record<string, unknown>;
    };

export interface SceneNodeSnapshot {
  id: string;
  name: string;
  type: 'Group' | 'Mesh' | 'Object3D';
  parentId: string | null;
  orderIndex: number;
  visible: boolean;
  locked: boolean;
  collection?: string;
  transform: AssetTransform;
  materialOverride?: {
    name?: string;
    color?: string;
    roughness?: number;
    metalness?: number;
    emissive?: string;
    emissiveIntensity?: number;
    wireframe?: boolean;
    textureAssetId?: string | null;
    textureName?: string | null;
  };
  clonedFromNodeId?: string;
  isCustomGroup?: boolean;
  childIds?: string[];
}

export interface SceneEditorState {
  revision: number;
  deletedNodeIds: string[];
  nodeSnapshots: Record<string, SceneNodeSnapshot>;
  customGroups: {
    id: string;
    name: string;
    parentId: string | null;
    childIds: string[];
    transform: AssetTransform;
    visible: boolean;
    locked: boolean;
    collection?: string;
  }[];
  duplicatedNodes: {
    id: string;
    sourceNodeId: string;
    parentId: string | null;
    name: string;
    transform: AssetTransform;
    visible: boolean;
    locked: boolean;
    collection?: string;
    isInstance?: boolean;
  }[];
  structureOps?: SceneStructureOp[];
  rootMirror?: { x: boolean; y: boolean; z: boolean };
}

export interface SceneHierarchyNode {
  id: string;
  name: string;
  type: 'Group' | 'Mesh' | 'Object3D';
  visible: boolean;
  locked?: boolean;
  collection?: string;
  hasTexture?: boolean;
  materialName?: string;
  isSharedGeometry?: boolean;
  isSharedMaterial?: boolean;
  triangleCount: number;
  children: SceneHierarchyNode[];
}

export interface ModAsset {
  id: string;
  name: string;
  path: string;
  type: '3d-model' | 'texture' | 'audio' | 'data';
  modCategory?: AssetModCategory;
  preset?: AssetPresetKind;
  blobKey?: string;
  mimeType?: string;
  originalFileName?: string;
  isImported?: boolean;
  format: string;
  sizeBytes: number;
  triangleEstimate: number;
  dimensions?: ModelDimensions;
  resolution?: { width: number; height: number };
  durationSeconds?: number;
  extractedMaterials?: ExtractedMaterialInfo[];
  pivotMode?: PivotMode;
  collision?: AssetCollisionConfig;
  transform: AssetTransform;
  material: AssetMaterialConfig;
  locked?: boolean;
  hidden?: boolean;
  collection?: string;
  sceneState?: SceneEditorState;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt?: string;
}

export interface ModFileNode {
  id: string;
  name: string;
  path: string;
  parentPath: string | null;
  type: ModNodeType;
  content?: string;
  assetId?: string;
  updatedAt: string;
}

export type ModTemplateId =
  | 'blank'
  | 'weapon-pack'
  | 'quest-npc'
  | 'building-dungeon'
  | 'biome-creature';

export interface ModLoadOrderConfig {
  priority: number; // 0..1000, higher loads later (overrides earlier)
  loadAfter: string[];
  loadBefore: string[];
}

export interface ModCompatibilityInfo {
  modApiSchema: string;
  modApiVersion: string;
  packageFormatVersion: number;
  compatiblePackageFormats: number[];
  supportedGameVersion: string;
  minGameVersion: string;
  maxGameVersion?: string;
  executionModel: 'data-driven';
  requiresNativeCode: boolean;
  backwardCompatible: boolean;
  targetPlatforms: TargetPlatform[];
}

export interface ModChangelogEntry {
  id: string;
  version: string;
  date: string;
  summary: string;
}

export interface ModDependency {
  modId: string;
  versionRange: string;
  optional?: boolean;
}

export interface ModManifest {
  modId: string;
  name: string;
  version: string;
  author: string;
  description: string;
  translations?: {
    name?: LocalizedTextMap;
    description?: LocalizedTextMap;
  };
  supportedGameVersion: string;
  minGameVersion?: string;
  maxGameVersion?: string;
  modApiVersion?: string;
  packageFormatVersion?: number;
  categories: ModCategory[];
  entryPoint: string;
  targetPlatforms: TargetPlatform[];
  dependencies?: ModDependency[];
  loadOrder?: ModLoadOrderConfig;
  changelog?: ModChangelogEntry[];
  templateId?: ModTemplateId;
  createdAt: string;
  updatedAt: string;
}

export interface ModProject {
  id: string; // matches manifest.modId
  manifest: ModManifest;
  files: ModFileNode[];
  assets: ModAsset[];
  contents?: ModContentDatabase;
  activeAssetId: string | null;
  lastOpenedAt: string;
}

export interface CreateModInput {
  modId: string;
  name: string;
  nameAr?: string;
  version: string;
  author: string;
  description: string;
  descriptionAr?: string;
  supportedGameVersion: string;
  maxGameVersion?: string;
  categories: ModCategory[];
  targetPlatforms?: TargetPlatform[];
  templateId?: ModTemplateId;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface ConsoleEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

export type ValidationSeverity = 'error' | 'warning';

export type ValidationCategory =
  | 'manifest'
  | 'identifiers'
  | 'assets'
  | 'models'
  | 'textures'
  | 'audio'
  | 'data'
  | 'dependencies'
  | 'properties'
  | 'security';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  code: string;
  category: ValidationCategory;
  file: string;
  object: string;
  property: string;
  problem: string;
  suggestion: string;
  targetType?: 'manifest' | 'file' | 'asset' | 'content';
  targetRef?: string; // file path, asset id, or `${contentKind}:${uid}`
}

export interface ModValidationReport {
  id: string;
  modId: string;
  version: string;
  targetPlatform: TargetPlatform;
  timestamp: string;
  durationMs: number;
  errorCount: number;
  warningCount: number;
  canExport: boolean;
  requiresConfirmation: boolean;
  issues: ValidationIssue[];
  checkedFiles: number;
  checkedAssets: number;
  checkedObjects: number;
  currentGameVersion?: string;
  minSupportedGameVersion?: string;
  targetGameVersion?: string;
  modCreatorVersion?: string;
  contentSchemaVersion?: number;
}

export interface BuildDiagnostic {
  level: 'error' | 'warn' | 'info';
  code: string;
  path?: string;
  message: string;
  object?: string;
  property?: string;
  suggestion?: string;
}

export interface BuildPipelineStep {
  step: number;
  label: string;
  status: 'passed' | 'warning' | 'failed' | 'skipped';
  detail: string;
}

export interface PrunedBuildFile {
  path: string;
  reason: 'dev-only' | 'unused-asset' | 'unsupported-format';
}

export interface BuildReport {
  id: string;
  modName: string;
  modId: string;
  version: string;
  targetPlatform: TargetPlatform;
  success: boolean;
  buildStatus: 'passed' | 'passed_with_warnings' | 'blocked';
  packageFileName: string;
  timestamp: string;
  durationMs: number;
  fileCount: number;
  assetCount: number;
  registeredObjectCount: number;
  excludedAssetCount: number;
  estimatedBundleBytes: number;
  packagedBytes: number;
  dependencies: ModDependency[];
  compatibility?: ModCompatibilityInfo;
  warnings: ValidationIssue[];
  diagnostics: BuildDiagnostic[];
  pipelineSteps: BuildPipelineStep[];
  prunedFiles: PrunedBuildFile[];
  packagedPaths: string[];
  validationReport?: ModValidationReport;
}

export interface ProjectBackupRecord {
  id: string;
  modId: string;
  modName: string;
  version: string;
  label: string;
  reason: 'manual' | 'auto' | 'pre-build';
  createdAt: string;
  sizeBytes: number;
  project: ModProject;
}

export interface BuildHistoryEntry {
  id: string;
  modId: string;
  modName: string;
  version: string;
  targetPlatform: TargetPlatform;
  buildStatus: BuildReport['buildStatus'];
  packageFileName: string;
  packagedBytes: number;
  assetCount: number;
  registeredObjectCount: number;
  warningCount: number;
  errorCount: number;
  durationMs: number;
  timestamp: string;
}

export interface EditorSettings {
  language: AppLanguage;
  theme: 'dark' | 'light';
  defaultAuthor: string;
  defaultGameVersion: string;
  defaultTargetPlatform: TargetPlatform;
  viewportGrid: boolean;
  viewportAxes: boolean;
  showShadows: boolean;
  lowPowerMode: boolean;
  autoSave: boolean;
  autoBackupOnBuild: boolean;
  snapToGrid: boolean;
  gridStep: number;
}
