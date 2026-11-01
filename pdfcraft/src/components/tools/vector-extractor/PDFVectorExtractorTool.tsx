'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { extractVectors, type VectorExtractorOptions } from '@/lib/pdf/processors/vector-extractor';
import { saveBlobFile } from '@/lib/tauri-bridge';
import type { ProcessOutput } from '@/types/pdf';
import { 
  Layers, 
  Settings2, 
  Copy, 
  Download, 
  Check, 
  Palette, 
  Search, 
  FileCode,
  Maximize2
} from 'lucide-react';

export interface PDFVectorExtractorToolProps {
  className?: string;
}

export function PDFVectorExtractorTool({ className = '' }: PDFVectorExtractorToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // File states
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [targetPage, setTargetPage] = useState<number>(1);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Status & Outcomes
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [svgContent, setSvgContent] = useState<string>('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Selection states
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [selectedElementHtml, setSelectedElementHtml] = useState<string | null>(null);
  const [elementColor, setElementColor] = useState<string>('#3b82f6');
  const [elementStroke, setElementStroke] = useState<number>(2);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  /**
   * Handle file upload and trigger parser
   */
  const handleFileSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    setIsLoadingMetadata(true);
    setError(null);
    setSvgContent('');
    setSelectedElementHtml(null);

    try {
      const { PDFDocument } = await import('pdf-lib');
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true } as any);
      setTotalPages(pdf.getPageCount());
      
      // Auto run vector extract
      setTimeout(() => {
        handleExtract(selectedFile, 1);
      }, 500);

    } catch (err) {
      console.error(err);
      setError('Failed to load PDF file. The file structure might be encrypted or broken.');
    } finally {
      setIsLoadingMetadata(false);
    }
  }, []);

  /**
   * Run Vector Extraction Processor
   */
  const handleExtract = async (targetFile: File, pageNum: number) => {
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setSvgContent('');
    setSelectedElementHtml(null);

    try {
      const output: ProcessOutput = await extractVectors(
        targetFile,
        {
          pageNum,
          cleanGrid: true,
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Compiling path coordinates...');
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result && output.metadata) {
        setSvgContent(output.metadata.svgContent as string);
        setResultBlob(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to extract vector details.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error extracting vector paths.');
        setStatus('error');
      }
    }
  };

  /**
   * Trigger manual page change re-extract
   */
  const handlePageChange = (newPage: number) => {
    if (!file) return;
    const boundedPage = Math.min(Math.max(1, newPage), totalPages);
    setTargetPage(boundedPage);
    handleExtract(file, boundedPage);
  };

  /**
   * Intercept SVG DOM mouse events to highlight path blocks
   */
  useEffect(() => {
    if (!svgContent || !containerRef.current) return;

    const container = containerRef.current;
    
    // Find all paths, shapes, text elements in the parsed SVG container
    const selectableTags = ['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'text', 'g'];
    
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (selectableTags.includes(target.tagName.toLowerCase())) {
        e.stopPropagation();
        
        // Add visual glowing styles on the fly
        target.style.transition = 'all 0.25s ease';
        target.style.filter = 'drop-shadow(0 4px 8px rgba(59, 130, 246, 0.5))';
        target.style.cursor = 'pointer';
        
        setHoveredElementId(target.id || target.tagName);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (selectableTags.includes(target.tagName.toLowerCase())) {
        target.style.filter = 'none';
        setHoveredElementId(null);
      }
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (selectableTags.includes(target.tagName.toLowerCase())) {
        e.stopPropagation();
        
        // Clone element HTML string for code copying
        const outerHtml = target.outerHTML;
        setSelectedElementHtml(outerHtml);
        
        // Pick existing color
        const fill = target.getAttribute('fill') || target.style.fill || '#3b82f6';
        if (fill.startsWith('#') || fill.startsWith('rgb')) {
          setElementColor(fill);
        }
      }
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    container.addEventListener('click', handleClick);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      container.removeEventListener('click', handleClick);
    };
  }, [svgContent]);

  /**
   * Action: Copy SVG Code to clipboard
   */
  const handleCopyCode = () => {
    if (!selectedElementHtml) return;
    navigator.clipboard.writeText(selectedElementHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Action: Download single selected SVG element
   */
  const handleDownloadSelected = async () => {
    if (!selectedElementHtml) return;
    
    // Wrap in full standard SVG container
    const wrappedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${selectedElementHtml}</svg>`;
    const blob = new Blob([wrappedSvg], { type: 'image/svg+xml;charset=utf-8' });
    await saveBlobFile(blob, 'extracted_vector_asset.svg');
  };

  const handleClearFile = () => {
    setFile(null);
    setTotalPages(0);
    setTargetPage(1);
    setSvgContent('');
    setSelectedElementHtml(null);
    setStatus('idle');
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  };

  const isProcessing = status === 'processing' || status === 'uploading';

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      
      {/* File Upload zone */}
      {!file && (
        <FileUploader
          accept={['application/pdf']}
          multiple={false}
          onFilesSelected={handleFileSelected}
          onError={setError}
          disabled={isProcessing || isLoadingMetadata}
          label={t('vectorExtractor.uploadLabel')}
          description={t('vectorExtractor.uploadDescription')}
        />
      )}

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400">
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {/* Metadata bar */}
      {file && (
        <Card variant="outlined" className="p-4 flex items-center justify-between border-2 border-[hsl(var(--color-primary)/0.25)] rounded-2xl">
          <div className="flex items-center gap-3">
            <svg className="w-10 h-10 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
              <path d="M14 2v6h6" fill="white" />
              <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
            </svg>
            <div>
              <p className="font-semibold text-sm text-[hsl(var(--color-foreground))] truncate max-w-[280px]" title={file.name}>
                {file.name}
              </p>
              <div className="flex items-center gap-4 mt-0.5">
                <span className="text-xs text-[hsl(var(--color-muted-foreground))]">
                  {totalPages > 0 ? t('comparePdfs.totalAligned', { count: totalPages }) : t('status.loading')} • {(file.size / (1024 * 1024)).toFixed(2)} MB
                </span>
                
                {/* Page Selector */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-0.5 bg-white dark:bg-zinc-900">
                    <button 
                      onClick={() => handlePageChange(targetPage - 1)}
                      disabled={targetPage <= 1}
                      className="text-xs font-black px-1 opacity-60 hover:opacity-100 disabled:opacity-30"
                    >
                      ◀
                    </button>
                    <span className="text-[11px] font-bold">{t('comparePdfs.pageNumber', { page: targetPage })}</span>
                    <button 
                      onClick={() => handlePageChange(targetPage + 1)}
                      disabled={targetPage >= totalPages}
                      className="text-xs font-black px-1 opacity-60 hover:opacity-100 disabled:opacity-30"
                    >
                      ▶
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClearFile} disabled={isProcessing}>
            {t('buttons.remove')}
          </Button>
        </Card>
      )}

      {/* Main Workspace */}
      {file && svgContent && status !== 'processing' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* LEFT: SVG Display Canvas */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            <Card variant="outlined" className="p-4 bg-zinc-100 dark:bg-zinc-950 flex-1 flex flex-col justify-between rounded-[2rem] border-2 shadow-inner min-h-[480px]">
              
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-[hsl(var(--color-foreground))] flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-zinc-400" />
                  {tTools('vectorExtractor.previewHelp')}
                </span>
                <span className="text-[10px] text-zinc-400">
                  {hoveredElementId ? `Hovered: ${hoveredElementId}` : 'Awaiting Selection'}
                </span>
              </div>

              {/* Rendered SVG wrapper with 3D Explode perspective container */}
              <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                <div 
                  ref={containerRef}
                  className="w-full max-w-lg aspect-square bg-white border border-zinc-200 dark:border-zinc-800 shadow-md rounded-2xl p-4 overflow-hidden relative"
                  style={{
                    transform: 'perspective(800px) rotateX(8deg)',
                    transformStyle: 'preserve-3d',
                  }}
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              </div>

            </Card>
          </div>

          {/* RIGHT: Inspector & Export Options */}
          <div className="lg:col-span-4 flex flex-col space-y-6">
            
            {/* Inspector Panel */}
            <Card variant="default" className="flex-1 p-6 rounded-[2rem] border border-white/20 dark:border-zinc-800/40 bg-white/40 dark:bg-black/30 backdrop-blur-md flex flex-col justify-between shadow-xl">
              
              <div className="space-y-6">
                <div className="border-b border-[hsl(var(--color-border))] pb-3">
                  <h3 className="text-base font-bold text-[hsl(var(--color-foreground))] flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-[hsl(var(--color-primary))]" />
                    {tTools('vectorExtractor.propertiesTitle')}
                  </h3>
                </div>

                {!selectedElementHtml ? (
                  <div className="text-center p-6 text-[hsl(var(--color-muted-foreground))] space-y-2">
                    <Layers className="w-12 h-12 text-zinc-400 mx-auto opacity-50" />
                    <h4 className="text-xs font-bold text-[hsl(var(--color-foreground))]">{tTools('vectorExtractor.emptyTitle')}</h4>
                    <p className="text-[10px]">{tTools('vectorExtractor.emptyDescription')}</p>
                  </div>
                ) : (
                  <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
                    
                    {/* SVG Preview Box */}
                    <div className="border border-[hsl(var(--color-border))] rounded-2xl p-4 bg-white flex items-center justify-center aspect-video shadow-sm relative overflow-hidden">
                      <div className="absolute top-2 left-2 text-[8px] font-bold text-zinc-400">Preview</div>
                      <div 
                        className="w-20 h-20 flex items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 100 100" width="100%" height="100%">${selectedElementHtml}</svg>` }}
                      />
                    </div>

                    {/* Recolor panel */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-[hsl(var(--color-muted-foreground))] flex items-center gap-1.5">
                        <Palette className="w-4 h-4" /> {tTools('vectorExtractor.colorFill')}
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={elementColor}
                          onChange={(e) => setElementColor(e.target.value)}
                          className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent"
                        />
                        <code className="text-xs font-mono font-bold">{elementColor}</code>
                      </div>
                    </div>

                    {/* Actions list */}
                    <div className="space-y-2.5 pt-2 border-t border-[hsl(var(--color-border))]">
                      
                      {/* Copy Code */}
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="w-full flex items-center justify-center gap-2 text-xs py-3"
                        onClick={handleCopyCode}
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        {copied ? tTools('vectorExtractor.copied') : tTools('vectorExtractor.copyCode')}
                      </Button>

                      {/* Download element */}
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="w-full flex items-center justify-center gap-2 text-xs py-3"
                        onClick={handleDownloadSelected}
                      >
                        <Download className="w-4 h-4" />
                        {tTools('vectorExtractor.downloadSelected')}
                      </Button>

                    </div>

                  </div>
                )}
              </div>

              {/* Complete Page Downloader */}
              <div className="pt-6 border-t border-[hsl(var(--color-border))] mt-6">
                {resultBlob && (
                  <DownloadButton
                    file={resultBlob}
                    filename={file.name.replace(/\.pdf$/i, `_page_${targetPage}.svg`)}
                    variant="primary"
                    size="lg"
                    className="w-full py-4 font-bold shadow-lg"
                    showFileSize
                  />
                )}
              </div>

            </Card>

          </div>

        </div>
      )}

      {/* Progress view */}
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

export default PDFVectorExtractorTool;
