/**
 * usePdfLibrary Hook
 * Requirements: 8.2 - Lazy loading for PDF libraries
 * 
 * Custom hook for lazy loading PDF processing libraries.
 * Libraries are loaded only when a tool is accessed, optimizing initial page load.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  loadPdfLib, 
  loadPdfjs, 
  isLibraryLoaded, 
  getLibraryStatus,
  preloadLibraries 
} from '@/lib/pdf/loader';

export type LibraryType = 'pdf-lib' | 'pdfjs' | 'both';

export interface UsePdfLibraryOptions {
  /** Which library to load */
  library: LibraryType;
  /** Whether to load immediately on mount */
  loadOnMount?: boolean;
  /** Callback when library is loaded */
  onLoad?: () => void;
  /** Callback when loading fails */
  onError?: (error: Error) => void;
}

export interface UsePdfLibraryResult {
  /** Whether the library is loaded */
  isLoaded: boolean;
  /** Whether the library is currently loading */
  isLoading: boolean;
  /** Error if loading failed */
  error: Error | null;
  /** Function to manually trigger loading */
  load: () => Promise<void>;
  /** Current status of all libraries */
  status: ReturnType<typeof getLibraryStatus>;
}

/**
 * Hook for lazy loading PDF libraries
 * 
 * @example
 * ```tsx
 * const { isLoaded, isLoading, load } = usePdfLibrary({ 
 *   library: 'pdf-lib',
 *   loadOnMount: true 
 * });
 * 
 * if (isLoading) return <LoadingSpinner />;
 * if (!isLoaded) return <button onClick={load}>Load Library</button>;
 * ```
 */
export function usePdfLibrary(options: UsePdfLibraryOptions): UsePdfLibraryResult {
  const { library, loadOnMount = false, onLoad, onError } = options;
  
  const [isLoaded, setIsLoaded] = useState(() => {
    // Check if already loaded on initial render
    if (library === 'both') {
      return isLibraryLoaded('pdf-lib') && isLibraryLoaded('pdfjs');
    }
    return isLibraryLoaded(library);
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState(getLibraryStatus);
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    // Skip if already loaded
    if (isLoaded) return;
    
    // Skip if already loading
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      if (library === 'both') {
        await preloadLibraries();
      } else if (library === 'pdf-lib') {
        await loadPdfLib();
      } else if (library === 'pdfjs') {
        await loadPdfjs();
      }
      
      if (isMountedRef.current) {
        setIsLoaded(true);
        setStatus(getLibraryStatus());
        onLoad?.();
      }
    } catch (err) {
      const loadError = err instanceof Error ? err : new Error('Failed to load PDF library');
      if (isMountedRef.current) {
        setError(loadError);
        onError?.(loadError);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [library, isLoaded, isLoading, onLoad, onError]);

  // Load on mount if requested
  useEffect(() => {
    if (loadOnMount && !isLoaded && !isLoading) {
      load();
    }
  }, [loadOnMount, isLoaded, isLoading, load]);

  // Update status periodically while loading
  useEffect(() => {
    if (!isLoading) return;
    
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        setStatus(getLibraryStatus());
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [isLoading]);

  return {
    isLoaded,
    isLoading,
    error,
    load,
    status,
  };
}

/**
 * Hook for preloading PDF libraries on hover/focus
 * Useful for preloading before user clicks on a tool
 */
export function usePdfLibraryPreload() {
  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const startPreload = useCallback((library: LibraryType = 'both', delay = 200) => {
    // Clear any existing timeout
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current);
    }
    
    preloadTimeoutRef.current = setTimeout(async () => {
      try {
        if (library === 'both') {
          await preloadLibraries();
        } else if (library === 'pdf-lib') {
          await loadPdfLib();
        } else if (library === 'pdfjs') {
          await loadPdfjs();
        }
      } catch {
        // Silently fail preload - user will see error when they actually use the tool
      }
    }, delay);
  }, []);
  
  const cancelPreload = useCallback(() => {
    if (preloadTimeoutRef.current) {
      clearTimeout(preloadTimeoutRef.current);
      preloadTimeoutRef.current = null;
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    startPreload,
    cancelPreload,
    getHandlers: (library: LibraryType = 'both') => ({
      onMouseEnter: () => startPreload(library),
      onMouseLeave: cancelPreload,
      onFocus: () => startPreload(library),
      onBlur: cancelPreload,
    }),
  };
}

export default usePdfLibrary;
