'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { exportAnnotations, type AnnotationExportOptions } from '@/lib/pdf/processors/annotation-exporter';
import type { ProcessOutput } from '@/types/pdf';
import { BookOpen, CheckSquare, Layers, Download } from 'lucide-react';

export interface AnnotationExporterToolProps {
  className?: string;
}

export function AnnotationExporterTool({ className = '' }: AnnotationExporterToolProps) {
  const t = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'md' | 'json'>('md');
  const [incHighlights, setIncHighlights] = useState(true);
  const [incNotes, setIncNotes] = useState(true);
  const [incUnderlines, setIncUnderlines] = useState(true);

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

  const handleExport = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await exportAnnotations(
        [file],
        {
          format,
          includeHighlights: incHighlights,
          includeNotes: incNotes,
          includeUnderlines: incUnderlines,
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Extracting comments...');
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
        setError(output.error?.message || 'Failed to parse page annotations.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error extracting annotations.');
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
          label={t('annotationExporter.uploadLabel')}
          description={t('annotationExporter.uploadDescription')}
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
                  <BookOpen className="w-4 h-4 text-primary" />
                  {t('annotationExporter.previewTitle')}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={status === 'processing'}>
                  {t('annotationExporter.clearButton')}
                </Button>
              </div>

              {/* Glowing notebooks flying trail animation mockup */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                {status === 'processing' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-24 h-24 rounded-full border-4 border-dashed border-primary animate-spin" />
                  </div>
                )}
                <div className="max-w-md text-center space-y-3">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto text-primary animate-[bounce_2s_infinite]">
                    ✍️
                  </div>
                  <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    {file.name}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    {t('annotationExporter.emptyStateTitle')}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card variant="default" className="p-6 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-850 rounded-[2rem] shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="space-y-6">
                <div className="border-b border-zinc-150 dark:border-zinc-800 pb-3 flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('annotationExporter.optionsTitle')}</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="highlights"
                      checked={incHighlights}
                      onChange={(e) => setIncHighlights(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4"
                    />
                    <label htmlFor="highlights" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {t('annotationExporter.incHighlightsLabel')}
                    </label>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="notes"
                      checked={incNotes}
                      onChange={(e) => setIncNotes(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4"
                    />
                    <label htmlFor="notes" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {t('annotationExporter.incNotesLabel')}
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500">{t('annotationExporter.formatLabel')}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={format === 'md' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setFormat('md')}
                        className="text-xs rounded-xl"
                      >
                        Markdown
                      </Button>
                      <Button
                        variant={format === 'json' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setFormat('json')}
                        className="text-xs rounded-xl"
                      >
                        JSON Data
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename={format === 'json' ? `${file.name.replace(/\.pdf$/i, '')}_notes.json` : `${file.name.replace(/\.pdf$/i, '')}_notes.md`}
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
                    onClick={handleExport}
                    disabled={status === 'processing'}
                  >
                    {t('annotationExporter.processButton')}
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

export default AnnotationExporterTool;
