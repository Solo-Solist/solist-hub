/**
 * BatchProcessingPanel Component
 * Requirements: 10.1
 * 
 * UI for batch processing multiple files with the same operation
 */

'use client';

import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  Files,
  X,
  Play,
  Pause,
  Download,
  Archive,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useBatchProcessing, type BatchFile } from '@/lib/hooks/useBatchProcessing';
import { formatFileSize } from '@/lib/storage/recent-files';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export interface BatchProcessingPanelProps {
  translations: {
    title: string;
    addFiles: string;
    clearAll: string;
    startProcessing: string;
    cancelProcessing: string;
    downloadAll: string;
    downloadZip: string;
    pending: string;
    processing: string;
    completed: string;
    error: string;
    progress: string;
    filesSelected: string;
    noFiles: string;
  };
  acceptedTypes?: string;
  processor: (file: File, onProgress: (progress: number) => void) => Promise<Blob>;
  maxConcurrent?: number;
}

const FileStatusIcon: React.FC<{ status: BatchFile['status'] }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <Files className="h-4 w-4 text-gray-400" aria-hidden="true" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" aria-hidden="true" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" aria-hidden="true" />;
    default:
      return null;
  }
};

export const BatchProcessingPanel: React.FC<BatchProcessingPanelProps> = ({
  translations,
  acceptedTypes = '.pdf',
  processor,
  maxConcurrent = 2,
}) => {
  const {
    files,
    isProcessing,
    overallProgress,
    completedCount,
    errorCount,
    addFiles,
    removeFile,
    clearFiles,
    startProcessing,
    cancelProcessing,
    downloadAll,
    downloadAsZip,
  } = useBatchProcessing({ maxConcurrent });

  const [focusedFileIndex, setFocusedFileIndex] = useState<number>(-1);
  const fileItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Focus file item when focusedFileIndex changes
  useEffect(() => {
    if (focusedFileIndex >= 0 && fileItemRefs.current[focusedFileIndex]) {
      const removeButton = fileItemRefs.current[focusedFileIndex]?.querySelector<HTMLButtonElement>(
        'button[aria-label]'
      );
      removeButton?.focus();
    }
  }, [focusedFileIndex]);

  const handleFileKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedFileIndex((prev) => (prev < files.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedFileIndex((prev) => (prev > 0 ? prev - 1 : files.length - 1));
        break;
      case 'Home':
        event.preventDefault();
        setFocusedFileIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedFileIndex(files.length - 1);
        break;
      case 'Delete':
      case 'Backspace':
        if (!isProcessing && files[index].status !== 'processing') {
          event.preventDefault();
          removeFile(files[index].id);
          // Adjust focus after removal
          if (files.length > 1) {
            setFocusedFileIndex((prev) => Math.min(prev, files.length - 2));
          } else {
            setFocusedFileIndex(-1);
          }
        }
        break;
    }
  }, [files, isProcessing, removeFile]);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = event.target.files;
      if (selectedFiles) {
        addFiles(Array.from(selectedFiles));
      }
      // Reset input
      event.target.value = '';
    },
    [addFiles]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const droppedFiles = event.dataTransfer.files;
      if (droppedFiles) {
        addFiles(Array.from(droppedFiles));
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleStartProcessing = useCallback(() => {
    startProcessing(processor);
  }, [startProcessing, processor]);

  const getStatusLabel = (status: BatchFile['status']) => {
    switch (status) {
      case 'pending':
        return translations.pending;
      case 'processing':
        return translations.processing;
      case 'completed':
        return translations.completed;
      case 'error':
        return translations.error;
      default:
        return status;
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const hasCompletedFiles = completedCount > 0;

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Files className="h-5 w-5 text-[hsl(var(--color-primary))]" aria-hidden="true" />
          <h3 className="font-medium text-[hsl(var(--color-foreground))]">
            {translations.title}
          </h3>
          {files.length > 0 && (
            <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
              ({files.length} {translations.filesSelected})
            </span>
          )}
        </div>
        {files.length > 0 && !isProcessing && (
          <button
            onClick={clearFiles}
            className="text-xs text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-destructive))] transition-colors flex items-center gap-1"
            aria-label={translations.clearAll}
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            {translations.clearAll}
          </button>
        )}
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed border-[hsl(var(--color-border))] rounded-[var(--radius-lg)] p-6 text-center hover:border-[hsl(var(--color-primary))] transition-colors cursor-pointer"
        role="region"
        aria-label="File drop zone"
      >
        <input
          type="file"
          id="batch-file-input"
          multiple
          accept={acceptedTypes}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isProcessing}
          aria-label={translations.addFiles}
        />
        <label
          htmlFor="batch-file-input"
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <Files className="h-8 w-8 text-[hsl(var(--color-muted-foreground))]" aria-hidden="true" />
          <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
            {translations.addFiles}
          </span>
        </label>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div 
          className="mt-4 space-y-2 max-h-64 overflow-auto"
          role="list"
          aria-label="Files to process"
        >
          {files.map((file, index) => (
            <div
              key={file.id}
              ref={(el) => { fileItemRefs.current[index] = el; }}
              className="flex items-center gap-3 p-2 rounded-[var(--radius-md)] bg-[hsl(var(--color-muted))] focus-within:ring-2 focus-within:ring-[hsl(var(--color-ring))]"
              role="listitem"
              onKeyDown={(e) => handleFileKeyDown(e, index)}
            >
              <FileStatusIcon status={file.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                    {file.file.name}
                  </span>
                  <span className="text-xs text-[hsl(var(--color-muted-foreground))] ml-2">
                    {formatFileSize(file.file.size)}
                  </span>
                </div>
                {file.status === 'processing' && (
                  <div className="mt-1">
                    <div className="h-1 bg-[hsl(var(--color-background))] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[hsl(var(--color-primary))] transition-all"
                        style={{ width: `${file.progress}%` }}
                        role="progressbar"
                        aria-valuenow={file.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                )}
                {file.status === 'error' && file.error && (
                  <span className="text-xs text-[hsl(var(--color-destructive))]" role="alert">
                    {file.error}
                  </span>
                )}
                <span className="text-xs text-[hsl(var(--color-muted-foreground))]">
                  {getStatusLabel(file.status)}
                </span>
              </div>
              {!isProcessing && file.status !== 'processing' && (
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-1 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-destructive))] focus:text-[hsl(var(--color-destructive))] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-ring))] rounded-sm"
                  aria-label={`Remove ${file.file.name}`}
                  tabIndex={focusedFileIndex === index ? 0 : -1}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Overall Progress */}
      {isProcessing && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-[hsl(var(--color-muted-foreground))] mb-1">
            <span>{translations.progress}</span>
            <span>
              {completedCount}/{files.length} ({overallProgress}%)
            </span>
          </div>
          <div className="h-2 bg-[hsl(var(--color-muted))] rounded-full overflow-hidden">
            <div
              className="h-full bg-[hsl(var(--color-primary))] transition-all"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      {files.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!isProcessing && pendingCount > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartProcessing}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {translations.startProcessing}
            </Button>
          )}
          
          {isProcessing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={cancelProcessing}
              className="flex items-center gap-2"
            >
              <Pause className="h-4 w-4" aria-hidden="true" />
              {translations.cancelProcessing}
            </Button>
          )}

          {hasCompletedFiles && !isProcessing && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadAll()}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {translations.downloadAll}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadAsZip()}
                className="flex items-center gap-2"
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
                {translations.downloadZip}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 && (
        <p className="mt-4 text-center text-sm text-[hsl(var(--color-muted-foreground))]">
          {translations.noFiles}
        </p>
      )}

      {/* Summary */}
      {files.length > 0 && !isProcessing && (completedCount > 0 || errorCount > 0) && (
        <div className="mt-4 flex items-center gap-4 text-sm">
          {completedCount > 0 && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
              {completedCount} {translations.completed}
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {errorCount} {translations.error}
            </span>
          )}
        </div>
      )}
    </Card>
  );
};

export default BatchProcessingPanel;
