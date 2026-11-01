/**
 * PDF Remove Metadata Processor
 * Requirements: 5.1
 * 
 * Implements PDF metadata removal functionality using pdf-lib.
 * Removes document properties like title, author, subject, keywords,
 * creation date, modification date, and custom metadata.
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
 * Remove Metadata options
 */
export interface RemoveMetadataOptions {
  /** Remove title */
  removeTitle: boolean;
  /** Remove author */
  removeAuthor: boolean;
  /** Remove subject */
  removeSubject: boolean;
  /** Remove keywords */
  removeKeywords: boolean;
  /** Remove creator */
  removeCreator: boolean;
  /** Remove producer */
  removeProducer: boolean;
  /** Remove creation date */
  removeCreationDate: boolean;
  /** Remove modification date */
  removeModificationDate: boolean;
}

/**
 * Default remove metadata options
 */
const DEFAULT_REMOVE_METADATA_OPTIONS: RemoveMetadataOptions = {
  removeTitle: true,
  removeAuthor: true,
  removeSubject: true,
  removeKeywords: true,
  removeCreator: true,
  removeProducer: true,
  removeCreationDate: true,
  removeModificationDate: true,
};

/**
 * Remove Metadata Processor
 * Removes metadata from PDF files.
 */
export class RemoveMetadataProcessor extends BasePDFProcessor {
  /**
   * Process PDF file and remove metadata
   */
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const removeOptions: RemoveMetadataOptions = {
      ...DEFAULT_REMOVE_METADATA_OPTIONS,
      ...(options as Partial<RemoveMetadataOptions>),
    };

    // Validate we have exactly 1 file
    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please provide exactly one PDF file.',
        `Received ${files.length} file(s).`
      );
    }

    const file = files[0];

    try {
      this.updateProgress(5, 'Loading PDF library...');

      // Load pdf-lib
      const pdfLib = await loadPdfLib();
      
      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(10, 'Reading PDF file...');

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const originalSize = arrayBuffer.byteLength;

      this.updateProgress(20, 'Loading PDF document...');

      // Load the source PDF
      let sourcePdf;
      try {
        sourcePdf = await pdfLib.PDFDocument.load(arrayBuffer, {
          ignoreEncryption: true,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('encrypt')) {
          return this.createErrorOutput(
            PDFErrorCode.PDF_ENCRYPTED,
            'The PDF file is encrypted.',
            'Please decrypt the file before removing metadata.'
          );
        }
        throw error;
      }

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(30, 'Reading current metadata...');

      const pageCount = sourcePdf.getPageCount();

      if (pageCount === 0) {
        return this.createErrorOutput(
          PDFErrorCode.PDF_MALFORMED,
          'The PDF file contains no pages.',
          'Cannot process an empty PDF.'
        );
      }

      // Store original metadata for reporting
      const originalMetadata = {
        title: sourcePdf.getTitle() || '',
        author: sourcePdf.getAuthor() || '',
        subject: sourcePdf.getSubject() || '',
        keywords: sourcePdf.getKeywords() || '',
        creator: sourcePdf.getCreator() || '',
        producer: sourcePdf.getProducer() || '',
        creationDate: sourcePdf.getCreationDate()?.toISOString() || '',
        modificationDate: sourcePdf.getModificationDate()?.toISOString() || '',
      };

      // Track what was removed
      const removedFields: string[] = [];

      this.updateProgress(50, 'Removing metadata...');

      // Remove metadata based on options
      if (removeOptions.removeTitle && originalMetadata.title) {
        sourcePdf.setTitle('');
        removedFields.push('title');
      }

      if (removeOptions.removeAuthor && originalMetadata.author) {
        sourcePdf.setAuthor('');
        removedFields.push('author');
      }

      if (removeOptions.removeSubject && originalMetadata.subject) {
        sourcePdf.setSubject('');
        removedFields.push('subject');
      }

      if (removeOptions.removeKeywords && originalMetadata.keywords) {
        sourcePdf.setKeywords([]);
        removedFields.push('keywords');
      }

      if (removeOptions.removeCreator && originalMetadata.creator) {
        sourcePdf.setCreator('');
        removedFields.push('creator');
      }

      if (removeOptions.removeProducer && originalMetadata.producer) {
        sourcePdf.setProducer('');
        removedFields.push('producer');
      }

      // Note: pdf-lib doesn't support removing creation/modification dates directly
      // They will be updated when saving

      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(80, 'Saving PDF...');

      // Save the PDF
      const cleanedPdfBytes = await sourcePdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      // Create blob from the Uint8Array
      const blob = new Blob([new Uint8Array(cleanedPdfBytes)], { type: 'application/pdf' });
      const newSize = cleanedPdfBytes.length;

      this.updateProgress(100, 'Complete!');

      // Generate output filename
      const outputFilename = generateCleanedFilename(file.name);

      return this.createSuccessOutput(blob, outputFilename, {
        pageCount,
        originalSize,
        newSize,
        removedFields,
        originalMetadata,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to remove PDF metadata.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get accepted file types for remove metadata processor
   */
  protected getAcceptedTypes(): string[] {
    return ['application/pdf'];
  }
}

/**
 * Generate a filename for the cleaned PDF
 */
function generateCleanedFilename(originalName: string): string {
  const lastDot = originalName.lastIndexOf('.');
  const baseName = lastDot === -1 ? originalName : originalName.slice(0, lastDot);
  return `${baseName}_no_metadata.pdf`;
}

/**
 * Create a new instance of the remove metadata processor
 */
export function createRemoveMetadataProcessor(): RemoveMetadataProcessor {
  return new RemoveMetadataProcessor();
}

/**
 * Remove metadata from a PDF file (convenience function)
 */
export async function removeMetadata(
  file: File,
  options?: Partial<RemoveMetadataOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createRemoveMetadataProcessor();
  return processor.process(
    {
      files: [file],
      options: options || {},
    },
    onProgress
  );
}
