/**
 * Performance Monitoring Utilities
 * Requirements: 8.1 - Lighthouse performance score 90+
 * 
 * Utilities for monitoring and reporting web performance metrics.
 */

/**
 * Core Web Vitals metrics
 */
export interface WebVitals {
  /** Largest Contentful Paint - loading performance */
  LCP?: number;
  /** First Input Delay - interactivity */
  FID?: number;
  /** Cumulative Layout Shift - visual stability */
  CLS?: number;
  /** First Contentful Paint */
  FCP?: number;
  /** Time to First Byte */
  TTFB?: number;
  /** Interaction to Next Paint */
  INP?: number;
}

/**
 * Performance metric thresholds (in milliseconds, except CLS)
 * Based on Google's Core Web Vitals thresholds
 */
export const PERFORMANCE_THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
  INP: { good: 200, needsImprovement: 500 },
} as const;

/**
 * Get performance rating based on metric value
 */
export function getPerformanceRating(
  metric: keyof typeof PERFORMANCE_THRESHOLDS,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const thresholds = PERFORMANCE_THRESHOLDS[metric];
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.needsImprovement) return 'needs-improvement';
  return 'poor';
}

/**
 * Report Web Vitals to console (development) or analytics (production)
 */
export function reportWebVitals(metric: {
  name: string;
  value: number;
  id: string;
  delta: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}): void {
  // In development, log to console
  if (process.env.NODE_ENV === 'development') {
    const color = 
      metric.rating === 'good' ? '\x1b[32m' : // green
      metric.rating === 'needs-improvement' ? '\x1b[33m' : // yellow
      '\x1b[31m'; // red
    
    console.log(
      `${color}[Web Vitals] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})\x1b[0m`
    );
  }
  
  // In production, you could send to analytics
  // Example: sendToAnalytics(metric);
}

/**
 * Measure and report a custom performance metric
 */
export function measurePerformance(
  name: string,
  startMark: string,
  endMark: string
): number | null {
  if (typeof window === 'undefined' || !window.performance) {
    return null;
  }

  try {
    const measure = performance.measure(name, startMark, endMark);
    return measure.duration;
  } catch {
    return null;
  }
}

/**
 * Create a performance mark
 */
export function markPerformance(name: string): void {
  if (typeof window === 'undefined' || !window.performance) {
    return;
  }

  try {
    performance.mark(name);
  } catch {
    // Ignore errors
  }
}

/**
 * Get navigation timing metrics
 */
export function getNavigationTiming(): Partial<WebVitals> | null {
  if (typeof window === 'undefined' || !window.performance) {
    return null;
  }

  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  
  if (!navigation) {
    return null;
  }

  return {
    TTFB: navigation.responseStart - navigation.requestStart,
  };
}

/**
 * Observe Largest Contentful Paint
 */
export function observeLCP(callback: (value: number) => void): (() => void) | null {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return null;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        callback(lastEntry.startTime);
      }
    });

    observer.observe({ type: 'largest-contentful-paint', buffered: true });

    return () => observer.disconnect();
  } catch {
    return null;
  }
}

/**
 * Observe Cumulative Layout Shift
 */
export function observeCLS(callback: (value: number) => void): (() => void) | null {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return null;
  }

  let clsValue = 0;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only count layout shifts without recent user input
        if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
          clsValue += (entry as PerformanceEntry & { value?: number }).value || 0;
        }
      }
      callback(clsValue);
    });

    observer.observe({ type: 'layout-shift', buffered: true });

    return () => observer.disconnect();
  } catch {
    return null;
  }
}

/**
 * Observe First Input Delay
 */
export function observeFID(callback: (value: number) => void): (() => void) | null {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return null;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const firstEntry = entries[0] as PerformanceEventTiming;
      if (firstEntry) {
        callback(firstEntry.processingStart - firstEntry.startTime);
      }
    });

    observer.observe({ type: 'first-input', buffered: true });

    return () => observer.disconnect();
  } catch {
    return null;
  }
}

/**
 * Initialize all Web Vitals observers
 */
export function initWebVitals(onMetric: (metric: WebVitals) => void): () => void {
  const metrics: WebVitals = {};
  const cleanups: ((() => void) | null)[] = [];

  cleanups.push(
    observeLCP((value) => {
      metrics.LCP = value;
      onMetric({ ...metrics });
    })
  );

  cleanups.push(
    observeCLS((value) => {
      metrics.CLS = value;
      onMetric({ ...metrics });
    })
  );

  cleanups.push(
    observeFID((value) => {
      metrics.FID = value;
      onMetric({ ...metrics });
    })
  );

  // Get TTFB from navigation timing
  const navTiming = getNavigationTiming();
  if (navTiming?.TTFB) {
    metrics.TTFB = navTiming.TTFB;
    onMetric({ ...metrics });
  }

  return () => {
    cleanups.forEach((cleanup) => cleanup?.());
  };
}
