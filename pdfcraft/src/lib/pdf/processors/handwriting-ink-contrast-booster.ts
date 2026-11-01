/**
 * Handwriting Ink Contrast Booster Processor
 * 
 * Bleaches messy backgrounds, shadows, and enhances handwriting ink contrast locally using HTML5 Canvas sandboxing.
 */

import type { ProcessInput, ProcessOutput, ProgressCallback } from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';

export interface HandwritingInkContrastBoosterOptions {
  threshold: number;      // 100-245 (default 200)
  contrast: number;       // 1.0-3.0 (default 1.5)
  inkType: 'dark-ink' | 'red-stamp' | 'auto';
}

export class HandwritingInkContrastBoosterProcessor extends BasePDFProcessor {
  async process(input: ProcessInput, onProgress?: ProgressCallback): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const boosterOptions: HandwritingInkContrastBoosterOptions = {
      threshold: 200,
      contrast: 1.5,
      inkType: 'auto',
      ...(options as Partial<HandwritingInkContrastBoosterOptions>),
    };

    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please provide exactly one document or photo to boost ink contrast.'
      );
    }

    const file = files[0];

    try {
      this.updateProgress(10, 'Initializing graphic sandbox context...');

      // Read image array buffer
      const arrayBuffer = await file.arrayBuffer();
      const blobType = file.type || 'image/png';
      
      this.updateProgress(35, 'Extracting handwriting pixels grid...');

      // Create a canvas offscreen
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not acquire 2D offscreen rendering context.');
      }

      // Convert buffer to ImageBitmap
      const imgBlob = new Blob([arrayBuffer], { type: blobType });
      const imgBitmap = await createImageBitmap(imgBlob);

      canvas.width = imgBitmap.width;
      canvas.height = imgBitmap.height;

      // Draw original
      ctx.drawImage(imgBitmap, 0, 0);

      this.updateProgress(60, 'Performing low-pass ink contrast boosting...');

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const len = data.length;

      const thresholdVal = boosterOptions.threshold;
      const contrastVal = boosterOptions.contrast;
      const inkType = boosterOptions.inkType;

      for (let i = 0; i < len; i += 4) {
        if (this.checkCancelled()) {
          throw new Error('Cancelled');
        }

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Gray level
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        if (inkType === 'red-stamp') {
          // If stamp, keep strong red color components and bleach dark/greenish tints
          const isRed = r > 120 && g < 80 && b < 80;
          if (!isRed && gray > thresholdVal) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          } else if (isRed) {
            // Boost red saturation
            data[i] = Math.min(255, r * contrastVal);
            data[i + 1] = Math.max(0, g / contrastVal);
            data[i + 2] = Math.max(0, b / contrastVal);
          }
        } else if (inkType === 'dark-ink') {
          // Keep dark ink (black/blue)
          if (gray > thresholdVal) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          } else {
            // Boost dark ink contrast
            data[i] = Math.max(0, r - (255 - r) * (contrastVal - 1));
            data[i + 1] = Math.max(0, g - (255 - g) * (contrastVal - 1));
            data[i + 2] = Math.max(0, b - (255 - b) * (contrastVal - 1));
          }
        } else {
          // Auto contrast enhancement
          if (gray > thresholdVal) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          } else {
            // Standard contrast enhancement
            const newR = Math.max(0, Math.min(255, ((r / 255 - 0.5) * contrastVal + 0.5) * 255));
            const newG = Math.max(0, Math.min(255, ((g / 255 - 0.5) * contrastVal + 0.5) * 255));
            const newB = Math.max(0, Math.min(255, ((b / 255 - 0.5) * contrastVal + 0.5) * 255));
            data[i] = newR;
            data[i + 1] = newG;
            data[i + 2] = newB;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      this.updateProgress(85, 'Flattening pixels layout...');

      const outputBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas conversion to Blob failed.'));
        }, blobType);
      });

      this.updateProgress(100, 'Complete!');
      
      const lastDot = file.name.lastIndexOf('.');
      const baseName = lastDot === -1 ? file.name : file.name.slice(0, lastDot);
      const suffix = inkType === 'red-stamp' ? '_stamp_boosted.png' : '_ink_boosted.png';

      return this.createSuccessOutput(outputBlob, `${baseName}${suffix}`, {
        appliedThreshold: thresholdVal,
        appliedContrast: contrastVal,
        inkType,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to boost handwriting ink.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  protected getAcceptedTypes(): string[] {
    return ['image/png', 'image/jpeg', 'image/jpg'];
  }
}

export function createHandwritingInkContrastBoosterProcessor(): HandwritingInkContrastBoosterProcessor {
  return new HandwritingInkContrastBoosterProcessor();
}

export async function boostHandwritingInkContrast(
  files: File[],
  options?: Partial<HandwritingInkContrastBoosterOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createHandwritingInkContrastBoosterProcessor();
  return processor.process({ files, options: options || {} }, onProgress);
}
