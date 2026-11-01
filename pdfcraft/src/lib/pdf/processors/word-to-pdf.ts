/**
 * Word to PDF Processor
 *
 * Uses LibreOffice WASM when Cross-Origin Isolation is available (best fidelity).
 * Falls back to Pyodide (python-docx) for .docx when isolation headers are missing.
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { getSharedLibreOfficeConverter } from '@/lib/libreoffice/shared-converter';
import { isCrossOriginIsolated } from '@/lib/utils/cross-origin-isolated';
import { convertWordToPdfPyodide } from './word-to-pdf-pyodide';

/** Maximum file size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
/** Conversion timeout: 5 minutes */
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000;

export interface WordToPDFOptions {
    /** Reserved for future options */
}

export class WordToPDFProcessor extends BasePDFProcessor {
    private conversionProgressTimer: ReturnType<typeof setInterval> | null = null;

    private startConversionProgress(message: string): void {
        this.stopConversionProgress();
        this.conversionProgressTimer = setInterval(() => {
            if (this.progress >= 98) return;
            this.updateProgress(this.progress + 1, message);
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

        this.updateProgress(85, 'Converting Word document to PDF...');
        this.startConversionProgress('Converting Word document to PDF...');

        try {
            return await Promise.race([
                converter.convertToPdf(file),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `Conversion timed out after ${CONVERT_TIMEOUT_MS / 60000} minutes. The file may be too complex.`
                                )
                            ),
                        CONVERT_TIMEOUT_MS
                    )
                ),
            ]);
        } finally {
            this.stopConversionProgress();
        }
    }

    private async convertWithPyodideFallback(file: File): Promise<Blob> {
        this.updateProgress(
            10,
            'Using compatibility converter (server lacks Cross-Origin Isolation)...'
        );

        const pdfBlob = await convertWordToPdfPyodide(file, (message) => {
            this.updateProgress(Math.min(this.progress + 2, 90), message);
        });

        return pdfBlob;
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
                'Please provide exactly one Word document.',
                `Received ${files.length} file(s).`
            );
        }

        const file = files[0];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const validExts = ['docx', 'doc', 'odt', 'rtf'];

        if (!validExts.includes(ext)) {
            return this.createErrorOutput(
                PDFErrorCode.FILE_TYPE_INVALID,
                'Invalid file type. Please upload .docx, .doc, .odt, or .rtf.',
                `Received: ${file.type || file.name}`
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum supported size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
                `File size: ${file.size} bytes, limit: ${MAX_FILE_SIZE} bytes`
            );
        }

        const useLibreOffice = isCrossOriginIsolated();

        if (!useLibreOffice && ext !== 'docx') {
            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                `.${ext} files require LibreOffice, which needs Cross-Origin Isolation on your server.`,
                'Your host must send Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp on all HTML responses. Alternatively, convert the file to .docx first.'
            );
        }

        try {
            let pdfBlob: Blob;
            let engine: 'libreoffice' | 'pyodide' = 'libreoffice';

            if (useLibreOffice) {
                try {
                    pdfBlob = await this.convertWithLibreOffice(file);
                } catch (loErr) {
                    if (ext === 'docx' && !this.checkCancelled()) {
                        console.warn('[WordToPDF] LibreOffice failed or timed out, falling back to Pyodide:', loErr);
                        this.updateProgress(20, 'LibreOffice engine unavailable, falling back to Python converter...');
                        pdfBlob = await this.convertWithPyodideFallback(file);
                        engine = 'pyodide';
                    } else {
                        throw loErr;
                    }
                }
            } else {
                pdfBlob = await this.convertWithPyodideFallback(file);
                engine = 'pyodide';
            }

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(100, 'Conversion complete!');

            const baseName = file.name.replace(/\.(docx?|odt|rtf)$/i, '');
            return this.createSuccessOutput(pdfBlob, `${baseName}.pdf`, {
                format: 'pdf',
                engine,
            });
        } catch (error) {
            this.stopConversionProgress();
            console.error('Conversion error:', error);
            const details = error instanceof Error ? error.message : 'Unknown error';
            const isEnvError = /SharedArrayBuffer|crossOriginIsolated|Cross-Origin/i.test(
                details
            );
            const hint = isEnvError
                ? 'Add COOP/COEP headers on your server, or use a .docx file (compatibility converter works without them).'
                : 'Verify the file is a valid Word document and try again.';
            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                `Failed to convert Word document to PDF: ${details}`,
                `${details}\n\n${hint}`
            );
        }
    }
}

export function createWordToPDFProcessor(): WordToPDFProcessor {
    return new WordToPDFProcessor();
}

export async function wordToPDF(
    file: File,
    options?: Partial<WordToPDFOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createWordToPDFProcessor();
    return processor.process({ files: [file], options: options || {} }, onProgress);
}
