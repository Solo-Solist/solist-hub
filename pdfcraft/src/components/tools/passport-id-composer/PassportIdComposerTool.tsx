'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { composePassportId, type PassportIdOptions } from '@/lib/pdf/processors/passport-id-composer';
import type { ProcessOutput } from '@/types/pdf';
import { Shield, Sparkles, Layers, Sliders } from 'lucide-react';

export interface PassportIdComposerToolProps {
  className?: string;
}

export function PassportIdComposerTool({ className = '' }: PassportIdComposerToolProps) {
  const t = useTranslations('common');
  const [files, setFiles] = useState<File[]>([]);
  const [watermark, setWatermark] = useState<string>('FOR COPY ONLY');
  const [layout, setLayout] = useState<'single-page' | 'two-pages'>('single-page');
  const [idCardWidth, setIdCardWidth] = useState<number>(242.6);
  const [idCardHeight, setIdCardHeight] = useState<number>(153);

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    setFiles((prev) => [...prev, ...selectedFiles].slice(0, 2));
    setError(null);
  }, []);

  const handleCompose = async () => {
    if (files.length === 0) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await composePassportId(
        files,
        {
          watermarkText: watermark,
          layout,
          idCardWidth,
          idCardHeight,
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Composing ID page...');
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        setResultBlob(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to compose ID card layout.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error composing ID.');
        setStatus('error');
      }
    }
  };

  const handleClear = () => {
    setFiles([]);
    setResultBlob(null);
    setStatus('idle');
  };

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {files.length < 2 && (
        <FileUploader
          accept={['application/pdf', 'image/jpeg', 'image/png']}
          multiple={true}
          onFilesSelected={handleFilesSelected}
          onError={setError}
          disabled={status === 'processing'}
          label={t('passportIdComposer.uploadLabel')}
          description={t('passportIdComposer.uploadDescription')}
        />
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Files display & visual effect */}
          <div className="lg:col-span-8 space-y-4">
            <Card variant="outlined" className="p-6 bg-zinc-50 dark:bg-zinc-950/40 relative overflow-hidden rounded-[2rem] min-h-[380px] flex flex-col justify-between border-2 border-dashed">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-zinc-500 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-primary" />
                  {t('passportIdComposer.layersCountLabel', { count: files.length })}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={status === 'processing'}>
                  {t('passportIdComposer.clearButton')}
                </Button>
              </div>

              {/* Replica scan animation effect */}
              <div className="flex-1 flex flex-col md:flex-row gap-6 items-center justify-center p-6 relative">
                {status === 'processing' && (
                  <div className="absolute inset-0 bg-primary/5 pointer-events-none flex flex-col items-center justify-center animate-pulse">
                    <div className="w-full h-1.5 bg-gradient-to-r from-transparent via-primary to-transparent absolute top-0 animate-[bounce_3s_infinite]" />
                    <Sparkles className="w-12 h-12 text-primary animate-spin" />
                  </div>
                )}

                {files.map((f, idx) => (
                  <div key={idx} className="w-48 h-32 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg flex flex-col items-center justify-center p-4 relative group overflow-hidden">
                    <div className="absolute top-2 left-2 text-[10px] font-black text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                      {idx === 0 ? t('passportIdComposer.frontLabel') : t('passportIdComposer.backLabel')}
                    </div>
                    <span className="text-xs font-semibold truncate max-w-full text-center mt-4">
                      {f.name}
                    </span>
                    <span className="text-[10px] text-zinc-400 mt-1">
                      {(f.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Options side panel */}
          <div className="lg:col-span-4 space-y-6">
            <Card variant="default" className="p-6 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-850 rounded-[2rem] shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="space-y-6">
                <div className="border-b border-zinc-150 dark:border-zinc-800 pb-3 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('passportIdComposer.optionsTitle')}</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-primary" />
                      {t('passportIdComposer.watermarkLabel')}
                    </label>
                    <input
                      type="text"
                      value={watermark}
                      onChange={(e) => setWatermark(e.target.value)}
                      placeholder={t('passportIdComposer.watermarkPlaceholder')}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500">{t('passportIdComposer.idCardHeightLabel')}</label>
                    <input
                      type="number"
                      value={idCardHeight}
                      onChange={(e) => setIdCardHeight(parseFloat(e.target.value) || 153)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename="passport_id_composite.pdf"
                    variant="primary"
                    size="lg"
                    className="w-full py-4 font-bold shadow-lg shadow-primary/25 rounded-2xl"
                    showFileSize
                  />
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full py-4 font-bold rounded-2xl"
                    onClick={handleCompose}
                    disabled={status === 'processing'}
                  >
                    {status === 'processing' ? 'Processing...' : t('passportIdComposer.processButton')}
                  </Button>
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

export default PassportIdComposerTool;
