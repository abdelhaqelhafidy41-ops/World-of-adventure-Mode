import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import {
  CURRENT_MOD_CONTENT_SCHEMA_VERSION,
  isSupportedContentSchemaVersion,
  parseSchemaVersionNumber,
  validateSupportedGameVersion,
} from '@/src/core/api/woaModApiSpec';
import { saveAssetBlob } from '@/src/core/storage/modRepository';
import {
  assertSafeLocalAssetSize,
  safeJsonParse,
  sanitizeSafeModId,
} from '@/src/core/security/importGuard';
import { t } from '@/src/i18n';
import {
  ASSET_MOD_CATEGORIES,
  AssetCollisionConfig,
  AssetMaterialConfig,
  AssetModCategory,
  AssetPresetKind,
  AssetTransform,
  ContentKind,
  ExtractedMaterialInfo,
  ModAsset,
  ModCategory,
  ModFileNode,
  ModNodeType,
  ModelDimensions,
  PivotMode,
} from '@/src/types/mod';

export type SupportedAssetCategory = '3d-model' | 'texture' | 'audio';

export interface AssetFormatSpec {
  ext: string;
  formatLabel: string;
  category: SupportedAssetCategory;
  targetDirectory: 'assets/models' | 'assets/textures' | 'assets/audio';
  nodeType: ModNodeType;
  defaultMime: string;
}

export const SUPPORTED_IMPORT_FORMATS: Record<string, AssetFormatSpec> = {
  glb: {
    ext: 'glb',
    formatLabel: 'GLB',
    category: '3d-model',
    targetDirectory: 'assets/models',
    nodeType: 'asset-3d',
    defaultMime: 'model/gltf-binary',
  },
  gltf: {
    ext: 'gltf',
    formatLabel: 'GLTF',
    category: '3d-model',
    targetDirectory: 'assets/models',
    nodeType: 'asset-3d',
    defaultMime: 'model/gltf+json',
  },
  obj: {
    ext: 'obj',
    formatLabel: 'OBJ',
    category: '3d-model',
    targetDirectory: 'assets/models',
    nodeType: 'asset-3d',
    defaultMime: 'text/plain',
  },
  woa3d: {
    ext: 'woa3d',
    formatLabel: 'WOA3D',
    category: '3d-model',
    targetDirectory: 'assets/models',
    nodeType: 'asset-3d',
    defaultMime: 'application/vnd.woa.model+json',
  },
  png: {
    ext: 'png',
    formatLabel: 'PNG',
    category: 'texture',
    targetDirectory: 'assets/textures',
    nodeType: 'texture',
    defaultMime: 'image/png',
  },
  jpg: {
    ext: 'jpg',
    formatLabel: 'JPG',
    category: 'texture',
    targetDirectory: 'assets/textures',
    nodeType: 'texture',
    defaultMime: 'image/jpeg',
  },
  jpeg: {
    ext: 'jpeg',
    formatLabel: 'JPG',
    category: 'texture',
    targetDirectory: 'assets/textures',
    nodeType: 'texture',
    defaultMime: 'image/jpeg',
  },
  wav: {
    ext: 'wav',
    formatLabel: 'WAV',
    category: 'audio',
    targetDirectory: 'assets/audio',
    nodeType: 'audio',
    defaultMime: 'audio/wav',
  },
  ogg: {
    ext: 'ogg',
    formatLabel: 'OGG',
    category: 'audio',
    targetDirectory: 'assets/audio',
    nodeType: 'audio',
    defaultMime: 'audio/ogg',
  },
  mp3: {
    ext: 'mp3',
    formatLabel: 'MP3',
    category: 'audio',
    targetDirectory: 'assets/audio',
    nodeType: 'audio',
    defaultMime: 'audio/mpeg',
  },
};

export const SUPPORTED_PACKAGED_ASSET_EXTENSIONS = new Set(
  Object.keys(SUPPORTED_IMPORT_FORMATS)
);

export const ACCEPTED_ASSET_INPUT_EXTENSIONS =
  '.glb,.gltf,.obj,.woa3d,.png,.jpg,.jpeg,.wav,.ogg,.mp3';

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function getAssetFormatSpec(filename: string): AssetFormatSpec | null {
  const ext = getFileExtension(filename);
  return SUPPORTED_IMPORT_FORMATS[ext] ?? null;
}

export function getExpectedAssetCategoryForPath(
  assetPath: string
): SupportedAssetCategory | null {
  const lower = assetPath.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  if (lower.startsWith('assets/models/')) return '3d-model';
  if (lower.startsWith('assets/textures/')) return 'texture';
  if (lower.startsWith('assets/audio/') || lower.startsWith('assets/sounds/')) {
    return 'audio';
  }
  return null;
}

export function isAssetInExpectedCategoryDirectory(
  assetPath: string,
  category: SupportedAssetCategory
): boolean {
  return getExpectedAssetCategoryForPath(assetPath) === category;
}

export function isSupportedAssetPath(path: string): boolean {
  const spec = getAssetFormatSpec(path);
  if (!spec) return false;
  const expectedCat = getExpectedAssetCategoryForPath(path);
  return expectedCat === null ? true : expectedCat === spec.category;
}

const VALID_WOA3D_PRESETS = new Set<AssetPresetKind>([
  'relic-sword',
  'crystal-obelisk',
  'frontier-crate',
  'clockwork-sentinel',
  'beacon-pedestal',
]);

const WOA3D_TRIANGLE_BY_PRESET: Record<AssetPresetKind, number> = {
  'relic-sword': 1420,
  'crystal-obelisk': 980,
  'frontier-crate': 640,
  'clockwork-sentinel': 2140,
  'beacon-pedestal': 1180,
};

const VALID_ASSET_MOD_CATEGORY_SET = new Set<string>(ASSET_MOD_CATEGORIES);
const VALID_COLLISION_SHAPES = new Set(['none', 'box', 'sphere', 'capsule']);

const ASSET_MOD_CATEGORY_ALIASES: Record<string, AssetModCategory> = {
  weapon: 'Weapon',
  weapons: 'Weapon',
  sword: 'Weapon',
  blade: 'Weapon',
  axe: 'Weapon',
  bow: 'Weapon',
  staff: 'Weapon',
  item: 'Item',
  items: 'Item',
  armor: 'Item',
  equipment: 'Item',
  consumable: 'Item',
  material: 'Item',
  quest_item: 'Item',
  character: 'Character',
  characters: 'Character',
  player: 'Character',
  npc: 'NPC',
  npcs: 'NPC',
  quest_giver: 'NPC',
  merchant: 'NPC',
  animal: 'Animal',
  animals: 'Animal',
  companion: 'Animal',
  mount: 'Animal',
  monster: 'Monster',
  monsters: 'Monster',
  creature: 'Monster',
  creatures: 'Monster',
  entity: 'Monster',
  entities: 'Monster',
  boss: 'Monster',
  enemy: 'Monster',
  building: 'Building',
  buildings: 'Building',
  structure: 'Building',
  structures: 'Building',
  block: 'Building',
  blocks: 'Building',
  decoration: 'Decoration',
  decorations: 'Decoration',
  prop: 'Decoration',
  props: 'Decoration',
  world_object: 'Decoration',
  biome: 'Decoration',
  biomes: 'Decoration',
};

const PRESET_TO_ASSET_MOD_CATEGORY: Record<AssetPresetKind, AssetModCategory> = {
  'relic-sword': 'Weapon',
  'clockwork-sentinel': 'Monster',
  'frontier-crate': 'Building',
  'crystal-obelisk': 'Decoration',
  'beacon-pedestal': 'Item',
};

export function normalizeAssetModCategory(raw: unknown): AssetModCategory | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (VALID_ASSET_MOD_CATEGORY_SET.has(trimmed)) {
    return trimmed as AssetModCategory;
  }
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  return ASSET_MOD_CATEGORY_ALIASES[normalized] ?? null;
}

export function deriveAssetModCategoryFromContext(options: {
  modCategory?: unknown;
  contentType?: unknown;
  preset?: AssetPresetKind;
  modCategories?: ModCategory[];
  fallback?: AssetModCategory;
}): AssetModCategory {
  const explicit = normalizeAssetModCategory(options.modCategory);
  if (explicit) return explicit;

  const fromContentType = normalizeAssetModCategory(options.contentType);
  if (fromContentType) return fromContentType;

  if (options.preset && PRESET_TO_ASSET_MOD_CATEGORY[options.preset]) {
    return PRESET_TO_ASSET_MOD_CATEGORY[options.preset];
  }

  const modCats = options.modCategories ?? [];
  if (modCats.includes('Weapons')) return 'Weapon';
  if (modCats.includes('Entities')) return 'Monster';
  if (modCats.includes('Blocks')) return 'Building';
  if (modCats.includes('Biomes')) return 'Decoration';
  if (modCats.includes('Items')) return 'Item';

  return options.fallback ?? 'Item';
}

export function getExpectedAssetCategoriesForContentKind(
  kind: ContentKind | 'world_object'
): AssetModCategory[] {
  switch (kind) {
    case 'weapon':
      return ['Weapon'];
    case 'armor':
      return ['Item', 'Character', 'Weapon'];
    case 'npc':
      return ['NPC', 'Character'];
    case 'monster':
      return ['Monster', 'Animal'];
    case 'building':
      return ['Building', 'Decoration'];
    case 'world_object':
      return ['Decoration', 'Building', 'Item'];
    case 'item':
      return ['Item', 'Weapon', 'Decoration'];
    default:
      return [...ASSET_MOD_CATEGORIES];
  }
}

export function getExpectedAssetCategoriesForRegistryCategory(
  rawCategory: unknown
): AssetModCategory[] | null {
  if (typeof rawCategory !== 'string' || !rawCategory.trim()) return null;
  const key = rawCategory.trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (key) {
    case 'weapon':
    case 'weapons':
      return ['Weapon'];
    case 'armor':
      return ['Item', 'Character', 'Weapon'];
    case 'npc':
    case 'npcs':
    case 'character':
    case 'characters':
      return ['NPC', 'Character'];
    case 'monster':
    case 'monsters':
    case 'creature':
    case 'creatures':
    case 'entities':
    case 'entity':
      return ['Monster', 'Animal', 'NPC', 'Character'];
    case 'animal':
    case 'animals':
      return ['Animal', 'Monster'];
    case 'building':
    case 'buildings':
    case 'blocks':
    case 'block':
      return ['Building', 'Decoration'];
    case 'world_object':
    case 'decoration':
    case 'decorations':
    case 'biomes':
    case 'biome':
      return ['Decoration', 'Building', 'Item'];
    case 'item':
    case 'items':
      return ['Item', 'Weapon', 'Decoration'];
    default: {
      const norm = normalizeAssetModCategory(rawCategory);
      return norm ? [norm] : null;
    }
  }
}

const DEFAULT_WOA3D_TRANSFORM: AssetTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

const DEFAULT_WOA3D_MATERIAL: AssetMaterialConfig = {
  color: '#475569',
  accentColor: '#3B82F6',
  roughness: 0.35,
  metalness: 0.65,
  emissiveIntensity: 0.3,
  wireframe: false,
};

const DEFAULT_WOA3D_COLLISION: AssetCollisionConfig = {
  shape: 'box',
  scale: 1,
  offsetY: 0,
};

function isFiniteVec3(val: unknown): val is { x: number; y: number; z: number } {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const rec = val as Record<string, unknown>;
  return (
    typeof rec.x === 'number' &&
    Number.isFinite(rec.x) &&
    typeof rec.y === 'number' &&
    Number.isFinite(rec.y) &&
    typeof rec.z === 'number' &&
    Number.isFinite(rec.z)
  );
}

export interface ParsedWoa3dAsset {
  $schema?: string;
  schemaVersion?: number;
  format: 'WOA3D';
  type: '3d-model';
  category: '3d-model';
  contentType?: string;
  preset: AssetPresetKind;
  rawPreset: string;
  modCategory: AssetModCategory;
  pivotMode: PivotMode;
  collision: AssetCollisionConfig;
  transform: AssetTransform;
  material: AssetMaterialConfig;
  triangleEstimate: number;
}

const VALID_WOA3D_SCHEMAS = new Set([
  'woa.asset3d.v1',
  'woa.asset3d.v2',
  'woa.asset3d.v1.json',
  'woa.asset3d.v2.json',
]);

export function parseAndValidateWoa3dContent(rawText: string): ParsedWoa3dAsset {
  if (!rawText || !rawText.trim()) {
    throw new Error('WOA3D asset file is empty.');
  }

  let parsed: unknown;
  try {
    parsed = safeJsonParse<unknown>(rawText);
  } catch (err) {
    throw new Error(
      `Corrupted WOA3D JSON: ${err instanceof Error ? err.message : 'Invalid JSON'}`
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('WOA3D root payload must be a JSON object.');
  }

  const obj = parsed as Record<string, unknown>;

  let resolvedSchema: string | undefined;
  if (obj.$schema !== undefined) {
    if (typeof obj.$schema !== 'string' || !VALID_WOA3D_SCHEMAS.has(obj.$schema.trim().toLowerCase())) {
      throw new Error(`Unsupported WOA3D $schema: "${String(obj.$schema)}".`);
    }
    resolvedSchema = obj.$schema.trim();
  }

  let resolvedSchemaVersion: number | undefined;
  if (obj.schemaVersion !== undefined) {
    if (!isSupportedContentSchemaVersion(obj.schemaVersion)) {
      throw new Error(
        `Unsupported WOA3D schemaVersion: "${String(obj.schemaVersion)}" (supported: v1, v2).`
      );
    }
    resolvedSchemaVersion = parseSchemaVersionNumber(obj.schemaVersion) ?? undefined;
  } else if (resolvedSchema) {
    const schemaMatch = /\.v(\d+)/i.exec(resolvedSchema);
    if (schemaMatch) {
      resolvedSchemaVersion = Number(schemaMatch[1]);
    }
  }

  if (obj.supportedGameVersion !== undefined) {
    if (typeof obj.supportedGameVersion !== 'string') {
      throw new Error('WOA3D "supportedGameVersion" must be a SemVer string.');
    }
    const verCheck = validateSupportedGameVersion(obj.supportedGameVersion);
    if (!verCheck.valid) {
      throw new Error(
        `Incompatible WOA3D supportedGameVersion "${obj.supportedGameVersion}": ${verCheck.error ?? 'invalid version'}`
      );
    }
  }

  if (obj.minGameVersion !== undefined) {
    if (typeof obj.minGameVersion !== 'string') {
      throw new Error('WOA3D "minGameVersion" must be a SemVer string.');
    }
    const minCheck = validateSupportedGameVersion(obj.minGameVersion);
    if (!minCheck.valid) {
      throw new Error(
        `Incompatible WOA3D minGameVersion "${obj.minGameVersion}": ${minCheck.error ?? 'invalid version'}`
      );
    }
  }

  if (obj.format !== undefined) {
    if (typeof obj.format !== 'string' || obj.format.trim().toUpperCase() !== 'WOA3D') {
      throw new Error(`Invalid WOA3D format field: "${String(obj.format)}".`);
    }
  }

  if (obj.type !== undefined) {
    if (typeof obj.type !== 'string' || obj.type.trim() !== '3d-model') {
      throw new Error(`Incompatible WOA3D asset type: "${String(obj.type)}" (expected "3d-model").`);
    }
  }

  if (obj.category !== undefined) {
    if (typeof obj.category !== 'string' || obj.category.trim() !== '3d-model') {
      throw new Error(
        `Incompatible WOA3D asset category: "${String(obj.category)}" (expected "3d-model").`
      );
    }
  }

  if (typeof obj.preset !== 'string' || !obj.preset.trim() || /[\r\n<>]/.test(obj.preset)) {
    throw new Error('WOA3D definition is missing a valid geometry "preset".');
  }
  const rawPreset = obj.preset.trim();
  const preset: AssetPresetKind = VALID_WOA3D_PRESETS.has(rawPreset as AssetPresetKind)
    ? (rawPreset as AssetPresetKind)
    : 'beacon-pedestal';

  let resolvedContentType: string | undefined;
  if (obj.contentType !== undefined) {
    if (typeof obj.contentType === 'string' && obj.contentType.trim()) {
      resolvedContentType = obj.contentType.trim();
    }
  }

  let modCategory: AssetModCategory;
  if (obj.modCategory !== undefined) {
    const normalizedModCat = normalizeAssetModCategory(obj.modCategory);
    if (!normalizedModCat) {
      throw new Error(
        `Incompatible WOA3D modCategory "${String(obj.modCategory)}" (wrong_category: expected one of ${ASSET_MOD_CATEGORIES.join(', ')}).`
      );
    }
    modCategory = normalizedModCat;
  } else {
    modCategory = deriveAssetModCategoryFromContext({
      contentType: resolvedContentType,
      preset,
    });
  }

  const pivotMode: PivotMode =
    obj.pivotMode === 'center' || obj.pivotMode === 'bottom-center'
      ? obj.pivotMode
      : 'bottom-center';

  let collision: AssetCollisionConfig = { ...DEFAULT_WOA3D_COLLISION };
  if (obj.collision !== undefined) {
    if (!obj.collision || typeof obj.collision !== 'object' || Array.isArray(obj.collision)) {
      throw new Error('WOA3D "collision" field must be an object.');
    }
    const c = obj.collision as Record<string, unknown>;
    collision = {
      shape:
        typeof c.shape === 'string' && VALID_COLLISION_SHAPES.has(c.shape)
          ? (c.shape as AssetCollisionConfig['shape'])
          : DEFAULT_WOA3D_COLLISION.shape,
      scale:
        typeof c.scale === 'number' && Number.isFinite(c.scale) && c.scale > 0
          ? c.scale
          : DEFAULT_WOA3D_COLLISION.scale,
      offsetY:
        typeof c.offsetY === 'number' && Number.isFinite(c.offsetY)
          ? c.offsetY
          : DEFAULT_WOA3D_COLLISION.offsetY,
    };
  }

  let transform: AssetTransform = {
    position: { ...DEFAULT_WOA3D_TRANSFORM.position },
    rotation: { ...DEFAULT_WOA3D_TRANSFORM.rotation },
    scale: { ...DEFAULT_WOA3D_TRANSFORM.scale },
  };
  if (obj.transform !== undefined) {
    if (!obj.transform || typeof obj.transform !== 'object' || Array.isArray(obj.transform)) {
      throw new Error('WOA3D "transform" field must be an object.');
    }
    const tr = obj.transform as Record<string, unknown>;
    if (tr.position !== undefined && !isFiniteVec3(tr.position)) {
      throw new Error('WOA3D "transform.position" must have numeric x, y, z coordinates.');
    }
    if (tr.rotation !== undefined && !isFiniteVec3(tr.rotation)) {
      throw new Error('WOA3D "transform.rotation" must have numeric x, y, z angles.');
    }
    if (tr.scale !== undefined && !isFiniteVec3(tr.scale)) {
      throw new Error('WOA3D "transform.scale" must have numeric x, y, z values.');
    }
    transform = {
      position: isFiniteVec3(tr.position) ? { ...tr.position } : transform.position,
      rotation: isFiniteVec3(tr.rotation) ? { ...tr.rotation } : transform.rotation,
      scale: isFiniteVec3(tr.scale) ? { ...tr.scale } : transform.scale,
    };
  }

  let material: AssetMaterialConfig = { ...DEFAULT_WOA3D_MATERIAL };
  if (obj.material !== undefined) {
    if (!obj.material || typeof obj.material !== 'object' || Array.isArray(obj.material)) {
      throw new Error('WOA3D "material" field must be an object.');
    }
    const mat = obj.material as Record<string, unknown>;
    material = {
      color: typeof mat.color === 'string' && mat.color.trim() ? mat.color.trim() : material.color,
      accentColor:
        typeof mat.accentColor === 'string' && mat.accentColor.trim()
          ? mat.accentColor.trim()
          : material.accentColor,
      roughness:
        typeof mat.roughness === 'number' && Number.isFinite(mat.roughness)
          ? mat.roughness
          : material.roughness,
      metalness:
        typeof mat.metalness === 'number' && Number.isFinite(mat.metalness)
          ? mat.metalness
          : material.metalness,
      emissiveIntensity:
        typeof mat.emissiveIntensity === 'number' && Number.isFinite(mat.emissiveIntensity)
          ? mat.emissiveIntensity
          : material.emissiveIntensity,
      wireframe: typeof mat.wireframe === 'boolean' ? mat.wireframe : material.wireframe,
    };
  }

  return {
    ...(resolvedSchema ? { $schema: resolvedSchema } : {}),
    ...(resolvedSchemaVersion !== undefined ? { schemaVersion: resolvedSchemaVersion } : {}),
    format: 'WOA3D',
    type: '3d-model',
    category: '3d-model',
    ...(resolvedContentType ? { contentType: resolvedContentType } : {}),
    preset,
    rawPreset,
    modCategory,
    pivotMode,
    collision,
    transform,
    material,
    triangleEstimate: WOA3D_TRIANGLE_BY_PRESET[preset] ?? 1180,
  };
}

export function serializeWoa3dAsset(
  asset: Pick<
    ModAsset,
    'format' | 'preset' | 'modCategory' | 'pivotMode' | 'collision' | 'transform' | 'material'
  > & { schemaVersion?: number; $schema?: string }
): string {
  const schemaVersion =
    asset.schemaVersion ??
    (asset.$schema?.toLowerCase().includes('.v1') ? 1 : CURRENT_MOD_CONTENT_SCHEMA_VERSION);
  const schemaId =
    asset.$schema ??
    (schemaVersion === 1 ? 'woa.asset3d.v1' : 'woa.asset3d.v2');
  const resolvedModCategory = deriveAssetModCategoryFromContext({
    modCategory: asset.modCategory,
    preset: asset.preset,
  });

  return JSON.stringify(
    {
      $schema: schemaId,
      schemaVersion,
      format: asset.format || 'WOA3D',
      type: '3d-model',
      category: '3d-model',
      preset: asset.preset ?? 'beacon-pedestal',
      modCategory: resolvedModCategory,
      pivotMode: asset.pivotMode ?? 'bottom-center',
      collision: asset.collision ?? DEFAULT_WOA3D_COLLISION,
      transform: asset.transform,
      material: asset.material,
    },
    null,
    2
  );
}

export function sanitizeFileName(rawName: string, ext: string): string {
  const base = rawName
    .replace(/\.[^.]+$/, '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'asset';
  return `${base}.${ext}`;
}

export function getUniqueAssetPath(
  dir: string,
  desiredFileName: string,
  existingPaths: string[]
): { fileName: string; path: string } {
  const ext = getFileExtension(desiredFileName);
  const stem = desiredFileName.replace(/\.[^.]+$/, '');
  const used = new Set(existingPaths.map((p) => p.toLowerCase()));

  let candidate = desiredFileName;
  let counter = 1;
  while (used.has(`${dir}/${candidate}`.toLowerCase())) {
    candidate = `${stem}_${counter}.${ext}`;
    counter++;
  }
  return { fileName: candidate, path: `${dir}/${candidate}` };
}

export function extractModelStats(object: THREE.Object3D): {
  dimensions: ModelDimensions;
  triangleEstimate: number;
  materials: ExtractedMaterialInfo[];
  meshCount: number;
} {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  if (!box.isEmpty()) {
    box.getSize(size);
  }

  let triangles = 0;
  let meshCount = 0;
  const matMap = new Map<string, ExtractedMaterialInfo>();

  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++;
      const geo = child.geometry as THREE.BufferGeometry | undefined;
      if (geo) {
        if (geo.index) {
          triangles += Math.round(geo.index.count / 3);
        } else {
          const pos = geo.getAttribute('position');
          if (pos) {
            triangles += Math.round(pos.count / 3);
          }
        }
      }

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m, idx) => {
        if (!m) return;
        const std = m as THREE.MeshStandardMaterial;
        const name = m.name?.trim() || `Material_${matMap.size + 1 + idx}`;
        const colorHex =
          std.color instanceof THREE.Color ? `#${std.color.getHexString()}` : '#94a3b8';
        const key = `${name}_${m.type}_${colorHex}`;
        if (!matMap.has(key)) {
          matMap.set(key, {
            name,
            type: m.type.replace('Mesh', '').replace('Material', '') || 'Standard',
            color: colorHex,
            roughness:
              typeof std.roughness === 'number'
                ? Number(std.roughness.toFixed(2))
                : undefined,
            metalness:
              typeof std.metalness === 'number'
                ? Number(std.metalness.toFixed(2))
                : undefined,
            hasTexture: Boolean(std.map || std.normalMap || std.roughnessMap),
          });
        }
      });
    }
  });

  return {
    dimensions: {
      width: Number(size.x.toFixed(2)),
      height: Number(size.y.toFixed(2)),
      depth: Number(size.z.toFixed(2)),
    },
    triangleEstimate: triangles,
    materials: Array.from(matMap.values()),
    meshCount,
  };
}

function disposeParsedObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m) return;
        const anyMat = m as unknown as Record<string, unknown>;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
          const tex = anyMat[key];
          if (tex && typeof (tex as THREE.Texture).dispose === 'function') {
            (tex as THREE.Texture).dispose();
          }
        }
        m.dispose();
      });
    }
  });
}

export async function inspect3DBuffer(
  buffer: ArrayBuffer,
  ext: string
): Promise<{
  dimensions: ModelDimensions;
  triangleEstimate: number;
  materials: ExtractedMaterialInfo[];
  meshCount: number;
}> {
  if (ext === 'obj') {
    const text = new TextDecoder().decode(buffer);
    const loader = new OBJLoader();
    const obj = loader.parse(text);
    const stats = extractModelStats(obj);
    disposeParsedObject(obj);
    return stats;
  }

  const loader = new GLTFLoader();
  let parseInput: ArrayBuffer | string;
  if (ext === 'gltf') {
    const rawText = new TextDecoder().decode(buffer);
    // Strip any prototype-polluting keys from untrusted GLTF JSON
    parseInput = JSON.stringify(safeJsonParse(rawText));
  } else {
    parseInput = buffer.slice(0);
  }

  return await new Promise((resolve, reject) => {
    loader.parse(
      parseInput,
      '',
      (gltf) => {
        const stats = extractModelStats(gltf.scene);
        disposeParsedObject(gltf.scene);
        resolve(stats);
      },
      (err) => {
        reject(err instanceof Error ? err : new Error(t('core.assetParseFailed')));
      }
    );
  });
}

export async function inspectImageBlob(
  blob: Blob
): Promise<{ width: number; height: number }> {
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const res = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(res);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

export async function inspectAudioBlob(blob: Blob): Promise<number> {
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(0);
    }, 2000);

    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      const duration = Number.isFinite(audio.duration)
        ? Number(audio.duration.toFixed(2))
        : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
}

export async function importLocalAssetFile(
  projectId: string,
  file: File,
  existingPaths: string[],
  replaceAsset?: ModAsset
): Promise<{ asset: ModAsset; fileNode: ModFileNode }> {
  assertSafeLocalAssetSize(file.name, file.size);
  const spec = getAssetFormatSpec(file.name);
  if (!spec) {
    throw new Error(t('core.assetUnsupportedFormat', { filename: file.name }));
  }

  // Create a clean project-local binary copy so the user's original file is never touched
  const buffer = await file.arrayBuffer();
  assertSafeLocalAssetSize(file.name, buffer.byteLength);
  const safeBuffer = buffer.slice(0);
  const mimeType = file.type || spec.defaultMime;
  const now = new Date().toISOString();

  const safeProjectId = sanitizeSafeModId(projectId);
  const assetId = replaceAsset?.id ?? `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const sanitizedName = sanitizeFileName(file.name, spec.ext);
  let targetFileName = sanitizedName;
  let targetPath = `${spec.targetDirectory}/${sanitizedName}`;

  if (replaceAsset) {
    const otherPaths = existingPaths.filter((p) => p !== replaceAsset.path);
    const unique = getUniqueAssetPath(spec.targetDirectory, sanitizedName, otherPaths);
    targetFileName = unique.fileName;
    targetPath = unique.path;
  } else {
    const unique = getUniqueAssetPath(spec.targetDirectory, sanitizedName, existingPaths);
    targetFileName = unique.fileName;
    targetPath = unique.path;
  }

  const displayName =
    replaceAsset?.name ??
    (file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || targetFileName);

  if (spec.ext === 'woa3d') {
    const rawText = new TextDecoder().decode(safeBuffer);
    const parsedWoa3d = parseAndValidateWoa3dContent(rawText);
    const resolvedSchemaVersion =
      parsedWoa3d.schemaVersion ?? CURRENT_MOD_CONTENT_SCHEMA_VERSION;
    const serialized = serializeWoa3dAsset({
      $schema:
        parsedWoa3d.$schema ??
        (resolvedSchemaVersion === 1 ? 'woa.asset3d.v1' : 'woa.asset3d.v2'),
      schemaVersion: resolvedSchemaVersion,
      format: 'WOA3D',
      preset: parsedWoa3d.preset,
      modCategory: replaceAsset?.modCategory ?? parsedWoa3d.modCategory,
      pivotMode: replaceAsset?.pivotMode ?? parsedWoa3d.pivotMode,
      collision: replaceAsset?.collision ?? parsedWoa3d.collision,
      transform: parsedWoa3d.transform,
      material: parsedWoa3d.material,
    });

    const asset: ModAsset = {
      id: assetId,
      name: displayName,
      path: targetPath,
      type: '3d-model',
      modCategory: replaceAsset?.modCategory ?? parsedWoa3d.modCategory,
      preset: parsedWoa3d.preset,
      originalFileName: file.name,
      isImported: false,
      format: spec.formatLabel,
      sizeBytes: serialized.length,
      triangleEstimate: parsedWoa3d.triangleEstimate,
      pivotMode: replaceAsset?.pivotMode ?? parsedWoa3d.pivotMode,
      collision: replaceAsset?.collision ?? parsedWoa3d.collision,
      transform: parsedWoa3d.transform,
      material: parsedWoa3d.material,
      metadata: {
        source: 'woa3d-import',
        originalFile: file.name,
      },
      createdAt: replaceAsset?.createdAt ?? now,
      updatedAt: now,
    };

    const fileNode: ModFileNode = {
      id: `file_${assetId}`,
      name: targetFileName,
      path: targetPath,
      parentPath: spec.targetDirectory,
      type: spec.nodeType,
      content: serialized,
      assetId,
      updatedAt: now,
    };

    return { asset, fileNode };
  }

  const blobKey = `${safeProjectId}/${assetId}`;
  await saveAssetBlob(blobKey, safeBuffer, mimeType);

  let dimensions: ModAsset['dimensions'];
  let triangleEstimate = 0;
  let extractedMaterials: ExtractedMaterialInfo[] | undefined;
  let resolution: ModAsset['resolution'];
  let durationSeconds: number | undefined;
  let meshCount = 0;

  if (spec.category === '3d-model') {
    const stats = await inspect3DBuffer(safeBuffer, spec.ext);
    dimensions = stats.dimensions;
    triangleEstimate = stats.triangleEstimate;
    extractedMaterials = stats.materials;
    meshCount = stats.meshCount;
  } else if (spec.category === 'texture') {
    const blob = new Blob([safeBuffer], { type: mimeType });
    resolution = await inspectImageBlob(blob);
  } else if (spec.category === 'audio') {
    const blob = new Blob([safeBuffer], { type: mimeType });
    durationSeconds = await inspectAudioBlob(blob);
  }

  const asset: ModAsset = {
    id: assetId,
    name: displayName,
    path: targetPath,
    type: spec.category,
    modCategory: replaceAsset?.modCategory ?? 'Item',
    blobKey,
    mimeType,
    originalFileName: file.name,
    isImported: true,
    format: spec.formatLabel,
    sizeBytes: safeBuffer.byteLength,
    triangleEstimate,
    dimensions,
    resolution,
    durationSeconds,
    extractedMaterials,
    pivotMode: replaceAsset?.pivotMode ?? 'bottom-center',
    collision: replaceAsset?.collision ?? { shape: 'box', scale: 1, offsetY: 0 },
    transform: replaceAsset?.transform ?? {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: replaceAsset?.material ?? {
      color: extractedMaterials?.[0]?.color ?? '#64748B',
      accentColor: '#3B82F6',
      roughness: extractedMaterials?.[0]?.roughness ?? 0.45,
      metalness: extractedMaterials?.[0]?.metalness ?? 0.35,
      emissiveIntensity: 0.25,
      wireframe: false,
    },
    metadata: {
      source: 'local-import',
      originalFile: file.name,
      meshes: meshCount,
      localCopyStored: true,
    },
    createdAt: replaceAsset?.createdAt ?? now,
    updatedAt: now,
  };

  const fileNode: ModFileNode = {
    id: `file_${assetId}`,
    name: targetFileName,
    path: targetPath,
    parentPath: spec.targetDirectory,
    type: spec.nodeType,
    assetId,
    updatedAt: now,
  };

  return { asset, fileNode };
}
