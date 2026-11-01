/**
 * PdfLibraryLoader Component
 * Requirements: 8.2 - Lazy loading for PDF libraries
 * 
 * A wrapper component that handles lazy loading of PDF libraries
 * and shows a loading state while libraries are being loaded.
 */

'use client';

import React from 'react';
import { usePdfLibrary, type LibraryType } from '@/lib/hooks/usePdfLibrary';
import { Loader2 } from 'lucide-react';

export interface PdfLibraryLoaderProps {
  /** Which library to load */
  library: LibraryType;
  /** Content to render when library is loaded */
  children: React.ReactNode;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Custom error component */
  errorComponent?: (error: Error, retry: () => void) => React.ReactNode;
  /** Loading message */
  loadingMessage?: string;
}

/**
 * Default loading component
 */
const DefaultLoading: React.FC<{ message?: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center p-8 gap-4">
    <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--color-primary))]" />
    <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
      {message || 'Loading PDF tools...'}
    </p>
  </div>
);

/**
 * Default error component
 */
const DefaultError: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => (
  <div className="flex flex-col items-center justify-center p-8 gap-4 text-center">
    <div className="w-12 h-12 rounded-full bg-[hsl(var(--color-destructive)/0.1)] flex items-center justify-center">
      <span className="text-2xl">⚠️</span>
    </div>
    <div>
      <h3 className="font-semibold text-[hsl(var(--color-foreground))]">
        Failed to load PDF tools
      </h3>
      <p className="text-sm text-[hsl(var(--color-muted-foreground))] mt-1">
        {error.message}
      </p>
    </div>
    <button
      onClick={retry}
      className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))] hover:bg-[hsl(var(--color-primary-hover))] transition-colors"
    >
      Try Again
    </button>
  </div>
);

/**
 * PdfLibraryLoader wraps tool components and handles library loading
 * 
 * @example
 * ```tsx
 * <PdfLibraryLoader library="pdf-lib">
 *   <MergePDFTool />
 * </PdfLibraryLoader>
 * ```
 */
export const PdfLibraryLoader: React.FC<PdfLibraryLoaderProps> = ({
  library,
  children,
  loadingComponent,
  errorComponent,
  loadingMessage,
}) => {
  const { isLoaded, isLoading, error, load } = usePdfLibrary({
    library,
    loadOnMount: true,
  });

  if (isLoading) {
    return loadingComponent || <DefaultLoading message={loadingMessage} />;
  }

  if (error) {
    return errorComponent ? (
      errorComponent(error, load)
    ) : (
      <DefaultError error={error} retry={load} />
    );
  }

  if (!isLoaded) {
    return loadingComponent || <DefaultLoading message={loadingMessage} />;
  }

  return <>{children}</>;
};

export default PdfLibraryLoader;
