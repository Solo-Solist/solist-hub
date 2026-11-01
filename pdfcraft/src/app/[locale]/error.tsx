'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logger } from '@/lib/utils/logger';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    logger.error('Page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[hsl(var(--color-background))]">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-[hsl(var(--color-foreground))]">
            Something went wrong
          </h1>
          <p className="text-[hsl(var(--color-muted-foreground))]">
            An unexpected error occurred. Please try again.
          </p>
          {error.digest && (
            <p className="text-xs text-[hsl(var(--color-muted-foreground))] font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))] font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--color-secondary))] text-[hsl(var(--color-secondary-foreground))] font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}
