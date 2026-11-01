'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { reflowPDF, type AIPDFReflowerOptions } from '@/lib/pdf/processors/ai-pdf-reflower';
import { saveBlobFile } from '@/lib/tauri-bridge';
import type { ProcessOutput } from '@/types/pdf';
import { 
  Smartphone, 
  Settings2, 
  FileText, 
  Download, 
  Type, 
  AlignLeft, 
  Compass, 
  Undo,
  BookOpen
} from 'lucide-react';

export interface AIPDFReflowerToolProps {
  className?: string;
}

export function AIPDFReflowerTool({ className = '' }: AIPDFReflowerToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // File states
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Layout states
  const [theme, setTheme] = useState<'sepia' | 'dark' | 'green' | 'light'>('sepia');
  const [fontSize, setFontSize] = useState<number>(16);
  const [isDualColumn, setIsDualColumn] = useState<boolean>(true);

  // Status & Outcomes
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [resultFilename, setResultFilename] = useState<string>('');
  const [paragraphs, setParagraphs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Pull cord state
  const [isPulling, setIsPulling] = useState(false);

  const cancelledRef = useRef(false);

  /**
   * Handle File Selection
   */
  const handleFileSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    setIsLoadingMetadata(true);
    setError(null);
    setResult(null);
    setParagraphs([]);

    try {
      const { PDFDocument } = await import('pdf-lib');
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true } as any);
      setTotalPages(pdf.getPageCount());
      
      // Auto run reflow
      setTimeout(() => {
        handleReflow(selectedFile);
      }, 500);

    } catch (err) {
      console.error(err);
      setError('Failed to parse PDF file metadata. Ensure it is not corrupted.');
    } finally {
      setIsLoadingMetadata(false);
    }
  }, []);

  /**
   * Run Reflow Processor
   */
  const handleReflow = async (targetFile: File) => {
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const output: ProcessOutput = await reflowPDF(
        targetFile,
        {
          theme,
          fontSize,
          exportFormat: 'markdown', // default format to markdown
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Extracting semantic blocks...');
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        setResult(output.result as Blob);
        setResultFilename(output.filename || 'reflowed.md');
        setStatus('complete');

        if (output.metadata && output.metadata.paragraphs) {
          setParagraphs(output.metadata.paragraphs as any[]);
        }
      } else {
        setError(output.error?.message || 'Failed to analyze and reflow PDF.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Reflowing processing failed.');
        setStatus('error');
      }
    }
  };

  /**
   * Export to specific format dynamically in front-end
   */
  const handleExportFormat = async (format: 'markdown' | 'epub' | 'json') => {
    if (!file || paragraphs.length === 0) return;

    setIsPulling(true);
    setTimeout(async () => {
      setIsPulling(false);
      
      let exportBlob: Blob;
      let ext = '.md';
      
      if (format === 'markdown') {
        const mdText = paragraphs.map((p) => {
          switch (p.type) {
            case 'h1': return `# ${p.text}\n`;
            case 'h2': return `## ${p.text}\n`;
            case 'h3': return `### ${p.text}\n`;
            case 'li': return `* ${p.text}`;
            default: return `${p.text}\n`;
          }
        }).join('\n');
        exportBlob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
        ext = '.md';
      } else if (format === 'epub') {
        const htmlText = `
        <?xml version="1.0" encoding="utf-8"?>
        <!DOCTYPE html>
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
          <title>${file.name.replace(/\.pdf$/i, '')}</title>
          <style>
            body { font-family: sans-serif; line-height: 1.6; padding: 20px; }
            h1 { color: #333; margin-top: 1.5em; }
            h2 { color: #555; margin-top: 1.3em; }
            p { margin-bottom: 1em; text-indent: 2em; }
            li { margin-bottom: 0.5em; }
          </style>
        </head>
        <body>
          ${paragraphs.map((p) => {
            if (p.type === 'li') return `<li>${p.text}</li>`;
            return `<${p.type}>${p.text}</${p.type}>`;
          }).join('\n')}
        </body>
        </html>`;
        exportBlob = new Blob([htmlText], { type: 'application/epub+zip' });
        ext = '.epub';
      } else {
        const jsonText = JSON.stringify(paragraphs, null, 2);
        exportBlob = new Blob([jsonText], { type: 'application/json' });
        ext = '.json';
      }

      // Download trigger
      const downloadName = `${file.name.replace(/\.pdf$/i, '')}_reflowed${ext}`;
      saveBlobFile(exportBlob, downloadName);
    }, 600);
  };

  const handleClearFile = () => {
    setFile(null);
    setTotalPages(0);
    setResult(null);
    setParagraphs([]);
    setStatus('idle');
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  };

  const isProcessing = status === 'processing' || status === 'uploading';

  // Theme Styles mapping
  const getThemeClass = () => {
    switch (theme) {
      case 'dark':
        return 'bg-zinc-900 text-zinc-100 border-zinc-800';
      case 'green':
        return 'bg-[#e2edd9] text-[#1c3016] border-[#ccdcb9]';
      case 'light':
        return 'bg-white text-zinc-800 border-zinc-200';
      case 'sepia':
      default:
        return 'bg-[#f4ebd0] text-[#5b4636] border-[#e7d8b5]';
    }
  };

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      
      {/* Upload files */}
      {!file && (
        <FileUploader
          accept={['application/pdf']}
          multiple={false}
          onFilesSelected={handleFileSelected}
          onError={setError}
          disabled={isProcessing || isLoadingMetadata}
          label={t('aiPdfReflower.uploadLabel')}
          description={t('aiPdfReflower.uploadDescription')}
        />
      )}

      {/* Error Block */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 animate-in fade-in">
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {/* File metadata status block */}
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
              <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                {totalPages > 0 ? `${totalPages} ${t('pdfToCbz.pagesLabel') || 'pages'}` : t('aiPdfReflower.scanningMetadata')} • {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFile}
            disabled={isProcessing}
          >
            {t('buttons.remove') || 'Remove'}
          </Button>
        </Card>
      )}

      {/* Primary Workspace */}
      {file && paragraphs.length > 0 && status !== 'processing' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: Controls Panel */}
          <div className="lg:col-span-5 space-y-6">
            <Card variant="default" className="p-6 rounded-[2rem] shadow-xl border border-white/20 dark:border-zinc-800/40 bg-white/40 dark:bg-black/30 backdrop-blur-md space-y-6">
              <div className="border-b border-[hsl(var(--color-border))] pb-3">
                <h3 className="text-base font-bold text-[hsl(var(--color-foreground))] flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-[hsl(var(--color-primary))]" />
                  {t('aiPdfReflower.optionsTitle')}
                </h3>
                <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                  {t('aiPdfReflower.optionsHelp')}
                </p>
              </div>

              {/* Theme selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--color-muted-foreground))] flex items-center gap-1.5">
                  <Compass className="w-4 h-4" />
                  {t('aiPdfReflower.themeLabel')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'sepia', name: t('aiPdfReflower.themeSepia'), bg: 'bg-[#f4ebd0] text-[#5b4636]' },
                    { id: 'light', name: t('aiPdfReflower.themeLight'), bg: 'bg-white text-zinc-800 border' },
                    { id: 'green', name: t('aiPdfReflower.themeGreen'), bg: 'bg-[#e2edd9] text-[#1c3016]' },
                    { id: 'dark', name: t('aiPdfReflower.themeDark'), bg: 'bg-zinc-900 text-zinc-100' },
                  ].map((thm) => (
                    <button
                      key={thm.id}
                      onClick={() => setTheme(thm.id as any)}
                      className={`p-2.5 rounded-xl text-center text-xs font-bold transition-all ${thm.bg} ${
                        theme === thm.id ? 'ring-2 ring-[hsl(var(--color-primary))] scale-95 shadow-sm' : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      {thm.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size adjustments */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--color-muted-foreground))] flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Type className="w-4 h-4" /> {t('aiPdfReflower.fontSizeLabel')}</span>
                  <span className="font-mono font-bold text-xs">{fontSize}px</span>
                </label>
                <div className="flex items-center gap-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 font-bold"
                    onClick={() => setFontSize(Math.max(12, fontSize - 1))}
                  >
                    A-
                  </Button>
                  <input
                    type="range"
                    min="12"
                    max="28"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="flex-[2] h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 font-bold"
                    onClick={() => setFontSize(Math.min(28, fontSize + 1))}
                  >
                    A+
                  </Button>
                </div>
              </div>

              {/* Export Panel with Pulley Pull-rope effect */}
              <div className="border-t border-[hsl(var(--color-border))] pt-6 space-y-4 relative">
                <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--color-muted-foreground))] flex items-center gap-1.5">
                  <Download className="w-4 h-4" />
                  {t('aiPdfReflower.pullToExport')}
                </label>
                
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="secondary" className="text-xs font-bold flex flex-col gap-1 py-4" onClick={() => handleExportFormat('markdown')}>
                    <FileText className="w-4 h-4 text-emerald-500" />
                    Markdown
                  </Button>
                  <Button variant="secondary" className="text-xs font-bold flex flex-col gap-1 py-4" onClick={() => handleExportFormat('epub')}>
                    <BookOpen className="w-4 h-4 text-amber-500" />
                    EPUB Ebook
                  </Button>
                  <Button variant="secondary" className="text-xs font-bold flex flex-col gap-1 py-4" onClick={() => handleExportFormat('json')}>
                    <AlignLeft className="w-4 h-4 text-blue-500" />
                    Structured JSON
                  </Button>
                </div>

                {/* 3D Physical pull rope visual item for wow effect */}
                <div className="flex flex-col items-center mt-6 pt-4 relative group">
                  <div className="w-1 bg-zinc-300 dark:bg-zinc-700 h-16 rounded-full relative transition-all duration-300 transform group-hover:h-20" 
                       style={{ 
                         transform: isPulling ? 'translateY(15px) scaleY(0.8)' : 'translateY(0) scaleY(1)'
                       }}
                  >
                    {/* Ring puller */}
                    <div 
                      onClick={() => handleExportFormat('markdown')}
                      className={`absolute bottom-0 -left-3.5 w-8 h-8 rounded-full border-4 border-amber-500/80 bg-amber-500/25 flex items-center justify-center cursor-pointer shadow-lg hover:scale-110 active:scale-95 transition-all ${
                        isPulling ? 'animate-ping' : ''
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    </div>
                  </div>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 tracking-wider">{t('aiPdfReflower.pullToExportHint')}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT: 3D Perspective Phone Simulator */}
          <div className="lg:col-span-7 flex justify-center">
            
            {/* Phone Outer container with custom CSS perspective perspective-[1200px] */}
            <div className="relative w-[340px] h-[640px] rounded-[3.5rem] p-3.5 bg-zinc-800 shadow-[0_30px_70px_rgba(0,0,0,0.45)] border-4 border-zinc-700/80 transform rotate-y-6 hover:rotate-y-0 transition-transform duration-500 group overflow-hidden">
              
              {/* Glossy glare reflection overlay */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none z-20" />

              {/* Speaker / Camera Notch */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-full z-30 flex items-center justify-center">
                <div className="w-12 h-1 bg-zinc-800 rounded-full" />
                <div className="w-3 h-3 rounded-full bg-zinc-950 ml-3 border border-zinc-900" />
              </div>

              {/* Screen Content */}
              <div className={`w-full h-full rounded-[2.8rem] overflow-hidden pt-10 pb-6 transition-all duration-300 relative border flex flex-col ${getThemeClass()}`}>
                
                {/* Simulated Header */}
                <div className="px-5 pb-3 border-b border-inherit flex items-center justify-between text-xs font-bold opacity-60">
                  <span>AI Reflow Reader</span>
                  <span className="flex items-center gap-1.5">
                    <span>Page {paragraphs[0]?.pageNum || 1}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  </span>
                </div>

                {/* Main Scrollable View */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-none" style={{ fontSize: `${fontSize}px` }}>
                  {paragraphs.map((p, idx) => {
                    switch (p.type) {
                      case 'h1':
                        return (
                          <h1 key={idx} className="font-extrabold text-lg mt-4 mb-2 border-l-4 border-amber-500 pl-2 leading-snug">
                            {p.text}
                          </h1>
                        );
                      case 'h2':
                        return (
                          <h2 key={idx} className="font-bold text-base mt-3 mb-1 leading-snug">
                            {p.text}
                          </h2>
                        );
                      case 'h3':
                        return (
                          <h3 key={idx} className="font-bold text-sm mt-2 mb-1 leading-snug opacity-90">
                            {p.text}
                          </h3>
                        );
                      case 'li':
                        return (
                          <li key={idx} className="list-disc ml-4 leading-relaxed opacity-95">
                            {p.text}
                          </li>
                        );
                      default:
                        return (
                          <p key={idx} className="leading-relaxed text-justify opacity-95 text-indent-2">
                            {p.text}
                          </p>
                        );
                    }
                  })}
                </div>

                {/* Simulated Bottom Navigation */}
                <div className="pt-2 border-t border-inherit flex items-center justify-center text-[10px] font-bold opacity-40">
                  <span>PDFCraft Mobile Reflower v1.0</span>
                </div>

              </div>

            </div>

          </div>

        </div>
      )}

      {/* Progress indicators */}
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

export default AIPDFReflowerTool;
