/**
 * PerformanceHints Component
 * Requirements: 8.1 - Lighthouse performance score 90+
 * 
 * Adds performance optimization hints to the document head:
 * - Preconnect to external origins
 * - DNS prefetch for third-party resources
 * - Preload critical resources
 */

import React from 'react';

/**
 * External origins that may be used by the application
 */
const PRECONNECT_ORIGINS = [
  // Google Fonts (if using external fonts)
  // 'https://fonts.googleapis.com',
  // 'https://fonts.gstatic.com',
] as const;

/**
 * DNS prefetch origins for resources that may be loaded later
 */
const DNS_PREFETCH_ORIGINS = [
  // Add any third-party origins here
] as const;

/**
 * Critical resources to preload
 */
interface PreloadResource {
  href: string;
  as: 'script' | 'style' | 'font' | 'image' | 'fetch';
  type?: string;
  crossOrigin?: 'anonymous' | 'use-credentials';
}

const PRELOAD_RESOURCES: PreloadResource[] = [
  // Preload critical fonts (if self-hosted)
  // {
  //   href: '/fonts/inter-var.woff2',
  //   as: 'font',
  //   type: 'font/woff2',
  //   crossOrigin: 'anonymous',
  // },
];

/**
 * PerformanceHints adds resource hints to optimize loading
 * 
 * @example
 * ```tsx
 * // In your layout.tsx or _document.tsx
 * <head>
 *   <PerformanceHints />
 * </head>
 * ```
 */
export const PerformanceHints: React.FC = () => {
  return (
    <>
      {/* Preconnect to external origins */}
      {PRECONNECT_ORIGINS.map((origin) => (
        <link
          key={`preconnect-${origin}`}
          rel="preconnect"
          href={origin}
          crossOrigin="anonymous"
        />
      ))}

      {/* DNS prefetch for resources that may be loaded later */}
      {DNS_PREFETCH_ORIGINS.map((origin) => (
        <link
          key={`dns-prefetch-${origin}`}
          rel="dns-prefetch"
          href={origin}
        />
      ))}

      {/* Preload critical resources */}
      {PRELOAD_RESOURCES.map((resource) => (
        <link
          key={`preload-${resource.href}`}
          rel="preload"
          href={resource.href}
          as={resource.as}
          type={resource.type}
          crossOrigin={resource.crossOrigin}
        />
      ))}

      {/* Optimize rendering */}
      <meta name="color-scheme" content="light dark" />
      
      {/* Prevent layout shift from scrollbar */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html {
              scrollbar-gutter: stable;
            }
          `,
        }}
      />
    </>
  );
};

export default PerformanceHints;
