'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { stitchScratchpadCanvas, type PdfScratchpadCanvasOptions } from '@/lib/pdf/processors/pdf-scratchpad-canvas';
import type { ProcessOutput } from '@/types/pdf';
import { Sliders, Eye, RefreshCw, PenTool, Columns } from 'lucide-react';

export interface PdfScratchpadCanvasToolProps {
  className?: string;
}

export function PdfScratchpadCanvasTool({ className = '' }: PdfScratchpadCanvasToolProps) {
  const t = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [padPosition, setPadPosition] = useState<'right' | 'bottom'>('right');
  const [padSize, setPadSize] = useState(200);
  const [gridType, setGridType] = useState<'grid' | 'ruled' | 'blank'>('grid');

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const [showScratchpad, setShowScratchpad] = useState(true);

  const handleFileSelected = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setFile(selectedFiles[0]);
    setError(null);
    setResultBlob(null);
  }, []);

  const handleStitch = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await stitchScratchpadCanvas(
        [file],
        { padPosition, padSize, gridType },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Stitching scratchpad margins...');
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
        setError(output.error?.message || 'Failed to stitch canvases.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error stitching canvases.');
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
          label={t('pdfScratchpadCanvas.uploadLabel')}
          description={t('pdfScratchpadCanvas.uploadDescription')}
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
                  <Columns className="w-4 h-4 text-primary animate-pulse" />
                  {t('pdfScratchpadCanvas.previewTitle')}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setShowScratchpad(!showScratchpad)}>
                  {showScratchpad ? t('pdfScratchpadCanvas.foldPad') : t('pdfScratchpadCanvas.unfoldPad')}
                </Button>
              </div>

              {/* 3D notebook unfolding grid margin mockup */}
              <div className="flex-1 flex items-center justify-center p-6 perspective-[1000px]">
                <div className="flex items-center justify-center relative shadow-xl rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden min-h-[220px]">
                  {/* Left normal page content */}
                  <div className="w-40 h-52 p-4 space-y-3 border-r border-zinc-200 dark:border-zinc-800">
                    <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800/40 rounded" />
                    <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800/40 rounded" />
                    <div className="h-2 w-5/6 bg-zinc-100 dark:bg-zinc-800/40 rounded" />
                  </div>

                  {/* Right scratchpad fold margin */}
                  <div 
                    className="h-52 bg-yellow-50/40 dark:bg-yellow-950/10 transition-all duration-500 ease-out origin-left flex items-center justify-center"
                    style={{
                      width: showScratchpad ? `${padSize / 1.5}px` : '0px',
                      transform: showScratchpad ? 'rotateY(0deg)' : 'rotateY(-90deg)',
                      opacity: showScratchpad ? 1 : 0,
                    }}
                  >
                    <div className="w-full h-full relative p-3">
                      {/* Draw grids decoratively */}
                      {gridType === 'grid' && (
                        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:10px_10px] opacity-60" />
                      )}
                      {gridType === 'ruled' && (
                        <div className="absolute inset-0 flex flex-col justify-between py-4">
                          <div className="border-b border-zinc-200 dark:border-zinc-800 h-0 w-full" />
                          <div className="border-b border-zinc-200 dark:border-zinc-800 h-0 w-full" />
                          <div className="border-b border-zinc-200 dark:border-zinc-800 h-0 w-full" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[8px] text-zinc-400 font-mono tracking-widest font-black uppercase">
                          {gridType} pad
                        </span>
                      </div>
                    </div>
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
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('pdfScratchpadCanvas.optionsTitle')}</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-zinc-500 font-bold">{t('pdfScratchpadCanvas.padPositionLabel')}</label>
                    <select
                      value={padPosition}
                      onChange={(e) => setPadPosition(e.target.value as any)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    >
                      <option value="right">{t('pdfScratchpadCanvas.padPositionRight')}</option>
                      <option value="bottom">{t('pdfScratchpadCanvas.padPositionBottom')}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-zinc-500 font-bold flex justify-between">
                      <span>{t('pdfScratchpadCanvas.padSizeLabel')}</span>
                      <span className="font-mono text-primary font-bold">{padSize} pt</span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="350"
                      step="10"
                      value={padSize}
                      onChange={(e) => setPadSize(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-500 font-bold">{t('pdfScratchpadCanvas.gridTypeLabel')}</label>
                    <select
                      value={gridType}
                      onChange={(e) => setGridType(e.target.value as any)}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    >
                      <option value="grid">{t('pdfScratchpadCanvas.gridTypeGrid')}</option>
                      <option value="ruled">{t('pdfScratchpadCanvas.gridTypeRuled')}</option>
                      <option value="blank">{t('pdfScratchpadCanvas.gridTypeBlank')}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename={`${file.name.replace(/\.[^/.]+$/, '')}_scratchpad.pdf`}
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
                    onClick={handleStitch}
                    disabled={status === 'processing'}
                  >
                    <RefreshCw className={`w-4 h-4 ${status === 'processing' ? 'animate-spin' : ''}`} />
                    {t('pdfScratchpadCanvas.processButton')}
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

export default PdfScratchpadCanvasTool;
