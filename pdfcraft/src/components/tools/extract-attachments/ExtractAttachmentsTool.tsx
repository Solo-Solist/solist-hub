'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { extractAttachments, type AttachmentInfo } from '@/lib/pdf/processors/attachments';
import { saveBlobFile } from '@/lib/tauri-bridge';
import type { ProcessOutput } from '@/types/pdf';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface UploadedFile {
  id: string;
  file: File;
}

export interface ExtractAttachmentsToolProps {
  /** Custom class name */
  className?: string;
}

/**
 * ExtractAttachmentsTool Component
 * Requirements: 5.1, 5.2
 * 
 * Provides the UI for extracting attachments from PDF files.
 */
export function ExtractAttachmentsTool({ className = '' }: ExtractAttachmentsToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  // State
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [extractedAttachments, setExtractedAttachments] = useState<AttachmentInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Handle files selected from uploader
   */
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map(file => ({
      id: generateId(),
      file,
    }));
    setFiles(prev => [...prev, ...uploadedFiles]);
    setError(null);
    setExtractedAttachments([]);
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
    setExtractedAttachments([]);
  }, []);

  /**
   * Clear all files
   */
  const handleClearAll = useCallback(() => {
    setFiles([]);
    setExtractedAttachments([]);
    setError(null);
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Handle extract operation
   */
  const handleExtract = useCallback(async () => {
    if (files.length === 0) {
      setError('Please add at least one PDF file.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setExtractedAttachments([]);

    try {
      const output: ProcessOutput = await extractAttachments(
        files.map(f => f.file),
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

      if (output.success && output.metadata?.attachments) {
        setExtractedAttachments(output.metadata.attachments as AttachmentInfo[]);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'No attachments found in the selected PDF(s).');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [files]);

  /**
   * Handle cancel operation
   */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Download a single attachment
   */
  const handleDownloadAttachment = useCallback((attachment: AttachmentInfo) => {
    const blob = new Blob([new Uint8Array(attachment.data)]);
    saveBlobFile(blob, attachment.name);
  }, []);

  /**
   * Download all attachments as individual files
   */
  const handleDownloadAll = useCallback(() => {
    extractedAttachments.forEach((attachment, index) => {
      setTimeout(() => {
        handleDownloadAttachment(attachment);
      }, index * 200); // Stagger downloads to avoid browser blocking
    });
  }, [extractedAttachments, handleDownloadAttachment]);

  /**
   * Format file size
   */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isProcessing = status === 'processing' || status === 'uploading';
  const canExtract = files.length > 0 && !isProcessing;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      <FileUploader
        accept={['application/pdf', '.pdf']}
        multiple
        maxFiles={20}
        onFilesSelected={handleFilesSelected}
        onError={handleUploadError}
        disabled={isProcessing}
        label={tTools('extractAttachments.uploadLabel') || 'Upload PDF Files'}
        description={tTools('extractAttachments.uploadDescription') || 'Select PDF files to extract attachments from.'}
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
            <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
              {tTools('extractAttachments.filesTitle') || 'Selected Files'} ({files.length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={isProcessing}
            >
              {t('buttons.clearAll') || 'Clear All'}
            </Button>
          </div>

          <ul className="space-y-2" role="list">
            {files.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))]"
              >
                <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                  <path d="M14 2v6h6" fill="white" />
                  <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {formatSize(item.file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(item.id)}
                  disabled={isProcessing}
                  className="p-1 rounded hover:bg-red-100 text-[hsl(var(--color-muted-foreground))] hover:text-red-600"
                  aria-label={`Remove ${item.file.name}`}
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
          onClick={handleExtract}
          disabled={!canExtract}
          loading={isProcessing}
        >
          {isProcessing 
            ? (t('status.processing') || 'Processing...') 
            : (tTools('extractAttachments.extractButton') || 'Extract Attachments')
          }
        </Button>
      </div>

      {/* Extracted Attachments */}
      {extractedAttachments.length > 0 && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
              {tTools('extractAttachments.extractedTitle') || 'Extracted Attachments'} ({extractedAttachments.length})
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadAll}
            >
              {tTools('extractAttachments.downloadAll') || 'Download All'}
            </Button>
          </div>

          <ul className="space-y-2" role="list">
            {extractedAttachments.map((attachment, index) => (
              <li
                key={`${attachment.name}-${index}`}
                className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted)/0.3)]"
              >
                <svg className="w-6 h-6 text-[hsl(var(--color-muted-foreground))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                    {attachment.name}
                  </p>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {formatSize(attachment.data.byteLength)}
                    {attachment.page > 0 && ` • Page ${attachment.page}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadAttachment(attachment)}
                >
                  {t('buttons.download') || 'Download'}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Success Message */}
      {status === 'complete' && extractedAttachments.length > 0 && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('extractAttachments.successMessage') || `Successfully extracted ${extractedAttachments.length} attachment(s). Click to download individual files or use "Download All".`}
          </p>
        </div>
      )}
    </div>
  );
}

export default ExtractAttachmentsTool;
