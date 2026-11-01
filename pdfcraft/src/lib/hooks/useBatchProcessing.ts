/**
 * useBatchProcessing Hook
 * Requirements: 10.1
 * 
 * React hook for batch processing multiple files with the same operation
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { saveBlobFile } from '@/lib/tauri-bridge';

export interface BatchFile {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  result?: Blob;
  error?: string;
}

export interface BatchProcessingOptions {
  maxConcurrent?: number;
  onFileComplete?: (file: BatchFile) => void;
  onAllComplete?: (files: BatchFile[]) => void;
  onError?: (file: BatchFile, error: Error) => void;
}

export interface UseBatchProcessingReturn {
  files: BatchFile[];
  isProcessing: boolean;
  overallProgress: number;
  completedCount: number;
  errorCount: number;
  
  // Actions
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  startProcessing: (
    processor: (file: File, onProgress: (progress: number) => void) => Promise<Blob>
  ) => Promise<void>;
  cancelProcessing: () => void;
  downloadAll: (filenamePrefix?: string) => void;
  downloadAsZip: (zipFilename?: string) => Promise<void>;
}

function generateFileId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function useBatchProcessing(options: BatchProcessingOptions = {}): UseBatchProcessingReturn {
  const { maxConcurrent = 2, onFileComplete, onAllComplete, onError } = options;
  
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const cancelledRef = useRef(false);
  const processingRef = useRef(false); // Track processing state with ref

  const addFiles = useCallback((newFiles: File[]) => {
    const batchFiles: BatchFile[] = newFiles.map((file) => ({
      id: generateFileId(),
      file,
      status: 'pending',
      progress: 0,
    }));
    
    setFiles((prev) => [...prev, ...batchFiles]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const updateFile = useCallback((id: string, updates: Partial<BatchFile>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  const startProcessing = useCallback(
    async (
      processor: (file: File, onProgress: (progress: number) => void) => Promise<Blob>
    ) => {
      // Check ref to avoid race condition
      if (processingRef.current) return;
      
      processingRef.current = true;
      setIsProcessing(true);
      cancelledRef.current = false;

      // Capture current files snapshot
      const currentFiles = await new Promise<BatchFile[]>((resolve) => {
        setFiles((f) => {
          resolve(f);
          return f;
        });
      });

      const pendingFiles = currentFiles.filter((f) => f.status === 'pending');
      const queue = [...pendingFiles];
      const processing: Promise<void>[] = [];

      const processFile = async (batchFile: BatchFile) => {
        if (cancelledRef.current) return;

        updateFile(batchFile.id, { status: 'processing', progress: 0 });

        try {
          const result = await processor(batchFile.file, (progress) => {
            updateFile(batchFile.id, { progress });
          });

          const completedFile: BatchFile = {
            ...batchFile,
            status: 'completed',
            progress: 100,
            result,
          };

          updateFile(batchFile.id, {
            status: 'completed',
            progress: 100,
            result,
          });

          onFileComplete?.(completedFile);
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Processing failed');
          
          updateFile(batchFile.id, {
            status: 'error',
            error: error.message,
          });

          onError?.({ ...batchFile, status: 'error', error: error.message }, error);
        }
      };

      const processQueue = async () => {
        while (queue.length > 0 && !cancelledRef.current) {
          // Wait if we're at max concurrent
          while (processing.length >= maxConcurrent) {
            await Promise.race(processing);
          }

          const file = queue.shift();
          if (!file) break;

          const promise = processFile(file).finally(() => {
            const index = processing.indexOf(promise);
            if (index > -1) {
              processing.splice(index, 1);
            }
          });

          processing.push(promise);
        }

        // Wait for all remaining to complete
        await Promise.all(processing);
      };

      await processQueue();

      // Mark as complete
      processingRef.current = false;
      setIsProcessing(false);

      // Get final state and trigger callback
      setFiles((finalFiles) => {
        onAllComplete?.(finalFiles);
        return finalFiles;
      });
    },
    [maxConcurrent, updateFile, onFileComplete, onAllComplete, onError]
  );

  const cancelProcessing = useCallback(() => {
    cancelledRef.current = true;
    processingRef.current = false;
    setIsProcessing(false);
  }, []);

  const downloadAll = useCallback((filenamePrefix = 'processed') => {
    const completedFiles = files.filter((f) => f.status === 'completed' && f.result);
    
    completedFiles.forEach((file, index) => {
      if (!file.result) return;
      
      const url = URL.createObjectURL(file.result);
      const a = document.createElement('a');
      a.href = url;
      
      // Generate filename
      const originalName = file.file.name.replace(/\.[^/.]+$/, '');
      a.download = `${filenamePrefix}_${originalName}_${index + 1}.pdf`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }, [files]);

  const downloadAsZip = useCallback(async (zipFilename = 'batch_processed.zip') => {
    const completedFiles = files.filter((f) => f.status === 'completed' && f.result);
    
    if (completedFiles.length === 0) return;

    // Dynamic import JSZip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    completedFiles.forEach((file, index) => {
      if (!file.result) return;
      
      const originalName = file.file.name.replace(/\.[^/.]+$/, '');
      const filename = `${originalName}_processed_${index + 1}.pdf`;
      zip.file(filename, file.result);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    await saveBlobFile(blob, zipFilename);
  }, [files]);

  // Calculate derived state
  const completedCount = files.filter((f) => f.status === 'completed').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const totalProgress = files.reduce((sum, f) => sum + f.progress, 0);
  const overallProgress = files.length > 0 ? Math.round(totalProgress / files.length) : 0;

  return {
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
  };
}
