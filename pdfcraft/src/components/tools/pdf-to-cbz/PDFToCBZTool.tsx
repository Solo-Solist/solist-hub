'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { pdfToCbz } from '@/lib/pdf/processors/pdf-to-cbz';
import type { ProcessOutput } from '@/types/pdf';
import { 
  BookOpen, 
  Settings2, 
  Layers, 
  User, 
  Tag, 
  Globe, 
  Eye, 
  HelpCircle, 
  Check, 
  AlertCircle 
} from 'lucide-react';

export interface PDFToCBZToolProps {
  className?: string;
}

export function PDFToCBZTool({ className = '' }: PDFToCBZToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Configuration options
  const [title, setTitle] = useState<string>('');
  const [series, setSeries] = useState<string>('');
  const [number, setNumber] = useState<string>('1');
  const [volume, setVolume] = useState<string>('1');
  const [writer, setWriter] = useState<string>('');
  const [publisher, setPublisher] = useState<string>('');
  const [genre, setGenre] = useState<string>('');
  const [manga, setManga] = useState<'No' | 'YesAndRightToLeft'>('No');
  const [grayscale, setGrayscale] = useState<boolean>(false);
  const [format, setFormat] = useState<'jpg' | 'png' | 'webp'>('jpg');
  const [scale, setScale] = useState<number>(1.5);
  const [quality, setQuality] = useState<number>(0.85);

  // Processing & result states
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cancellation ref
  const cancelledRef = useRef(false);

  /**
   * Handle File Selection and get pages
   */
  const handleFileSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    setIsLoadingFile(true);
    setError(null);
    setResult(null);

    // Set default title matching filename
    const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
    setTitle(baseName);

    try {
      const { PDFDocument } = await import('pdf-lib');
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      setTotalPages(pdf.getPageCount());
    } catch (err) {
      console.error(err);
      setError(t('pdfToCbz.errorMetadata'));
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  const handleClearFile = () => {
    setFile(null);
    setTotalPages(0);
    setTitle('');
    setResult(null);
  };

  /**
   * Run CBZ Packing compiler
   */
  const handleProcess = async () => {
    if (!file) {
      setError(t('pdfToCbz.errorUpload'));
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const output: ProcessOutput = await pdfToCbz(
        file,
        {
          title: title || file.name.replace(/\.pdf$/i, ''),
          series: series || undefined,
          number: number || undefined,
          volume: volume || undefined,
          writer: writer || undefined,
          publisher: publisher || undefined,
          genre: genre || undefined,
          manga,
          grayscale,
          format,
          scale,
          quality
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || t('pdfToCbz.progressExtracting'));
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
        setError(output.error?.message || t('pdfToCbz.errorExtracting'));
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : t('pdfToCbz.errorUnknown'));
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
          {t('pdfToCbz.uploadLabel')}
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
                <text x="8" y="17" fontSize="5.5" fill="white" fontWeight="bold">CBZ</text>
              </svg>
              <div>
                <p 
                  className="font-semibold text-sm text-[hsl(var(--color-foreground))] truncate max-w-[280px] md:max-w-md" 
                  title={file.name}
                >
                  {file.name}
                </p>
                <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                  {totalPages > 0 ? t('pdfToCbz.uploadSuccess', { count: totalPages, size: (file.size / (1024 * 1024)).toFixed(2) }) : (t('aiPdfReflower.scanningMetadata') || 'Loading...')}
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
            label={t('pdfToCbz.uploadButton')}
            description={t('pdfToCbz.uploadDesc')}
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

      {/* Configuration Panel & 3D Preview */}
      {file && totalPages > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: 3D Comic Book floating Preview */}
          <div className="lg:col-span-5 space-y-4">
            <Card variant="outlined" className="p-6 bg-[hsl(var(--color-card))] rounded-2xl flex flex-col items-center justify-center min-h-[360px] overflow-hidden relative">
              <span className="text-xs font-bold text-[hsl(var(--color-muted-foreground))] mb-8 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[hsl(var(--color-primary))]" />
                {t('pdfToCbz.previewTitle')}
              </span>
              
              <div 
                className="relative w-48 h-64 transform-gpu transition-all duration-700 ease-in-out cursor-pointer"
                style={{ 
                  perspective: '1000px',
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* 3D Book card */}
                <div
                  className="w-full h-full relative rounded-r-lg shadow-2xl transition-transform duration-500 hover:rotate-y-12"
                  style={{
                    transform: manga === 'YesAndRightToLeft' 
                      ? 'rotateY(-15deg) rotateX(8deg) rotateZ(1deg)' 
                      : 'rotateY(15deg) rotateX(8deg) rotateZ(-1deg)',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  {/* Front Cover page */}
                  <div 
                    className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950 border border-zinc-700 text-white rounded-r-lg flex flex-col justify-between p-4 select-none"
                    style={{
                      transform: 'translateZ(10px)',
                      boxShadow: 'inset 0 0 30px rgba(0,0,0,0.8), 0 15px 30px rgba(0,0,0,0.5)'
                    }}
                  >
                    <div className="space-y-1">
                      <span className="text-[9px] font-black tracking-widest text-emerald-400 bg-emerald-950/60 border border-emerald-500/25 px-2 py-0.5 rounded-full uppercase">
                        {manga === 'YesAndRightToLeft' ? '🇯🇵 MANGA (RTL)' : '📖 COMIC (LTR)'}
                      </span>
                      <h4 className="font-extrabold text-sm line-clamp-2 mt-3 leading-snug">
                        {series || title || t('pdfToCbz.comicTitleDefault')}
                      </h4>
                      {volume && (
                        <p className="text-[10px] font-bold text-zinc-400">
                          VOL. {volume}
                        </p>
                      )}
                    </div>
                    
                    <div className="border-t border-zinc-700/60 pt-2 flex justify-between items-end">
                      <div>
                        <p className="text-[8px] text-zinc-500 uppercase tracking-wider font-bold">Artist / Writer</p>
                        <p className="text-[10px] font-bold truncate max-w-[100px] text-zinc-300">
                          {writer || t('pdfToCbz.comicArtistDefault')}
                        </p>
                      </div>
                      <div className="w-7 h-7 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                        <span className="text-xs font-black text-emerald-400">
                          #{number || '1'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Book Spine (thickness) */}
                  <div 
                    className="absolute top-0 bottom-0 bg-zinc-950 border-r border-zinc-800 flex items-center justify-center text-[7px] font-extrabold text-zinc-500 select-none"
                    style={{
                      width: '20px',
                      left: manga === 'YesAndRightToLeft' ? 'auto' : '-10px',
                      right: manga === 'YesAndRightToLeft' ? '-10px' : 'auto',
                      transform: 'rotateY(90deg) translateZ(10px)',
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                    }}
                  >
                    {series || title || 'BOOK SPIN TEXT'} • VOL.{volume}
                  </div>
                </div>
              </div>

              <div className="mt-8 text-center max-w-xs leading-normal">
                <p className="text-[11px] font-semibold text-[hsl(var(--color-muted-foreground))]">
                  {manga === 'YesAndRightToLeft' 
                    ? t('pdfToCbz.directionRtlHelp')
                    : t('pdfToCbz.directionLtrHelp')
                  }
                </p>
              </div>
            </Card>
          </div>

          {/* RIGHT: Parameter & Book properties input */}
          <div className="lg:col-span-7 space-y-6">
            <Card 
              variant="default" 
              className="p-6 rounded-2xl space-y-6 backdrop-blur-md bg-white/40 dark:bg-black/30 border border-white/20 dark:border-zinc-800/40"
            >
              <h3 className="text-sm font-bold text-[hsl(var(--color-foreground))] border-b border-[hsl(var(--color-border))] pb-3 flex items-center gap-1.5">
                <Settings2 className="w-4.5 h-4.5 text-[hsl(var(--color-primary))]" />
                {t('pdfToCbz.metadataTitle')}
              </h3>

              {/* Grid properties */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Book Title */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[hsl(var(--color-muted-foreground))]">
                    {t('pdfToCbz.fieldTitle')}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[hsl(var(--color-muted)/0.3)] border border-[hsl(var(--color-input))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] transition-all"
                  />
                </div>

                {/* Series name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[hsl(var(--color-muted-foreground))]">
                    {t('pdfToCbz.fieldSeries')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('pdfToCbz.seriesPlaceholder')}
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[hsl(var(--color-muted)/0.3)] border border-[hsl(var(--color-input))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] transition-all"
                  />
                </div>

                {/* Issue Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[hsl(var(--color-muted-foreground))]">
                    {t('pdfToCbz.fieldIssue')}
                  </label>
                  <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[hsl(var(--color-muted)/0.3)] border border-[hsl(var(--color-input))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] transition-all"
                  />
                </div>

                {/* Volume Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[hsl(var(--color-muted-foreground))]">
                    {t('pdfToCbz.fieldVolume')}
                  </label>
                  <input
                    type="text"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[hsl(var(--color-muted)/0.3)] border border-[hsl(var(--color-input))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] transition-all"
                  />
                </div>

                {/* Writer/Artist */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[hsl(var(--color-muted-foreground))] flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    {t('pdfToCbz.fieldArtist')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('pdfToCbz.artistPlaceholder')}
                    value={writer}
                    onChange={(e) => setWriter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[hsl(var(--color-muted)/0.3)] border border-[hsl(var(--color-input))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] transition-all"
                  />
                </div>

                {/* Publisher */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[hsl(var(--color-muted-foreground))]">
                    {t('pdfToCbz.fieldPublisher')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('pdfToCbz.publisherPlaceholder')}
                    value={publisher}
                    onChange={(e) => setPublisher(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[hsl(var(--color-muted)/0.3)] border border-[hsl(var(--color-input))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] transition-all"
                  />
                </div>

                {/* Genre */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[hsl(var(--color-muted-foreground))] flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-zinc-400" />
                    {t('pdfToCbz.fieldGenre')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('pdfToCbz.genrePlaceholder')}
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[hsl(var(--color-muted)/0.3)] border border-[hsl(var(--color-input))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] transition-all"
                  />
                </div>

                {/* Manga LTR/RTL reading order */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[hsl(var(--color-muted-foreground))] flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-zinc-400" />
                    {t('pdfToCbz.readingOrderLabel')}
                  </label>
                  <select
                    value={manga}
                    onChange={(e) => setManga(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[hsl(var(--color-muted)/0.35)] border border-[hsl(var(--color-input))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] transition-all"
                  >
                    <option value="No">{t('pdfToCbz.readingOrderLtr')}</option>
                    <option value="YesAndRightToLeft">{t('pdfToCbz.readingOrderRtl')}</option>
                  </select>
                </div>
              </div>

              {/* Adjustments: compression, scale & grayscale */}
              <div className="border-t border-[hsl(var(--color-border))] pt-4 space-y-4">
                <h4 className="text-xs font-bold text-[hsl(var(--color-foreground))] flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  {t('pdfToCbz.deviceOptimizeTitle')}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Quality slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <label className="font-bold text-[hsl(var(--color-muted-foreground))]">
                        {t('pdfToCbz.qualityLabel')}
                      </label>
                      <span className="font-black text-[hsl(var(--color-primary))]">
                        {Math.round(quality * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1"
                      step="0.05"
                      value={quality}
                      onChange={(e) => setQuality(parseFloat(e.target.value))}
                      className="w-full accent-[hsl(var(--color-primary))] bg-[hsl(var(--color-muted))] h-1 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Scale slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <label className="font-bold text-[hsl(var(--color-muted-foreground))]">
                        {t('pdfToCbz.scaleLabel')}
                      </label>
                      <span className="font-black text-[hsl(var(--color-primary))]">
                        {scale.toFixed(1)}x ({Math.round(scale * 72)} DPI)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="2.5"
                      step="0.1"
                      value={scale}
                      onChange={(e) => setScale(parseFloat(e.target.value))}
                      className="w-full accent-[hsl(var(--color-primary))] bg-[hsl(var(--color-muted))] h-1 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Format selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[hsl(var(--color-muted-foreground))] block">
                      {t('pdfToCbz.formatLabel')}
                    </label>
                    <div className="flex bg-[hsl(var(--color-muted)/0.5)] p-0.5 rounded-lg border border-[hsl(var(--color-input)/0.4)]">
                      {(['jpg', 'png', 'webp'] as const).map(fmt => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setFormat(fmt)}
                          className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${
                            format === fmt
                              ? 'bg-[hsl(var(--color-card))] text-[hsl(var(--color-foreground))] shadow-sm'
                              : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]'
                          }`}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grayscale switch */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-[hsl(var(--color-muted)/0.2)] border border-[hsl(var(--color-input)/0.2)]">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-zinc-400" />
                      <div>
                        <span className="text-[11px] font-bold text-[hsl(var(--color-foreground))] block">
                          {t('pdfToCbz.einkGreyscale')}
                        </span>
                        <span className="text-[8px] text-[hsl(var(--color-muted-foreground))] block leading-none mt-0.5">
                          {t('pdfToCbz.einkGreyscaleDesc')}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGrayscale(prev => !prev)}
                      className={`relative w-9 h-5 rounded-full transition-colors duration-300 focus:outline-none ${
                        grayscale ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                    >
                      <div 
                        className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full shadow transition-transform duration-300 ${
                          grayscale ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

            </Card>

            {/* Run Button */}
            <div className="space-y-3">
              <Button
                variant="primary"
                size="lg"
                onClick={handleProcess}
                disabled={isProcessing}
                className="w-full py-4 font-bold shadow-lg shadow-[hsl(var(--color-primary)/0.15)] flex items-center justify-center gap-2"
              >
                <BookOpen className="w-5 h-5" />
                {isProcessing ? (t('pdfToCbz.processing') || 'Processing...') : t('pdfToCbz.processButton')}
              </Button>

              {result && (
                <DownloadButton
                  file={result}
                  filename={`${file.name.replace(/\.pdf$/i, '')}.cbz`}
                  variant="secondary"
                  size="lg"
                  className="w-full py-4"
                  showFileSize
                />
              )}
            </div>

            {/* Complete Alert */}
            {status === 'complete' && result && (
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400 text-center animate-in fade-in">
                <p className="text-sm font-semibold flex items-center justify-center gap-1.5">
                  <Check className="w-5 h-5" />
                  {t('pdfToCbz.successMessage')}
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

export default PDFToCBZTool;
