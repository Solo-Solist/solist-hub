'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { pdfToJSON, type PDFToJSONOptions } from '@/lib/pdf/processors/pdf-to-json';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface PDFToJSONToolProps {
  /** Custom class name */
  className?: string;
}

/**
 * PDFToJSONTool Component
 * Requirements: 5.1, 5.2
 * 
 * Extracts PDF content and metadata to JSON format.
 */
export function PDFToJSONTool({ className = '' }: PDFToJSONToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  // State
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [jsonPreview, setJsonPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Options state
  const [includeText, setIncludeText] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includePageInfo, setIncludePageInfo] = useState(true);
  const [includeOutline, setIncludeOutline] = useState(true);
  const [prettyPrint, setPrettyPrint] = useState(true);
  const [pageRange, setPageRange] = useState('');
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Handle file selected from uploader
   */
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    if (newFiles.length > 0) {
      const uploadedFile: UploadedFile = {
        id: generateId(),
        file: newFiles[0],
        status: 'pending' as const,
      };
      setFile(uploadedFile);
      setError(null);
      setResult(null);
      setJsonPreview(null);
    }
  }, []);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Remove the file
   */
  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setResult(null);
    setJsonPreview(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Parse page range string to array of page numbers
   */
  const parsePageRange = (rangeStr: string): number[] => {
    if (!rangeStr.trim()) return [];
    
    const pages: number[] = [];
    const parts = rangeStr.split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(s => parseInt(s.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            if (!pages.includes(i)) pages.push(i);
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && !pages.includes(num)) {
          pages.push(num);
        }
      }
    }
    
    return pages.sort((a, b) => a - b);
  };

  /**
   * Handle convert operation
   */
  const handleConvert = useCallback(async () => {
    if (!file) {
      setError('Please upload a PDF file.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);
    setJsonPreview(null);

    const options: Partial<PDFToJSONOptions> = {
      includeText,
      includeMetadata,
      includePageInfo,
      includeOutline,
      prettyPrint,
      pages: parsePageRange(pageRange),
    };

    try {
      const output: ProcessOutput = await pdfToJSON(
        file.file,
        options,
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || '');
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        const blob = output.result as Blob;
        setResult(blob);
        
        // Read JSON for preview (limit to first 5000 chars)
        const text = await blob.text();
        setJsonPreview(text.length > 5000 ? text.substring(0, 5000) + '\n...(truncated)' : text);
        
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to convert PDF to JSON.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [file, includeText, includeMetadata, includePageInfo, includeOutline, prettyPrint, pageRange]);

  /**
   * Handle cancel operation
   */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Format file size
   */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isProcessing = status === 'processing' || status === 'uploading';
  const canConvert = file && !isProcessing;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      <FileUploader
        accept={['application/pdf', '.pdf']}
        multiple={false}
        maxFiles={1}
        onFilesSelected={handleFilesSelected}
        onError={handleUploadError}
        disabled={isProcessing}
        label={tTools('pdfToJson.uploadLabel') || 'Upload PDF'}
        description={tTools('pdfToJson.uploadDescription') || 'Drag and drop a PDF file here, or click to browse.'}
      />

      {/* Error Message */}
      {error && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700"
          role="alert"
        >
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* File Info */}
      {file && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[hsl(var(--color-primary)/0.1)] flex items-center justify-center">
                <svg className="w-5 h-5 text-[hsl(var(--color-primary))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[hsl(var(--color-foreground))]">{file.file.name}</p>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{formatSize(file.file.size)}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveFile}
              disabled={isProcessing}
            >
              {t('buttons.remove') || 'Remove'}
            </Button>
          </div>
        </Card>
      )}

      {/* Options Panel */}
      {file && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('pdfToJson.optionsTitle') || 'Extraction Options'}
          </h3>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeText}
                  onChange={(e) => setIncludeText(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <span className="text-sm text-[hsl(var(--color-foreground))]">
                  {tTools('pdfToJson.includeText') || 'Include Text'}
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMetadata}
                  onChange={(e) => setIncludeMetadata(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <span className="text-sm text-[hsl(var(--color-foreground))]">
                  {tTools('pdfToJson.includeMetadata') || 'Include Metadata'}
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePageInfo}
                  onChange={(e) => setIncludePageInfo(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <span className="text-sm text-[hsl(var(--color-foreground))]">
                  {tTools('pdfToJson.includePageInfo') || 'Include Page Info'}
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOutline}
                  onChange={(e) => setIncludeOutline(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <span className="text-sm text-[hsl(var(--color-foreground))]">
                  {tTools('pdfToJson.includeOutline') || 'Include Outline'}
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prettyPrint}
                  onChange={(e) => setPrettyPrint(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <span className="text-sm text-[hsl(var(--color-foreground))]">
                  {tTools('pdfToJson.prettyPrint') || 'Pretty Print'}
                </span>
              </label>
            </div>

            {/* Page Range */}
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('pdfToJson.pageRange') || 'Page Range'}
              </label>
              <input
                type="text"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder={tTools('pdfToJson.pageRangePlaceholder') || 'e.g., 1-3, 5, 7'}
                disabled={isProcessing}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
              />
              <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                {tTools('pdfToJson.pageRangeHint') || 'Leave empty for all pages'}
              </p>
            </div>
          </div>
        </Card>
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

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="primary"
          size="lg"
          onClick={handleConvert}
          disabled={!canConvert}
          loading={isProcessing}
        >
          {isProcessing 
            ? (t('status.processing') || 'Processing...') 
            : (tTools('pdfToJson.convertButton') || 'Extract to JSON')
          }
        </Button>

        {result && (
          <DownloadButton
            file={result}
            filename={`${file?.file.name.replace(/\.pdf$/i, '')}.json`}
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}
      </div>

      {/* JSON Preview */}
      {jsonPreview && (
        <Card variant="outlined" size="lg">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('pdfToJson.previewTitle') || 'JSON Preview'}
          </h3>
          <pre className="p-4 bg-[hsl(var(--color-muted)/0.3)] rounded-[var(--radius-md)] overflow-auto max-h-96 text-xs font-mono text-[hsl(var(--color-foreground))]">
            {jsonPreview}
          </pre>
        </Card>
      )}

      {/* Success Message */}
      {status === 'complete' && result && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('pdfToJson.successMessage') || 'PDF extracted to JSON successfully! Click the download button to save your file.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default PDFToJSONTool;
