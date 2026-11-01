/**
 * Rasterize PDF Processor
 * 
 * Converts PDF pages to images with configurable DPI and format.
 * Supports PNG, JPEG, and WebP output formats.
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
 * Output image format
 */
export type RasterizeFormat = 'png' | 'jpeg' | 'webp' | 'pdf';

/**
 * Rasterize options interface
 */
export interface RasterizePDFOptions {
    /** Output DPI (72-600, default 150) */
    dpi: number;
    /** Output image format */
    format: RasterizeFormat;
    /** Quality for JPEG/WebP (0.1-1.0, default 0.92) */
    quality: number;
    /** Page range (e.g., "1-5,8,10", empty for all) */
    pageRange?: string;
    /** Background color (default 'white') */
    backgroundColor: string;
}

/**
 * Default rasterize options
 */
const DEFAULT_RASTERIZE_OPTIONS: RasterizePDFOptions = {
    dpi: 150,
    format: 'png',
    quality: 0.92,
    pageRange: '',
    backgroundColor: 'white',
};

/**
 * DPI presets
 */
export const DPI_PRESETS = {
    screen: 72,
    low: 96,
    medium: 150,
    high: 300,
    print: 600,
};

/**
 * Parse page range string into array of page numbers
 */
function parsePageRange(rangeStr: string, totalPages: number): number[] {
    if (!rangeStr || rangeStr.trim() === '') {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = new Set<number>();
    const parts = rangeStr.split(',').map(p => p.trim());

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10));
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
                    pages.add(i);
                }
            }
        } else {
            const pageNum = parseInt(part, 10);
            if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
                pages.add(pageNum);
            }
        }
    }

    return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Get MIME type for format
 */
function getMimeType(format: RasterizeFormat): string {
    switch (format) {
        case 'png': return 'image/png';
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        default: return 'image/png';
    }
}

/**
 * Get file extension for format
 */
function getFileExtension(format: RasterizeFormat): string {
    switch (format) {
        case 'png': return '.png';
        case 'jpeg': return '.jpg';
        case 'webp': return '.webp';
        default: return '.png';
    }
}

/**
 * Rasterize PDF Processor
 * Converts PDF pages to images.
 */
export class RasterizePDFProcessor extends BasePDFProcessor {
    /**
     * Process PDF file and rasterize pages
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const rasterizeOptions: RasterizePDFOptions = {
            ...DEFAULT_RASTERIZE_OPTIONS,
            ...(options as Partial<RasterizePDFOptions>),
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
            this.updateProgress(5, 'Loading PDF library...');

            // Load PDF.js library
            const pdfjsLib = await loadPdfjs();

            this.updateProgress(10, 'Loading PDF file...');

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();

            // Load PDF with pdf.js
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdfDoc = await loadingTask.promise;

            const totalPages = pdfDoc.numPages;

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(10, 'Parsing page range...');

            // Parse page range
            const pagesToRender = parsePageRange(rasterizeOptions.pageRange || '', totalPages);

            if (pagesToRender.length === 0) {
                return this.createErrorOutput(
                    PDFErrorCode.INVALID_OPTIONS,
                    'No valid pages specified.',
                    'Please enter a valid page range.'
                );
            }

            this.updateProgress(15, 'Rendering pages...');

            // Calculate scale from DPI (PDF default is 72 DPI)
            const scale = rasterizeOptions.dpi / 72;

            // Render each page
            const baseName = file.name.replace(/\.pdf$/i, '');

            // PDF output mode: render pages to images, then assemble into a new rasterized PDF
            if (rasterizeOptions.format === 'pdf') {
                const { jsPDF } = await import('jspdf');
                let pdfOutput: InstanceType<typeof jsPDF> | null = null;

                for (let i = 0; i < pagesToRender.length; i++) {
                    if (this.checkCancelled()) {
                        return this.createErrorOutput(
                            PDFErrorCode.PROCESSING_CANCELLED,
                            'Processing was cancelled.'
                        );
                    }

                    const pageNum = pagesToRender[i];
                    const progress = 15 + ((i / pagesToRender.length) * 75);
                    this.updateProgress(progress, `Rendering page ${pageNum} of ${totalPages}...`);

                    try {
                        const page = await pdfDoc.getPage(pageNum);
                        const viewport = page.getViewport({ scale });

                        // Create canvas
                        const canvas = document.createElement('canvas');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        const ctx = canvas.getContext('2d')!;

                        // Fill background
                        ctx.fillStyle = rasterizeOptions.backgroundColor;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                        // Render page
                        await page.render({
                            canvasContext: ctx,
                            viewport,
                        }).promise;

                        // Get image data URL
                        const imgData = canvas.toDataURL('image/jpeg', rasterizeOptions.quality);

                        // Page dimensions in mm (convert from pixels at given DPI)
                        const widthMm = (viewport.width / rasterizeOptions.dpi) * 25.4;
                        const heightMm = (viewport.height / rasterizeOptions.dpi) * 25.4;
                        const orientation = widthMm > heightMm ? 'landscape' : 'portrait';

                        if (i === 0) {
                            // Create jsPDF with first page dimensions
                            pdfOutput = new jsPDF({
                                orientation,
                                unit: 'mm',
                                format: [widthMm, heightMm],
                                compress: true,
                            });
                        } else {
                            // Add new page for subsequent pages
                            pdfOutput!.addPage([widthMm, heightMm], orientation);
                        }

                        // Add the rasterized image to fill the entire page
                        pdfOutput!.addImage(imgData, 'JPEG', 0, 0, widthMm, heightMm, undefined, 'FAST');
                    } catch (pageError) {
                        console.warn(`Failed to render page ${pageNum}:`, pageError);
                    }
                }

                if (!pdfOutput) {
                    return this.createErrorOutput(
                        PDFErrorCode.PROCESSING_FAILED,
                        'Failed to render any pages.',
                        'Unknown rendering error'
                    );
                }

                this.updateProgress(92, 'Generating PDF...');

                const pdfBlob = pdfOutput.output('blob');

                this.updateProgress(100, 'Complete!');

                return this.createSuccessOutput(pdfBlob, `${baseName}_rasterized.pdf`, {
                    totalPages,
                    renderedPages: pagesToRender.length,
                    dpi: rasterizeOptions.dpi,
                    format: 'pdf',
                });
            }

            // Image output mode (PNG / JPEG / WebP)
            const images: { pageNum: number; blob: Blob; filename: string }[] = [];
            const mimeType = getMimeType(rasterizeOptions.format);
            const extension = getFileExtension(rasterizeOptions.format);

            for (let i = 0; i < pagesToRender.length; i++) {
                if (this.checkCancelled()) {
                    return this.createErrorOutput(
                        PDFErrorCode.PROCESSING_CANCELLED,
                        'Processing was cancelled.'
                    );
                }

                const pageNum = pagesToRender[i];
                const progress = 15 + ((i / pagesToRender.length) * 75);
                this.updateProgress(progress, `Rendering page ${pageNum} of ${totalPages}...`);

                try {
                    // Get page
                    const page = await pdfDoc.getPage(pageNum);
                    const viewport = page.getViewport({ scale });

                    // Create canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d')!;

                    // Fill background
                    ctx.fillStyle = rasterizeOptions.backgroundColor;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Render page
                    await page.render({
                        canvasContext: ctx,
                        viewport,
                    }).promise;

                    // Convert to blob
                    const blob = await new Promise<Blob>((resolve, reject) => {
                        canvas.toBlob(
                            (blob) => {
                                if (blob) resolve(blob);
                                else reject(new Error('Failed to create image blob'));
                            },
                            mimeType,
                            rasterizeOptions.quality
                        );
                    });

                    images.push({
                        pageNum,
                        blob,
                        filename: `${baseName}_page_${pageNum}${extension}`,
                    });
                } catch (pageError) {
                    console.warn(`Failed to render page ${pageNum}:`, pageError);
                }
            }

            if (images.length === 0) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_FAILED,
                    'Failed to render any pages.',
                    'Unknown rendering error'
                );
            }

            this.updateProgress(92, 'Packaging output...');

            // If single page, return image directly
            if (images.length === 1) {
                this.updateProgress(100, 'Complete!');
                return this.createSuccessOutput(images[0].blob, images[0].filename, {
                    totalPages,
                    renderedPages: 1,
                    dpi: rasterizeOptions.dpi,
                    format: rasterizeOptions.format,
                });
            }

            // Multiple pages - create ZIP
            const { default: JSZip } = await import('jszip');
            const zip = new JSZip();

            for (const img of images) {
                zip.file(img.filename, img.blob);
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });

            this.updateProgress(100, 'Complete!');

            return this.createSuccessOutput(zipBlob, `${baseName}_images.zip`, {
                totalPages,
                renderedPages: images.length,
                dpi: rasterizeOptions.dpi,
                format: rasterizeOptions.format,
            });

        } catch (error) {
            if (error instanceof Error && error.message.includes('encrypt')) {
                return this.createErrorOutput(
                    PDFErrorCode.PDF_ENCRYPTED,
                    'The PDF file is encrypted.',
                    'Please decrypt the file first.'
                );
            }

            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                'Failed to rasterize PDF.',
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
 * Create a new instance of the rasterize processor
 */
export function createRasterizeProcessor(): RasterizePDFProcessor {
    return new RasterizePDFProcessor();
}

/**
 * Rasterize a PDF file (convenience function)
 */
export async function rasterizePDF(
    file: File,
    options?: Partial<RasterizePDFOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createRasterizeProcessor();
    return processor.process(
        {
            files: [file],
            options: options || {},
        },
        onProgress
    );
}
