import versionMeta from '../../version.json';

export const APP_VERSION: string = versionMeta.version;
export const APP_VERSION_CODE: number = versionMeta.versionCode;
export const APP_DISPLAY_NAME: string = versionMeta.appName;
export const APP_SHORT_NAME: string = versionMeta.shortName;
export const APP_ID: string = versionMeta.appId;

export function getArtifactFileNames(version: string = APP_VERSION) {
  return {
    androidApk: `World-of-Adventure-Mod-Creator-v${version}.apk`,
    windowsPortable: `World-of-Adventure-Mod-Creator-v${version}-Windows-Portable.exe`,
    windowsSetup: `World-of-Adventure-Mod-Creator-v${version}-Windows-Setup.exe`,
  };
}
