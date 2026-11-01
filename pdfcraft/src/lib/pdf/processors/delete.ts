/**
 * PDF Delete Pages Processor
 * Requirements: 5.1
 * 
 * Implements PDF page deletion functionality using pdf-lib.
 * Supports deleting specific pages from a PDF.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfLib } from '../loader';

/**
 * Delete options for page deletion
 */
export interface DeleteOptions {
  /** Pages to delete (1-based page numbers) */
  pages: number[];
}

/**
 * Default delete options
 */
const DEFAULT_DELETE_OPTIONS: DeleteOptions = {
  pages: [],
};

/**
 * Delete Pages PDF Processor
 * Deletes specific pages from a PDF document.
 */
export class DeletePagesPDFProcessor extends BasePDFProcessor {
  /**
   * Process a PDF file and delete specified pages
   */
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const deleteOptions: DeleteOptions = {
      ...DEFAULT_DELETE_OPTIONS,
      ...(options as Partial<DeleteOptions>),
    };

    // Validate we have exactly 1 file
    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Exactly 1 PDF file is required for deletion.',
        `Received ${files.length} file(s).`
      );
    }

    // Validate pages are provided
    if (!deleteOptions.pages || deleteOptions.pages.length === 0) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'At least one page is required for deletion.',
        'Please specify pages to delete.'
      );
    }

    try {
      this.updateProgress(5, 'Loading PDF library...');

      const pdfLib = await loadPdfLib();

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(10, 'Loading source PDF...');

      const file = files[0];
      const arrayBuffer = await file.arrayBuffer();

      // Load the source PDF
      let sourcePdf;
      try {
        sourcePdf = await pdfLib.PDFDocument.load(arrayBuffer, {
          ignoreEncryption: false,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('encrypt')) {
          return this.createErrorOutput(
            PDFErrorCode.PDF_ENCRYPTED,
            'The PDF file is encrypted.',
            'Please decrypt the file before deleting pages.'
          );
        }
        throw error;
      }

      const totalPages = sourcePdf.getPageCount();
      this.updateProgress(20, `Source PDF has ${totalPages} pages.`);

      // Validate pages
      const validationError = validatePages(deleteOptions.pages, totalPages);
      if (validationError) {
        return this.createErrorOutput(
          PDFErrorCode.INVALID_PAGE_RANGE,
          validationError,
          `The PDF has ${totalPages} pages.`
        );
      }

      // Remove duplicates and sort in descending order (to delete from end first)
      const uniquePages = [...new Set(deleteOptions.pages)].sort((a, b) => b - a);

      // Check if trying to delete all pages
      if (uniquePages.length >= totalPages) {
        return this.createErrorOutput(
          PDFErrorCode.INVALID_OPTIONS,
          'Cannot delete all pages from the PDF.',
          'At least one page must remain in the document.'
        );
      }

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(30, 'Deleting pages...');

      // Delete pages (from end to start to maintain correct indices)
      const progressPerPage = 60 / uniquePages.length;

      for (let i = 0; i < uniquePages.length; i++) {
        if (this.checkCancelled()) {
          return this.createErrorOutput(
            PDFErrorCode.PROCESSING_CANCELLED,
            'Processing was cancelled.'
          );
        }

        const pageNum = uniquePages[i];
        const pageIndex = pageNum - 1; // Convert to 0-based index

        this.updateProgress(
          30 + (i * progressPerPage),
          `Deleting page ${pageNum}...`
        );

        sourcePdf.removePage(pageIndex);
      }

      this.updateProgress(90, 'Saving modified PDF...');

      // Save the modified PDF
      const pdfBytes = await sourcePdf.save({ useObjectStreams: true });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

      this.updateProgress(100, 'Complete!');

      // Generate output filename
      const outputFilename = generateDeletedFilename(file.name, uniquePages.length);

      return this.createSuccessOutput(blob, outputFilename, {
        deletedPageCount: uniquePages.length,
        originalPageCount: totalPages,
        remainingPageCount: totalPages - uniquePages.length,
        deletedPages: uniquePages.sort((a, b) => a - b),
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to delete pages from PDF file.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get accepted file types for delete processor
   */
  protected getAcceptedTypes(): string[] {
    return ['application/pdf'];
  }
}

/**
 * Validate pages array
 */
function validatePages(pages: number[], totalPages: number): string | null {
  if (pages.length === 0) {
    return 'No pages specified for deletion.';
  }

  for (let i = 0; i < pages.length; i++) {
    const pageNum = pages[i];

    if (!Number.isInteger(pageNum)) {
      return `Invalid page number: ${pageNum}`;
    }

    if (pageNum < 1) {
      return `Page number must be at least 1. Found ${pageNum}.`;
    }

    if (pageNum > totalPages) {
      return `Page ${pageNum} exceeds total pages (${totalPages}).`;
    }
  }

  return null;
}

/**
 * Get filename without extension
 */
function getFileNameWithoutExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return filename;
  return filename.slice(0, lastDot);
}

/**
 * Generate a filename for the modified PDF
 */
function generateDeletedFilename(originalName: string, deletedCount: number): string {
  const baseName = getFileNameWithoutExtension(originalName);
  return `${baseName}_${deletedCount}_pages_deleted.pdf`;
}

/**
 * Parse page selection string into array of page numbers
 * Supports formats like: "1,3,5", "1-5", "1-3,5,7-10"
 */
export function parsePageSelection(selectionString: string, totalPages: number): number[] {
  const pages: number[] = [];
  const parts = selectionString.split(',').map(s => s.trim()).filter(s => s.length > 0);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= Math.min(end, totalPages); i++) {
          if (i >= 1) pages.push(i);
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        pages.push(pageNum);
      }
    }
  }

  // Remove duplicates and sort
  return [...new Set(pages)].sort((a, b) => a - b);
}

/**
 * Create a new instance of the delete processor
 */
export function createDeleteProcessor(): DeletePagesPDFProcessor {
  return new DeletePagesPDFProcessor();
}

/**
 * Delete pages from a PDF file (convenience function)
 */
export async function deletePages(
  file: File,
  pages: number[],
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createDeleteProcessor();
  return processor.process(
    {
      files: [file],
      options: { pages },
    },
    onProgress
  );
}
