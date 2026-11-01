'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { boostHandwritingInkContrast, type HandwritingInkContrastBoosterOptions } from '@/lib/pdf/processors/handwriting-ink-contrast-booster';
import type { ProcessOutput } from '@/types/pdf';
import { Sliders, Sparkles, RefreshCw, Eye, Percent, EyeOff } from 'lucide-react';

export interface HandwritingInkContrastBoosterToolProps {
  className?: string;
}

export function HandwritingInkContrastBoosterTool({ className = '' }: HandwritingInkContrastBoosterToolProps) {
  const t = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [threshold, setThreshold] = useState(200);
  const [contrast, setContrast] = useState(1.5);
  const [inkType, setInkType] = useState<'dark-ink' | 'red-stamp' | 'auto'>('auto');

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const [lensPosition, setLensPosition] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const handleFileSelected = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setFile(selectedFiles[0]);
    setError(null);
    setResultBlob(null);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setLensPosition({ x, y });
  };

  const handleOptimize = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await boostHandwritingInkContrast(
        [file],
        { threshold, contrast, inkType },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Purifying ink grids...');
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
        setError(output.error?.message || 'Failed to boost handwriting ink.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error purifying ink.');
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
          label={t('handwritingInkContrastBooster.uploadLabel')}
          description={t('handwritingInkContrastBooster.uploadDescription')}
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
                  <Eye className="w-4 h-4 text-primary animate-pulse" />
                  {t('handwritingInkContrastBooster.magnifierTitle')}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={status === 'processing'}>
                  {t('pdfTwoColumnReflower.clearButton')}
                </Button>
              </div>

              {/* The magical interactive magnifying contrast lens */}
              <div 
                ref={imageContainerRef}
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="flex-1 flex items-center justify-center p-6 relative cursor-crosshair select-none min-h-[280px]"
              >
                <div className="relative w-64 h-48 bg-yellow-100/40 dark:bg-yellow-950/10 border border-yellow-200 dark:border-yellow-900/50 rounded-xl shadow-inner overflow-hidden flex flex-col items-center justify-center p-6">
                  {/* Mock messy background with handwriting */}
                  <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
                  
                  {/* Moldy shadow patch */}
                  <div className="absolute w-24 h-24 bg-zinc-500/20 rounded-full blur-xl top-8 left-8" />
                  
                  <div className="space-y-1.5 z-10 text-center text-zinc-400">
                    <span className="text-sm font-serif font-black italic block text-zinc-700 dark:text-zinc-300">
                      {t('handwritingInkContrastBooster.inkTitle')}
                    </span>
                    <span className="text-[10px] text-zinc-400 block font-mono">
                      {t('handwritingInkContrastBooster.bleachHelp')}
                    </span>
                  </div>

                  {/* Contrast booster magnifying lens window */}
                  {isHovered && (
                    <div 
                      className="absolute w-24 h-24 rounded-full border-2 border-primary bg-white dark:bg-zinc-950 shadow-2xl flex items-center justify-center overflow-hidden pointer-events-none transform -translate-x-12 -translate-y-12 z-30"
                      style={{ 
                        left: `${lensPosition.x}%`, 
                        top: `${lensPosition.y}%`,
                        boxShadow: '0 0 15px rgba(var(--primary), 0.3)'
                      }}
                    >
                      <div className="text-center font-serif font-black italic text-primary scale-125">
                        Pure Ink
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card variant="default" className="p-6 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-850 rounded-[2rem] shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="space-y-6">
                <div className="border-b border-zinc-150 dark:border-zinc-800 pb-3 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('handwritingInkContrastBooster.optionsTitle')}</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-1.5">
                    {t('handwritingInkContrastBooster.targetTypeLabel')}
                    <select
                      value={inkType}
                      onChange={(e) => setInkType(e.target.value as any)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    >
                      {t('handwritingInkContrastBooster.typeAuto')}
                      {t('handwritingInkContrastBooster.typeDarkInk')}
                      {t('handwritingInkContrastBooster.typeRedStamp')}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-zinc-500 font-bold flex justify-between">
                      {t('handwritingInkContrastBooster.bleachThreshold')}
                      <span className="font-mono text-primary font-bold">{threshold}</span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="245"
                      value={threshold}
                      onChange={(e) => setThreshold(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-zinc-500 font-bold flex justify-between">
                      {t('handwritingInkContrastBooster.strokeContrast')}
                      <span className="font-mono text-primary font-bold">{contrast.toFixed(1)}x</span>
                    </label>
                    <input
                      type="range"
                      min="1.0"
                      max="3.0"
                      step="0.1"
                      value={contrast}
                      onChange={(e) => setContrast(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename={`${file.name.replace(/\.[^/.]+$/, '')}_ink_boosted.png`}
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
                    onClick={handleOptimize}
                    disabled={status === 'processing'}
                  >
                    <RefreshCw className={`w-4 h-4 ${status === 'processing' ? 'animate-spin' : ''}`} />
                    {t('handwritingInkContrastBooster.processButton')}
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

export default HandwritingInkContrastBoosterTool;
