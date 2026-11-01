'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { generateInteractiveToc, type InteractiveTocOptions } from '@/lib/pdf/processors/interactive-toc-generator';
import type { ProcessOutput } from '@/types/pdf';
import { Layers, Sliders, CheckSquare, Sparkles } from 'lucide-react';

export interface InteractiveTocGeneratorToolProps {
  className?: string;
}

export function InteractiveTocGeneratorTool({ className = '' }: InteractiveTocGeneratorToolProps) {
  const t = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('Table of Contents');
  const [insertIndex, setInsertIndex] = useState(0);

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
  }, []);

  const handleGenerate = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await generateInteractiveToc(
        [file],
        {
          title,
          insertIndex,
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Weaving interactive paths...');
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
        setError(output.error?.message || 'Failed to generate interactive TOC.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error generating TOC.');
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
          label={t('interactiveTocGenerator.uploadLabel')}
          description={t('interactiveTocGenerator.uploadDescription')}
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
                  <Layers className="w-4 h-4 text-primary" />
                  {t('interactiveTocGenerator.previewTitle')}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={status === 'processing'}>
                  {t('interactiveTocGenerator.clearButton')}
                </Button>
              </div>

              {/* Origami fly out overlay motion mockup */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                {status === 'processing' && (
                  <div className="absolute inset-0 bg-primary/5 flex flex-col items-center justify-center pointer-events-none">
                    <Sparkles className="w-12 h-12 text-primary animate-spin" />
                  </div>
                )}
                <div className="max-w-md text-center space-y-3">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto text-primary">
                    📜
                  </div>
                  <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    {file.name}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    {t('interactiveTocGenerator.emptyStateDescription')}
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
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('interactiveTocGenerator.optionsTitle')}</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-zinc-500 font-bold">{t('interactiveTocGenerator.tocTitleLabel')}</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Table of Contents"
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-500 font-bold">{t('interactiveTocGenerator.insertPageLabel')}</label>
                    <input
                      type="number"
                      value={insertIndex}
                      onChange={(e) => setInsertIndex(parseInt(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename={`${file.name.replace(/\.pdf$/i, '')}_toc_interactive.pdf`}
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
                    onClick={handleGenerate}
                    disabled={status === 'processing'}
                  >
                    {t('interactiveTocGenerator.processButton')}
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

export default InteractiveTocGeneratorTool;
