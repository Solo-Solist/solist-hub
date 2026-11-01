/**
 * Signature Ink Optimizer Processor
 * 
 * Extracts ink text and red stamps from photos, filters out yellow/gray crumpled paper shadows,
 * enhances ink color intensity, and converts the background to a transparent Alpha channel PNG.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';

export interface SignatureInkOptions {
  threshold?: number;   // 0-255 background luminance cutoff, default: 200
  inkType?: 'dark-ink' | 'red-stamp' | 'auto'; // target enhance color
  contrast?: number;    // contrast multiplier, default: 1.5
}

const DEFAULT_OPTIONS: SignatureInkOptions = {
  threshold: 200,
  inkType: 'auto',
  contrast: 1.5,
};

export class SignatureInkOptimizerProcessor extends BasePDFProcessor {
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const inkOptions: SignatureInkOptions = {
      ...DEFAULT_OPTIONS,
      ...(options as Partial<SignatureInkOptions>),
    };

    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please upload exactly one image file.'
      );
    }

    const file = files[0];

    try {
      this.updateProgress(20, 'Loading signature image...');
      
      const imageBitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not obtain 2D canvas context.');
      }

      ctx.drawImage(imageBitmap, 0, 0);
      this.updateProgress(50, 'Analyzing pixels & separating Alpha channel...');

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      const threshold = inkOptions.threshold || 200;
      const contrast = inkOptions.contrast || 1.5;
      const targetType = inkOptions.inkType || 'auto';

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Calculate luminance (standard ITU BT.601)
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // Extract and isolate background: if brighter than threshold, make transparent
        if (luminance > threshold) {
          data[i + 3] = 0; // Transparant
          continue;
        }

        // Ink enhancement strategy
        if (targetType === 'red-stamp' || (targetType === 'auto' && r > g * 1.3 && r > b * 1.3)) {
          // Enhance red channel for ink stamp, diminish others to clear gray noise
          data[i] = Math.min(255, r * contrast);
          data[i + 1] = Math.max(0, g * 0.5);
          data[i + 2] = Math.max(0, b * 0.5);
        } else {
          // Standard dark ink/signature enhancement (increase black contrast)
          const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
          const enhanceValue = (val: number) => Math.max(0, Math.min(255, factor * (val - 128) + 128));
          
          const newR = enhanceValue(r);
          const newG = enhanceValue(g);
          const newB = enhanceValue(b);

          // Force to dark tint
          const darkLuminance = 0.299 * newR + 0.587 * newG + 0.114 * newB;
          if (darkLuminance < 100) {
            data[i] = Math.max(0, newR - 40);
            data[i + 1] = Math.max(0, newG - 40);
            data[i + 2] = Math.max(0, newB - 40);
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      this.updateProgress(90, 'Compressing transparent PNG...');
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas compilation to PNG failed.'));
        }, 'image/png');
      });

      this.updateProgress(100, 'Complete!');
      
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      return this.createSuccessOutput(blob, `${baseName}_ink_purified.png`, {
        width: canvas.width,
        height: canvas.height,
        optimized: true,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to purify signature ink.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  protected getAcceptedTypes(): string[] {
    return ['image/jpeg', 'image/png'];
  }
}

export function createSignatureInkOptimizerProcessor(): SignatureInkOptimizerProcessor {
  return new SignatureInkOptimizerProcessor();
}

export async function optimizeSignatureInk(
  files: File[],
  options?: Partial<SignatureInkOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createSignatureInkOptimizerProcessor();
  return processor.process({ files, options: options || {} }, onProgress);
}
