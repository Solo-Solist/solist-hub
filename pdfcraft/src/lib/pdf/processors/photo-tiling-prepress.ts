/**
 * Photo Tiling Prepress Processor
 * 
 * Arranges ID photos / passport cards in precise matrix grids on standard photo papers (e.g. 5" or 6") with crop marks.
 */

import type { ProcessInput, ProcessOutput, ProgressCallback } from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfLib } from '../loader';

export interface PhotoTilingPrepressOptions {
  photoSpec: '1-inch' | '2-inch';
  paperSize: '5-inch' | '6-inch';
  gapPt: number;
}

const PAPER_DIMENSIONS = {
  '5-inch': { width: 360.0, height: 252.0 }, // 5" (3.5 x 5 in horizontal) -> 360 x 252 pt
  '6-inch': { width: 432.0, height: 288.0 }, // 6" (4 x 6 in horizontal) -> 432 x 288 pt
};

const PHOTO_DIMENSIONS = {
  '1-inch': { width: 70.87, height: 99.21 },   // 25mm x 35mm -> 70.87 x 99.21 pt
  '2-inch': { width: 99.21, height: 138.90 },  // 35mm x 49mm -> 99.21 x 138.90 pt
};

export class PhotoTilingPrepressProcessor extends BasePDFProcessor {
  async process(input: ProcessInput, onProgress?: ProgressCallback): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const prepressOptions: PhotoTilingPrepressOptions = {
      photoSpec: '1-inch',
      paperSize: '6-inch',
      gapPt: 8,
      ...(options as Partial<PhotoTilingPrepressOptions>),
    };

    if (files.length === 0) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please upload at least one photo (PNG/JPEG) for tiling.'
      );
    }

    const file = files[0];

    try {
      this.updateProgress(15, 'Loading PDF library...');
      const pdfLib = await loadPdfLib();
      const pdfDoc = await pdfLib.PDFDocument.create();

      this.updateProgress(35, 'Encoding photo payload into PDF streams...');
      const photoBytes = await file.arrayBuffer();
      
      let image: any;
      if (file.type === 'image/png') {
        image = await pdfDoc.embedPng(photoBytes);
      } else {
        image = await pdfDoc.embedJpg(photoBytes);
      }

      this.updateProgress(60, 'Calculating photo tile placement matrix...');

      const paperDim = PAPER_DIMENSIONS[prepressOptions.paperSize] || PAPER_DIMENSIONS['6-inch'];
      const photoDim = PHOTO_DIMENSIONS[prepressOptions.photoSpec] || PHOTO_DIMENSIONS['1-inch'];

      const page = pdfDoc.addPage([paperDim.width, paperDim.height]);
      const { rgb } = pdfLib;

      // Draw light photobooth background
      page.drawRectangle({
        x: 0,
        y: 0,
        width: paperDim.width,
        height: paperDim.height,
        color: rgb(0.99, 0.99, 0.99),
      });

      const gap = prepressOptions.gapPt;
      const tileW = photoDim.width;
      const tileH = photoDim.height;

      // Calculate how many columns and rows can fit
      const cols = Math.floor((paperDim.width - gap) / (tileW + gap));
      const rows = Math.floor((paperDim.height - gap) / (tileH + gap));

      if (cols === 0 || rows === 0) {
        throw new Error('Target paper dimensions too small to fit requested photo specifications.');
      }

      // Center the grid
      const gridTotalW = cols * tileW + (cols - 1) * gap;
      const gridTotalH = rows * tileH + (rows - 1) * gap;
      
      const startX = (paperDim.width - gridTotalW) / 2;
      const startY = (paperDim.height - gridTotalH) / 2;

      this.updateProgress(80, 'Plotting prepress matrix grid & crop marks...');

      let tiledCount = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = startX + c * (tileW + gap);
          const y = startY + r * (tileH + gap);

          // Draw the photo tile
          page.drawImage(image, {
            x,
            y,
            width: tileW,
            height: tileH,
          });

          // Draw crop marks (thin dashed lines around tiles for physical slicing guidance)
          page.drawRectangle({
            x: x - 1,
            y: y - 1,
            width: tileW + 2,
            height: tileH + 2,
            borderColor: rgb(0.85, 0.85, 0.85),
            borderWidth: 0.5,
            borderDashArray: [2, 2],
          });

          tiledCount++;
        }
      }

      this.updateProgress(90, 'Assembling printing tiles...');
      const outputBytes = await pdfDoc.save();
      const blob = new Blob([outputBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

      this.updateProgress(100, 'Complete!');

      return this.createSuccessOutput(blob, 'prepress_photo_tiled_layout.pdf', {
        tiledPhotosCount: tiledCount,
        photoSpec: prepressOptions.photoSpec,
        paperSize: prepressOptions.paperSize,
        columns: cols,
        rows,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to process photo tiling prepress layout.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  protected getAcceptedTypes(): string[] {
    return ['image/png', 'image/jpeg', 'image/jpg'];
  }
}

export function createPhotoTilingPrepressProcessor(): PhotoTilingPrepressProcessor {
  return new PhotoTilingPrepressProcessor();
}

export async function prepressPhotoTiling(
  files: File[],
  options?: Partial<PhotoTilingPrepressOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createPhotoTilingPrepressProcessor();
  return processor.process({ files, options: options || {} }, onProgress);
}
