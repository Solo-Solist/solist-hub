/**
 * useRecentFiles Hook
 * Requirements: 10.4
 * 
 * React hook for managing recent files history
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  type RecentFile,
  getRecentFiles,
  addRecentFile,
  removeRecentFile,
  clearRecentFiles,
} from '@/lib/storage/recent-files';

export interface UseRecentFilesReturn {
  recentFiles: RecentFile[];
  addFile: (name: string, size: number, toolUsed: string, toolName?: string) => void;
  removeFile: (id: string) => void;
  clearAll: () => void;
  isLoading: boolean;
}

export function useRecentFiles(): UseRecentFilesReturn {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load recent files on mount
  useEffect(() => {
    setRecentFiles(getRecentFiles());
    setIsLoading(false);
  }, []);

  const addFile = useCallback(
    (name: string, size: number, toolUsed: string, toolName?: string) => {
      addRecentFile(name, size, toolUsed, toolName);
      setRecentFiles(getRecentFiles());
    },
    []
  );

  const removeFile = useCallback((id: string) => {
    removeRecentFile(id);
    setRecentFiles(getRecentFiles());
  }, []);

  const clearAll = useCallback(() => {
    clearRecentFiles();
    setRecentFiles([]);
  }, []);

  return {
    recentFiles,
    addFile,
    removeFile,
    clearAll,
    isLoading,
  };
}
