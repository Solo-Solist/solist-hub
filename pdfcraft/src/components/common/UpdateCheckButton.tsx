'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpCircle, Sparkles } from 'lucide-react';
import {
  checkUpdate,
  isVersionIgnored,
  shouldCheckUpdate,
  isUpdateSnoozedInSession,
  snoozeUpdateInSession,
  ignoreVersion,
} from '@/lib/updater';
import { isTauri } from '@/lib/tauri-bridge';
import { UpdateCheckResult } from '@/types/updater';
import { UpdateModal } from './UpdateModal';
import { UpdateNotificationToast } from './UpdateNotificationToast';

export interface UpdateCheckButtonProps {
  className?: string;
}

export const UpdateCheckButton: React.FC<UpdateCheckButtonProps> = ({ className = '' }) => {
  const t = useTranslations('common');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [hasNotification, setHasNotification] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const getMsg = (key: string, fallback: string): string => {
    try {
      const fullKey = `updater.${key}`;
      const msg = t(fullKey as any);
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
    return fallback;
  };

  const checkBtnLabel = getMsg('checkBtn', '检查更新');

  // Background auto-check on mount
  useEffect(() => {
    let isMounted = true;

    const performBackgroundCheck = async () => {
      const desktop = isTauri();
      // In Tauri desktop, always verify update status on startup without 24h block;
      // In browser, check if auto-check interval has elapsed.
      if (shouldCheckUpdate() || desktop) {
        try {
          const res = await checkUpdate({ force: desktop, isDesktop: desktop });
          if (isMounted && res.hasUpdate && !isVersionIgnored(res.latestVersion)) {
            setResult(res);
            setHasNotification(true);
            if (!isUpdateSnoozedInSession(res.latestVersion)) {
              setShowToast(true);
            }
          }
        } catch {
          // Silent failure in background
        }
      }
    };

    // Small delay on initial startup to avoid contending with page hydration
    const timer = setTimeout(() => {
      performBackgroundCheck();
    }, 2500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const handleManualCheck = useCallback(async () => {
    setShowToast(false);
    setIsOpen(true);
    setLoading(true);
    try {
      const res = await checkUpdate({ force: true });
      setResult(res);
      if (res.hasUpdate && !isVersionIgnored(res.latestVersion)) {
        setHasNotification(true);
      } else {
        setHasNotification(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCloseModal = () => {
    setIsOpen(false);
  };

  const handleOpenModalFromToast = () => {
    setShowToast(false);
    setIsOpen(true);
  };

  const handleSnoozeToast = () => {
    if (result?.latestVersion) {
      snoozeUpdateInSession(result.latestVersion);
    }
    setShowToast(false);
  };

  const handleIgnoreToast = () => {
    if (result?.latestVersion) {
      ignoreVersion(result.latestVersion);
    }
    setShowToast(false);
    setHasNotification(false);
  };

  return (
    <>
      {hasNotification ? (
        <button
          type="button"
          onClick={handleManualCheck}
          className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 shadow-sm transition-all animate-in fade-in ${className}`}
          aria-label={getMsg('available', 'New Version Available')}
          title={`${getMsg('available', 'New Version Available')}: ${result?.latestVersion}`}
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse shrink-0" />
          <span className="hidden sm:inline font-sans">{getMsg('newVersionBadge', '新版本')}</span>
          <span className="font-mono text-[11px] font-bold">{result?.latestVersion}</span>
          <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 ml-0.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleManualCheck}
          className={`relative flex items-center justify-center h-9 w-9 rounded-lg text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))/0.5] transition-all ${className}`}
          aria-label={checkBtnLabel}
          title={checkBtnLabel}
        >
          <ArrowUpCircle className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {/* Floating proactive toast card */}
      <UpdateNotificationToast
        isOpen={showToast}
        result={result}
        onOpenModal={handleOpenModalFromToast}
        onSnooze={handleSnoozeToast}
        onIgnore={handleIgnoreToast}
        onClose={() => setShowToast(false)}
      />

      {/* Full update modal dialog */}
      <UpdateModal
        isOpen={isOpen}
        onClose={handleCloseModal}
        result={result}
        loading={loading}
        onRetry={handleManualCheck}
      />
    </>
  );
};
