'use client';

import React, { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { imposeBookletFolding, BookletFoldingOptions } from '@/lib/pdf/processors/booklet-folding-simulator';
import {
  BookOpen,
  Layers,
  Printer,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw
} from 'lucide-react';

export function BookletFoldingSimulatorTool() {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.bookletFoldingSimulator');

  const [file, setFile] = useState<File | null>(null);
  const [foldingMode, setFoldingMode] = useState<'4-page-fold' | '8-page-saddle'>('4-page-fold');
  const [foldProgress, setFoldProgress] = useState(0); // 0 to 100 for folding simulation
  const [is3DMode, setIs3DMode] = useState(true);

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = (uploadedFiles: File[]) => {
    if (uploadedFiles.length > 0) {
      setFile(uploadedFiles[0]);
      setResult(null);
      setError(null);
      setStatus('idle');
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setStatus('processing');
    setProgress(10);
    setError(null);

    try {
      const output = await imposeBookletFolding(
        file,
        { foldingMode },
        (p) => setProgress(p)
      );

      if (output.success && output.result) {
        setResult(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to generate booklet layout.');
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during processing.');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setStatus('idle');
    setFoldProgress(0);
  };

  return (
    <Card className="p-6 max-w-4xl mx-auto shadow-2xl bg-neutral-900 border-neutral-800 text-white">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-lg bg-violet-600/20 text-violet-400">
          <BookOpen className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            {tTools('optionsTitle')}
          </h2>
          <p className="text-xs text-neutral-400">
            {tTools('uploadDescription')}
          </p>
        </div>
      </div>

      {!file ? (
        <FileUploader
          accept={['.pdf']}
          onFilesSelected={handleUpload}
          label={tTools('uploadLabel')}
          description={tTools('uploadDescription')}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-800 border border-neutral-700">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-neutral-400" />
              <span className="text-sm font-medium truncate max-w-md">{file.name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="text-xs border-neutral-700 text-neutral-300 hover:bg-neutral-700"
            >
              {t('buttons.reset')}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Control Panel */}
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-400" />
                  {tTools('foldingMode')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFoldingMode('4-page-fold')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      foldingMode === '4-page-fold'
                        ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                        : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
                    }`}
                  >
                    <div className="font-bold text-sm">{t('bookletFoldingSimulator.fourPagesFold')}</div>
                    <div className="text-[10px] opacity-75 mt-1">{t('bookletFoldingSimulator.oneSheetDoubleSide')}</div>
                  </button>
                  <button
                    onClick={() => setFoldingMode('8-page-saddle')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      foldingMode === '8-page-saddle'
                        ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                        : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
                    }`}
                  >
                    <div className="font-bold text-sm">{t('bookletFoldingSimulator.eightPagesSaddle')}</div>
                    <div className="text-[10px] opacity-75 mt-1">{t('bookletFoldingSimulator.twoSheetsMiddleStitch')}</div>
                  </button>
                </div>
              </div>

              {/* Slider for Folding Progress */}
              <div className="space-y-3 p-4 rounded-xl bg-neutral-800/40 border border-neutral-800">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span className="flex items-center gap-1">
                    <Printer className="w-3.5 h-3.5" />
                    {t('bookletFoldingSimulator.foldingDamping')}
                  </span>
                  <span>{foldProgress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={foldProgress}
                  onChange={(e) => setFoldProgress(parseInt(e.target.value))}
                  className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
                />
                <div className="flex justify-between text-[9px] text-neutral-500">
                  <span>{t('bookletFoldingSimulator.flatUnfold')}</span>
                  <span>{t('bookletFoldingSimulator.fullyFolded')}</span>
                </div>
              </div>

              {/* Process Button */}
              {status === 'idle' && (
                <Button
                  onClick={handleProcess}
                  className="w-full bg-violet-600 hover:bg-violet-700 font-bold"
                >
                  {tTools('processButton')}
                </Button>
              )}

              {status === 'processing' && (
                <ProcessingProgress progress={progress} status={status} />
              )}

              {status === 'complete' && result && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm text-center">
                    {tTools('successMessage')}
                  </div>
                  <DownloadButton
                    file={result}
                    filename={file.name.replace(/\.pdf$/i, '_imposed.pdf')}
                    className="w-full bg-green-600 hover:bg-green-700 font-bold"
                  />
                </div>
              )}

              {status === 'error' && error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* 3D Folding Paper View (WOW FACTOR) */}
            <div className="relative h-64 md:h-auto min-h-[300px] flex items-center justify-center bg-gradient-to-b from-neutral-900 to-neutral-950 rounded-xl overflow-hidden border border-neutral-800 shadow-inner">
              <div className="absolute top-3 right-3 flex gap-2 z-10">
                <button
                  onClick={() => setIs3DMode(!is3DMode)}
                  className="p-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white text-xs flex items-center gap-1 border border-neutral-700"
                >
                  {is3DMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  {is3DMode ? t('bookletFoldingSimulator.view2D') : t('bookletFoldingSimulator.view3D')}
                </button>
              </div>

              {/* 3D Paper Model */}
              <div
                className="w-48 h-64 relative transition-transform duration-300"
                style={{
                  perspective: '1200px',
                  transformStyle: 'preserve-3d',
                  transform: is3DMode
                    ? 'rotateX(30deg) rotateY(-25deg) rotateZ(5deg)'
                    : 'none',
                }}
              >
                {/* Left Page (Static base) */}
                <div
                  className="absolute top-0 left-0 w-24 h-64 bg-neutral-100 rounded-l shadow-lg origin-right border-r border-neutral-300 flex flex-col justify-between p-3 text-neutral-800 transition-all duration-300"
                  style={{
                    backfaceVisibility: 'hidden',
                  }}
                >
                  <div className="text-[10px] text-neutral-400 border-b pb-1 font-mono">SHEET FRONT</div>
                  <div className="text-center font-bold text-lg">P4</div>
                  <div className="text-[9px] text-neutral-400 text-center">{t('bookletFoldingSimulator.leftPageHalf')}</div>
                </div>

                {/* Right Page (Folds over Left Page) */}
                <div
                  className="absolute top-0 left-24 w-24 h-64 bg-neutral-200 rounded-r shadow-lg origin-left flex flex-col justify-between p-3 text-neutral-800 transition-transform"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: `rotateY(${-foldProgress * 1.8}deg)`,
                    boxShadow: foldProgress > 50 
                      ? 'inset 10px 0 15px rgba(0,0,0,0.1)' 
                      : '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  <div className="text-[10px] text-neutral-400 border-b pb-1 text-right font-mono">PAGE 1</div>
                  <div className="text-center font-bold text-lg">P1</div>
                  <div className="text-[9px] text-neutral-400 text-center">{t('bookletFoldingSimulator.rightPageHalf')}</div>
                </div>

                {/* 3D Binding shadow */}
                {is3DMode && (
                  <div 
                    className="absolute top-4 -left-4 w-56 h-72 bg-black/10 blur-xl pointer-events-none -z-10 rounded-xl transition-all"
                    style={{
                      transform: `translateZ(-20px) scale(${1 - foldProgress * 0.003})`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default BookletFoldingSimulatorTool;
