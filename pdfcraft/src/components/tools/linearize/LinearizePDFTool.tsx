'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { linearizePDF, linearizePDFs, type LinearizePDFOptions } from '@/lib/pdf/processors/linearize';
import type { ProcessOutput } from '@/types/pdf';

export interface LinearizePDFToolProps {
  /** Custom class name */
  className?: string;
}

/**
 * LinearizePDFTool Component
 * Requirements: 5.1, 5.2
 * 
 * Provides the UI for linearizing PDF files for fast web viewing.
 * Linearized PDFs are optimized for streaming, allowing the first page
 * to display before the entire file is downloaded.
 */
export function LinearizePDFTool({ className = '' }: LinearizePDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  // State
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [resultFilename, setResultFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    originalSize: number;
    linearizedSize: number;
    pageCount: number;
    filesProcessed?: number;
  } | null>(null);
  
  // Options
  const [useObjectStreams, setUseObjectStreams] = useState(true);
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Handle files selected from uploader
   */
  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setError(null);
      setResult(null);
      setStats(null);
    }
  }, []);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Clear files
   */
  const handleClear = useCallback(() => {
    setFiles([]);
    setResult(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
    setStats(null);
  }, []);

  /**
   * Remove a specific file
   */
  const handleRemoveFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Handle linearize operation
   */
  const handleLinearize = useCallback(async () => {
    if (files.length === 0) {
      setError('Please select at least one PDF file to linearize.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);
    setStats(null);

    const options: LinearizePDFOptions = {
      useObjectStreams,
      addDefaultPage: false,
    };

    try {
      let output: ProcessOutput;
      
      if (files.length === 1) {
        output = await linearizePDF(
          files[0],
          options,
          (prog, message) => {
            if (!cancelledRef.current) {
              setProgress(prog);
              setProgressMessage(message || '');
            }
          }
        );
      } else {
        output = await linearizePDFs(
          files,
          options,
          (prog, message) => {
            if (!cancelledRef.current) {
              setProgress(prog);
              setProgressMessage(message || '');
            }
          }
        );
      }

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        setResult(output.result as Blob);
        setResultFilename(output.filename || 'linearized.pdf');
        setStatus('complete');
        
        // Set stats
        if (output.metadata) {
          setStats({
            originalSize: output.metadata.originalSize as number,
            linearizedSize: output.metadata.linearizedSize as number,
            pageCount: output.metadata.pageCount as number || output.metadata.totalPages as number,
            filesProcessed: output.metadata.filesProcessed as number,
          });
        }
      } else {
        setError(output.error?.message || 'Failed to linearize PDF file.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [files, useObjectStreams]);

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
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isProcessing = status === 'processing';
  const canLinearize = files.length > 0 && !isProcessing;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      <FileUploader
        accept={['application/pdf', '.pdf']}
        multiple={true}
        maxFiles={10}
        onFilesSelected={handleFilesSelected}
        onError={handleUploadError}
        disabled={isProcessing}
        label={tTools('linearizePdf.uploadLabel') || 'Upload PDF Files'}
        description={tTools('linearizePdf.uploadDescription') || 'Drag and drop PDF files here, or click to browse. You can select multiple files.'}
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

      {/* Selected Files */}
      {files.length > 0 && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
              {tTools('linearizePdf.selectedFiles') || 'Selected Files'} ({files.length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={isProcessing}
            >
              {t('buttons.clearAll') || 'Clear All'}
            </Button>
          </div>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {files.map((file, index) => (
              <div 
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 rounded-[var(--radius-sm)] bg-[hsl(var(--color-muted)/0.3)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                      <path d="M14 2v6h6" fill="white" />
                      <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                      {file.name}
                    </p>
                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                      {formatSize(file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFile(index)}
                  disabled={isProcessing}
                >
                  {t('buttons.remove') || 'Remove'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Linearization Options */}
      {files.length > 0 && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('linearizePdf.optionsTitle') || 'Linearization Options'}
          </h3>
          
          <div className="space-y-4">
            {/* Info about linearization */}
            <div className="p-3 rounded-[var(--radius-sm)] bg-blue-50 border border-blue-200">
              <p className="text-sm text-blue-700">
                {tTools('linearizePdf.info') || 'Linearization optimizes PDFs for fast web viewing. The first page will display before the entire file is downloaded, improving user experience for web-hosted documents.'}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useObjectStreams}
                  onChange={(e) => setUseObjectStreams(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                />
                <div>
                  <span className="text-sm text-[hsl(var(--color-foreground))]">
                    {tTools('linearizePdf.useObjectStreams') || 'Use object streams for better compression'}
                  </span>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {tTools('linearizePdf.useObjectStreamsDesc') || 'Recommended for smaller file sizes. Disable for maximum compatibility with older PDF readers.'}
                  </p>
                </div>
              </label>
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
          onClick={handleLinearize}
          disabled={!canLinearize}
          loading={isProcessing}
        >
          {isProcessing 
            ? (t('status.processing') || 'Processing...') 
            : (tTools('linearizePdf.linearizeButton') || 'Linearize PDF')
          }
        </Button>

        {result && (
          <DownloadButton
            file={result}
            filename={resultFilename}
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}
      </div>

      {/* Results */}
      {status === 'complete' && result && stats && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium mb-2">
            {tTools('linearizePdf.successMessage') || 'PDF linearized successfully!'}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {stats.filesProcessed && stats.filesProcessed > 1 && (
              <div>
                <span className="text-green-600">{tTools('linearizePdf.filesProcessed') || 'Files:'}</span>
                <span className="ml-1 font-medium">{stats.filesProcessed}</span>
              </div>
            )}
            <div>
              <span className="text-green-600">{tTools('linearizePdf.pages') || 'Pages:'}</span>
              <span className="ml-1 font-medium">{stats.pageCount}</span>
            </div>
            <div>
              <span className="text-green-600">{tTools('linearizePdf.originalSize') || 'Original:'}</span>
              <span className="ml-1 font-medium">{formatSize(stats.originalSize)}</span>
            </div>
            <div>
              <span className="text-green-600">{tTools('linearizePdf.optimizedSize') || 'Optimized:'}</span>
              <span className="ml-1 font-medium">{formatSize(stats.linearizedSize)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LinearizePDFTool;
