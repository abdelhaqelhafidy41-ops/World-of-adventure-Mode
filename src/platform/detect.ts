import { Capacitor } from '@capacitor/core';
import type {
  DeviceFormFactor,
  PlatformCapabilities,
  PlatformInfo,
  RuntimePlatform,
} from './types';

export function detectRuntimePlatform(): RuntimePlatform {
  if (typeof window !== 'undefined') {
    if (window.woaDesktop?.platform === 'windows') {
      return 'windows';
    }
    try {
      if (Capacitor.isNativePlatform()) {
        const capPlatform = Capacitor.getPlatform();
        if (capPlatform === 'android') {
          return 'android';
        }
      }
    } catch {
      // Fallback safely in non-Capacitor contexts
    }
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      // Capacitor WebView fallback check
      if (/Capacitor/i.test(ua) && /Android/i.test(ua)) {
        return 'android';
      }
    }
  }
  return 'web';
}

export function detectIsTouchPrimary(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
    const hasTouch = 'ontouchstart' in window || (navigator?.maxTouchPoints ?? 0) > 0;
    return coarse || (noHover && hasTouch);
  } catch {
    return false;
  }
}

export function detectFormFactor(
  viewportWidth: number,
  platform: RuntimePlatform,
  isTouchPrimary: boolean
): DeviceFormFactor {
  if (platform === 'windows') {
    return 'desktop';
  }
  if (viewportWidth < 768) {
    return 'phone';
  }
  if (viewportWidth < 1100 && (platform === 'android' || isTouchPrimary)) {
    return 'tablet';
  }
  if (platform === 'android') {
    return viewportWidth >= 768 ? 'tablet' : 'phone';
  }
  return viewportWidth < 1024 && isTouchPrimary ? 'tablet' : 'desktop';
}

export function getPlatformCapabilities(
  platform: RuntimePlatform = detectRuntimePlatform()
): PlatformCapabilities {
  const isTouchPrimary = detectIsTouchPrimary();

  if (platform === 'windows') {
    return {
      platform: 'windows',
      hasNativeFilesystem: true,
      hasNativeDialogs: true,
      hasStorageAccessFramework: false,
      hasDragAndDrop: true,
      hasKeyboardShortcuts: true,
      hasWindowControls: true,
      supportsHardwareBack: false,
      supportsShareSheet: false,
      isTouchPrimary,
    };
  }

  if (platform === 'android') {
    return {
      platform: 'android',
      hasNativeFilesystem: true,
      hasNativeDialogs: true,
      hasStorageAccessFramework: true,
      hasDragAndDrop: false,
      hasKeyboardShortcuts: false,
      hasWindowControls: false,
      supportsHardwareBack: true,
      supportsShareSheet: true,
      isTouchPrimary: true,
    };
  }

  const hasWebFsAccess =
    typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';

  return {
    platform: 'web',
    hasNativeFilesystem: hasWebFsAccess,
    hasNativeDialogs: hasWebFsAccess,
    hasStorageAccessFramework: false,
    hasDragAndDrop: !isTouchPrimary,
    hasKeyboardShortcuts: !isTouchPrimary,
    hasWindowControls: false,
    supportsHardwareBack: false,
    supportsShareSheet:
      typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    isTouchPrimary,
  };
}

export function getPlatformInfo(): PlatformInfo {
  const platform = detectRuntimePlatform();
  const caps = getPlatformCapabilities(platform);
  const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const height = typeof window !== 'undefined' ? window.innerHeight : 800;
  const formFactor = detectFormFactor(width, platform, caps.isTouchPrimary);

  return {
    ...caps,
    formFactor,
    viewportWidth: width,
    viewportHeight: height,
    isPortrait: height >= width,
  };
}
