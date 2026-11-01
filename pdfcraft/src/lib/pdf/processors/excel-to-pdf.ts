/**
 * Excel to PDF Processor
 * 
 * Converts Excel spreadsheets to PDF using LibreOffice WASM.
 * Uses the shared LibreOfficeConverter singleton (same approach as BentoPDF).
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';

/** Maximum file size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
/** Conversion timeout: 5 minutes */
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000;

import {
    getSharedLibreOfficeConverter,
    isLibreOfficeFailed,
    isLibreOfficeReady,
} from '@/lib/libreoffice/shared-converter';
import { isCrossOriginIsolated } from '@/lib/utils/cross-origin-isolated';
import {
    convertExcelToPdfPyodide,
    isExcelPyodideReady,
} from './excel-to-pdf-pyodide';

export interface ExcelToPDFOptions {
    /** Reserved for future options */
}

export class ExcelToPDFProcessor extends BasePDFProcessor {
    private conversionProgressTimer: ReturnType<typeof setInterval> | null = null;

    private startConversionProgress(): void {
        this.stopConversionProgress();
        // LibreOffice convert() does not expose granular runtime progress.
        // Keep UI responsive by advancing a bounded pseudo-progress while waiting.
        this.conversionProgressTimer = setInterval(() => {
            if (this.progress >= 98) return;
            this.updateProgress(this.progress + 1, 'Converting Excel to PDF...');
        }, 800);
    }

    private stopConversionProgress(): void {
        if (this.conversionProgressTimer) {
            clearInterval(this.conversionProgressTimer);
            this.conversionProgressTimer = null;
        }
    }

    protected reset(): void {
        this.stopConversionProgress();
        super.reset();
    }

    private async convertWithLibreOffice(file: File): Promise<Blob> {
        const converter = await getSharedLibreOfficeConverter((percent, message) => {
            this.updateProgress(Math.min(percent * 0.8, 80), message);
        });

        if (this.checkCancelled()) {
            throw new Error('Processing was cancelled.');
        }

        this.updateProgress(85, 'Converting Excel to PDF...');
        this.startConversionProgress();

        try {
            return await Promise.race([
                converter.convertToPdf(file),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(
                        `Conversion timed out after ${CONVERT_TIMEOUT_MS / 60000} minutes. The file may be too complex.`
                    )), CONVERT_TIMEOUT_MS)
                ),
            ]);
        } finally {
            this.stopConversionProgress();
        }
    }

    private async convertWithPyodideFallback(file: File): Promise<Blob> {
        this.updateProgress(20, 'Converting Excel to PDF...');

        return await convertExcelToPdfPyodide(file, (message) => {
            const mappedMessage =
                message === 'Converting...' || message === 'Analyzing...'
                    ? 'Converting Excel to PDF...'
                    : message;
            this.updateProgress(Math.min(this.progress + 15, 92), mappedMessage);
        });
    }

    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files } = input;

        if (files.length !== 1) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Please provide exactly one Excel spreadsheet.',
                `Received ${files.length} file(s).`
            );
        }

        const file = files[0];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const validExts = ['xlsx', 'xls', 'ods', 'csv'];

        if (!validExts.includes(ext)) {
            return this.createErrorOutput(
                PDFErrorCode.FILE_TYPE_INVALID,
                'Invalid file type. Please upload .xlsx, .xls, .ods, or .csv.',
                `Received: ${file.type || file.name}`
            );
        }

        // File size guard
        if (file.size > MAX_FILE_SIZE) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum supported size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
                `File size: ${file.size} bytes, limit: ${MAX_FILE_SIZE} bytes`
            );
        }

        const canPyodideFallback = ext === 'xlsx' || ext === 'csv';
        const isolated = isCrossOriginIsolated();
        const isPyodideReady = isExcelPyodideReady();
        const loReady = isLibreOfficeReady();
        const loFailed = isLibreOfficeFailed();

        if (!isolated && !canPyodideFallback) {
            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                `.${ext} files require LibreOffice, which needs Cross-Origin Isolation on your server.`,
                'Your host must send Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp on all HTML responses. Alternatively, convert the file to .xlsx or .csv first.'
            );
        }

        // Determine best engine to use without redundant reload:
        // If file is .xlsx/.csv:
        // - If Pyodide is already preloaded and ready, use it immediately
        // - If LibreOffice failed or host is not isolated, use Pyodide
        // - If LibreOffice is already ready, use it
        // - Otherwise default to Pyodide for instant, reliable Excel processing
        let preferPyodide = false;
        if (canPyodideFallback) {
            if (isPyodideReady || loFailed || !isolated) {
                preferPyodide = true;
            } else if (loReady) {
                preferPyodide = false;
            } else {
                preferPyodide = true;
            }
        }

        try {
            let pdfBlob: Blob;
            let engine: 'libreoffice' | 'pyodide' = preferPyodide ? 'pyodide' : 'libreoffice';

            if (preferPyodide) {
                pdfBlob = await this.convertWithPyodideFallback(file);
            } else {
                try {
                    pdfBlob = await this.convertWithLibreOffice(file);
                } catch (loErr) {
                    if (canPyodideFallback && !this.checkCancelled()) {
                        console.warn('[ExcelToPDF] LibreOffice failed or timed out, falling back to Pyodide:', loErr);
                        this.updateProgress(25, 'Converting Excel to PDF...');
                        pdfBlob = await this.convertWithPyodideFallback(file);
                        engine = 'pyodide';
                    } else {
                        throw loErr;
                    }
                }
            }

            if (this.checkCancelled()) {
                return this.createErrorOutput(PDFErrorCode.PROCESSING_CANCELLED, 'Processing was cancelled.');
            }

            this.updateProgress(100, 'Conversion complete!');

            const baseName = file.name.replace(/\.(xlsx?|ods|csv)$/i, '');
            return this.createSuccessOutput(pdfBlob, `${baseName}.pdf`, { format: 'pdf', engine });

        } catch (error) {
            this.stopConversionProgress();
            console.error('Conversion error:', error);
            const details = error instanceof Error ? error.message : 'Unknown error';
            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                `Failed to convert Excel to PDF: ${details}`,
                details
            );
        }
    }
}

export function createExcelToPDFProcessor(): ExcelToPDFProcessor {
    return new ExcelToPDFProcessor();
}

export async function excelToPDF(
    file: File,
    options?: Partial<ExcelToPDFOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createExcelToPDFProcessor();
    return processor.process({ files: [file], options: options || {} }, onProgress);
}
