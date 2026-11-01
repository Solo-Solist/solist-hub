'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, X, ArrowRight, Clock, Ban } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { UpdateCheckResult } from '@/types/updater';

export interface UpdateNotificationToastProps {
  isOpen: boolean;
  result: UpdateCheckResult | null;
  onOpenModal: () => void;
  onSnooze: () => void;
  onIgnore: () => void;
  onClose: () => void;
}

export const UpdateNotificationToast: React.FC<UpdateNotificationToastProps> = ({
  isOpen,
  result,
  onOpenModal,
  onSnooze,
  onIgnore,
  onClose,
}) => {
  const t = useTranslations('common');

  if (!isOpen || !result || !result.hasUpdate) return null;

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

  return (
    <aside
      aria-label={getMsg('available', 'New Version Available')}
      className="fixed bottom-5 right-5 z-[9999] w-[calc(100vw-2.5rem)] sm:w-[380px] rounded-2xl border border-[hsl(var(--color-primary)/0.3)] bg-[hsl(var(--color-background))] shadow-2xl p-4 transition-all animate-in slide-in-from-bottom-5 fade-in duration-300 ring-1 ring-[hsl(var(--color-primary)/0.2)]"
    >
      {/* Header bar */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--color-primary))] text-white shadow-sm">
            <Sparkles className="h-4 w-4 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-[hsl(var(--color-foreground))] leading-tight">
                {getMsg('available', '发现新版本')}
              </h4>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {result.latestVersion}
              </span>
            </div>
            <p className="text-[11px] text-[hsl(var(--color-muted-foreground))] mt-0.5">
              {getMsg('currentVersion', '当前版本')}: <span className="font-mono">{result.currentVersion}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] transition-colors"
          aria-label={getMsg('close', '关闭')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Brief content / prompt */}
      <p className="text-xs text-[hsl(var(--color-muted-foreground))] mb-3.5 leading-relaxed">
        {getMsg(
          'toastPrompt',
          '新版本已发布，已优化应用稳定性与多项核心功能，推荐立即更新体验。'
        )}
      </p>

      {/* Action buttons */}
      <div className="space-y-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onOpenModal}
          className="w-full justify-center gap-1.5 py-2 text-xs font-semibold shadow-sm"
        >
          <span>{getMsg('viewDetails', '立即更新 / 查看详情')}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>

        <div className="flex items-center justify-between text-[11px] pt-1 text-[hsl(var(--color-muted-foreground))]">
          <button
            type="button"
            onClick={onSnooze}
            className="inline-flex items-center gap-1 py-0.5 px-1.5 rounded hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] transition-colors"
          >
            <Clock className="h-3 w-3" />
            <span>{getMsg('remindLater', '稍后提醒')}</span>
          </button>

          <button
            type="button"
            onClick={onIgnore}
            className="inline-flex items-center gap-1 py-0.5 px-1.5 rounded hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] transition-colors"
          >
            <Ban className="h-3 w-3" />
            <span>{getMsg('skipVersion', '跳过此版本')}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
