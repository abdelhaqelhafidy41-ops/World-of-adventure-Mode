import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { saveAssetBlob } from '@/src/core/storage/modRepository';
import {
  assertSafeLocalAssetSize,
  safeJsonParse,
  sanitizeSafeModId,
} from '@/src/core/security/importGuard';
import { t } from '@/src/i18n';
import {
  ExtractedMaterialInfo,
  ModAsset,
  ModFileNode,
  ModNodeType,
  ModelDimensions,
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

export const SUPPORTED_PACKAGED_ASSET_EXTENSIONS = new Set([
  ...Object.keys(SUPPORTED_IMPORT_FORMATS),
  'woa3d',
]);

export const ACCEPTED_ASSET_INPUT_EXTENSIONS =
  '.glb,.gltf,.obj,.png,.jpg,.jpeg,.wav,.ogg,.mp3';

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function getAssetFormatSpec(filename: string): AssetFormatSpec | null {
  const ext = getFileExtension(filename);
  return SUPPORTED_IMPORT_FORMATS[ext] ?? null;
}

export function isSupportedAssetPath(path: string): boolean {
  const ext = getFileExtension(path);
  return SUPPORTED_PACKAGED_ASSET_EXTENSIONS.has(ext);
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
  const blobKey = `${safeProjectId}/${assetId}`;

  await saveAssetBlob(blobKey, safeBuffer, mimeType);

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
