'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Package,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { UpdateCheckResult, ReleaseAsset } from '@/types/updater';
import { ignoreVersion, GITHUB_REPO } from '@/lib/updater';
import { openExternalUrl } from '@/lib/tauri-bridge';

export interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: UpdateCheckResult | null;
  loading: boolean;
  onRetry: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  result,
  loading,
  onRetry,
}) => {
  const t = useTranslations('common');
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<{
    status: 'opening' | 'success' | 'failed';
    text: string;
  } | null>(null);

  const getMsg = (
    key: string,
    fallback: string,
    values?: Record<string, string | number>
  ): string => {
    try {
      const fullKey = `updater.${key}`;
      const msg = t(fullKey as any, values as any);
      if (
        msg &&
        !msg.startsWith('common.') &&
        !msg.startsWith('updater.') &&
        !msg.includes(`.${key}`) &&
        msg !== fullKey &&
        msg !== key
      ) {
        return msg;
      }
    } catch {
      // fallback
    }
    if (values) {
      let res = fallback;
      for (const [k, v] of Object.entries(values)) {
        res = res.replace(`{${k}}`, String(v));
      }
      return res;
    }
    return fallback;
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `(${mb.toFixed(1)} MB)`;
  };

  const getAssetLabel = (asset: ReleaseAsset): string => {
    switch (asset.platformType) {
      case 'windows-portable':
        return getMsg('downloadPortable', 'Windows 便携版 (ZIP)');
      case 'windows-installer':
        return getMsg('downloadInstaller', 'Windows 安装包 (.exe / .msi)');
      case 'macos-dmg':
        return getMsg('downloadMac', 'macOS 安装包 (.dmg)');
      case 'linux-appimage':
        return getMsg('downloadAppImage', 'Linux AppImage (便携版)');
      case 'linux-deb':
        return getMsg('downloadDeb', 'Linux Debian 安装包 (.deb)');
      default:
        return asset.name;
    }
  };

  const handleDownload = async (asset: ReleaseAsset, useMirror = false) => {
    const url = useMirror && asset.mirrorDownloadUrl ? asset.mirrorDownloadUrl : asset.browserDownloadUrl;
    setDownloadNotice({
      status: 'opening',
      text: getMsg('openingBrowser', '正在打开系统浏览器...'),
    });

    const success = await openExternalUrl(url);
    if (success) {
      setDownloadNotice({
        status: 'success',
        text: getMsg(
          'downloadStartedNotice',
          '已唤起浏览器开始下载！若未自动弹出，可点击右侧按钮复制直链并在浏览器中粘贴。'
        ),
      });
    } else {
      setDownloadNotice({
        status: 'failed',
        text: getMsg(
          'downloadFailedNotice',
          '无法自动打开浏览器，请点击复制按钮手动在浏览器中粘贴下载。'
        ),
      });
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2500);
      setDownloadNotice({
        status: 'success',
        text: getMsg('linkCopied', '下载链接已复制到剪贴板！'),
      });
    } catch {
      // fallback
    }
  };

  const handleOpenGitHub = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const url = result?.release?.htmlUrl || `https://github.com/${GITHUB_REPO}/releases`;
    openExternalUrl(url);
  };

  const handleSkipVersion = () => {
    if (result?.latestVersion) {
      ignoreVersion(result.latestVersion);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getMsg('title', '软件更新')}
      size="lg"
    >
      <div className="space-y-5 py-2">
        {/* State: Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <RefreshCw className="h-9 w-9 animate-spin text-[hsl(var(--color-primary))]" />
            <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
              {getMsg('checking', '正在检查更新...')}
            </p>
          </div>
        )}

        {/* State: Error */}
        {!loading && result?.error && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-[hsl(var(--color-foreground))]">
                {getMsg('errorTitle', '无法检查更新')}
              </h3>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))] max-w-sm">
                {result.error}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                {getMsg('retry', '重试')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="gap-1.5"
                onClick={handleOpenGitHub}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{getMsg('viewOnGithub', '前往 GitHub 查看')}</span>
              </Button>
            </div>
          </div>
        )}

        {/* State: Up to date */}
        {!loading && !result?.error && !result?.hasUpdate && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-[hsl(var(--color-foreground))]">
                {getMsg('latest', 'You are up to date!')}
              </h3>
              <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {getMsg(
                  'latestDesc',
                  'PDFCraft is currently at the latest version ({version}).',
                  { version: result?.currentVersion || '' }
                )}
              </p>
            </div>
            <div className="pt-2">
              <Button variant="primary" size="sm" onClick={onClose}>
                {getMsg('close', 'Close')}
              </Button>
            </div>
          </div>
        )}

        {/* State: Update available */}
        {!loading && !result?.error && result?.hasUpdate && (
          <div className="space-y-5">
            {/* Version banner */}
            <div className="flex items-start gap-4 rounded-xl border border-[hsl(var(--color-primary))/0.25] bg-[hsl(var(--color-primary))/0.05] p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--color-primary))] text-white shadow-md">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[hsl(var(--color-foreground))] text-base">
                    {getMsg('available', 'New Version Available')}
                  </h3>
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {result.latestVersion}
                  </span>
                  {result.release?.publishedAt && (
                    <span className="text-[11px] text-[hsl(var(--color-muted-foreground))]">
                      ({getMsg('released', 'Released')}:{' '}
                      {new Date(result.release.publishedAt).toLocaleDateString()})
                    </span>
                  )}
                </div>
                <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                  {getMsg('currentVersion', 'Current')}:{' '}
                  <span className="font-mono">{result.currentVersion}</span>
                </p>
              </div>
            </div>

            {/* Release Notes */}
            {result.release?.body && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--color-muted-foreground))]">
                  {getMsg('releaseNotes', 'Release Notes')}
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-muted))/0.3] p-3 text-xs text-[hsl(var(--color-foreground))] whitespace-pre-wrap font-sans leading-relaxed">
                  {result.release.body}
                </div>
              </div>
            )}

            {/* Download Actions */}
            <div className="space-y-2.5 pt-1">
              {result.matchedAssets.primary && (
                <div className="flex items-stretch gap-2">
                  <Button
                    variant="primary"
                    className="flex-1 justify-center gap-2 py-5 text-sm font-semibold shadow-md shadow-primary/20"
                    onClick={() => handleDownload(result.matchedAssets.primary!)}
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span>{getAssetLabel(result.matchedAssets.primary)}</span>
                    <span className="opacity-75 font-normal text-xs">
                      {formatFileSize(result.matchedAssets.primary.size)}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-3 shrink-0 flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300 transition-colors"
                    title={getMsg('copyLink', '复制链接')}
                    onClick={() => handleCopyLink(result.matchedAssets.primary!.browserDownloadUrl)}
                  >
                    {copiedUrl === result.matchedAssets.primary!.browserDownloadUrl ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-[hsl(var(--color-muted-foreground))]" />
                    )}
                  </Button>
                </div>
              )}

              {result.matchedAssets.secondary && (
                <div className="flex items-stretch gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 justify-center gap-2 py-4 text-xs font-medium"
                    onClick={() => handleDownload(result.matchedAssets.secondary!)}
                  >
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    <span>{getAssetLabel(result.matchedAssets.secondary)}</span>
                    <span className="opacity-75 font-mono text-[11px]">
                      {formatFileSize(result.matchedAssets.secondary.size)}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-3 shrink-0 border border-[hsl(var(--color-border))] flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                    title={getMsg('copyLink', '复制链接')}
                    onClick={() => handleCopyLink(result.matchedAssets.secondary!.browserDownloadUrl)}
                  >
                    {copiedUrl === result.matchedAssets.secondary!.browserDownloadUrl ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-[hsl(var(--color-muted-foreground))]" />
                    )}
                  </Button>
                </div>
              )}

              {/* Status Notice */}
              {downloadNotice && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200 ${
                    downloadNotice.status === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : downloadNotice.status === 'failed'
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
                      : 'bg-[hsl(var(--color-primary)/0.08)] text-[hsl(var(--color-primary))] border border-[hsl(var(--color-primary)/0.2)]'
                  }`}
                >
                  {downloadNotice.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : downloadNotice.status === 'failed' ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-[hsl(var(--color-primary))]" />
                  )}
                  <span className="flex-1 leading-snug">{downloadNotice.text}</span>
                </div>
              )}

              {/* Fast mirror option */}
              {result.matchedAssets.primary?.mirrorDownloadUrl && (
                <div className="flex items-center justify-center gap-3 pt-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleDownload(result.matchedAssets.primary!, true)}
                    className="text-[hsl(var(--color-primary))] hover:underline inline-flex items-center gap-1 font-medium py-1 px-2 rounded hover:bg-[hsl(var(--color-primary))/0.08] transition-colors"
                  >
                    <span>{getMsg('mirrorDownload', '⚡ 国内高速镜像通道下载')}</span>
                  </button>
                  <span className="text-[hsl(var(--color-border))]">|</span>
                  <button
                    type="button"
                    onClick={() => handleCopyLink(result.matchedAssets.primary!.mirrorDownloadUrl!)}
                    className="text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:underline inline-flex items-center gap-1 py-1 px-1.5 transition-colors"
                  >
                    <Copy className="h-3 w-3" />
                    <span>{getMsg('copyMirrorLink', '复制镜像直链')}</span>
                  </button>
                </div>
              )}

              {/* Toggle all assets */}
              {result.matchedAssets.all.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAllAssets(!showAllAssets)}
                    className="flex items-center gap-1 text-xs text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] transition-colors"
                  >
                    <span>{getMsg('allDownloads', '查看所有平台下载')}</span>
                    {showAllAssets ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {showAllAssets && (
                    <div className="mt-2 space-y-1.5 rounded-lg border border-[hsl(var(--color-border))] p-2 bg-[hsl(var(--color-background))]">
                      {result.matchedAssets.all.map((asset) => (
                        <div
                          key={asset.name}
                          className="flex items-center justify-between py-1 px-2 hover:bg-[hsl(var(--color-muted))/0.5] rounded transition-colors text-xs"
                        >
                          <span className="font-mono truncate max-w-[220px] text-[hsl(var(--color-foreground))]">
                            {asset.name}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]"
                              title={getMsg('copyLink', '复制链接')}
                              onClick={() => handleCopyLink(asset.browserDownloadUrl)}
                            >
                              {copiedUrl === asset.browserDownloadUrl ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs"
                              onClick={() => handleDownload(asset)}
                            >
                              <Download className="h-3 w-3" />
                              {formatFileSize(asset.size)}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom auxiliary links */}
            <div className="flex items-center justify-between pt-3 border-t border-[hsl(var(--color-border))] text-xs">
              <button
                type="button"
                onClick={handleOpenGitHub}
                className="inline-flex items-center gap-1 text-[hsl(var(--color-primary))] hover:underline cursor-pointer bg-transparent border-0 p-0 text-xs"
              >
                <span>{getMsg('viewOnGithub', '前往 GitHub 查看')}</span>
                <ExternalLink className="h-3 w-3" />
              </button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkipVersion}
                  className="text-xs text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]"
                >
                  {getMsg('skipVersion', 'Skip this version')}
                </Button>
                <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                  {getMsg('remindLater', 'Remind later')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
