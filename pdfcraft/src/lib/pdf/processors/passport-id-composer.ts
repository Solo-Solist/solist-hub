/**
 * Passport ID Composer Processor
 * 
 * Implements national standard composition of double-sided ID cards
 * onto a single A4 page with optional security watermarks.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfLib } from '../loader';

export interface PassportIdOptions {
  watermarkText?: string;
  layout?: 'single-page' | 'two-pages';
  idCardWidth?: number;  // in points, default: 242.6 (85.6mm)
  idCardHeight?: number; // in points, default: 153 (54mm)
}

const DEFAULT_OPTIONS: PassportIdOptions = {
  watermarkText: '',
  layout: 'single-page',
  idCardWidth: 242.6,
  idCardHeight: 153,
};

export class PassportIdComposerProcessor extends BasePDFProcessor {
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const composerOptions: PassportIdOptions = {
      ...DEFAULT_OPTIONS,
      ...(options as Partial<PassportIdOptions>),
    };

    if (files.length === 0) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'At least 1 file (front or front + back) is required.'
      );
    }

    try {
      this.updateProgress(10, 'Loading PDF libraries...');
      const pdfLib = await loadPdfLib();
      const pdfDoc = await pdfLib.PDFDocument.create();

      // standard A4 dimensions
      const a4Width = 595.28;
      const a4Height = 841.89;
      const page = pdfDoc.addPage([a4Width, a4Height]);

      const w = composerOptions.idCardWidth || 242.6;
      const h = composerOptions.idCardHeight || 153;

      // Positions on A4
      const x = (a4Width - w) / 2;
      const yFront = a4Height * 0.6; // Top portion of A4
      const yBack = a4Height * 0.3;  // Bottom portion of A4

      const progressInterval = 80 / files.length;

      for (let i = 0; i < files.length && i < 2; i++) {
        const file = files[i];
        const currentY = i === 0 ? yFront : yBack;
        
        this.updateProgress(20 + i * progressInterval, `Embedding ID page/image: ${file.name}`);

        const fileBytes = await file.arrayBuffer();
        const fileExt = file.name.split('.').pop()?.toLowerCase();

        if (file.type === 'application/pdf' || fileExt === 'pdf') {
          // Load as PDF and embed the first page
          const tempDoc = await pdfLib.PDFDocument.load(fileBytes);
          if (tempDoc.getPageCount() > 0) {
            const [embeddedPage] = await pdfDoc.embedPages([tempDoc.getPage(0)]);
            page.drawPage(embeddedPage, {
              x,
              y: currentY,
              width: w,
              height: h,
            });
          }
        } else if (['png', 'jpg', 'jpeg', 'webp'].includes(fileExt || '')) {
          // Embed image
          let image;
          if (file.type === 'image/png' || fileExt === 'png') {
            image = await pdfDoc.embedPng(new Uint8Array(fileBytes));
          } else {
            image = await pdfDoc.embedJpg(new Uint8Array(fileBytes));
          }
          page.drawImage(image, {
            x,
            y: currentY,
            width: w,
            height: h,
          });
        }
      }

      // Draw secure watermark if provided
      if (composerOptions.watermarkText) {
        this.updateProgress(90, 'Adding security watermark...');
        const standardFont = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
        
        // Let's add multiple diagonal watermark lines
        const text = composerOptions.watermarkText;
        const fontSize = 14;
        
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 3; col++) {
            page.drawText(text, {
              x: 50 + col * 200,
              y: 100 + row * 160,
              size: fontSize,
              font: standardFont,
              color: pdfLib.rgb(0.7, 0.7, 0.7),
              rotate: pdfLib.degrees(45),
              opacity: 0.15,
            });
          }
        }
      }

      this.updateProgress(95, 'Generating composite PDF...');
      const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

      this.updateProgress(100, 'Complete!');

      return this.createSuccessOutput(blob, 'passport_id_composite.pdf', {
        pageCount: 1,
        filesProcessed: files.length,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to compose passport ID PDF.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  protected getAcceptedTypes(): string[] {
    return ['application/pdf', 'image/jpeg', 'image/png'];
  }
}

export function createPassportIdComposerProcessor(): PassportIdComposerProcessor {
  return new PassportIdComposerProcessor();
}

export async function composePassportId(
  files: File[],
  options?: Partial<PassportIdOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createPassportIdComposerProcessor();
  return processor.process({ files, options: options || {} }, onProgress);
}
