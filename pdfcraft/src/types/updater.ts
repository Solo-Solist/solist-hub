/**
 * Types for the In-App Desktop Updater
 */

export type AssetPlatformType =
  | 'windows-portable'
  | 'windows-installer'
  | 'macos-dmg'
  | 'linux-appimage'
  | 'linux-deb'
  | 'source'
  | 'other';

export type HostPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  size: number;
  platformType: AssetPlatformType;
  browserDownloadUrl: string;
  mirrorDownloadUrl?: string;
}

export interface ReleaseInfo {
  tag: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  body: string;
  assets: ReleaseAsset[];
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  release?: ReleaseInfo;
  matchedAssets: {
    primary?: ReleaseAsset;
    secondary?: ReleaseAsset;
    all: ReleaseAsset[];
  };
  error?: string;
}

export interface UpdateSettings {
  autoCheck: boolean;
  checkFrequencyHours: number;
  lastCheckedTimestamp: number;
  ignoredVersions: string[];
}
