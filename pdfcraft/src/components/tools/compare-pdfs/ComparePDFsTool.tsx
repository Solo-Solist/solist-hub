'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { configurePdfjsWorker } from '@/lib/pdf/loader';
import { 
  FileText, 
  HelpCircle, 
  Check, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Shuffle, 
  Eye, 
  Settings, 
  Filter, 
  Download, 
  Minimize, 
  Maximize2 
} from 'lucide-react';

export interface ComparePDFsToolProps {
  className?: string;
}

interface TextWordInfo {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontName: string;
  itemIdx: number;
}

interface PageTextContent {
  rawText: string;
  words: TextWordInfo[];
  originalItems: any[];
}

interface PDFFile {
  file: File;
  pageCount: number;
  pageTextContents: PageTextContent[];
  // Image buffers for rendering canvases
  pagesImages: string[]; // DataURLs of rendered pages
  pageDimensions: Array<{ width: number; height: number; scale: number }>;
}

interface DiffHighlight {
  type: 'added' | 'deleted' | 'modified' | 'moved';
  text: string;
  // Bounding rect relative to the viewport/canvas
  x: number;
  y: number;
  w: number;
  h: number;
  category: 'text' | 'header-footer' | 'formatting';
  movedToPageIndex?: number;
  movedToCoords?: { x: number; y: number };
}

interface PageComparisonResult {
  pageIndex1: number; // 0-based index of original file, -1 if inserted page
  pageIndex2: number; // 0-based index of modified file, -1 if deleted page
  hasDifference: boolean;
  highlights1: DiffHighlight[]; // deleted / modified / moved source
  highlights2: DiffHighlight[]; // added / modified / moved dest
  diffPercentage: number;
}

export function ComparePDFsTool({ className = '' }: ComparePDFsToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // Files state
  const [file1, setFile1] = useState<PDFFile | null>(null);
  const [file2, setFile2] = useState<PDFFile | null>(null);

  // Configuration options (Categories)
  const [filterPills, setFilterPills] = useState({
    text: true,
    formatting: true,
    headerFooter: false, // Default ignore header/footer for clean diff
    moved: true
  });

  // Processing & result states
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isProcessing = status === 'processing';
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  // Pagination & pairing outcomes
  const [pairedPages, setPairedPages] = useState<PageComparisonResult[]>([]);
  const [currentPairIdx, setCurrentPairIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Synced scroll refs
  const scrollContainer1Ref = useRef<HTMLDivElement>(null);
  const scrollContainer2Ref = useRef<HTMLDivElement>(null);
  const isScrollingSyncRef = useRef(false);
  const comparisonContainerRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  /**
   * Load PDF, render pages to DataURL, and extract all words with Bounding Box coordinates
   */
  const loadPDF = useCallback(async (file: File, slotNum: 1 | 2): Promise<PDFFile | null> => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      configurePdfjsWorker(pdfjsLib);

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdf.numPages;

      const pageTextContents: PageTextContent[] = [];
      const pagesImages: string[] = [];
      const pageDimensions: Array<{ width: number; height: number; scale: number }> = [];

      const renderScale = 1.5; // Render at high clarity

      for (let i = 1; i <= pageCount; i++) {
        if (cancelledRef.current) return null;

        // Progress breakdown: slot 1 occupies 0-50%, slot 2 occupies 50-100%
        const baseProg = slotNum === 1 ? 0 : 50;
        setProgress(baseProg + Math.round((i / pageCount) * 45));

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: renderScale });
        pageDimensions.push({ width: viewport.width, height: viewport.height, scale: renderScale });

        // 1. Render page to DataURL
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        pagesImages.push(canvas.toDataURL('image/jpeg', 0.85));

        // 2. Extract Bounding Box coordinates for text items
        const textContent = await page.getTextContent();
        const words: TextWordInfo[] = [];
        let rawText = '';

        textContent.items.forEach((item: any, itemIdx: number) => {
          if (!item.str || item.str.trim() === '') return;

          const strVal = item.str;
          const tx = item.transform[4];
          const ty = item.transform[5];
          const itemWidth = item.width || 0;
          const itemHeight = item.height || parseInt(item.transform[3], 10) || 12;
          const fontName = item.fontName || '';

          // High accuracy coordinates conversion
          const ptTopLeft = viewport.convertToViewportPoint(tx, ty + itemHeight);
          const ptBottomRight = viewport.convertToViewportPoint(tx + itemWidth, ty);

          const canvasX = ptTopLeft[0];
          const canvasY = ptTopLeft[1];
          const canvasW = Math.max(2, ptBottomRight[0] - ptTopLeft[0]);
          const canvasH = Math.max(2, ptBottomRight[1] - ptTopLeft[1]);

          // CJK character splitting or English word splitting
          const isChinese = /[\u4e00-\u9fa5]/.test(strVal);
          
          if (isChinese) {
            // For CJK languages, map per character coordinates proportionally
            const chars = strVal.split('');
            const charW = canvasW / chars.length;
            chars.forEach((char: string, charIdx: number) => {
              words.push({
                text: char,
                x: canvasX + (charIdx * charW),
                y: canvasY,
                w: charW,
                h: canvasH,
                fontName,
                itemIdx
              });
            });
            rawText += strVal;
          } else {
            // For space-separated English/Latin words
            const tokens = strVal.split(/(\s+)/);
            let currentTokenX = canvasX;
            const totalChars = strVal.length || 1;
            const pxPerChar = canvasW / totalChars;

            tokens.forEach((token: string) => {
              const tokenW = token.length * pxPerChar;
              if (token.trim() !== '') {
                words.push({
                  text: token,
                  x: currentTokenX,
                  y: canvasY,
                  w: tokenW,
                  h: canvasH,
                  fontName,
                  itemIdx
                });
              }
              currentTokenX += tokenW;
            });
            rawText += strVal + ' ';
          }
        });

        pageTextContents.push({
          rawText,
          words,
          originalItems: textContent.items
        });
      }

      return {
        file,
        pageCount,
        pageTextContents,
        pagesImages,
        pageDimensions
      };
    } catch (err) {
      console.error('PDF parsing error:', err);
      throw err;
    }
  }, []);

  const handleFile1Selected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setProgressMessage(t('comparePdfs.progressExtractingOriginal'));
    setError(null);
    setPairedPages([]);

    try {
      const loaded = await loadPDF(files[0], 1);
      if (loaded) setFile1(loaded);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('comparePdfs.errorExtractingOriginal'));
      setStatus('error');
    }
  }, [loadPDF, t]);

  const handleFile2Selected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(50);
    setProgressMessage(t('comparePdfs.progressExtractingModified'));
    setError(null);
    setPairedPages([]);

    try {
      const loaded = await loadPDF(files[0], 2);
      if (loaded) setFile2(loaded);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('comparePdfs.errorExtractingModified'));
      setStatus('error');
    }
  }, [loadPDF, t]);

  /**
   * World-class Semantic Diff & smart pairing orchestrator
   */
  const handleCompare = useCallback(() => {
    if (!file1 || !file2) return;

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(95);
    setProgressMessage(t('comparePdfs.progressRunningDiff'));

    try {
      // 1. LCS Page Alignment to avoid multi-page shifts
      const pairedList = smartPagePairing(file1, file2);

      // 2. Perform detailed word diff on each aligned page pair
      pairedList.forEach(pair => {
        if (pair.pageIndex1 !== -1 && pair.pageIndex2 !== -1) {
          const page1 = file1.pageTextContents[pair.pageIndex1];
          const page2 = file2.pageTextContents[pair.pageIndex2];
          
          const dim1 = file1.pageDimensions[pair.pageIndex1];
          const dim2 = file2.pageDimensions[pair.pageIndex2];

          const diffResult = diffSinglePageWords(
            page1.words,
            page2.words,
            dim1.height,
            dim2.height
          );

          pair.highlights1 = diffResult.highlights1;
          pair.highlights2 = diffResult.highlights2;
          pair.hasDifference = diffResult.hasDifference;
          pair.diffPercentage = diffResult.diffPercentage;
        } else {
          // One-sided page (entire page inserted or deleted)
          pair.hasDifference = true;
          pair.diffPercentage = 100;
          pair.highlights1 = [];
          pair.highlights2 = [];
        }
      });

      // 3. Moved-Text (段落位移) Cross-correlation analysis
      findMovedTextSegments(pairedList);

      setPairedPages(pairedList);
      setCurrentPairIdx(0);
      setStatus('complete');
    } catch (err) {
      console.error(err);
      setError(t('comparePdfs.errorDiffFailed'));
      setStatus('error');
    }
  }, [file1, file2, t]);

  const handleClearAll = () => {
    setFile1(null);
    setFile2(null);
    setPairedPages([]);
    setError(null);
    setStatus('idle');
    setProgress(0);
    setCurrentPairIdx(0);
  };

  /**
   * Synced scrolling controllers
   */
  const handleScroll1 = useCallback(() => {
    if (isScrollingSyncRef.current) return;
    if (!scrollContainer1Ref.current || !scrollContainer2Ref.current) return;
    isScrollingSyncRef.current = true;
    scrollContainer2Ref.current.scrollTop = scrollContainer1Ref.current.scrollTop;
    scrollContainer2Ref.current.scrollLeft = scrollContainer1Ref.current.scrollLeft;
    requestAnimationFrame(() => { isScrollingSyncRef.current = false; });
  }, []);

  const handleScroll2 = useCallback(() => {
    if (isScrollingSyncRef.current) return;
    if (!scrollContainer1Ref.current || !scrollContainer2Ref.current) return;
    isScrollingSyncRef.current = true;
    scrollContainer1Ref.current.scrollTop = scrollContainer2Ref.current.scrollTop;
    scrollContainer1Ref.current.scrollLeft = scrollContainer2Ref.current.scrollLeft;
    requestAnimationFrame(() => { isScrollingSyncRef.current = false; });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!comparisonContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await comparisonContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => { setIsFullscreen(!!document.fullscreenElement); };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Filter highlights based on user-toggled filter pills
  const getFilteredHighlights = (highlights: DiffHighlight[]) => {
    return highlights.filter(hl => {
      if (hl.type === 'moved' && !filterPills.moved) return false;
      if (hl.category === 'header-footer' && !filterPills.headerFooter) return false;
      if (hl.category === 'formatting' && !filterPills.formatting) return false;
      if (hl.category === 'text' && !filterPills.text) return false;
      return true;
    });
  };

  const currentPair = pairedPages[currentPairIdx];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* File Upload zones */}
      {pairedPages.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* File 1 */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-[hsl(var(--color-foreground))] block">
              {t('comparePdfs.originalPdfTitle')}
            </label>
            {file1 ? (
              <Card variant="outlined" className="p-4 flex items-center justify-between border-2 border-[hsl(var(--color-primary)/0.35)] bg-[hsl(var(--color-muted)/0.15)] rounded-2xl">
                <div className="flex items-center gap-3">
                  <FileText className="w-10 h-10 text-[hsl(var(--color-primary))]" />
                  <div>
                    <p className="font-semibold text-sm truncate max-w-[200px]" title={file1.file.name}>{file1.file.name}</p>
                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">{file1.pageCount} {t('pdfToCbz.pagesLabel') || 'pages'} • {(file1.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFile1(null)}>{t('comparePdfs.removeButton')}</Button>
              </Card>
            ) : (
              <FileUploader
                accept={['application/pdf']}
                multiple={false}
                onFilesSelected={handleFile1Selected}
                onError={setError}
                disabled={isProcessing}
                label={t('comparePdfs.originalPdfLabel')}
                description={t('comparePdfs.originalPdfDesc')}
                className="min-h-[160px] p-6 rounded-2xl"
              />
            )}
          </div>

          {/* File 2 */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-[hsl(var(--color-foreground))] block">
              {t('comparePdfs.modifiedPdfTitle')}
            </label>
            {file2 ? (
              <Card variant="outlined" className="p-4 flex items-center justify-between border-2 border-emerald-500/35 bg-emerald-500/5 rounded-2xl">
                <div className="flex items-center gap-3">
                  <FileText className="w-10 h-10 text-emerald-500" />
                  <div>
                    <p className="font-semibold text-sm truncate max-w-[200px]" title={file2.file.name}>{file2.file.name}</p>
                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">{file2.pageCount} {t('pdfToCbz.pagesLabel') || 'pages'} • {(file2.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFile2(null)}>{t('comparePdfs.removeButton')}</Button>
              </Card>
            ) : (
              <FileUploader
                accept={['application/pdf']}
                multiple={false}
                onFilesSelected={handleFile2Selected}
                onError={setError}
                disabled={isProcessing}
                label={t('comparePdfs.modifiedPdfLabel')}
                description={t('comparePdfs.modifiedPdfDesc')}
                className="min-h-[160px] p-6 rounded-2xl border-emerald-500/20 hover:border-emerald-500"
              />
            )}
          </div>
        </div>
      )}

      {/* Start trigger */}
      {file1 && file2 && pairedPages.length === 0 && !isProcessing && (
        <div className="flex justify-center pt-3">
          <Button
            variant="primary"
            size="lg"
            onClick={handleCompare}
            className="px-12 py-4 font-bold shadow-lg shadow-[hsl(var(--color-primary)/0.15)] flex items-center gap-2"
          >
            <Shuffle className="w-5 h-5 animate-pulse" />
            {t('comparePdfs.startCompare')}
          </Button>
        </div>
      )}

      {/* Processing */}
      {isProcessing && (
        <ProcessingProgress
          progress={progress}
          status={status}
          message={progressMessage}
          onCancel={handleCancel}
          showPercentage
        />
      )}

      {/* Results Workspace */}
      {pairedPages.length > 0 && (
        <div className="space-y-4">
          
          {/* Header Panel */}
          <Card 
            variant="default" 
            className="p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-md bg-white/40 dark:bg-black/35 border border-white/20 dark:border-zinc-800/40"
          >
            <div>
              <h3 className="text-md font-bold text-[hsl(var(--color-foreground))]">
                {t('comparePdfs.successTitle')}
              </h3>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                {t('comparePdfs.totalAligned', { count: pairedPages.length })} • 
                {t.rich('comparePdfs.diffSummary', { count: pairedPages.filter(p => p.hasDifference).length, red: (chunks) => <span className="font-bold text-red-500 mx-1">{chunks}</span> })}
              </p>
            </div>
            
            {/* Filter pills bar */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black text-zinc-400 flex items-center gap-1 uppercase tracking-wider mr-2">
                <Filter className="w-3.5 h-3.5" />
                {t('comparePdfs.filterLabel')}
              </span>
              
              <button
                onClick={() => setFilterPills(p => ({ ...p, text: !p.text }))}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  filterPills.text 
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/35 shadow-sm shadow-amber-500/5' 
                    : 'bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 border border-transparent'
                }`}
              >
                {t('comparePdfs.filterText')}
              </button>

              <button
                onClick={() => setFilterPills(p => ({ ...p, formatting: !p.formatting }))}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  filterPills.formatting 
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/35 shadow-sm shadow-emerald-500/5' 
                    : 'bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 border border-transparent'
                }`}
              >
                {t('comparePdfs.filterFont')}
              </button>

              <button
                onClick={() => setFilterPills(p => ({ ...p, headerFooter: !p.headerFooter }))}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  filterPills.headerFooter 
                    ? 'bg-blue-500/10 text-blue-500 border border-blue-500/35 shadow-sm shadow-blue-500/5' 
                    : 'bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 border border-transparent'
                }`}
              >
                {t('comparePdfs.filterHeaderFooter')}
              </button>

              <button
                onClick={() => setFilterPills(p => ({ ...p, moved: !p.moved }))}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  filterPills.moved 
                    ? 'bg-purple-500/10 text-purple-500 border border-purple-500/35 shadow-sm shadow-purple-500/5' 
                    : 'bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 border border-transparent'
                }`}
              >
                {t('comparePdfs.filterMoved')}
              </button>

              <Button variant="outline" size="sm" onClick={handleClearAll} className="ml-4 py-2 text-xs">
                {t('comparePdfs.resetButton')}
              </Button>
            </div>
          </Card>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between px-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPairIdx(prev => Math.max(0, prev - 1))}
              disabled={currentPairIdx === 0}
              className="flex items-center gap-1 py-2"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('comparePdfs.prevPair')}
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[hsl(var(--color-foreground))]">
                {t('comparePdfs.alignSequence', { current: currentPairIdx + 1, total: pairedPages.length })}
              </span>
              {currentPair && (
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${
                  currentPair.hasDifference
                    ? 'bg-red-500/15 text-red-500 border border-red-500/25'
                    : 'bg-green-500/15 text-green-500 border border-green-500/25'
                }`}>
                  {currentPair.pageIndex1 === -1 && t('comparePdfs.insertedPage')}
                  {currentPair.pageIndex2 === -1 && t('comparePdfs.deletedPage')}
                  {currentPair.pageIndex1 !== -1 && currentPair.pageIndex2 !== -1 && (
                    currentPair.hasDifference 
                      ? t('comparePdfs.diffPercentage', { percent: currentPair.diffPercentage.toFixed(1) })
                      : t('comparePdfs.noDiff')
                  )}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleFullscreen}
                className="p-2"
                title={t('comparePdfs.fullscreenTooltip')}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPairIdx(prev => Math.min(pairedPages.length - 1, prev + 1))}
                disabled={currentPairIdx >= pairedPages.length - 1}
                className="flex items-center gap-1 py-2"
              >
                {t('comparePdfs.nextPair')}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Double View Panels Workspace */}
          <div 
            ref={comparisonContainerRef}
            className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
              isFullscreen ? 'fixed inset-0 z-50 p-4 bg-zinc-900 overflow-y-auto' : ''
            }`}
          >
            {/* LEFT Version (Original / Deleted Page) */}
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  {t('comparePdfs.originalVersion')}
                </span>
                <span className="text-[10px] font-bold text-zinc-500">
                  {currentPair?.pageIndex1 !== -1 ? t('comparePdfs.pageNumber', { page: currentPair.pageIndex1 + 1 }) : '---'}
                </span>
              </div>
              
              <div 
                ref={scrollContainer1Ref}
                onScroll={handleScroll1}
                className="border border-[hsl(var(--color-border))] rounded-2xl bg-zinc-950 overflow-auto relative flex items-center justify-center p-4 min-h-[500px] max-h-[720px] shadow-inner custom-scrollbar"
              >
                {currentPair?.pageIndex1 !== -1 ? (
                  <div className="relative transform-gpu">
                    {/* Rendered PDF base canvas image */}
                    <img 
                      src={file1?.pagesImages[currentPair.pageIndex1]} 
                      alt="Original Page" 
                      className="max-w-none shadow-md rounded-lg"
                      style={{
                        width: `${file1?.pageDimensions[currentPair.pageIndex1].width}px`,
                        height: `${file1?.pageDimensions[currentPair.pageIndex1].height}px`,
                      }}
                    />
                    
                    {/* Diff highlights Overlay Layer */}
                    <div className="absolute inset-0 pointer-events-none">
                      {getFilteredHighlights(currentPair.highlights1).map((hl, idx) => (
                        <div
                          key={idx}
                          className="absolute rounded-sm transition-all duration-300 pointer-events-auto cursor-help group"
                          style={{
                            left: `${hl.x}px`,
                            top: `${hl.y}px`,
                            width: `${hl.w}px`,
                            height: `${hl.h}px`,
                            background: hl.type === 'deleted' 
                              ? 'rgba(239, 68, 68, 0.18)' 
                              : hl.type === 'modified'
                                ? 'rgba(245, 158, 11, 0.18)'
                                : 'rgba(168, 85, 247, 0.18)', // Moved source
                            border: hl.type === 'deleted'
                              ? '1px solid rgba(239, 68, 68, 0.4)'
                              : hl.type === 'modified'
                                ? '1px solid rgba(245, 158, 11, 0.4)'
                                : '1px dashed rgba(168, 85, 247, 0.6)',
                            boxShadow: hl.type === 'deleted'
                              ? '0 0 4px rgba(239, 68, 68, 0.15)'
                              : hl.type === 'modified'
                                ? '0 0 4px rgba(245, 158, 11, 0.15)'
                                : '0 0 4px rgba(168, 85, 247, 0.15)',
                          }}
                        >
                          {/* Tooltip widget */}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover:block bg-zinc-950 text-white text-[9px] font-bold py-1 px-2.5 rounded-lg border border-zinc-800 shadow-xl z-30 whitespace-nowrap leading-none pointer-events-none">
                            {hl.type === 'deleted' 
                              ? t('comparePdfs.removedText') 
                              : hl.type === 'modified' 
                                ? t('comparePdfs.modifiedText') 
                                : t('comparePdfs.paragraphMovedRight')}
                            <span className="text-zinc-400 block mt-1">"{hl.text}"</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Deleted Page placeholder blank board */
                  <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 w-full min-h-[500px] border border-dashed border-zinc-800 rounded-xl bg-zinc-950/60 backdrop-blur-md">
                    <AlertCircle className="w-10 h-10 text-emerald-500/70 mb-4 animate-bounce" />
                    {t('comparePdfs.insertedPageTitle')}
                    <p className="text-[10px] text-zinc-600 mt-1 max-w-xs">
                      {t('comparePdfs.insertedPageDesc')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT Version (Modified / Inserted Page) */}
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                  {t('comparePdfs.modifiedVersion')}
                </span>
                <span className="text-[10px] font-bold text-zinc-500">
                  {currentPair?.pageIndex2 !== -1 ? t('comparePdfs.pageNumber', { page: currentPair.pageIndex2 + 1 }) : '---'}
                </span>
              </div>
              
              <div 
                ref={scrollContainer2Ref}
                onScroll={handleScroll2}
                className="border border-[hsl(var(--color-border))] rounded-2xl bg-zinc-950 overflow-auto relative flex items-center justify-center p-4 min-h-[500px] max-h-[720px] shadow-inner custom-scrollbar"
              >
                {currentPair?.pageIndex2 !== -1 ? (
                  <div className="relative transform-gpu">
                    {/* Rendered PDF base canvas image */}
                    <img 
                      src={file2?.pagesImages[currentPair.pageIndex2]} 
                      alt="Modified Page" 
                      className="max-w-none shadow-md rounded-lg"
                      style={{
                        width: `${file2?.pageDimensions[currentPair.pageIndex2].width}px`,
                        height: `${file2?.pageDimensions[currentPair.pageIndex2].height}px`,
                      }}
                    />
                    
                    {/* Diff highlights Overlay Layer */}
                    <div className="absolute inset-0 pointer-events-none">
                      {getFilteredHighlights(currentPair.highlights2).map((hl, idx) => (
                        <div
                          key={idx}
                          className="absolute rounded-sm transition-all duration-300 pointer-events-auto cursor-help group"
                          style={{
                            left: `${hl.x}px`,
                            top: `${hl.y}px`,
                            width: `${hl.w}px`,
                            height: `${hl.h}px`,
                            background: hl.type === 'added' 
                              ? 'rgba(16, 185, 129, 0.18)' 
                              : hl.type === 'modified'
                                ? 'rgba(245, 158, 11, 0.18)'
                                : 'rgba(168, 85, 247, 0.18)', // Moved dest
                            border: hl.type === 'added'
                              ? '1px solid rgba(16, 185, 129, 0.4)'
                              : hl.type === 'modified'
                                ? '1px solid rgba(245, 158, 11, 0.4)'
                                : '1px dashed rgba(168, 85, 247, 0.6)',
                            boxShadow: hl.type === 'added'
                              ? '0 0 4px rgba(16, 185, 129, 0.15)'
                              : hl.type === 'modified'
                                ? '0 0 4px rgba(245, 158, 11, 0.15)'
                                : '0 0 4px rgba(168, 85, 247, 0.15)',
                          }}
                        >
                          {/* Tooltip widget */}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover:block bg-zinc-950 text-white text-[9px] font-bold py-1 px-2.5 rounded-lg border border-zinc-800 shadow-xl z-30 whitespace-nowrap leading-none pointer-events-none">
                            {hl.type === 'added' 
                              ? t('comparePdfs.addedText') 
                              : hl.type === 'modified' 
                                ? t('comparePdfs.modifiedText') 
                                : t('comparePdfs.paragraphMovedLeft')}
                            <span className="text-zinc-400 block mt-1">"{hl.text}"</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Inserted Page placeholder blank board */
                  <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 w-full min-h-[500px] border border-dashed border-zinc-800 rounded-xl bg-zinc-950/60 backdrop-blur-md">
                    <AlertCircle className="w-10 h-10 text-red-500/70 mb-4 animate-bounce" />
                    {t('comparePdfs.deletedPageTitle')}
                    <p className="text-[10px] text-zinc-600 mt-1 max-w-xs">
                      {t('comparePdfs.deletedPageDesc')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}

/**
 * 1. Smart LCS Page Pairing dynamic programming algorithm
 */
function smartPagePairing(file1: PDFFile, file2: PDFFile): PageComparisonResult[] {
  const N = file1.pageCount;
  const M = file2.pageCount;

  // Pre-calculate page text likeness matrix
  const similarityMatrix = Array.from({ length: N }, () => new Array(M).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      similarityMatrix[i][j] = computeTextSimilarity(
        file1.pageTextContents[i].rawText,
        file2.pageTextContents[j].rawText
      );
    }
  }

  // DP table for alignment
  const dp = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0));
  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      // Threshold 0.25 to consider pages "matching" at all
      if (similarityMatrix[i - 1][j - 1] >= 0.25) {
        dp[i][j] = dp[i - 1][j - 1] + similarityMatrix[i - 1][j - 1];
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find paired matches
  const paired: PageComparisonResult[] = [];
  let i = N;
  let j = M;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && similarityMatrix[i - 1][j - 1] >= 0.25) {
      paired.unshift({
        pageIndex1: i - 1,
        pageIndex2: j - 1,
        hasDifference: similarityMatrix[i - 1][j - 1] < 0.999,
        highlights1: [],
        highlights2: [],
        diffPercentage: (1 - similarityMatrix[i - 1][j - 1]) * 100
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Insertion in file 2 (no match in file 1)
      paired.unshift({
        pageIndex1: -1,
        pageIndex2: j - 1,
        hasDifference: true,
        highlights1: [],
        highlights2: [],
        diffPercentage: 100
      });
      j--;
    } else {
      // Deletion in file 2 (no match in file 1)
      paired.unshift({
        pageIndex1: i - 1,
        pageIndex2: -1,
        hasDifference: true,
        highlights1: [],
        highlights2: [],
        diffPercentage: 100
      });
      i--;
    }
  }

  return paired;
}

/**
 * Text Similarity Index based on common characters proportion
 */
function computeTextSimilarity(txt1: string, txt2: string): number {
  const clean1 = txt1.replace(/\s+/g, '');
  const clean2 = txt2.replace(/\s+/g, '');
  if (!clean1 && !clean2) return 1.0;
  if (!clean1 || !clean2) return 0.0;

  const set1 = new Set(clean1.split(''));
  let match = 0;
  clean2.split('').forEach(c => {
    if (set1.has(c)) match++;
  });
  
  return (match * 2) / (clean1.length + clean2.length);
}

/**
 * Word LCS Diff backtrack algorithm
 */
function diffWordsLCS(A: string[], B: string[]) {
  const N = A.length;
  const M = B.length;
  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0));

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      if (A[i - 1] === B[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: Array<{ type: 'equal' | 'added' | 'deleted'; word: string; indexA: number; indexB: number }> = [];
  let i = N;
  let j = M;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1]) {
      result.unshift({ type: 'equal', word: A[i - 1], indexA: i - 1, indexB: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', word: B[j - 1], indexA: -1, indexB: j - 1 });
      j--;
    } else {
      result.unshift({ type: 'deleted', word: A[i - 1], indexA: i - 1, indexB: -1 });
      i--;
    }
  }

  return result;
}

/**
 * 2. Word-level Diff on single page with Bounding Box coordinates
 */
function diffSinglePageWords(
  words1: TextWordInfo[],
  words2: TextWordInfo[],
  pageHeight1: number,
  pageHeight2: number
): { highlights1: DiffHighlight[]; highlights2: DiffHighlight[]; hasDifference: boolean; diffPercentage: number } {
  const A = words1.map(w => w.text);
  const B = words2.map(w => w.text);

  const rawDiff = diffWordsLCS(A, B);

  // Group diff structures and detect "modified" segments (contiguous delete + add)
  // Re-map word indices back to physical bounding box coordinates
  const highlights1: DiffHighlight[] = [];
  const highlights2: DiffHighlight[] = [];

  let wordCountDiff = 0;

  rawDiff.forEach(item => {
    // Determine category based on spatial coordinate analysis
    // Header/Footer: within top/bottom 12% vertical coordinate bounds of canvas
    let category: 'text' | 'header-footer' | 'formatting' = 'text';

    if (item.type === 'deleted') {
      wordCountDiff++;
      const wInfo = words1[item.indexA];
      if (wInfo.y <= pageHeight1 * 0.12 || wInfo.y >= pageHeight1 * 0.88) {
        category = 'header-footer';
      }

      highlights1.push({
        type: 'deleted',
        text: item.word,
        x: wInfo.x - 1,
        y: wInfo.y - 1,
        w: wInfo.w + 2,
        h: wInfo.h + 2,
        category
      });
    } else if (item.type === 'added') {
      wordCountDiff++;
      const wInfo = words2[item.indexB];
      if (wInfo.y <= pageHeight2 * 0.12 || wInfo.y >= pageHeight2 * 0.88) {
        category = 'header-footer';
      }

      highlights2.push({
        type: 'added',
        text: item.word,
        x: wInfo.x - 1,
        y: wInfo.y - 1,
        w: wInfo.w + 2,
        h: wInfo.h + 2,
        category
      });
    } else {
      // Check for Formatting discrepancies (Fonts diff)
      const wInfo1 = words1[item.indexA];
      const wInfo2 = words2[item.indexB];
      
      if (wInfo1.fontName !== wInfo2.fontName) {
        category = 'formatting';
        
        highlights1.push({
          type: 'modified',
          text: item.word,
          x: wInfo1.x - 1,
          y: wInfo1.y - 1,
          w: wInfo1.w + 2,
          h: wInfo1.h + 2,
          category
        });
        
        highlights2.push({
          type: 'modified',
          text: item.word,
          x: wInfo2.x - 1,
          y: wInfo2.y - 1,
          w: wInfo2.w + 2,
          h: wInfo2.h + 2,
          category
        });
      }
    }
  });

  // Consolidate adjacent highlights to reduce bounding box DOM nodes
  const compact1 = compactAdjacentHighlights(highlights1, 'deleted');
  const compact2 = compactAdjacentHighlights(highlights2, 'added');

  const totalWords = Math.max(words1.length, words2.length, 1);
  const diffPercentage = (wordCountDiff / totalWords) * 100;

  return {
    highlights1: compact1,
    highlights2: compact2,
    hasDifference: compact1.length > 0 || compact2.length > 0,
    diffPercentage
  };
}

/**
 * Compact contiguous text highlights into single bounding boxes to save DOM render overhead
 */
function compactAdjacentHighlights(highlights: DiffHighlight[], type: 'added' | 'deleted' | 'modified'): DiffHighlight[] {
  if (highlights.length === 0) return [];

  const result: DiffHighlight[] = [];
  let current = { ...highlights[0] };

  for (let i = 1; i < highlights.length; i++) {
    const next = highlights[i];
    
    // Check if next highlight is on the same line, contiguous coordinate, and same properties
    const sameLine = Math.abs(next.y - current.y) < 5;
    const contiguous = Math.abs(next.x - (current.x + current.w)) < 15;
    
    if (sameLine && contiguous && next.category === current.category && next.type === current.type) {
      current.w = (next.x + next.w) - current.x;
      current.text += next.text;
    } else {
      result.push(current);
      current = { ...next };
    }
  }
  result.push(current);
  return result;
}

/**
 * 3. Cross-correlation Moved-Text Segment detector
 */
function findMovedTextSegments(pairedList: PageComparisonResult[]) {
  // Collect all deletes and adds segments across aligned pages
  pairedList.forEach(pair1 => {
    if (pair1.highlights1.length === 0) return;

    pair1.highlights1.forEach(hl1 => {
      if (hl1.type !== 'deleted' || hl1.text.trim().length < 5) return;

      // Scan other pages to find corresponding add segments
      pairedList.forEach(pair2 => {
        if (pair2.highlights2.length === 0) return;

        pair2.highlights2.forEach(hl2 => {
          if (hl2.type !== 'added' || hl2.text.trim().length < 5) return;

          // Cross-correlation threshold 85% textual likeness
          const matchSim = computeTextSimilarity(hl1.text, hl2.text);
          
          if (matchSim >= 0.85) {
            // Relabel as moved
            hl1.type = 'moved';
            hl2.type = 'moved';
            hl1.movedToPageIndex = pair2.pageIndex2;
            hl1.movedToCoords = { x: hl2.x, y: hl2.y };
            
            hl2.movedToPageIndex = pair1.pageIndex1;
            hl2.movedToCoords = { x: hl1.x, y: hl1.y };
          }
        });
      });
    });
  });
}

export default ComparePDFsTool;
