import type { CapacitorConfig } from '@capacitor/cli';
import fs from 'node:fs';
import path from 'node:path';

const versionMeta = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'version.json'), 'utf8')
) as {
  appId: string;
  appName: string;
};

const config: CapacitorConfig = {
  appId: versionMeta.appId,
  appName: versionMeta.appName,
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
