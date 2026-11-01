/**
 * PDF to PDF/A Processor
 * 
 * Converts PDF files to PDF/A format for long-term archival.
 * Supports PDF/A-1b, PDF/A-2b, and PDF/A-3b standards.
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPyMuPDF } from '../pymupdf-loader';

/**
 * PDF/A conformance levels
 */
export type PdfALevel = '1b' | '2b' | '3b';

/**
 * PDF to PDF/A options
 */
export interface PdfToPdfAOptions {
    /** PDF/A conformance level (2b is recommended) */
    level: PdfALevel;
    /** ICC color profile to embed (default: sRGB) */
    colorProfile?: 'srgb' | 'cmyk';
    /** Whether to embed all fonts */
    embedFonts: boolean;
    /** Whether to flatten transparency */
    flattenTransparency: boolean;
}

/**
 * Default PDF/A options
 */
const DEFAULT_PDFA_OPTIONS: PdfToPdfAOptions = {
    level: '2b',
    colorProfile: 'srgb',
    embedFonts: true,
    flattenTransparency: true,
};

/**
 * PDF/A level descriptions
 */
export const PDFA_LEVEL_INFO: Record<PdfALevel, { name: string; description: string }> = {
    '1b': {
        name: 'PDF/A-1b',
        description: 'Basic conformance. Oldest standard with widest compatibility.',
    },
    '2b': {
        name: 'PDF/A-2b (Recommended)',
        description: 'Recommended. Supports JPEG2000, transparency, and layers.',
    },
    '3b': {
        name: 'PDF/A-3b',
        description: 'Allows embedding arbitrary files (e.g., XML, CSV).',
    },
};

/**
 * PDF to PDF/A Processor
 */
export class PdfToPdfAProcessor extends BasePDFProcessor {
    /**
     * Process PDF file and convert to PDF/A
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const pdfaOptions: PdfToPdfAOptions = {
            ...DEFAULT_PDFA_OPTIONS,
            ...(options as Partial<PdfToPdfAOptions>),
        };

        // Validate single file
        if (files.length !== 1) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Please provide exactly one PDF file.',
                `Received ${files.length} file(s).`
            );
        }

        const file = files[0];

        try {
            this.updateProgress(5, 'Loading PyMuPDF library...');

            // Load PyMuPDF
            const pymupdf = await loadPyMuPDF();

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(20, 'Analyzing PDF structure...');

            // Convert to PDF/A using PyMuPDF
            const result = await pymupdf.pdfToPdfa(file, {
                level: pdfaOptions.level,
                embedFonts: pdfaOptions.embedFonts,
                flattenTransparency: pdfaOptions.flattenTransparency,
            });

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(90, 'Finalizing PDF/A document...');

            // Get result blob
            const blob = result.pdf || result;

            this.updateProgress(100, 'Complete!');

            // Generate output filename
            const outputFilename = generatePdfAFilename(file.name, pdfaOptions.level);

            return this.createSuccessOutput(blob, outputFilename, {
                conformanceLevel: `PDF/A-${pdfaOptions.level}`,
                embedFonts: pdfaOptions.embedFonts,
                flattenTransparency: pdfaOptions.flattenTransparency,
            });

        } catch (error) {
            if (error instanceof Error && error.message.includes('encrypt')) {
                return this.createErrorOutput(
                    PDFErrorCode.PDF_ENCRYPTED,
                    'The PDF file is encrypted.',
                    'Please decrypt the file before converting to PDF/A.'
                );
            }

            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                'Failed to convert to PDF/A.',
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }

    /**
     * Get accepted file types
     */
    protected getAcceptedTypes(): string[] {
        return ['application/pdf'];
    }
}

/**
 * Generate PDF/A filename
 */
function generatePdfAFilename(originalName: string, level: PdfALevel): string {
    const lastDot = originalName.lastIndexOf('.');
    const baseName = lastDot === -1 ? originalName : originalName.slice(0, lastDot);
    return `${baseName}_pdfa-${level}.pdf`;
}

/**
 * Create a new instance of the PDF/A processor
 */
export function createPdfToPdfAProcessor(): PdfToPdfAProcessor {
    return new PdfToPdfAProcessor();
}

/**
 * Convert PDF to PDF/A (convenience function)
 */
export async function pdfToPdfA(
    file: File,
    options?: Partial<PdfToPdfAOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createPdfToPdfAProcessor();
    return processor.process(
        {
            files: [file],
            options: options || {},
        },
        onProgress
    );
}
