/**
 * OptimizedImage Component
 * Requirements: 8.3 - Image optimization
 * 
 * A wrapper around next/image that provides optimized image loading
 * with lazy loading, blur placeholder, and proper sizing.
 * 
 * Note: Since the project uses static export, Next.js built-in image
 * optimization is disabled. This component provides client-side
 * optimizations like lazy loading and blur placeholders.
 */

'use client';

import React, { useState, useCallback } from 'react';
import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

export interface OptimizedImageProps extends Omit<ImageProps, 'onLoad' | 'onError'> {
  /** Fallback image source if main image fails to load */
  fallbackSrc?: string;
  /** Whether to show a blur placeholder while loading */
  showBlurPlaceholder?: boolean;
  /** Custom placeholder color (CSS color value) */
  placeholderColor?: string;
  /** Callback when image loads successfully */
  onLoad?: () => void;
  /** Callback when image fails to load */
  onError?: () => void;
  /** Container className for the wrapper div */
  containerClassName?: string;
}

/**
 * Generate a simple blur data URL for placeholder
 */
function generateBlurDataUrl(color: string = '#e5e7eb'): string {
  // Create a simple 1x1 pixel SVG as blur placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="${color}" width="1" height="1"/></svg>`;
  // Use btoa for browser compatibility instead of Buffer
  return `data:image/svg+xml;base64,${typeof window !== 'undefined' ? btoa(svg) : ''}`;
}

/**
 * OptimizedImage provides enhanced image loading with:
 * - Lazy loading (native browser lazy loading)
 * - Blur placeholder while loading
 * - Fallback image on error
 * - Smooth fade-in animation
 * 
 * @example
 * ```tsx
 * <OptimizedImage
 *   src="/images/hero.png"
 *   alt="Hero image"
 *   width={800}
 *   height={600}
 *   priority={false}
 *   showBlurPlaceholder
 * />
 * ```
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  fallbackSrc,
  showBlurPlaceholder = true,
  placeholderColor = '#e5e7eb',
  onLoad,
  onError,
  className,
  containerClassName,
  priority = false,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setHasError(true);
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      setHasError(false);
    }
    onError?.();
  }, [fallbackSrc, currentSrc, onError]);

  // Generate blur placeholder
  const blurDataURL = showBlurPlaceholder ? generateBlurDataUrl(placeholderColor) : undefined;

  return (
    <div className={cn('relative overflow-hidden', containerClassName)}>
      {/* Placeholder background */}
      {showBlurPlaceholder && !isLoaded && (
        <div 
          className="absolute inset-0 animate-pulse"
          style={{ backgroundColor: placeholderColor }}
          aria-hidden="true"
        />
      )}
      
      <Image
        src={currentSrc}
        alt={alt}
        className={cn(
          'transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0',
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
        loading={priority ? 'eager' : 'lazy'}
        placeholder={showBlurPlaceholder ? 'blur' : 'empty'}
        blurDataURL={blurDataURL}
        priority={priority}
        {...props}
      />
      
      {/* Error state */}
      {hasError && !fallbackSrc && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-[hsl(var(--color-muted))]"
          role="img"
          aria-label={`Failed to load: ${alt}`}
        >
          <span className="text-[hsl(var(--color-muted-foreground))] text-sm">
            Image unavailable
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * Responsive image sizes for common breakpoints
 * Use these with the `sizes` prop for responsive images
 */
export const IMAGE_SIZES = {
  /** Full width on all screens */
  fullWidth: '100vw',
  /** Container width (max 1280px) */
  container: '(max-width: 1280px) 100vw, 1280px',
  /** Half width on desktop, full on mobile */
  halfDesktop: '(max-width: 768px) 100vw, 50vw',
  /** Third width on desktop, full on mobile */
  thirdDesktop: '(max-width: 768px) 100vw, 33vw',
  /** Quarter width on desktop, half on tablet, full on mobile */
  quarterDesktop: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw',
  /** Tool card size */
  toolCard: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px',
} as const;

export default OptimizedImage;
