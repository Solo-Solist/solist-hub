'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { pdfToTiff } from '@/lib/pdf/processors/pdf-to-tiff';
import type { ProcessOutput } from '@/types/pdf';
import { 
  Printer, 
  Settings, 
  Cpu, 
  Layers, 
  Sliders, 
  Info, 
  Check, 
  AlertCircle 
} from 'lucide-react';

export interface PDFToTIFFToolProps {
  className?: string;
}

export function PDFToTIFFTool({ className = '' }: PDFToTIFFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Configuration options
  const [colorMode, setColorMode] = useState<'color' | 'grayscale' | 'mono'>('color');
  const [compression, setCompression] = useState<'none' | 'packbits'>('packbits');
  const [dpi, setDpi] = useState<number>(150);

  // Processing & result states
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cancellation ref
  const cancelledRef = useRef(false);

  /**
   * Handle File Selection and read pages
   */
  const handleFileSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    setIsLoadingFile(true);
    setError(null);
    setResult(null);

    try {
      const { PDFDocument } = await import('pdf-lib');
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      setTotalPages(pdf.getPageCount());
    } catch (err) {
      console.error(err);
      setError(t('pdfToTiff.errorMetadata'));
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  const handleClearFile = () => {
    setFile(null);
    setTotalPages(0);
    setResult(null);
  };

  /**
   * Run TIFF Compilation
   */
  const handleProcess = async () => {
    if (!file) {
      setError(t('pdfToTiff.errorUpload'));
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    // Compute PDFJS render scale based on DPI无级滑轨
    // 72 DPI corresponds to scale 1.0
    const calculatedScale = dpi / 72;

    try {
      const output: ProcessOutput = await pdfToTiff(
        file,
        {
          colorMode,
          compression,
          dpi,
          scale: calculatedScale
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || t('pdfToTiff.progressExtracting'));
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        setResult(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || t('pdfToTiff.errorExtracting'));
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : t('pdfToTiff.errorUnknown'));
        setStatus('error');
      }
    }
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  };

  const isProcessing = status === 'processing' || status === 'uploading';

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Zone */}
      <div className="space-y-3">
        <label className="text-sm font-bold text-[hsl(var(--color-foreground))] block">
          {t('pdfToTiff.uploadLabel')}
        </label>
        {file ? (
          <Card 
            variant="outlined" 
            className="relative group p-4 flex items-center justify-between border-2 border-[hsl(var(--color-primary)/0.3)] bg-[hsl(var(--color-muted)/0.15)] rounded-2xl"
          >
            <div className="flex items-center gap-3">
              <svg className="w-10 h-10 text-[hsl(var(--color-primary))]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                <path d="M14 2v6h6" fill="white" />
                <text x="8" y="17" fontSize="5.5" fill="white" fontWeight="bold">TIFF</text>
              </svg>
              <div>
                <p 
                  className="font-semibold text-sm text-[hsl(var(--color-foreground))] truncate max-w-[280px] md:max-w-md" 
                  title={file.name}
                >
                  {file.name}
                </p>
                <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                  {totalPages > 0 ? t('pdfToTiff.uploadSuccess', { count: totalPages, size: (file.size / (1024 * 1024)).toFixed(2) }) : (t('aiPdfReflower.scanningMetadata') || 'Loading...')}
                </p>
              </div>
            </div>
            <button 
              onClick={handleClearFile}
              disabled={isProcessing}
              className="p-1 rounded-full hover:bg-[hsl(var(--color-muted))] text-zinc-400 hover:text-red-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </Card>
        ) : (
          <FileUploader
            accept={['application/pdf']}
            multiple={false}
            onFilesSelected={handleFileSelected}
            onError={setError}
            disabled={isProcessing || isLoadingFile}
            label={t('pdfToTiff.uploadButton')}
            description={t('pdfToTiff.uploadDesc')}
            className="min-h-[160px] p-6 rounded-2xl"
          />
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400">
          <div className="flex gap-2.5 items-start">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        </div>
      )}

      {/* Configuration & 3D Interactive Grid */}
      {file && totalPages > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: 3D Pixel Grid Interactive Widget */}
          <div className="lg:col-span-5 space-y-4">
            <Card variant="outlined" className="p-6 bg-[hsl(var(--color-card))] rounded-2xl flex flex-col items-center justify-center min-h-[360px] overflow-hidden relative">
              <span className="text-xs font-bold text-[hsl(var(--color-muted-foreground))] mb-8 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-[hsl(var(--color-primary))]" />
                {t('pdfToTiff.previewTitle')}
              </span>
              
              <div 
                className="relative w-44 h-44 transform-gpu transition-all duration-700 ease-in-out"
                style={{ 
                  perspective: '600px',
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* 3D Grid container */}
                <div 
                  className="w-full h-full border border-zinc-700/30 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-2xl"
                  style={{
                    transform: 'rotateX(55deg) rotateZ(-35deg)',
                    background: 'rgba(15, 15, 18, 0.85)',
                    boxShadow: colorMode === 'mono'
                      ? '0 25px 50px rgba(255, 255, 255, 0.05), inset 0 0 20px rgba(255,255,255,0.03)'
                      : colorMode === 'grayscale'
                        ? '0 25px 50px rgba(156, 163, 175, 0.08), inset 0 0 20px rgba(156, 163, 175, 0.03)'
                        : '0 25px 50px rgba(99, 102, 241, 0.25), inset 0 0 20px rgba(99, 102, 241, 0.08)',
                  }}
                >
                  {/* Dynamic Grid lines representing DPI */}
                  <div 
                    className="absolute inset-4 rounded-xl opacity-90 grid gap-1 transition-all duration-500"
                    style={{
                      gridTemplateColumns: `repeat(${dpi <= 100 ? 5 : dpi <= 200 ? 10 : 16}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${dpi <= 100 ? 5 : dpi <= 200 ? 10 : 16}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: dpi <= 100 ? 25 : dpi <= 200 ? 100 : 256 }).map((_, idx) => (
                      <div 
                        key={idx}
                        className="rounded-xs transition-all duration-700"
                        style={{
                          background: colorMode === 'mono'
                            ? (Math.random() > 0.45 ? '#ffffff' : '#000000')
                            : colorMode === 'grayscale'
                              ? `rgb(${Math.random() * 200 + 40}, ${Math.random() * 200 + 40}, ${Math.random() * 200 + 40})`
                              : `hsl(${(idx * 17) % 360}, 90%, 65%)`,
                          opacity: colorMode === 'mono' ? (Math.random() > 0.45 ? 0.95 : 0.1) : 0.8
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 text-center max-w-xs leading-normal">
                <p className="text-[11px] font-semibold text-[hsl(var(--color-muted-foreground))]">
                  {colorMode === 'color' 
                    ? t('pdfToTiff.descColor')
                    : colorMode === 'grayscale'
                      ? t('pdfToTiff.descGrayscale')
                      : t('pdfToTiff.descMono')
                  }
                </p>
              </div>
            </Card>
          </div>

          {/* RIGHT: Parameter adjustments */}
          <div className="lg:col-span-7 space-y-6">
            <Card 
              variant="default" 
              className="p-6 rounded-2xl space-y-6 backdrop-blur-md bg-white/40 dark:bg-black/30 border border-white/20 dark:border-zinc-800/40"
            >
              <h3 className="text-sm font-bold text-[hsl(var(--color-foreground))] border-b border-[hsl(var(--color-border))] pb-3 flex items-center gap-1.5">
                <Printer className="w-4.5 h-4.5 text-[hsl(var(--color-primary))]" />
                {t('pdfToTiff.optionsTitle')}
              </h3>

              {/* Color Mode Switcher */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[hsl(var(--color-muted-foreground))] flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                  {t('pdfToTiff.colorModeLabel')}
                </span>
                <div className="flex bg-[hsl(var(--color-muted)/0.5)] p-0.5 rounded-xl border border-[hsl(var(--color-input)/0.4)]">
                  {[
                    { mode: 'color', label: t('pdfToTiff.colorModeFull') },
                    { mode: 'grayscale', label: t('pdfToTiff.colorModeGrayscale') },
                    { mode: 'mono', label: t('pdfToTiff.colorModeMono') }
                  ].map(item => (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => setColorMode(item.mode as any)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        colorMode === item.mode
                          ? 'bg-[hsl(var(--color-card))] text-[hsl(var(--color-foreground))] shadow-sm'
                          : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Compression Algorithm */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[hsl(var(--color-muted-foreground))] flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-zinc-400" />
                  {t('pdfToTiff.compressionLabel')}
                </span>
                <div className="flex bg-[hsl(var(--color-muted)/0.5)] p-0.5 rounded-xl border border-[hsl(var(--color-input)/0.4)]">
                  {[
                    { cmp: 'none', label: t('pdfToTiff.compressionNone') },
                    { cmp: 'packbits', label: t('pdfToTiff.compressionPackbits') }
                  ].map(item => (
                    <button
                      key={item.cmp}
                      type="button"
                      onClick={() => setCompression(item.cmp as any)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        compression === item.cmp
                          ? 'bg-[hsl(var(--color-card))] text-[hsl(var(--color-foreground))] shadow-sm'
                          : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* DPI 无级滑轨 */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-[hsl(var(--color-muted-foreground))] flex items-center gap-1">
                    <Settings className="w-3.5 h-3.5 text-zinc-400" />
                    {t('pdfToTiff.resolutionLabel')}
                  </span>
                  <span className="font-black text-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary)/0.1)] px-2 py-0.5 rounded">
                    {t('pdfToTiff.resolutionDpi', { dpi, percent: Math.round(dpi / 72 * 100) })}
                  </span>
                </div>
                
                <input
                  type="range"
                  min="72"
                  max="600"
                  step="6"
                  value={dpi}
                  onChange={(e) => setDpi(parseInt(e.target.value, 10))}
                  className="w-full accent-[hsl(var(--color-primary))] bg-[hsl(var(--color-muted))] h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                
                <div className="flex justify-between text-[9px] text-[hsl(var(--color-muted-foreground))] font-semibold">
                  <span>{t('pdfToTiff.dpi72')}</span>
                  <span>{t('pdfToTiff.dpi150')}</span>
                  <span>{t('pdfToTiff.dpi300')}</span>
                  <span>{t('pdfToTiff.dpi600')}</span>
                </div>
              </div>

              {/* Halftone / 1-bit logic notice */}
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/20 border border-[hsl(var(--color-border)/0.5)] text-[10px] text-[hsl(var(--color-muted-foreground))] leading-normal flex gap-2">
                <Info className="w-4 h-4 text-[hsl(var(--color-primary))] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[hsl(var(--color-foreground))]">{t('pdfToTiff.tipTitle')}</span>
                  {t('pdfToTiff.tipDesc') || 'TIFF recommendations:'} <span className="text-[hsl(var(--color-primary))] font-extrabold mx-0.5">{t('pdfToTiff.tipRecommend') || '300 DPI'}</span> {t('pdfToTiff.tipTail') || 'to ensure clean edges.'}
                </div>
              </div>

            </Card>

            {/* Run Buttons */}
            <div className="space-y-3">
              <Button
                variant="primary"
                size="lg"
                onClick={handleProcess}
                disabled={isProcessing}
                className="w-full py-4 font-bold shadow-lg shadow-[hsl(var(--color-primary)/0.15)] flex items-center justify-center gap-2"
              >
                <Printer className="w-5 h-5" />
                {isProcessing ? (t('pdfToTiff.processing') || 'Processing...') : t('pdfToTiff.processButton')}
              </Button>

              {result && (
                <DownloadButton
                  file={result}
                  filename={`${file.name.replace(/\.pdf$/i, '')}.tiff`}
                  variant="secondary"
                  size="lg"
                  className="w-full py-4"
                  showFileSize
                />
              )}
            </div>

            {/* Complete Prompt */}
            {status === 'complete' && result && (
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400 text-center animate-in fade-in">
                <p className="text-sm font-semibold flex items-center justify-center gap-1.5">
                  <Check className="w-5 h-5" />
                  {t('pdfToTiff.successMessage')}
                </p>
              </div>
            )}
          </div>
          
        </div>
      )}

      {/* Processing Progress */}
      {isProcessing && (
        <ProcessingProgress
          progress={progress}
          status={status}
          message={progressMessage}
          onCancel={handleCancel}
          showPercentage
        />
      )}
    </div>
  );
}

export default PDFToTIFFTool;
