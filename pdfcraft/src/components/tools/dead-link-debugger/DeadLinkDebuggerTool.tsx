'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { debugDeadLinks, type DeadLinkOptions } from '@/lib/pdf/processors/dead-link-debugger';
import type { ProcessOutput } from '@/types/pdf';
import { Unlink, Sliders, CheckSquare, Sparkles } from 'lucide-react';

export interface DeadLinkDebuggerToolProps {
  className?: string;
}

export function DeadLinkDebuggerTool({ className = '' }: DeadLinkDebuggerToolProps) {
  const t = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [linkList, setLinkList] = useState<any[]>([]);
  const [replacements, setReplacements] = useState<Record<string, string>>({});

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const handleFileSelected = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setFile(selectedFiles[0]);
    setError(null);
    setResultBlob(null);
    setLinkList([]);
  }, []);

  const handleScan = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await debugDeadLinks(
        [file],
        {
          replacements,
          validateReachability: true,
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Probing url reachability...');
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result && output.metadata) {
        setResultBlob(output.result as Blob);
        setLinkList((output.metadata.links as any[]) || []);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to scan links.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error checking links.');
        setStatus('error');
      }
    }
  };

  const handleUpdateLink = (original: string, newUrl: string) => {
    setReplacements(prev => ({
      ...prev,
      [original]: newUrl
    }));
  };

  const handleClear = () => {
    setFile(null);
    setResultBlob(null);
    setLinkList([]);
    setStatus('idle');
  };

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && (
        <FileUploader
          accept={['application/pdf']}
          multiple={false}
          onFilesSelected={handleFileSelected}
          onError={setError}
          disabled={status === 'processing'}
          label={t('deadLinkDebugger.uploadLabel')}
          description={t('deadLinkDebugger.uploadDescription')}
        />
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {file && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-4">
            <Card variant="outlined" className="p-6 bg-zinc-50 dark:bg-zinc-950/40 relative overflow-hidden rounded-[2rem] min-h-[380px] flex flex-col justify-between border-2">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-zinc-500 flex items-center gap-1.5">
                  <Unlink className="w-4 h-4 text-primary" />
                  {t('deadLinkDebugger.previewTitle')}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={status === 'processing'}>
                  {t('deadLinkDebugger.clearButton')}
                </Button>
              </div>

              {/* Show list of extracted URLs and allow fast edit */}
              <div className="flex-1 flex flex-col p-4 overflow-y-auto max-h-[360px] space-y-3">
                {linkList.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400">
                    {status === 'processing' ? t('deadLinkDebugger.detectingText') : t('deadLinkDebugger.idleText')}
                  </div>
                ) : (
                  linkList.map((item, idx) => (
                    <div key={idx} className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col gap-2 shadow-sm">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-primary">{t('deadLinkDebugger.pageNumberLabel', { page: item.pageNumber })}</span>
                        <span className="text-green-500">Status: Detected</span>
                      </div>
                      <div className="text-xs font-mono break-all font-semibold">
                        {item.originalUrl}
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder={t('deadLinkDebugger.redirectPlaceholder')}
                          value={replacements[item.originalUrl] || ''}
                          onChange={(e) => handleUpdateLink(item.originalUrl, e.target.value)}
                          className="flex-1 text-[11px] bg-zinc-50 dark:bg-zinc-950 border rounded-lg p-2 focus:outline-none"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card variant="default" className="p-6 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-850 rounded-[2rem] shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="space-y-6">
                <div className="border-b border-zinc-150 dark:border-zinc-800 pb-3 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('deadLinkDebugger.optionsTitle')}</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <p className="text-zinc-400">
                    {t('deadLinkDebugger.emptyStateDescription')}
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6 space-y-3">
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full py-4 font-bold rounded-2xl"
                  onClick={handleScan}
                  disabled={status === 'processing'}
                >
                  {t('deadLinkDebugger.processButton')}
                </Button>

                {status === 'complete' && resultBlob && (
                  <DownloadButton
                    file={resultBlob}
                    filename={`${file.name.replace(/\.pdf$/i, '')}_fixed.pdf`}
                    variant="primary"
                    size="lg"
                    className="w-full py-4 font-bold shadow-lg shadow-primary/25 rounded-2xl"
                    showFileSize
                  />
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {status === 'processing' && (
        <ProcessingProgress
          progress={progress}
          status={status}
          message={progressMessage}
          onCancel={() => { cancelledRef.current = true; setStatus('idle'); }}
          showPercentage
        />
      )}
    </div>
  );
}

export default DeadLinkDebuggerTool;
