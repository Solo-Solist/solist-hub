/**
 * PDF to JSON Processor
 * Requirements: 5.1
 * 
 * Extracts PDF content and metadata to JSON format.
 * Includes text content, metadata, and page information.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfjs } from '../loader';

/**
 * PDF to JSON options
 */
export interface PDFToJSONOptions {
  /** Include text content from pages */
  includeText: boolean;
  /** Include metadata */
  includeMetadata: boolean;
  /** Include page dimensions */
  includePageInfo: boolean;
  /** Include outline/bookmarks */
  includeOutline: boolean;
  /** Specific pages to extract (empty = all pages) */
  pages: number[];
  /** Pretty print JSON output */
  prettyPrint: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: PDFToJSONOptions = {
  includeText: true,
  includeMetadata: true,
  includePageInfo: true,
  includeOutline: true,
  pages: [], // All pages
  prettyPrint: true,
};

/**
 * JSON output structure
 */
export interface PDFJSONOutput {
  filename: string;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
  };
  info: {
    pageCount: number;
    isEncrypted: boolean;
    pdfVersion?: string;
  };
  outline?: OutlineItem[];
  pages: PageContent[];
}

export interface OutlineItem {
  title: string;
  dest?: string;
  items?: OutlineItem[];
}

export interface PageContent {
  pageNumber: number;
  width?: number;
  height?: number;
  rotation?: number;
  text?: string;
}


/**
 * PDF to JSON Processor
 * Extracts PDF content and metadata to JSON format.
 */
export class PDFToJSONProcessor extends BasePDFProcessor {
  /**
   * Process PDF and extract to JSON
   */
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const jsonOptions: PDFToJSONOptions = {
      ...DEFAULT_OPTIONS,
      ...(options as Partial<PDFToJSONOptions>),
    };

    // Validate we have exactly 1 PDF file
    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please provide exactly one PDF file.',
        `Received ${files.length} file(s).`
      );
    }

    const file = files[0];

    // Validate file type
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return this.createErrorOutput(
        PDFErrorCode.FILE_TYPE_INVALID,
        'Invalid file type. Please upload a PDF file.',
        `Received: ${file.type || 'unknown'}`
      );
    }

    try {
      this.updateProgress(5, 'Loading PDF library...');

      const pdfjs = await loadPdfjs();
      
      if (this.checkCancelled()) {
        return this.createErrorOutput(
          PDFErrorCode.PROCESSING_CANCELLED,
          'Processing was cancelled.'
        );
      }

      this.updateProgress(10, 'Loading PDF document...');

      // Load the PDF document
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      // Initialize output structure
      const output: PDFJSONOutput = {
        filename: file.name,
        info: {
          pageCount: totalPages,
          isEncrypted: false,
        },
        pages: [],
      };

      // Extract metadata
      if (jsonOptions.includeMetadata) {
        this.updateProgress(15, 'Extracting metadata...');
        try {
          const metadata = await pdf.getMetadata();
          if (metadata.info) {
            const info = metadata.info as Record<string, unknown>;
            output.metadata = {
              title: info.Title as string | undefined,
              author: info.Author as string | undefined,
              subject: info.Subject as string | undefined,
              keywords: info.Keywords as string | undefined,
              creator: info.Creator as string | undefined,
              producer: info.Producer as string | undefined,
              creationDate: info.CreationDate ? String(info.CreationDate) : undefined,
              modificationDate: info.ModDate ? String(info.ModDate) : undefined,
            };
            // Extract PDF version if available
            if (info.PDFFormatVersion) {
              output.info.pdfVersion = String(info.PDFFormatVersion);
            }
          }
        } catch {
          // Metadata extraction failed, continue without it
        }
      }

      // Extract outline/bookmarks
      if (jsonOptions.includeOutline) {
        this.updateProgress(20, 'Extracting outline...');
        try {
          const outline = await pdf.getOutline();
          if (outline) {
            output.outline = this.processOutline(outline);
          }
        } catch {
          // Outline extraction failed, continue without it
        }
      }

      // Determine which pages to extract
      const pagesToExtract = jsonOptions.pages.length > 0
        ? jsonOptions.pages.filter(p => p >= 1 && p <= totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

      this.updateProgress(25, `Extracting ${pagesToExtract.length} page(s)...`);

      const progressPerPage = 70 / pagesToExtract.length;

      for (let i = 0; i < pagesToExtract.length; i++) {
        if (this.checkCancelled()) {
          return this.createErrorOutput(
            PDFErrorCode.PROCESSING_CANCELLED,
            'Processing was cancelled.'
          );
        }

        const pageNum = pagesToExtract[i];
        const pageProgress = 25 + (i * progressPerPage);
        
        this.updateProgress(
          pageProgress,
          `Extracting page ${pageNum} of ${totalPages}...`
        );

        try {
          const pageContent = await this.extractPageContent(
            pdf,
            pageNum,
            jsonOptions
          );
          output.pages.push(pageContent);
        } catch (error) {
          // Add page with error info
          output.pages.push({
            pageNumber: pageNum,
            text: `[Error extracting page: ${error instanceof Error ? error.message : 'Unknown error'}]`,
          });
        }
      }

      this.updateProgress(95, 'Generating JSON...');

      // Generate JSON string
      const jsonString = jsonOptions.prettyPrint
        ? JSON.stringify(output, null, 2)
        : JSON.stringify(output);

      // Create blob
      const blob = new Blob([jsonString], { type: 'application/json' });

      this.updateProgress(100, 'Complete!');

      // Generate output filename
      const baseName = file.name.replace(/\.pdf$/i, '');
      const outputFilename = `${baseName}.json`;

      return this.createSuccessOutput(blob, outputFilename, {
        pageCount: output.pages.length,
        hasMetadata: !!output.metadata,
        hasOutline: !!output.outline,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to convert PDF to JSON.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Extract content from a single page
   */
  private async extractPageContent(
    pdf: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>,
    pageNum: number,
    options: PDFToJSONOptions
  ): Promise<PageContent> {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    const content: PageContent = {
      pageNumber: pageNum,
    };

    // Include page dimensions
    if (options.includePageInfo) {
      content.width = viewport.width;
      content.height = viewport.height;
      content.rotation = viewport.rotation;
    }

    // Extract text content
    if (options.includeText) {
      const textContent = await page.getTextContent();
      const textItems = textContent.items
        .filter((item): item is typeof item & { str: string } => 'str' in item)
        .map(item => item.str);
      content.text = textItems.join(' ').replace(/\s+/g, ' ').trim();
    }

    return content;
  }

  /**
   * Process outline/bookmarks recursively
   */
  private processOutline(outline: unknown[]): OutlineItem[] {
    return outline.map((item: unknown) => {
      const outlineItem = item as { title?: string; dest?: string; items?: unknown[] };
      const result: OutlineItem = {
        title: outlineItem.title || '',
      };
      if (outlineItem.dest) {
        result.dest = String(outlineItem.dest);
      }
      if (outlineItem.items && outlineItem.items.length > 0) {
        result.items = this.processOutline(outlineItem.items);
      }
      return result;
    });
  }
}

/**
 * Create a new instance of the PDF to JSON processor
 */
export function createPDFToJSONProcessor(): PDFToJSONProcessor {
  return new PDFToJSONProcessor();
}

/**
 * Convert PDF to JSON (convenience function)
 */
export async function pdfToJSON(
  file: File,
  options?: Partial<PDFToJSONOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createPDFToJSONProcessor();
  return processor.process(
    {
      files: [file],
      options: options || {},
    },
    onProgress
  );
}
