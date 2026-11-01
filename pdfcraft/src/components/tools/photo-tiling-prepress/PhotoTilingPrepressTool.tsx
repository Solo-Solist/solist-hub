'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { prepressPhotoTiling, type PhotoTilingPrepressOptions } from '@/lib/pdf/processors/photo-tiling-prepress';
import type { ProcessOutput } from '@/types/pdf';
import { Sliders, Layout, RefreshCw, Sparkles, AlertCircle } from 'lucide-react';

export interface PhotoTilingPrepressToolProps {
  className?: string;
}

export function PhotoTilingPrepressTool({ className = '' }: PhotoTilingPrepressToolProps) {
  const t = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [photoSpec, setPhotoSpec] = useState<'1-inch' | '2-inch'>('1-inch');
  const [paperSize, setPaperSize] = useState<'5-inch' | '6-inch'>('6-inch');
  const [gapPt, setGapPt] = useState(8);

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

  const handlePrepress = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await prepressPhotoTiling(
        [file],
        { photoSpec, paperSize, gapPt },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Engraving prepress tiled grids...');
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
        setError(output.error?.message || 'Failed to arrange photo prepress.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error processing photo tiling.');
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
          accept={['image/png', 'image/jpeg', 'image/jpg']}
          multiple={false}
          onFilesSelected={handleFileSelected}
          onError={setError}
          disabled={status === 'processing'}
          label={t('photoTilingPrepress.uploadLabel')}
          description={t('photoTilingPrepress.uploadDescription')}
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
            <Card variant="outlined" className="p-6 bg-amber-950/5 dark:bg-amber-950/10 relative overflow-hidden rounded-[2rem] min-h-[380px] flex flex-col justify-between border-2 border-amber-900/10 shadow-inner">
              <div className="flex items-center justify-between pb-3 border-b border-amber-900/10 pointer-events-none">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-600 flex items-center gap-1.5">
                  <Layout className="w-4 h-4 text-amber-700 animate-pulse" />
                  {t('photoTilingPrepress.previewTitle')}
                </span>
                <Button variant="ghost" size="sm" className="text-amber-800 dark:text-amber-600 hover:bg-amber-900/5" onClick={handleClear} disabled={status === 'processing'}>
                  {t('photoTilingPrepress.clearButton')}
                </Button>
              </div>

              {/* Wooden magnet pre-flight card desk mockup */}
              <div className="flex-1 flex items-center justify-center p-6 relative">
                <div className="w-72 h-44 bg-amber-100 dark:bg-zinc-800 border-4 border-amber-900/20 dark:border-zinc-700 shadow-2xl rounded-2xl p-4 relative overflow-hidden flex flex-wrap gap-2 items-center justify-center">
                  
                  {/* Photo Matrix grids with strong snapping micro-animations */}
                  <div className="w-12 h-16 border border-dashed border-amber-900/20 bg-white/40 rounded flex items-center justify-center text-[8px] text-amber-900/40 transform hover:scale-105 duration-200 shadow-sm">
                    Snapped
                  </div>
                  <div className="w-12 h-16 border border-dashed border-amber-900/20 bg-white/40 rounded flex items-center justify-center text-[8px] text-amber-900/40 transform hover:scale-105 duration-200 shadow-sm">
                    Snapped
                  </div>
                  <div className="w-12 h-16 border border-dashed border-amber-900/20 bg-white/40 rounded flex items-center justify-center text-[8px] text-amber-900/40 transform hover:scale-105 duration-200 shadow-sm">
                    Snapped
                  </div>
                  <div className="w-12 h-16 border border-dashed border-amber-900/20 bg-white/40 rounded flex items-center justify-center text-[8px] text-amber-900/40 transform hover:scale-105 duration-200 shadow-sm">
                    Snapped
                  </div>
                  <div className="w-12 h-16 border border-dashed border-amber-900/20 bg-white/40 rounded flex items-center justify-center text-[8px] text-amber-900/40 transform hover:scale-105 duration-200 shadow-sm">
                    Snapped
                  </div>

                  <div className="absolute top-2 right-2 text-[7px] text-amber-800 font-mono font-bold">
                    GRID snaps ON
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
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('photoTilingPrepress.optionsTitle')}</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-zinc-500 font-bold">{t('photoTilingPrepress.photoSpecLabel')}</label>
                    <select
                      value={photoSpec}
                      onChange={(e) => setPhotoSpec(e.target.value as any)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    >
                      <option value="1-inch">{t('photoTilingPrepress.photoSpec1Inch')}</option>
                      <option value="2-inch">{t('photoTilingPrepress.photoSpec2Inch')}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-500 font-bold">{t('photoTilingPrepress.paperSizeLabel')}</label>
                    <select
                      value={paperSize}
                      onChange={(e) => setPaperSize(e.target.value as any)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    >
                      <option value="5-inch">{t('photoTilingPrepress.paperSize5Inch')}</option>
                      <option value="6-inch">{t('photoTilingPrepress.paperSize6Inch')}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-zinc-500 font-bold flex justify-between">
                      <span>{t('photoTilingPrepress.gapPtLabel')}</span>
                      <span className="font-mono text-primary font-bold">{gapPt} pt</span>
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="20"
                      value={gapPt}
                      onChange={(e) => setGapPt(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename="prepress_photos_matrix.pdf"
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
                    onClick={handlePrepress}
                    disabled={status === 'processing'}
                  >
                    <RefreshCw className={`w-4 h-4 ${status === 'processing' ? 'animate-spin' : ''}`} />
                    {t('photoTilingPrepress.processButton')}
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

export default PhotoTilingPrepressTool;
