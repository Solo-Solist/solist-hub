'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { injectSignatureAnchors, type PdfSignatureAnchorHelperOptions } from '@/lib/pdf/processors/pdf-signature-anchor-helper';
import type { ProcessOutput } from '@/types/pdf';
import { Sliders, HelpCircle, PenTool, RefreshCw } from 'lucide-react';

export interface PdfSignatureAnchorHelperToolProps {
  className?: string;
}

export function PdfSignatureAnchorHelperTool({ className = '' }: PdfSignatureAnchorHelperToolProps) {
  const t = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [anchorX, setAnchorX] = useState(0.8);
  const [anchorY, setAnchorY] = useState(0.8);
  const [anchorLabel, setAnchorLabel] = useState(t('pdfSignatureAnchorHelper.anchorLabelDefault'));

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleFileSelected = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setFile(selectedFiles[0]);
    setError(null);
    setResultBlob(null);
  }, []);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setAnchorX(parseFloat(x.toFixed(3)));
    setAnchorY(parseFloat(y.toFixed(3)));
  };

  const handleInject = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await injectSignatureAnchors(
        [file],
        {
          anchorX,
          anchorY,
          pageNumber,
          anchorLabel,
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Injecting visual signature coordinates...');
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
        setError(output.error?.message || 'Failed to inject signature guides.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error injecting guides.');
        setStatus('error');
      }
    }
  };

  const handleClear = () => {
    setFile(null);
    setResultBlob(null);
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
          label={t('pdfSignatureAnchorHelper.uploadLabel')}
          description={t('pdfSignatureAnchorHelper.uploadDescription')}
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
            <Card variant="outlined" className="p-6 bg-zinc-50 dark:bg-zinc-950/40 relative overflow-hidden rounded-[2rem] min-h-[380px] flex flex-col justify-between border-2 border-dashed border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-zinc-500 flex items-center gap-1.5">
                  <PenTool className="w-4 h-4 text-primary animate-pulse" />
                  {t('pdfSignatureAnchorHelper.magnifierTitle')}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={status === 'processing'}>
                  {t('pdfTwoColumnReflower.clearButton')}
                </Button>
              </div>

              {/* Interactive clickable preview layout with radar ripple */}
              <div className="flex-1 flex items-center justify-center p-6 relative">
                <div 
                  ref={containerRef}
                  onClick={handleCanvasClick}
                  className="relative w-60 h-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-md cursor-crosshair overflow-hidden"
                >
                  {/* Fake paragraph mock lines */}
                  <div className="p-4 space-y-3">
                    <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800/40 rounded" />
                    <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800/40 rounded" />
                    <div className="h-2 w-5/6 bg-zinc-100 dark:bg-zinc-800/40 rounded" />
                    <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800/40 rounded" />
                    <div className="h-2 w-2/3 bg-zinc-100 dark:bg-zinc-800/40 rounded" />
                  </div>

                  {/* Breathing radar pulse target indicator */}
                  <div 
                    className="absolute w-6 h-6 -translate-x-3 -translate-y-3 pointer-events-none"
                    style={{ left: `${anchorX * 100}%`, top: `${anchorY * 100}%` }}
                  >
                    <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75" />
                    <div className="absolute inset-1.5 bg-red-600 rounded-full border border-white shadow" />
                  </div>

                  {/* Floated tip text next to radar */}
                  <div 
                    className="absolute bg-red-50 border border-red-200 text-red-600 text-[8px] px-2 py-0.5 rounded shadow pointer-events-none -translate-x-1/2 -translate-y-9 whitespace-nowrap"
                    style={{ left: `${anchorX * 100}%`, top: `${anchorY * 100}%` }}
                  >
                    {anchorLabel}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card variant="default" className="p-6 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-850 rounded-[2rem] shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="space-y-6">
                <div className="border-b border-zinc-150 dark:border-zinc-800 pb-3 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('pdfSignatureAnchorHelper.optionsTitle')}</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-1">
                    {t('pdfSignatureAnchorHelper.anchorLabelLabel')}
                    <input
                      type="text"
                      value={anchorLabel}
                      onChange={(e) => setAnchorLabel(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    />
                  </div>

                  <div className="space-y-1">
                    {t('pdfSignatureAnchorHelper.targetPageLabel')}
                    <input
                      type="number"
                      min={1}
                      value={pageNumber}
                      onChange={(e) => setPageNumber(parseInt(e.target.value) || 1)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-[9px] text-zinc-400">
                    <div>X: {(anchorX * 100).toFixed(0)}%</div>
                    <div>Y: {(anchorY * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename={`${file.name.replace(/\.[^/.]+$/, '')}_signed_guide.pdf`}
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
                    onClick={handleInject}
                    disabled={status === 'processing'}
                  >
                    <RefreshCw className={`w-4 h-4 ${status === 'processing' ? 'animate-spin' : ''}`} />
                    {t('pdfSignatureAnchorHelper.processButton')}
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

export default PdfSignatureAnchorHelperTool;
