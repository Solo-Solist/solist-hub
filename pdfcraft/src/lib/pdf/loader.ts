/**
 * PDF Library Loader
 * Requirements: 1.4, 5.6, 8.2
 * 
 * Handles lazy loading of PDF processing libraries.
 * Libraries are loaded only when needed to optimize initial page load.
 */

import type { PDFDocument } from 'pdf-lib';

// Type definitions for lazy-loaded libraries
type PDFLibModule = typeof import('pdf-lib');
type PDFJSModule = typeof import('pdfjs-dist');

// Cached library instances
let pdfLibInstance: PDFLibModule | null = null;
let pdfjsInstance: PDFJSModule | null = null;

// Loading promises to prevent duplicate loads
let pdfLibLoadingPromise: Promise<PDFLibModule> | null = null;
let pdfjsLoadingPromise: Promise<PDFJSModule> | null = null;

import { withBasePath } from '../utils/path';

// Worker configuration flag
let workerConfigured = false;

/**
 * Configure PDF.js worker source
 * Uses the worker bundled locally for offline support
 */
export function configurePdfjsWorker(pdfjsLib: PDFJSModule): void {
  if (workerConfigured) return;

  if (typeof window !== 'undefined') {
    // Use the local worker file for offline support
    // The worker file is located in public/workers/pdf.worker.min.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = withBasePath('/workers/pdf.worker.min.js');
    workerConfigured = true;
  }
}

/**
 * Load pdf-lib library
 * Used for PDF creation and modification
 */
export async function loadPdfLib(): Promise<PDFLibModule> {
  if (pdfLibInstance) {
    return pdfLibInstance;
  }

  if (pdfLibLoadingPromise) {
    return pdfLibLoadingPromise;
  }

  pdfLibLoadingPromise = import('pdf-lib').then((module) => {
    pdfLibInstance = module;
    pdfLibLoadingPromise = null;
    return module;
  });

  return pdfLibLoadingPromise;
}

/**
 * Load pdfjs-dist library
 * Used for PDF rendering and text extraction
 */
export async function loadPdfjs(): Promise<PDFJSModule> {
  if (pdfjsInstance) {
    return pdfjsInstance;
  }

  if (pdfjsLoadingPromise) {
    return pdfjsLoadingPromise;
  }

  pdfjsLoadingPromise = import('pdfjs-dist').then((module) => {
    // Configure worker using centralized function
    configurePdfjsWorker(module);
    pdfjsInstance = module;
    pdfjsLoadingPromise = null;
    return module;
  });

  return pdfjsLoadingPromise;
}

/**
 * Load a PDF document using pdf-lib
 */
export async function loadPdfDocument(data: ArrayBuffer | Uint8Array): Promise<PDFDocument> {
  const pdfLib = await loadPdfLib();
  return pdfLib.PDFDocument.load(data, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
}

/**
 * Create a new PDF document using pdf-lib
 */
export async function createPdfDocument(): Promise<PDFDocument> {
  const pdfLib = await loadPdfLib();
  return pdfLib.PDFDocument.create();
}

/**
 * Check if libraries are loaded
 */
export function isLibraryLoaded(library: 'pdf-lib' | 'pdfjs'): boolean {
  switch (library) {
    case 'pdf-lib':
      return pdfLibInstance !== null;
    case 'pdfjs':
      return pdfjsInstance !== null;
    default:
      return false;
  }
}

/**
 * Preload all PDF libraries
 * Call this to warm up the libraries before user interaction
 */
export async function preloadLibraries(): Promise<void> {
  await Promise.all([
    loadPdfLib(),
    loadPdfjs(),
  ]);
}

/**
 * Get library loading status
 */
export function getLibraryStatus(): {
  pdfLib: 'loaded' | 'loading' | 'not-loaded';
  pdfjs: 'loaded' | 'loading' | 'not-loaded';
} {
  return {
    pdfLib: pdfLibInstance ? 'loaded' : pdfLibLoadingPromise ? 'loading' : 'not-loaded',
    pdfjs: pdfjsInstance ? 'loaded' : pdfjsLoadingPromise ? 'loading' : 'not-loaded',
  };
}
