import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Box, Circle } from 'lucide-react';
import { getAssetBlobRecord } from '@/src/core/storage/modRepository';
import { MaterialConfigEntry, ModAsset } from '@/src/types/mod';

interface MaterialPreviewThumbProps {
  material: MaterialConfigEntry;
  assets: ModAsset[];
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const MaterialPreviewThumb: React.FC<MaterialPreviewThumbProps> = ({
  material,
  assets,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState<'sphere' | 'cube'>('sphere');

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sphereMesh: THREE.Mesh;
    cubeMesh: THREE.Mesh;
    stdMat: THREE.MeshStandardMaterial;
    envRt: THREE.WebGLRenderTarget;
    ownedTextures: THREE.Texture[];
    requestRender: () => void;
  } | null>(null);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    let disposed = false;
    const isSoftwareGl = detectSoftwareGl();

    const width = Math.max(180, host.clientWidth || 240);
    const height = Math.max(150, host.clientHeight || 176);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2));
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'w-full h-full block';
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRt = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRt.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 30);
    camera.position.set(1.85, 1.3, 2.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.3;
    controls.maxDistance = 5;
    controls.target.set(0, 0, 0);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(3, 4, 2.5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-3, 1.5, -2.5);
    scene.add(rimLight);

    const sphereGeo = new THREE.SphereGeometry(0.74, isSoftwareGl ? 24 : 40, isSoftwareGl ? 18 : 28);
    if (sphereGeo.attributes.uv && !sphereGeo.attributes.uv2) {
      sphereGeo.setAttribute('uv2', sphereGeo.attributes.uv);
    }
    const cubeGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
    if (cubeGeo.attributes.uv && !cubeGeo.attributes.uv2) {
      cubeGeo.setAttribute('uv2', cubeGeo.attributes.uv);
    }

    const stdMat = new THREE.MeshStandardMaterial({
      color: material.baseColor || '#64748B',
      metalness: material.metallic,
      roughness: material.roughness,
    });

    const sphereMesh = new THREE.Mesh(sphereGeo, stdMat);
    const cubeMesh = new THREE.Mesh(cubeGeo, stdMat);
    cubeMesh.visible = false;
    scene.add(sphereMesh, cubeMesh);

    let rafId: number | null = null;
    const renderFrame = () => {
      rafId = null;
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
    };

    const requestRender = () => {
      if (disposed || rafId !== null) return;
      rafId = window.requestAnimationFrame(renderFrame);
    };

    controls.addEventListener('change', requestRender);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || disposed) return;
      const w = Math.max(120, Math.round(entry.contentRect.width));
      const h = Math.max(120, Math.round(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      requestRender();
    });
    ro.observe(host);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      controls,
      sphereMesh,
      cubeMesh,
      stdMat,
      envRt,
      ownedTextures: [],
      requestRender,
    };
    requestRender();

    return () => {
      disposed = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      const ref = sceneRef.current;
      if (ref) {
        ref.ownedTextures.forEach((t) => t.dispose());
      }
      sphereGeo.dispose();
      cubeGeo.dispose();
      stdMat.dispose();
      envRt.dispose();
      renderer.dispose();
      sceneRef.current = null;
      host.innerHTML = '';
    };
  }, []);

  // Toggle sphere vs cube
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.sphereMesh.visible = shape === 'sphere';
    ctx.cubeMesh.visible = shape === 'cube';
    ctx.requestRender();
  }, [shape]);

  // Sync scalar PBR parameters
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const { stdMat } = ctx;
    stdMat.color.set(material.baseColor || '#64748B');
    stdMat.metalness = THREE.MathUtils.clamp(material.metallic ?? 0.25, 0, 1);
    stdMat.roughness = THREE.MathUtils.clamp(material.roughness ?? 0.55, 0, 1);
    stdMat.emissive.set(material.emissiveColor || '#000000');
    stdMat.emissiveIntensity = Math.max(0, material.emissiveIntensity ?? 0);
    const opacity = THREE.MathUtils.clamp(material.opacity ?? 1, 0, 1);
    const alphaMode =
      material.alphaMode ?? (material.transparent || opacity < 1 ? 'blend' : 'opaque');
    stdMat.opacity = opacity;
    stdMat.transparent = alphaMode === 'blend' || Boolean(material.transparent) || opacity < 1;
    stdMat.alphaTest = alphaMode === 'cutoff' ? (material.alphaCutoff ?? 0.5) : 0;
    stdMat.side = material.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    stdMat.normalScale.set(material.normalScale ?? 1, material.normalScale ?? 1);
    stdMat.aoMapIntensity = THREE.MathUtils.clamp(material.aoIntensity ?? 1, 0, 2);

    const syncUv = (tex: THREE.Texture | null) => {
      if (!tex) return;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(
        Math.max(0.1, material.uvTiling?.x ?? 1),
        Math.max(0.1, material.uvTiling?.y ?? 1)
      );
      tex.offset.set(material.uvOffset?.x ?? 0, material.uvOffset?.y ?? 0);
      tex.needsUpdate = true;
    };
    syncUv(stdMat.map);
    syncUv(stdMat.normalMap);
    syncUv(stdMat.aoMap);
    stdMat.needsUpdate = true;
    ctx.requestRender();
  }, [material]);

  // Sync textures when paths or project assets change
  useEffect(() => {
    let cancelled = false;
    const loadTex = async (
      assetPath: string | undefined,
      colorSpace: THREE.ColorSpace
    ): Promise<THREE.Texture | null> => {
      if (!assetPath?.trim()) return null;
      const asset = assets.find((a) => a.path === assetPath || a.id === assetPath);
      if (!asset?.blobKey) return null;
      const rec = await getAssetBlobRecord(asset.blobKey);
      if (!rec || cancelled) return null;
      const url = URL.createObjectURL(
        new Blob([rec.data], { type: rec.mimeType || 'image/png' })
      );
      try {
        const tex = await new THREE.TextureLoader().loadAsync(url);
        tex.colorSpace = colorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(
          Math.max(0.1, material.uvTiling?.x ?? 1),
          Math.max(0.1, material.uvTiling?.y ?? 1)
        );
        tex.offset.set(material.uvOffset?.x ?? 0, material.uvOffset?.y ?? 0);
        tex.needsUpdate = true;
        return tex;
      } catch {
        return null;
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    (async () => {
      const [albedo, normal, ao] = await Promise.all([
        loadTex(material.albedoTexture, THREE.SRGBColorSpace),
        loadTex(material.normalTexture, THREE.LinearSRGBColorSpace),
        loadTex(material.aoTexture, THREE.LinearSRGBColorSpace),
      ]);
      const ctx = sceneRef.current;
      if (cancelled || !ctx) {
        albedo?.dispose();
        normal?.dispose();
        ao?.dispose();
        return;
      }
      ctx.ownedTextures.forEach((t) => t.dispose());
      ctx.ownedTextures = [];
      if (albedo) ctx.ownedTextures.push(albedo);
      if (normal) ctx.ownedTextures.push(normal);
      if (ao) ctx.ownedTextures.push(ao);

      ctx.stdMat.map = albedo;
      ctx.stdMat.normalMap = normal;
      ctx.stdMat.aoMap = ao;
      ctx.stdMat.needsUpdate = true;
      ctx.requestRender();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    assets,
    material.albedoTexture,
    material.normalTexture,
    material.aoTexture,
    material.uvTiling?.x,
    material.uvTiling?.y,
    material.uvOffset?.x,
    material.uvOffset?.y,
  ]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 bg-slate-900/70">
        <span className="text-[11px] font-semibold text-slate-300">
          3D Material Preview
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShape('sphere')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
              shape === 'sphere'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Circle className="w-3 h-3" />
            Sphere
          </button>
          <button
            type="button"
            onClick={() => setShape('cube')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
              shape === 'cube'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Box className="w-3 h-3" />
            Cube
          </button>
        </div>
      </div>
      <div ref={mountRef} className="w-full h-44 bg-slate-950" />
    </div>
  );
};
