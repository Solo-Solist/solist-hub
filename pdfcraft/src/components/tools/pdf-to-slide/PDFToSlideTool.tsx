'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { reconstructPDFToSlide } from '@/lib/pdf/processors/pdf-to-slide';
import {
  Presentation,
  Palette,
  Sparkles,
  ChevronRight,
  Download,
  BookOpen
} from 'lucide-react';

interface SlidePreview {
  title: string;
  bullets: string[];
}

export function PDFToSlideTool() {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.pdfToSlide');

  const [file, setFile] = useState<File | null>(null);
  const [themeColor, setThemeColor] = useState('#6366f1'); // Indigo default
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<SlidePreview[]>([]);

  const handleUpload = (uploadedFiles: File[]) => {
    if (uploadedFiles.length > 0) {
      setFile(uploadedFiles[0]);
      setResult(null);
      setError(null);
      setStatus('idle');
      setSlides([]);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setStatus('processing');
    setProgress(10);
    setError(null);
    setIsAnimating(true);

    try {
      const output = await reconstructPDFToSlide(
        file,
        { themeColor },
        (p) => setProgress(p)
      );

      if (output.success && output.result) {
        setResult(output.result as Blob);
        setStatus('complete');
        // Extract slides metadata returned from processor
        if (output.metadata && output.metadata.slides) {
          setSlides(output.metadata.slides as SlidePreview[]);
        }
      } else {
        setError(output.error?.message || 'Failed to reconstruct slides.');
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
      setStatus('error');
    } finally {
      // Keep animation running briefly for WOW effect
      setTimeout(() => {
        setIsAnimating(false);
      }, 1500);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setStatus('idle');
    setSlides([]);
    setActiveSlideIdx(0);
  };

  return (
    <Card className="p-6 max-w-4xl mx-auto shadow-2xl bg-neutral-950 border-neutral-800 text-white">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-lg bg-indigo-600/20 text-indigo-400">
          <Presentation className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
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
          <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-neutral-850">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-neutral-400" />
              <span className="text-sm font-medium truncate max-w-md">{file.name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="text-xs border-neutral-800 text-neutral-300 hover:bg-neutral-800"
            >
              {t('buttons.reset')}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Column: Color Picker & Action */}
            <div className="space-y-6 md:col-span-1">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-indigo-400" />
                  {t('pdfToSlide.themeLabel')}
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setThemeColor(color)}
                      className={`h-8 w-8 rounded-full border-2 transition-all ${
                        themeColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {status === 'idle' && (
                <Button
                  onClick={handleProcess}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
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
                    filename={file.name.replace(/\.pdf$/i, '.pptx')}
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

            {/* Right Column: Slide Outlines & WOW Transition View */}
            <div className="md:col-span-2 space-y-4">
              {isAnimating ? (
                /* Starfield Flow Transition (WOW Effect) */
                <div className="relative h-64 bg-neutral-900 rounded-xl overflow-hidden flex flex-col items-center justify-center border border-indigo-900/30">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/40 via-neutral-950 to-neutral-950 -z-10" />
                  
                  {/* Floating particles */}
                  <div className="absolute top-10 left-12 h-2 w-2 rounded-full bg-indigo-500 blur-sm animate-ping" />
                  <div className="absolute bottom-10 right-20 h-3 w-3 rounded-full bg-pink-500 blur-sm animate-ping" />

                  {/* Flowing Outlines Card */}
                  <div className="space-y-3 text-center z-10">
                    <div className="flex gap-2 justify-center">
                      <div className="p-4 rounded-xl bg-neutral-800/80 backdrop-blur-md border border-indigo-500/30 shadow-lg shadow-indigo-500/10 animate-bounce">
                        <span className="text-xs font-semibold text-indigo-400 font-mono">TEXT OBJECTS</span>
                      </div>
                      <div className="flex items-center text-neutral-600">
                        <ChevronRight className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="p-4 rounded-xl bg-neutral-800/80 backdrop-blur-md border border-pink-500/30 shadow-lg shadow-pink-500/10 animate-pulse">
                        <span className="text-xs font-semibold text-pink-400 font-mono">OOXML PPT SLIDE</span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-400 mt-4 animate-pulse">
                      {t('pdfToSlide.progressReconstructing')}
                    </p>
                  </div>
                </div>
              ) : slides.length > 0 ? (
                /* Slide Previews Panel */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>RECONSTRUCTED OUTLINES ({slides.length} SLIDES)</span>
                    <span>SLIDE {activeSlideIdx + 1} OF {slides.length}</span>
                  </div>

                  {/* Modern Glassmorphic PPT Slide Preview Card */}
                  <div 
                    className="p-6 rounded-xl border min-h-[220px] flex flex-col justify-between transition-all duration-300"
                    style={{
                      backgroundColor: 'rgba(23, 23, 23, 0.75)',
                      borderColor: themeColor,
                      boxShadow: `0 8px 32px rgba(0, 0, 0, 0.2), 0 0 16px ${themeColor}15`
                    }}
                  >
                    <div>
                      {/* Accent indicator */}
                      <div 
                        className="w-12 h-1.5 rounded mb-4" 
                        style={{ backgroundColor: themeColor }}
                      />
                      <h3 className="text-lg font-bold text-neutral-100 leading-snug">
                        {slides[activeSlideIdx].title}
                      </h3>
                      <ul className="mt-4 space-y-2">
                        {slides[activeSlideIdx].bullets.map((bullet, bIdx) => (
                          <li key={bIdx} className="text-xs text-neutral-400 flex items-start gap-2">
                            <span className="text-indigo-400 mt-1">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Pagination buttons */}
                    <div className="flex gap-2 justify-end mt-6 border-t border-neutral-800 pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={activeSlideIdx === 0}
                        onClick={() => setActiveSlideIdx(p => p - 1)}
                        className="text-xs border-neutral-800 bg-transparent text-neutral-300 hover:bg-neutral-800"
                      >
                        {t('pdfToSlide.prevPage')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={activeSlideIdx === slides.length - 1}
                        onClick={() => setActiveSlideIdx(p => p + 1)}
                        className="text-xs border-neutral-800 bg-transparent text-neutral-300 hover:bg-neutral-800"
                      >
                        {t('pdfToSlide.nextPage')}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Idle/Help display */
                <div className="h-64 rounded-xl border border-neutral-800 bg-neutral-900/30 flex items-center justify-center p-6 text-center">
                  <div className="space-y-2">
                    <Sparkles className="w-8 h-8 text-neutral-600 mx-auto" />
                    {t('pdfToSlide.outlinePreviewTitle')}
                    {t('pdfToSlide.outlinePreviewDesc')}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default PDFToSlideTool;
