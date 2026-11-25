import { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CapacitorAndroidAdapter } from './capacitorAdapter';
import { detectRuntimePlatform, getPlatformInfo } from './detect';
import { ElectronWindowsAdapter } from './electronAdapter';
import type { PlatformBridge, PlatformInfo } from './types';
import { WebPlatformAdapter } from './webAdapter';

export * from './types';
export {
  APP_ROOT_FOLDER_NAME,
  AndroidAccessDeniedError,
  checkAndroidDirectoryAccess,
  clearAndroidAccessIssue,
  classifyAndroidNativeError,
  createDefaultStorageConfig,
  detectAndroidStorageCapabilities,
  doesOperationRequireRuntimePermission,
  ensureAndroidOperationAccess,
  formatBackupTimestampFolder,
  generateUniqueFilename,
  getAndroidAccessStatus,
  getCurrentAndroidAccessIssue,
  openAndroidAppSettings,
  parseScopedBlobKey,
  reportAndroidAccessError,
  reportAndroidSafRevoked,
  sanitizeFolderSegment,
  subscribeAndroidAccessIssue,
  type AndroidAccessIssue,
  type AndroidAccessOperation,
  type AndroidNativeErrorCode,
  type AndroidStorageAccessStatus,
  type AndroidStorageCapabilities,
  type AndroidStorageCapabilityTier,
} from './androidAccessManager';
export {
  detectFormFactor,
  detectIsTouchPrimary,
  detectRuntimePlatform,
  getPlatformCapabilities,
  getPlatformInfo,
} from './detect';

let cachedAdapter: PlatformBridge | null = null;

export function getPlatformAdapter(): PlatformBridge {
  const detected = detectRuntimePlatform();
  if (cachedAdapter && cachedAdapter.platform === detected) {
    return cachedAdapter;
  }
  if (detected === 'windows') {
    cachedAdapter = new ElectronWindowsAdapter();
  } else if (detected === 'android') {
    cachedAdapter = new CapacitorAndroidAdapter();
  } else {
    cachedAdapter = new WebPlatformAdapter();
  }
  return cachedAdapter;
}

export function usePlatform(): PlatformInfo {
  const [info, setInfo] = useState<PlatformInfo>(() => getPlatformInfo());

  useEffect(() => {
    const update = () => {
      const next = getPlatformInfo();
      setInfo((prev) =>
        prev.platform === next.platform &&
        prev.formFactor === next.formFactor &&
        prev.viewportWidth === next.viewportWidth &&
        prev.viewportHeight === next.viewportHeight &&
        prev.isPortrait === next.isPortrait &&
        prev.isTouchPrimary === next.isTouchPrimary &&
        prev.hasNativeFilesystem === next.hasNativeFilesystem
          ? prev
          : next
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return info;
}

// LIFO Android hardware back-button handler stack
type BackHandler = () => boolean; // return true if handled (prevent default exit)
const backHandlerStack: Array<{ id: number; handler: BackHandler }> = [];
let nextBackId = 1;
let listenerAttached = false;

function ensureCapacitorBackListener(): void {
  if (listenerAttached || typeof window === 'undefined') return;
  try {
    if (!Capacitor.isNativePlatform()) return;
    listenerAttached = true;
    void CapacitorApp.addListener('backButton', () => {
      for (let i = backHandlerStack.length - 1; i >= 0; i--) {
        const entry = backHandlerStack[i];
        if (entry && entry.handler()) {
          return;
        }
      }
      // At root screen: exit app cleanly on Android
      void CapacitorApp.exitApp();
    });
  } catch {
    // Ignore when not running inside Capacitor native shell
  }
}

/**
 * Registers an Android hardware back navigation handler while `active` is true.
 * Handlers run in LIFO order; returning `true` consumes the event.
 */
export function useBackNavigation(handler: BackHandler, active: boolean = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    ensureCapacitorBackListener();
    const id = nextBackId++;
    backHandlerStack.push({
      id,
      handler: () => handlerRef.current(),
    });
    return () => {
      const idx = backHandlerStack.findIndex((entry) => entry.id === id);
      if (idx >= 0) {
        backHandlerStack.splice(idx, 1);
      }
    };
  }, [active]);
}
