'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { 
  textToPDF, 
  AVAILABLE_FONTS,
  hexToRgb,
  type TextPageSizeType, 
  type TextToPDFOptions,
  type PageOrientation,
  type FontId
} from '@/lib/pdf/processors/text-to-pdf';
import { Select } from '@/components/ui/FormField';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export interface TextToPDFToolProps {
  className?: string;
}

type InputMode = 'upload' | 'text';

export function TextToPDFTool({ className = '' }: TextToPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [directText, setDirectText] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string>('');
  
  const [pageSize, setPageSize] = useState<TextPageSizeType>('A4');
  const [customWidth, setCustomWidth] = useState(595);
  const [customHeight, setCustomHeight] = useState(842);
  const [orientation, setOrientation] = useState<PageOrientation>('portrait');
  const [fontId, setFontId] = useState<FontId>('helvetica');
  const [fontSize, setFontSize] = useState(12);
  const [lineHeight, setLineHeight] = useState(1.5);
  const [textColor, setTextColor] = useState('#000000');
  const [preserveLineBreaks, setPreserveLineBreaks] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  
  const cancelledRef = useRef(false);

  const handleFilesSelected = useCallback(async (newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map(file => ({
      id: generateId(),
      file,
      status: 'pending' as const,
    }));
    setFiles(prev => [...prev, ...uploadedFiles]);
    setError(null);
    setResult(null);
    if (newFiles.length > 0) {
      try {
        const text = await newFiles[0].text();
        setTextPreview(text.slice(0, 2000) + (text.length > 2000 ? '...' : ''));
      } catch { setTextPreview(''); }
    }
  }, []);

  const handleUploadError = useCallback((errorMessage: string) => setError(errorMessage), []);
  const handleRemoveFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setResult(null);
    setTextPreview('');
  }, []);

  const handleClearAll = useCallback(() => {
    setFiles([]);
    setDirectText('');
    setResult(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
    setTextPreview('');
  }, []);

  const handleConvert = useCallback(async () => {
    const hasFiles = files.length >= 1;
    const hasDirectText = inputMode === 'text' && directText.trim().length > 0;
    if (!hasFiles && !hasDirectText) {
      setError(inputMode === 'text' 
        ? (tTools('txtToPdf.noTextError') || 'Please enter some text to convert.')
        : (tTools('txtToPdf.noFilesError') || 'Please add at least 1 text file.'));
      return;
    }
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    const options: Partial<TextToPDFOptions> = {
      pageSize,
      customWidth: pageSize === 'CUSTOM' ? customWidth : undefined,
      customHeight: pageSize === 'CUSTOM' ? customHeight : undefined,
      orientation,
      fontId,
      fontSize,
      lineHeight,
      textColor: hexToRgb(textColor),
      preserveLineBreaks,
      wrapLines,
      directText: inputMode === 'text' ? directText : undefined,
    };

    try {
      const output: ProcessOutput = await textToPDF(
        inputMode === 'upload' ? files.map(f => f.file) : [],
        options,
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || '');
          }
        }
      );
      if (cancelledRef.current) { setStatus('idle'); return; }
      if (output.success && output.result) {
        setResult(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to convert text to PDF.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [files, inputMode, directText, pageSize, customWidth, customHeight, orientation, fontId, fontSize, lineHeight, textColor, preserveLineBreaks, wrapLines, tTools]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isProcessing = status === 'processing' || status === 'uploading';
  const canConvert = (inputMode === 'upload' ? files.length >= 1 : directText.trim().length > 0) && !isProcessing;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* Mode Selector */}
      <div className="flex gap-2">
        <button type="button" onClick={() => setInputMode('upload')}
          className={`px-4 py-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${inputMode === 'upload' ? 'bg-[hsl(var(--color-primary))] text-white' : 'bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted)/0.8)]'}`}>
          {tTools('txtToPdf.modeUpload') || 'Upload Files'}
        </button>
        <button type="button" onClick={() => setInputMode('text')}
          className={`px-4 py-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${inputMode === 'text' ? 'bg-[hsl(var(--color-primary))] text-white' : 'bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted)/0.8)]'}`}>
          {tTools('txtToPdf.modeText') || 'Enter Text'}
        </button>
      </div>

      {/* Upload Mode */}
      {inputMode === 'upload' && (
        <>
          <FileUploader accept={['text/plain', '.txt']} multiple maxFiles={10}
            onFilesSelected={handleFilesSelected} onError={handleUploadError} disabled={isProcessing}
            label={tTools('txtToPdf.uploadLabel') || 'Upload Text Files'}
            description={tTools('txtToPdf.uploadDescription') || 'Drag and drop text files here, or click to browse.'} />
          {files.length > 0 && (
            <Card variant="outlined" size="lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">{tTools('txtToPdf.filesTitle') || 'Text Files'} ({files.length})</h3>
                <Button variant="ghost" size="sm" onClick={handleClearAll} disabled={isProcessing}>{t('buttons.clearAll') || 'Clear All'}</Button>
              </div>
              <ul className="space-y-2" role="list">
                {files.map((file) => (
                  <li key={file.id} className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))]">
                    <svg className="w-8 h-8 text-blue-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                      <path d="M14 2v6h6" fill="white" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.file.name}</p>
                      <p className="text-xs text-[hsl(var(--color-muted-foreground))]">{formatSize(file.file.size)}</p>
                    </div>
                    <button type="button" onClick={() => handleRemoveFile(file.id)} disabled={isProcessing}
                      className="flex-shrink-0 p-1 rounded hover:bg-red-100 text-[hsl(var(--color-muted-foreground))] hover:text-red-600 disabled:opacity-30">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
              {textPreview && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">{tTools('txtToPdf.preview') || 'Preview'}</h4>
                  <pre className="p-3 rounded-[var(--radius-md)] bg-[hsl(var(--color-muted)/0.3)] text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap">{textPreview}</pre>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Text Input Mode */}
      {inputMode === 'text' && (
        <Card variant="outlined" size="lg">
          <h3 className="text-lg font-medium mb-4">{tTools('txtToPdf.enterText') || 'Enter Text'}</h3>
          <textarea value={directText} onChange={(e) => setDirectText(e.target.value)}
            placeholder={tTools('txtToPdf.textPlaceholder') || 'Type or paste your text here...'} disabled={isProcessing}
            className="w-full h-64 px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] resize-y" />
          <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-2">{directText.length} {tTools('txtToPdf.characters') || 'characters'}</p>
        </Card>
      )}

      {error && <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert"><p className="text-sm">{error}</p></div>}

      {/* Options Panel */}
      {(files.length >= 1 || (inputMode === 'text' && directText.length > 0)) && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium mb-4">{tTools('txtToPdf.optionsTitle') || 'PDF Options'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{tTools('txtToPdf.pageSize') || 'Page Size'}</label>
              <Select value={pageSize} onChange={(e) => setPageSize(e.target.value as TextPageSizeType)} disabled={isProcessing}>
                <option value="A4">A4</option><option value="LETTER">Letter</option><option value="LEGAL">Legal</option>
                <option value="A5">A5</option><option value="A3">A3</option><option value="CUSTOM">{tTools('txtToPdf.custom') || 'Custom'}</option>
              </Select>
            </div>
            {pageSize === 'CUSTOM' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">{tTools('txtToPdf.width') || 'Width (pt)'}</label>
                  <input type="number" value={customWidth} onChange={(e) => setCustomWidth(Number(e.target.value))} disabled={isProcessing} min={72} max={2000}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{tTools('txtToPdf.height') || 'Height (pt)'}</label>
                  <input type="number" value={customHeight} onChange={(e) => setCustomHeight(Number(e.target.value))} disabled={isProcessing} min={72} max={2000}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] text-sm" />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">{tTools('txtToPdf.orientation') || 'Orientation'}</label>
              <Select value={orientation} onChange={(e) => setOrientation(e.target.value as PageOrientation)} disabled={isProcessing}>
                <option value="portrait">{tTools('txtToPdf.portrait') || 'Portrait'}</option>
                <option value="landscape">{tTools('txtToPdf.landscape') || 'Landscape'}</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{tTools('txtToPdf.fontFamily') || 'Font Family'}</label>
              <Select value={fontId} onChange={(e) => setFontId(e.target.value as FontId)} disabled={isProcessing}>
                {AVAILABLE_FONTS.map(font => (
                  <option key={font.id} value={font.id}>{font.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{tTools('txtToPdf.fontSize') || 'Font Size'}</label>
              <Select value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} disabled={isProcessing}>
                {[8, 10, 11, 12, 14, 16, 18, 20, 24].map(size => <option key={size} value={size}>{size}pt</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{tTools('txtToPdf.lineHeight') || 'Line Spacing'}</label>
              <Select value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))} disabled={isProcessing}>
                <option value="1">{tTools('txtToPdf.single') || 'Single'}</option>
                <option value="1.15">1.15</option>
                <option value="1.5">1.5</option>
                <option value="2">{tTools('txtToPdf.double') || 'Double'}</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{tTools('txtToPdf.textColor') || 'Text Color'}</label>
              <div className="flex gap-2">
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} disabled={isProcessing} className="w-10 h-10 rounded border cursor-pointer" />
                <input type="text" value={textColor} onChange={(e) => setTextColor(e.target.value)} disabled={isProcessing}
                  className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] text-sm" />
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={preserveLineBreaks} onChange={(e) => setPreserveLineBreaks(e.target.checked)} disabled={isProcessing} className="w-4 h-4 rounded" />
              <span className="text-sm">{tTools('txtToPdf.preserveLineBreaks') || 'Preserve line breaks'}</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={wrapLines} onChange={(e) => setWrapLines(e.target.checked)} disabled={isProcessing} className="w-4 h-4 rounded" />
              <span className="text-sm">{tTools('txtToPdf.wrapLines') || 'Wrap long lines'}</span>
            </label>
          </div>
        </Card>
      )}

      {isProcessing && <ProcessingProgress progress={progress} status={status} message={progressMessage} onCancel={handleCancel} showPercentage />}

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" size="lg" onClick={handleConvert} disabled={!canConvert} loading={isProcessing}>
          {isProcessing ? (t('status.processing') || 'Processing...') : (tTools('txtToPdf.convertButton') || 'Convert to PDF')}
        </Button>
        {result && (
          <DownloadButton file={result}
            filename={inputMode === 'text' ? 'from_text.pdf' : (files.length === 1 ? `${files[0].file.name.replace(/\.[^/.]+$/, '')}.pdf` : `text_${files.length}_files.pdf`)}
            variant="secondary" size="lg" showFileSize />
        )}
      </div>

      {status === 'complete' && result && (
        <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700" role="status">
          <p className="text-sm font-medium">{tTools('txtToPdf.successMessage') || 'Text converted to PDF successfully!'}</p>
        </div>
      )}
    </div>
  );
}

export default TextToPDFTool;
