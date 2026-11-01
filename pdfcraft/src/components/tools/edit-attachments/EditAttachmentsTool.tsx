'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { 
  EditAttachmentsPDFProcessor, 
  createEditAttachmentsProcessor,
  type AttachmentInfo 
} from '@/lib/pdf/processors/attachments';
import { saveBlobFile } from '@/lib/tauri-bridge';
import type { ProcessOutput } from '@/types/pdf';

export interface EditAttachmentsToolProps {
  /** Custom class name */
  className?: string;
}

/**
 * EditAttachmentsTool Component
 * Requirements: 5.1, 5.2
 * 
 * Provides the UI for viewing and removing attachments from PDF files.
 */
export function EditAttachmentsTool({ className = '' }: EditAttachmentsToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  // State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [selectedForRemoval, setSelectedForRemoval] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  
  // Ref for processor and cancellation
  const processorRef = useRef<EditAttachmentsPDFProcessor | null>(null);
  const cancelledRef = useRef(false);

  /**
   * Handle PDF file selected
   */
  const handlePdfSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    const file = files[0];
    setPdfFile(file);
    setError(null);
    setResult(null);
    setAttachments([]);
    setSelectedForRemoval(new Set());
    setIsLoadingAttachments(true);

    try {
      const processor = createEditAttachmentsProcessor();
      processorRef.current = processor;
      
      const result = await processor.getAttachments(file);
      
      if (result.success && result.attachments) {
        setAttachments(result.attachments);
        if (result.attachments.length === 0) {
          setError(tTools('editAttachments.noAttachments') || 'No attachments found in this PDF file.');
        }
      } else {
        setError(result.error || 'Failed to read attachments from PDF.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDF.');
    } finally {
      setIsLoadingAttachments(false);
    }
  }, []);

  /**
   * Handle file upload error
   */
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  /**
   * Toggle attachment selection for removal
   */
  const handleToggleSelection = useCallback((index: number) => {
    setSelectedForRemoval(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
    setResult(null);
  }, []);

  /**
   * Select all attachments for removal
   */
  const handleSelectAll = useCallback(() => {
    setSelectedForRemoval(new Set(attachments.map((_, i) => i)));
    setResult(null);
  }, [attachments]);

  /**
   * Deselect all attachments
   */
  const handleDeselectAll = useCallback(() => {
    setSelectedForRemoval(new Set());
    setResult(null);
  }, []);

  /**
   * Clear all and reset
   */
  const handleClearAll = useCallback(() => {
    setPdfFile(null);
    setAttachments([]);
    setSelectedForRemoval(new Set());
    setResult(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Download an attachment
   */
  const handleDownloadAttachment = useCallback((attachment: AttachmentInfo) => {
    const blob = new Blob([new Uint8Array(attachment.data)]);
    saveBlobFile(blob, attachment.name);
  }, []);

  /**
   * Handle remove selected attachments
   */
  const handleRemoveSelected = useCallback(async () => {
    if (!pdfFile || selectedForRemoval.size === 0) {
      setError(tTools('editAttachments.selectAtLeastOne') || 'Please select at least one attachment to remove.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const processor = createEditAttachmentsProcessor();
      processorRef.current = processor;

      const output: ProcessOutput = await processor.process(
        {
          files: [pdfFile],
          options: { attachmentsToRemove: Array.from(selectedForRemoval) },
        },
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
        setError(output.error?.message || 'Failed to remove attachments.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [pdfFile, selectedForRemoval]);

  /**
   * Handle cancel operation
   */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    if (processorRef.current) {
      processorRef.current.cancel();
    }
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
  const canRemove = pdfFile && selectedForRemoval.size > 0 && !isProcessing;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* File Upload Area */}
      <FileUploader
        accept={['application/pdf', '.pdf']}
        multiple={false}
        maxFiles={1}
        onFilesSelected={handlePdfSelected}
        onError={handleUploadError}
        disabled={isProcessing || isLoadingAttachments}
        label={tTools('editAttachments.uploadLabel') || 'Upload PDF File'}
        description={tTools('editAttachments.uploadDescription') || 'Select a PDF file to view and manage its attachments.'}
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

      {/* Loading Attachments */}
      {isLoadingAttachments && (
        <div className="flex items-center justify-center p-8">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-[hsl(var(--color-primary))]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
              {tTools('editAttachments.loadingAttachments') || 'Loading attachments...'}
            </span>
          </div>
        </div>
      )}

      {/* PDF File Info */}
      {pdfFile && !isLoadingAttachments && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                <path d="M14 2v6h6" fill="white" />
                <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
              </svg>
              <div>
                <p className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                  {pdfFile.name}
                </p>
                <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                  {formatSize(pdfFile.size)} • {attachments.length} {tTools('editAttachments.attachmentCount') || 'attachment(s)'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={isProcessing}
            >
              {t('buttons.clear') || 'Clear'}
            </Button>
          </div>

          {/* Attachments List */}
          {attachments.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                  {tTools('editAttachments.attachmentsTitle') || 'Attachments'}
                </h4>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={isProcessing}
                  >
                    {tTools('editAttachments.selectAll') || 'Select All'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    disabled={isProcessing || selectedForRemoval.size === 0}
                  >
                    {tTools('editAttachments.deselectAll') || 'Deselect All'}
                  </Button>
                </div>
              </div>

              <ul className="space-y-2" role="list">
                {attachments.map((attachment, index) => (
                  <li
                    key={`${attachment.name}-${index}`}
                    className={`flex items-center gap-3 p-3 rounded-[var(--radius-md)] border transition-colors ${
                      selectedForRemoval.has(index)
                        ? 'border-red-300 bg-red-50'
                        : 'border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted)/0.3)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForRemoval.has(index)}
                      onChange={() => handleToggleSelection(index)}
                      disabled={isProcessing}
                      className="w-4 h-4 rounded border-[hsl(var(--color-border))]"
                      aria-label={`Select ${attachment.name} for removal`}
                    />
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
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadAttachment(attachment)}
                      disabled={isProcessing}
                    >
                      {t('buttons.download') || 'Download'}
                    </Button>
                  </li>
                ))}
              </ul>

              {selectedForRemoval.size > 0 && (
                <p className="mt-3 text-sm text-red-600">
                  {tTools('editAttachments.selectedCount', { count: selectedForRemoval.size }) || `${selectedForRemoval.size} attachment(s) selected for removal`}
                </p>
              )}
            </>
          )}
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
      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="primary"
            size="lg"
            onClick={handleRemoveSelected}
            disabled={!canRemove}
            loading={isProcessing}
          >
            {isProcessing 
              ? (t('status.processing') || 'Processing...') 
              : (tTools('editAttachments.removeButton') || 'Remove Selected')
            }
          </Button>

          {result && (
            <DownloadButton
              file={result}
              filename={pdfFile ? pdfFile.name.replace(/\.pdf$/i, '_edited.pdf') : 'output.pdf'}
              variant="secondary"
              size="lg"
              showFileSize
            />
          )}
        </div>
      )}

      {/* Success Message */}
      {status === 'complete' && result && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('editAttachments.successMessage') || 'Attachments removed successfully! Click the download button to save your file.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default EditAttachmentsTool;
