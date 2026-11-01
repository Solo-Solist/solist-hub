/**
 * PDF Background Color Processor
 * Requirements: 5.1
 */

import type { ProcessInput, ProcessOutput, ProgressCallback } from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfLib } from '../loader';

export interface BackgroundColorOptions {
  color: { r: number; g: number; b: number };
  pages?: number[] | 'all';
  opacity?: number;
}

export class BackgroundColorProcessor extends BasePDFProcessor {
  async process(input: ProcessInput, onProgress?: ProgressCallback): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const inputOptions = options as Partial<BackgroundColorOptions>;
    const bgOptions: BackgroundColorOptions = {
      color: inputOptions.color ?? { r: 1, g: 1, b: 0.9 }, // Light yellow default
      pages: inputOptions.pages ?? 'all',
      opacity: inputOptions.opacity ?? 1,
    };

    if (files.length !== 1) {
      return this.createErrorOutput(PDFErrorCode.INVALID_OPTIONS, 'Exactly 1 PDF file is required.');
    }

    try {
      this.updateProgress(10, 'Loading PDF library...');
      const pdfLib = await loadPdfLib();

      this.updateProgress(20, 'Loading PDF...');
      const file = files[0];
      const arrayBuffer = await file.arrayBuffer();
      const sourcePdf = await pdfLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      const totalPages = sourcePdf.getPageCount();
      const pagesToProcess = bgOptions.pages === 'all'
        ? Array.from({ length: totalPages }, (_, i) => i)
        : (bgOptions.pages as number[]).map(p => p - 1);

      // Create new PDF with background
      const newPdf = await pdfLib.PDFDocument.create();

      this.updateProgress(30, 'Embedding pages...');

      // Pre-embed all pages at once to avoid duplicate font embedding
      // This is crucial for CJK PDFs where fonts can be very large
      const sourcePages = sourcePdf.getPages();
      const embeddedPages = await newPdf.embedPages(sourcePages);

      this.updateProgress(40, 'Adding background color...');

      for (let i = 0; i < totalPages; i++) {
        if (this.checkCancelled()) {
          return this.createErrorOutput(PDFErrorCode.PROCESSING_CANCELLED, 'Processing was cancelled.');
        }

        const sourcePage = sourcePages[i];
        const { width, height } = sourcePage.getSize();

        // Create new page with same dimensions
        const newPage = newPdf.addPage([width, height]);

        // Add background if this page should be processed
        if (pagesToProcess.includes(i)) {
          newPage.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: pdfLib.rgb(bgOptions.color.r, bgOptions.color.g, bgOptions.color.b),
            opacity: bgOptions.opacity,
          });
        }

        // Use pre-embedded page
        const embeddedPage = embeddedPages[i];
        newPage.drawPage(embeddedPage, { x: 0, y: 0, width, height });

        this.updateProgress(40 + (50 * (i + 1) / totalPages), `Processing page ${i + 1}...`);
      }

      this.updateProgress(95, 'Saving PDF...');
      const pdfBytes = await newPdf.save({
        useObjectStreams: true,
      });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

      this.updateProgress(100, 'Complete!');
      return this.createSuccessOutput(blob, file.name.replace('.pdf', '_background.pdf'), { pageCount: totalPages });

    } catch (error) {
      return this.createErrorOutput(PDFErrorCode.PROCESSING_FAILED, 'Failed to add background color.', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  protected getAcceptedTypes(): string[] {
    return ['application/pdf'];
  }
}

export function createBackgroundColorProcessor(): BackgroundColorProcessor {
  return new BackgroundColorProcessor();
}

export async function addBackgroundColor(file: File, options: BackgroundColorOptions, onProgress?: ProgressCallback): Promise<ProcessOutput> {
  const processor = createBackgroundColorProcessor();
  return processor.process({ files: [file], options: options as unknown as Record<string, unknown> }, onProgress);
}
