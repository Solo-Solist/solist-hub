'use client';

import React, { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { designPDFSpine, type PdfSpineBookbinderOptions } from '@/lib/pdf/processors/pdf-spine-bookbinder';
import type { ProcessOutput } from '@/types/pdf';
import { Sliders, Book, RefreshCw, Compass, Shield } from 'lucide-react';

export interface PdfSpineBookbinderToolProps {
  className?: string;
}

export function PdfSpineBookbinderTool({ className = '' }: PdfSpineBookbinderToolProps) {
  const t = useTranslations('common');
  const [pageCount, setPageCount] = useState(100);
  const [paperGsm, setPaperGsm] = useState<80 | 100 | 120 | 150>(80);
  const [bookTitle, setBookTitle] = useState('PDFCraft Design');

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  // 3D rotation mockup control
  const [rotation, setRotation] = useState({ x: -20, y: -30 });
  const [isMouseDown, setIsMouseDown] = useState(false);
  const mouseStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsMouseDown(true);
    mouseStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown) return;
    const deltaX = e.clientX - mouseStart.current.x;
    const deltaY = e.clientY - mouseStart.current.y;
    setRotation((prev) => ({
      x: Math.max(-60, Math.min(60, prev.x - deltaY * 0.5)),
      y: prev.y + deltaX * 0.5,
    }));
    mouseStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
  };

  // Calculate simulated spine width
  let sheetThick = 0.1;
  if (paperGsm === 100) sheetThick = 0.12;
  else if (paperGsm === 120) sheetThick = 0.14;
  else if (paperGsm === 150) sheetThick = 0.18;
  const sheets = Math.ceil(pageCount / 2);
  const spineWidthMm = sheets * sheetThick;

  const handleDesign = async () => {
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const output: ProcessOutput = await designPDFSpine(
        [],
        {
          pageCount,
          paperGsm,
          coverWidthPt: 595.27,
          coverHeightPt: 841.89,
          bookTitle,
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Engraving spine creasing folds...');
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
        setError(output.error?.message || 'Failed to design spine layout.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error designing spine.');
        setStatus('error');
      }
    }
  };

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-4">
          <Card 
            variant="outlined" 
            className="p-6 bg-zinc-50 dark:bg-zinc-950/40 relative overflow-hidden rounded-[2rem] min-h-[400px] flex flex-col justify-between border-2 border-dashed border-zinc-200 dark:border-zinc-800 select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 pointer-events-none">
              <span className="text-xs font-bold text-zinc-500 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-primary animate-spin" style={{ animationDuration: '8s' }} />
                {t('pdfSpineBookbinder.magnifierTitle')}
              </span>
              <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-bold">
                {t('pdfSpineBookbinder.spineWidthText', { width: spineWidthMm.toFixed(2) })}
              </span>
            </div>

            {/* 3D rotate book viewport */}
            <div className="flex-1 flex items-center justify-center p-6 perspective-[1000px]">
              <div 
                className="w-40 h-56 relative transform-style-3d transition-transform duration-100 ease-out"
                style={{ 
                  transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
                }}
              >
                {/* Back Cover */}
                <div className="absolute w-36 h-52 bg-zinc-400 border border-zinc-500 rounded-l-md origin-right -translate-x-36 z-10 flex items-center justify-center text-[10px] text-zinc-600 font-bold"
                  style={{ transform: 'rotateY(180deg) translateZ(0px)', transformOrigin: 'right' }}
                >
                  BACK COVER
                </div>

                {/* Spine side */}
                <div 
                  className="absolute h-52 bg-primary border-t border-b border-primary-hover flex items-center justify-center text-white text-[9px] font-bold overflow-hidden"
                  style={{ 
                    width: `${Math.max(4, spineWidthMm * 2)}px`,
                    transform: `rotateY(90deg) translateZ(18px) translateX(-${Math.max(2, spineWidthMm)}px)`,
                    boxShadow: '0 0 10px rgba(var(--primary), 0.5)'
                  }}
                >
                  <div className="transform rotate-90 whitespace-nowrap tracking-wider font-mono">
                    {bookTitle || 'SPINE'}
                  </div>
                </div>

                {/* Front Cover */}
                <div className="absolute w-36 h-52 bg-white dark:bg-zinc-900 border-2 border-primary rounded-r-md z-20 flex flex-col items-center justify-center p-4"
                  style={{ transform: 'translateZ(1px)' }}
                >
                  <Book className="w-8 h-8 text-primary mb-2" />
                  <span className="text-[10px] text-center font-black line-clamp-2 text-zinc-800 dark:text-zinc-200">
                    {bookTitle || 'Untitled Book'}
                  </span>
                  <span className="text-[8px] text-zinc-400 mt-2 font-mono">
                    {pageCount} Pages
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Card variant="default" className="p-6 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-850 rounded-[2rem] shadow-xl flex flex-col justify-between min-h-[400px]">
            <div className="space-y-6">
              <div className="border-b border-zinc-150 dark:border-zinc-800 pb-3 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('pdfSpineBookbinder.optionsTitle')}</h3>
              </div>

              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  {t('pdfSpineBookbinder.spineTextLabel')}
                  <input
                    type="text"
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                    placeholder={t('pdfSpineBookbinder.spineTextPlaceholder')}
                    className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-zinc-500 font-bold flex justify-between">
                    {t('pdfSpineBookbinder.totalPagesLabel')}
                    <span className="font-mono text-primary font-bold">{t('pdfSpineBookbinder.totalPagesUnit', { count: pageCount })}</span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    step="2"
                    value={pageCount}
                    onChange={(e) => setPageCount(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  {t('pdfSpineBookbinder.gsmLabel')}
                  <select
                    value={paperGsm}
                    onChange={(e) => setPaperGsm(parseInt(e.target.value) as any)}
                    className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                  >
                    {t('pdfSpineBookbinder.gsm80')}
                    {t('pdfSpineBookbinder.gsm100')}
                    {t('pdfSpineBookbinder.gsm120')}
                    {t('pdfSpineBookbinder.gsm150')}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
              {status === 'complete' && resultBlob ? (
                <DownloadButton
                  file={resultBlob}
                  filename="spine_cover_binding_crease.pdf"
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
                  onClick={handleDesign}
                  disabled={status === 'processing'}
                >
                  <RefreshCw className={`w-4 h-4 ${status === 'processing' ? 'animate-spin' : ''}`} />
                  {t('pdfSpineBookbinder.processButton')}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

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

export default PdfSpineBookbinderTool;
