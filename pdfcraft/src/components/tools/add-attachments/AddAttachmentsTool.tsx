'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { addAttachments, type AddAttachmentsOptions } from '@/lib/pdf/processors/attachments';
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

export interface AddAttachmentsToolProps {
  /** Custom class name */
  className?: string;
}

/**
 * AddAttachmentsTool Component
 * Requirements: 5.1, 5.2
 * 
 * Provides the UI for adding attachments to PDF files.
 */
export function AddAttachmentsTool({ className = '' }: AddAttachmentsToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');
  
  // State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachmentLevel, setAttachmentLevel] = useState<'document' | 'page'>('document');
  const [pageRange, setPageRange] = useState('');
  
  // Ref for cancellation
  const cancelledRef = useRef(false);

  /**
   * Handle PDF file selected
   */
  const handlePdfSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      setPdfFile(files[0]);
      setError(null);
      setResult(null);
    }
  }, []);

  /**
   * Handle attachment files selected
   */
  const handleAttachmentsSelected = useCallback((files: File[]) => {
    const newFiles: UploadedFile[] = files.map(file => ({
      id: generateId(),
      file,
    }));
    setAttachmentFiles(prev => [...prev, ...newFiles]);
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
   * Remove an attachment file
   */
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachmentFiles(prev => prev.filter(f => f.id !== id));
    setResult(null);
  }, []);

  /**
   * Clear all files
   */
  const handleClearAll = useCallback(() => {
    setPdfFile(null);
    setAttachmentFiles([]);
    setResult(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
  }, []);

  /**
   * Handle add attachments operation
   */
  const handleAddAttachments = useCallback(async () => {
    if (!pdfFile || attachmentFiles.length === 0) {
      setError('Please select a PDF file and at least one file to attach.');
      return;
    }

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    const options: AddAttachmentsOptions = {
      attachmentLevel,
      pageRange: attachmentLevel === 'page' ? pageRange : undefined,
    };

    try {
      const output: ProcessOutput = await addAttachments(
        pdfFile,
        attachmentFiles.map(f => f.file),
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
        setError(output.error?.message || 'Failed to add attachments.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  }, [pdfFile, attachmentFiles, attachmentLevel, pageRange]);

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
  const canProcess = pdfFile && attachmentFiles.length > 0 && !isProcessing;

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {/* PDF File Upload */}
      <Card variant="outlined" size="lg">
        <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
          {tTools('addAttachments.pdfFileTitle') || '1. Select PDF File'}
        </h3>
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handlePdfSelected}
          onError={handleUploadError}
          disabled={isProcessing}
          label={tTools('addAttachments.pdfUploadLabel') || 'Upload PDF File'}
          description={tTools('addAttachments.pdfUploadDescription') || 'Select the PDF file to add attachments to.'}
        />
        {pdfFile && (
          <div className="mt-4 flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[hsl(var(--color-muted)/0.3)]">
            <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
              <path d="M14 2v6h6" fill="white" />
              <text x="7" y="17" fontSize="6" fill="white" fontWeight="bold">PDF</text>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                {pdfFile.name}
              </p>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                {formatSize(pdfFile.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPdfFile(null)}
              disabled={isProcessing}
              className="p-1 rounded hover:bg-red-100 text-[hsl(var(--color-muted-foreground))] hover:text-red-600"
              aria-label="Remove PDF"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </Card>

      {/* Attachment Files Upload */}
      <Card variant="outlined" size="lg">
        <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
          {tTools('addAttachments.attachmentsTitle') || '2. Select Files to Attach'}
        </h3>
        <FileUploader
          accept={['*/*']}
          multiple
          maxFiles={50}
          onFilesSelected={handleAttachmentsSelected}
          onError={handleUploadError}
          disabled={isProcessing}
          label={tTools('addAttachments.attachmentsUploadLabel') || 'Upload Attachments'}
          description={tTools('addAttachments.attachmentsUploadDescription') || 'Select files to embed in the PDF. Any file type is supported.'}
        />
        
        {attachmentFiles.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {attachmentFiles.length} file(s) selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAttachmentFiles([])}
                disabled={isProcessing}
              >
                {t('buttons.clearAll') || 'Clear All'}
              </Button>
            </div>
            <ul className="space-y-2" role="list">
              {attachmentFiles.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 p-2 rounded-[var(--radius-md)] bg-[hsl(var(--color-muted)/0.3)]"
                >
                  <svg className="w-6 h-6 text-[hsl(var(--color-muted-foreground))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[hsl(var(--color-foreground))] truncate">
                      {item.file.name}
                    </p>
                    <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                      {formatSize(item.file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(item.id)}
                    disabled={isProcessing}
                    className="p-1 rounded hover:bg-red-100 text-[hsl(var(--color-muted-foreground))] hover:text-red-600"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Options Panel */}
      {pdfFile && attachmentFiles.length > 0 && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
            {tTools('addAttachments.optionsTitle') || 'Attachment Options'}
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                {tTools('addAttachments.attachmentLevel') || 'Attachment Level'}
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="attachmentLevel"
                    value="document"
                    checked={attachmentLevel === 'document'}
                    onChange={() => setAttachmentLevel('document')}
                    disabled={isProcessing}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{tTools('addAttachments.documentLevel') || 'Document Level'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="attachmentLevel"
                    value="page"
                    checked={attachmentLevel === 'page'}
                    onChange={() => setAttachmentLevel('page')}
                    disabled={isProcessing}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{tTools('addAttachments.pageLevel') || 'Page Level'}</span>
                </label>
              </div>
            </div>

            {attachmentLevel === 'page' && (
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                  {tTools('addAttachments.pageRange') || 'Page Range'}
                </label>
                <input
                  type="text"
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                  placeholder="e.g., 1-3, 5, 7-9"
                  disabled={isProcessing}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-sm"
                />
                <p className="mt-1 text-xs text-[hsl(var(--color-muted-foreground))]">
                  {tTools('addAttachments.pageRangeHint') || 'Specify which pages to attach files to.'}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Error Message */}
      {error && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700"
          role="alert"
        >
          <p className="text-sm">{error}</p>
        </div>
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
          onClick={handleAddAttachments}
          disabled={!canProcess}
          loading={isProcessing}
        >
          {isProcessing 
            ? (t('status.processing') || 'Processing...') 
            : (tTools('addAttachments.addButton') || 'Add Attachments')
          }
        </Button>

        {result && (
          <DownloadButton
            file={result}
            filename={pdfFile ? pdfFile.name.replace(/\.pdf$/i, '_with_attachments.pdf') : 'output.pdf'}
            variant="secondary"
            size="lg"
            showFileSize
          />
        )}

        {(pdfFile || attachmentFiles.length > 0) && !isProcessing && (
          <Button
            variant="ghost"
            size="lg"
            onClick={handleClearAll}
          >
            {t('buttons.clearAll') || 'Clear All'}
          </Button>
        )}
      </div>

      {/* Success Message */}
      {status === 'complete' && result && (
        <div 
          className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
          role="status"
        >
          <p className="text-sm font-medium">
            {tTools('addAttachments.successMessage') || 'Attachments added successfully! Click the download button to save your file.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default AddAttachmentsTool;
