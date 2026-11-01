'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { resizePDFPagesUniform, type PdfPageResizerUniformOptions } from '@/lib/pdf/processors/pdf-page-resizer-uniform';
import type { ProcessOutput } from '@/types/pdf';
import { Sliders, Copy, LayoutGrid, Layers, RefreshCw, Zap } from 'lucide-react';

export interface PdfPageResizerUniformToolProps {
  className?: string;
}

export function PdfPageResizerUniformTool({ className = '' }: PdfPageResizerUniformToolProps) {
  const t = useTranslations('common');
  const [files, setFiles] = useState<File[]>([]);
  const [targetSize, setTargetSize] = useState<'A4' | 'A3' | 'Letter'>('A4');
  const [scaleMode, setScaleMode] = useState<'fit' | 'fill'>('fit');

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setFiles(selectedFiles);
    setError(null);
    setResultBlob(null);
  }, []);

  const handleResize = async () => {
    if (files.length === 0) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await resizePDFPagesUniform(
        files,
        { targetSize, scaleMode },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Harmonizing page bounds...');
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
        setError(output.error?.message || 'Failed to unify page dimensions.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error resizing documents.');
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
      {files.length === 0 && (
        <FileUploader
          accept={['application/pdf']}
          multiple={true}
          onFilesSelected={handleFilesSelected}
          onError={setError}
          disabled={status === 'processing'}
          label={t('pdfPageResizerUniform.uploadLabel')}
          description={t('pdfPageResizerUniform.uploadDescription')}
        />
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-4">
            <Card variant="outlined" className="p-6 bg-zinc-50 dark:bg-zinc-950/40 relative overflow-hidden rounded-[2rem] min-h-[380px] flex flex-col justify-between border-2 border-dashed border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-zinc-500 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-primary animate-pulse" />
                  {t('pdfPageResizerUniform.magnifierTitle')}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={status === 'processing'}>
                  {t('pdfTwoColumnReflower.clearButton')}
                </Button>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                {/* 3D Stack of cards representation */}
                <div className="relative w-48 h-36 flex items-center justify-center">
                  <div className="absolute w-36 h-28 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg shadow-md transform rotate-12 scale-90 translate-y-3 z-10" />
                  <div className="absolute w-44 h-32 bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg transform -rotate-6 translate-y-1 z-20 flex items-center justify-center">
                    <span className="text-[10px] text-zinc-400 font-mono">Letter / A3</span>
                  </div>
                  <div className="absolute w-40 h-28 border-2 border-primary bg-primary/5 rounded-lg shadow-xl z-30 flex flex-col items-center justify-center animate-pulse">
                    <Zap className="w-5 h-5 text-primary mb-1 animate-bounce" />
                    <span className="text-[10px] text-primary font-black tracking-widest">{targetSize} UNIFORM</span>
                  </div>
                </div>

                <div className="max-w-md text-center mt-6 space-y-2">
                  <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    {t('pdfPageResizerUniform.filesLoaded', { count: files.length })}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    {t('pdfPageResizerUniform.uniformHelp')}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card variant="default" className="p-6 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-850 rounded-[2rem] shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="space-y-6">
                <div className="border-b border-zinc-150 dark:border-zinc-800 pb-3 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('pdfPageResizerUniform.optionsTitle')}</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-1.5">
                    {t('pdfPageResizerUniform.targetSpecLabel')}
                    <select
                      value={targetSize}
                      onChange={(e) => setTargetSize(e.target.value as any)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    >
                      {t('pdfPageResizerUniform.specA4')}
                      {t('pdfPageResizerUniform.specA3')}
                      {t('pdfPageResizerUniform.specLetter')}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    {t('pdfPageResizerUniform.scaleModeLabel')}
                    <select
                      value={scaleMode}
                      onChange={(e) => setScaleMode(e.target.value as any)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    >
                      {t('pdfPageResizerUniform.modeFit')}
                      {t('pdfPageResizerUniform.modeFill')}
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename={`${files[0].name.replace(/\.[^/.]+$/, '')}_uniform_${targetSize.toLowerCase()}.pdf`}
                    variant="primary"
                    size="lg"
                    className="w-full py-4 font-bold shadow-lg shadow-primary/25 rounded-2xl"
                    showFileSize
                  />
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full py-4 font-bold rounded-2xl flex items-center justify-center gap-2"
                    onClick={handleResize}
                    disabled={status === 'processing'}
                  >
                    <RefreshCw className={`w-4 h-4 ${status === 'processing' ? 'animate-spin' : ''}`} />
                    {t('pdfPageResizerUniform.processButton')}
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

export default PdfPageResizerUniformTool;
