import { ModAsset, ModProject } from '@/src/types/mod';

export interface ProfilerIssue {
  id: string;
  level: 'warn' | 'error' | 'info';
  code: string;
  assetId?: string;
  title: string;
  detail: string;
  recommendation: string;
}

export interface ModPerformanceProfile {
  totalTriangles: number;
  modelCount: number;
  textureCount: number;
  audioCount: number;
  estimatedVramBytes: number;
  uncompressedBytes: number;
  estimatedPackageBytes: number;
  unusedAssetIds: string[];
  highPolyAssets: ModAsset[];
  oversizedTextureAssets: ModAsset[];
  androidMemoryRisk: 'low' | 'moderate' | 'high';
  recommendations: ProfilerIssue[];
}

export function profileModProject(
  project: ModProject,
  referencedAssetPaths: Set<string>
): ModPerformanceProfile {
  let totalTriangles = 0;
  let modelCount = 0;
  let textureCount = 0;
  let audioCount = 0;
  let estimatedVramBytes = 0;
  let uncompressedBytes = 0;

  const highPolyAssets: ModAsset[] = [];
  const oversizedTextureAssets: ModAsset[] = [];
  const unusedAssetIds: string[] = [];
  const recommendations: ProfilerIssue[] = [];

  for (const asset of project.assets) {
    uncompressedBytes += asset.sizeBytes || 0;

    if (!referencedAssetPaths.has(asset.path)) {
      unusedAssetIds.push(asset.id);
    }

    if (asset.type === '3d-model') {
      modelCount++;
      const tris = asset.triangleEstimate || 0;
      totalTriangles += tris;
      estimatedVramBytes += tris * 64;
      if (tris > 25000) {
        highPolyAssets.push(asset);
        recommendations.push({
          id: `prof_poly_${asset.id}`,
          level: tris > 60000 ? 'error' : 'warn',
          code: 'HIGH_POLY_MODEL',
          assetId: asset.id,
          title: `${asset.name} (${tris.toLocaleString()} tris)`,
          detail: `Exceeds mobile-friendly 25k triangle budget per mesh.`,
          recommendation: `Decimate geometry or enable lower LOD levels before shipping to Android.`,
        });
      }
    } else if (asset.type === 'texture') {
      textureCount++;
      const w = asset.resolution?.width ?? 512;
      const h = asset.resolution?.height ?? 512;
      estimatedVramBytes += w * h * 4 * 1.33; // RGBA + mipmaps estimate
      if (w > 2048 || h > 2048 || asset.sizeBytes > 6 * 1024 * 1024) {
        oversizedTextureAssets.push(asset);
        recommendations.push({
          id: `prof_tex_${asset.id}`,
          level: w > 4096 || h > 4096 ? 'error' : 'warn',
          code: 'OVERSIZED_TEXTURE',
          assetId: asset.id,
          title: `${asset.name} (${w}x${h})`,
          detail: `Large texture increases GPU VRAM usage significantly on mobile GPUs.`,
          recommendation: `Downscale texture to 1024x1024 or 2048x2048 for balanced sharpness and memory.`,
        });
      }
    } else if (asset.type === 'audio') {
      audioCount++;
      if (asset.sizeBytes > 8 * 1024 * 1024) {
        recommendations.push({
          id: `prof_aud_${asset.id}`,
          level: 'warn',
          code: 'LARGE_AUDIO_FILE',
          assetId: asset.id,
          title: asset.name,
          detail: `Uncompressed or long audio asset (${(asset.sizeBytes / (1024 * 1024)).toFixed(1)} MB).`,
          recommendation: `Use OGG Vorbis or MP3 compression for ambience and music tracks.`,
        });
      }
    }
  }

  for (const file of project.files) {
    if (file.content) {
      uncompressedBytes += file.content.length;
    }
  }

  if (unusedAssetIds.length > 0) {
    recommendations.push({
      id: 'prof_unused_assets',
      level: 'info',
      code: 'UNUSED_ASSETS',
      title: `${unusedAssetIds.length} unused asset(s)`,
      detail: `Imported assets not referenced by items, weapons, buildings, prefabs, or world maps.`,
      recommendation: `Remove unused assets or bind them to content definitions to keep .woamod lean.`,
    });
  }

  const estimatedPackageBytes = Math.round(uncompressedBytes * 0.68);
  const vramMb = estimatedVramBytes / (1024 * 1024);
  const androidMemoryRisk =
    vramMb > 180 || totalTriangles > 160000
      ? 'high'
      : vramMb > 75 || totalTriangles > 60000
        ? 'moderate'
        : 'low';

  return {
    totalTriangles,
    modelCount,
    textureCount,
    audioCount,
    estimatedVramBytes: Math.round(estimatedVramBytes),
    uncompressedBytes,
    estimatedPackageBytes,
    unusedAssetIds,
    highPolyAssets,
    oversizedTextureAssets,
    androidMemoryRisk,
    recommendations,
  };
}
