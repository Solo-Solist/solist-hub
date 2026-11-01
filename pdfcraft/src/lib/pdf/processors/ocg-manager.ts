/**
 * PDF OCG (Optional Content Groups) Manager Processor
 * 
 * Manages PDF layers (OCG) - view, toggle, add, and delete layers.
 * OCG is used for things like maps, technical drawings, and print versions.
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
 * OCG Layer information
 */
export interface OCGLayer {
    /** Layer ID */
    id: string;
    /** Layer name */
    name: string;
    /** Whether layer is currently visible */
    visible: boolean;
    /** Layer intent (View, Design, etc.) */
    intent?: string;
    /** Usage information */
    usage?: string;
}

/**
 * OCG Manager action types
 */
export type OCGAction = 'list' | 'toggle' | 'add' | 'delete' | 'rename';

/**
 * OCG Manager options
 */
export interface OCGManagerOptions {
    /** Action to perform */
    action: OCGAction;
    /** Layer ID for toggle/delete/rename actions */
    layerId?: string;
    /** New name for add/rename actions */
    layerName?: string;
    /** Visibility state for toggle action */
    visible?: boolean;
}

/**
 * Default OCG manager options
 */
const DEFAULT_OCG_OPTIONS: OCGManagerOptions = {
    action: 'list',
};

/**
 * OCG Manager Processor
 * Manages PDF layers (Optional Content Groups).
 */
export class OCGManagerProcessor extends BasePDFProcessor {
    /**
     * Process PDF and perform OCG operations
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const ocgOptions: OCGManagerOptions = {
            ...DEFAULT_OCG_OPTIONS,
            ...(options as Partial<OCGManagerOptions>),
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
            this.updateProgress(10, 'Loading PyMuPDF...');

            const pymupdf = await loadPyMuPDF();

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(30, 'Analyzing PDF layers...');

            // Perform the requested action
            let result: ProcessOutput;

            switch (ocgOptions.action) {
                case 'list':
                    result = await this.listLayers(file, pymupdf);
                    break;
                case 'toggle':
                    result = await this.toggleLayer(file, pymupdf, ocgOptions);
                    break;
                case 'add':
                    result = await this.addLayer(file, pymupdf, ocgOptions);
                    break;
                case 'delete':
                    result = await this.deleteLayer(file, pymupdf, ocgOptions);
                    break;
                case 'rename':
                    result = await this.renameLayer(file, pymupdf, ocgOptions);
                    break;
                default:
                    result = await this.listLayers(file, pymupdf);
            }

            this.updateProgress(100, 'Complete!');
            return result;

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
                'Failed to process PDF layers.',
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }

    /**
     * List all OCG layers in the PDF
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async listLayers(file: File, pymupdf: any): Promise<ProcessOutput> {
        this.updateProgress(50, 'Reading layer information...');

        const layers = await pymupdf.getOCGLayers(file);

        this.updateProgress(90, 'Processing complete...');

        return {
            success: true,
            result: undefined,
            metadata: {
                action: 'list',
                layers: layers as OCGLayer[],
                layerCount: layers.length,
            },
        };
    }

    /**
     * Toggle layer visibility
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async toggleLayer(file: File, pymupdf: any, options: OCGManagerOptions): Promise<ProcessOutput> {
        if (!options.layerId) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Layer ID is required for toggle action.'
            );
        }

        this.updateProgress(50, 'Toggling layer visibility...');

        const result = await pymupdf.toggleOCGLayer(file, {
            layerId: options.layerId,
            visible: options.visible !== undefined ? options.visible : undefined,
        });

        this.updateProgress(90, 'Saving changes...');

        const outputFilename = generateOCGFilename(file.name);

        return this.createSuccessOutput(result, outputFilename, {
            action: 'toggle',
            layerId: options.layerId,
            visible: options.visible,
        });
    }

    /**
     * Add a new layer
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async addLayer(file: File, pymupdf: any, options: OCGManagerOptions): Promise<ProcessOutput> {
        if (!options.layerName) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Layer name is required for add action.'
            );
        }

        this.updateProgress(50, 'Adding new layer...');

        const result = await pymupdf.addOCGLayer(file, {
            name: options.layerName,
        });

        this.updateProgress(90, 'Saving changes...');

        const outputFilename = generateOCGFilename(file.name);

        return this.createSuccessOutput(result, outputFilename, {
            action: 'add',
            layerName: options.layerName,
        });
    }

    /**
     * Delete a layer
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async deleteLayer(file: File, pymupdf: any, options: OCGManagerOptions): Promise<ProcessOutput> {
        if (!options.layerId) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Layer ID is required for delete action.'
            );
        }

        this.updateProgress(50, 'Deleting layer...');

        const result = await pymupdf.deleteOCGLayer(file, {
            layerId: options.layerId,
        });

        this.updateProgress(90, 'Saving changes...');

        const outputFilename = generateOCGFilename(file.name);

        return this.createSuccessOutput(result, outputFilename, {
            action: 'delete',
            layerId: options.layerId,
        });
    }

    /**
     * Rename a layer
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async renameLayer(file: File, pymupdf: any, options: OCGManagerOptions): Promise<ProcessOutput> {
        if (!options.layerId || !options.layerName) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Layer ID and new name are required for rename action.'
            );
        }

        this.updateProgress(50, 'Renaming layer...');

        const result = await pymupdf.renameOCGLayer(file, {
            layerId: options.layerId,
            newName: options.layerName,
        });

        this.updateProgress(90, 'Saving changes...');

        const outputFilename = generateOCGFilename(file.name);

        return this.createSuccessOutput(result, outputFilename, {
            action: 'rename',
            layerId: options.layerId,
            newName: options.layerName,
        });
    }

    /**
     * Get accepted file types
     */
    protected getAcceptedTypes(): string[] {
        return ['application/pdf'];
    }
}

/**
 * Generate output filename
 */
function generateOCGFilename(originalName: string): string {
    const lastDot = originalName.lastIndexOf('.');
    const baseName = lastDot === -1 ? originalName : originalName.slice(0, lastDot);
    return `${baseName}_layers.pdf`;
}

/**
 * Create a new instance of the OCG manager processor
 */
export function createOCGManagerProcessor(): OCGManagerProcessor {
    return new OCGManagerProcessor();
}

/**
 * Manage OCG layers (convenience function)
 */
export async function manageOCGLayers(
    file: File,
    options?: Partial<OCGManagerOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createOCGManagerProcessor();
    return processor.process(
        {
            files: [file],
            options: options || {},
        },
        onProgress
    );
}

/**
 * List OCG layers (convenience function)
 */
export async function listOCGLayers(
    file: File,
    onProgress?: ProgressCallback
): Promise<{ layers: OCGLayer[] }> {
    const result = await manageOCGLayers(file, { action: 'list' }, onProgress);
    return {
        layers: (result.metadata?.layers as OCGLayer[]) || [],
    };
}
