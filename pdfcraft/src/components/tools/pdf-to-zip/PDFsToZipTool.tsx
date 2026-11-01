'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { packagePDFsToZip, type PDFToZipOptions } from '@/lib/pdf/processors/pdf-to-zip';
import type { ProcessOutput, UploadedFile } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface PDFsToZipToolProps {
  /** Custom class name */
  className?: string;
}

/**
 * PDFsToZipTool Component
 * Requirements: 5.1, 5.2
 * 
 * Provides the UI for packaging multiple PDF files into a ZIP archive.
 */
export function PDFsToZipTool({ className = '' }: PDFsToZipToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  // State
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compressionLevel, setCompressionLevel] = useState(6);
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Handle files selected from uploader
   */
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map(file => ({
      id: generateId(),
      file,
      status: 'pending' as const,
    }));
    
    setFiles(prev => [...prev, ...uploadedFiles]);
    setError(null);
    setResult(null);
  }, []);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Remove a file from the list
   */
  const handleRemoveFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setResult(null);
  }, []);

  /**
   * Clear all files
   */
  const handleClearAll = useCallback(() => {
    setFiles([]);
    setResult(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Handle create ZIP operation
   */
  const handleCreateZip = useCallback(async () => {
    if (files.length === 0) {
      setError('Please add at least one PDF file.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    const options: PDFToZipOptions = {
      compressionLevel,
    };

    try {
      const output: ProcessOutput = await packagePDFsToZip(
        files.map(f => f.file),
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
        setResult(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to create ZIP archive.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [files, compressionLevel]);

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

  /**
   * Calculate total size of all files
   */
  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);

  const isProcessing = status === 'processing' || status === 'uploading';
  const canCreateZip = files.length > 0 && !isProcessing;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      <FileUploader
        accept={['application/pdf', '.pdf']}
        multiple
        maxFiles={100}
        onFilesSelected={handleFilesSelected}
        onError={handleUploadError}
        disabled={isProcessing}
        label={tTools('pdfToZip.uploadLabel') || 'Upload PDF Files'}
        description={tTools('pdfToZip.uploadDescription') || 'Drag and drop PDF files here, or click to browse. You can add multiple files to package into a ZIP archive.'}
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

      {/* File List */}
      {files.length > 0 && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
                {tTools('pdfToZip.filesTitle') || 'Files to Package'} ({files.length})
              </h3>
              <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {tTools('pdfToZip.totalSize') || 'Total size'}: {formatSize(totalSize)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={isProcessing}
            >
              {t('buttons.clearAll') || 'Clear All'}
            </Button>
          </div>

          <ul className="space-y-2 max-h-80 overflow-y-auto" role="list" aria-label="Files to package">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted)/0.3)]"
              >
                {/* PDF Icon */}
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    <path d="M14 2v6h6" fill="white" />
                    <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
                  </svg>
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                    {file.file.name}
                  </p>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {formatSize(file.file.size)}
                  </p>
                </div>

                {/* Remove Button */}
                <button
                  type="button"
                  onClick={() => handleRemoveFile(file.id)}
                  disabled={isProcessing}
                  className="flex-shrink-0 p-1 rounded hover:bg-red-100 text-[hsl(var(--color-muted-foreground))] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`Remove ${file.file.name}`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Options Panel */}
      {files.length > 0 && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('pdfToZip.optionsTitle') || 'ZIP Options'}
          </h3>
          
          <div className="space-y-4">
            <div>
              <label 
                htmlFor="compression-level"
                className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2"
              >
                {tTools('pdfToZip.compressionLevel') || 'Compression Level'}
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="compression-level"
                  type="range"
                  min="0"
                  max="9"
                  value={compressionLevel}
                  onChange={(e) => setCompressionLevel(Number(e.target.value))}
                  disabled={isProcessing}
                  className="flex-1 h-2 bg-[hsl(var(--color-muted))] rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm text-[hsl(var(--color-muted-foreground))] w-8 text-center">
                  {compressionLevel}
                </span>
              </div>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                {compressionLevel === 0 
                  ? (tTools('pdfToZip.noCompression') || 'No compression (fastest)')
                  : compressionLevel <= 3
                  ? (tTools('pdfToZip.lowCompression') || 'Low compression (fast)')
                  : compressionLevel <= 6
                  ? (tTools('pdfToZip.mediumCompression') || 'Medium compression (balanced)')
                  : (tTools('pdfToZip.highCompression') || 'High compression (smaller file)')
                }
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
          onClick={handleCreateZip}
          disabled={!canCreateZip}
          loading={isProcessing}
        >
          {isProcessing 
            ? (t('status.processing') || 'Processing...') 
            : (tTools('pdfToZip.createButton') || 'Create ZIP Archive')
          }
        </Button>

        {result && (
          <DownloadButton
            file={result}
            filename="pdfs.zip"
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}
      </div>

      {/* Success Message */}
      {status === 'complete' && result && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('pdfToZip.successMessage') || `Successfully packaged ${files.length} PDF file(s) into a ZIP archive. Click the download button to save your file.`}
          </p>
        </div>
      )}
    </div>
  );
}

export default PDFsToZipTool;
