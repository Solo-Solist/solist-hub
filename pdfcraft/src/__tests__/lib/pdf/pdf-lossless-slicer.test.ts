import { describe, it, expect, beforeEach } from 'vitest';
import {
  PdfLosslessSlicerProcessor,
  createPdfLosslessSlicerProcessor,
  slicePDFLossless
} from '@/lib/pdf/processors/pdf-lossless-slicer';

async function createRealPDFFile(name: string, pageCount: number = 1): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage([612, 792]);
  }
  const pdfBytes = await pdfDoc.save();
  const arrayBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  ) as ArrayBuffer;
  const file = new File([arrayBuffer], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => arrayBuffer,
    writable: false,
  });
  return file;
}

describe('PdfLosslessSlicerProcessor', () => {
  let mockFile: File;

  beforeEach(async () => {
    mockFile = await createRealPDFFile('large_blueprint.pdf', 1);
  });

  it('should instantiate correctly', () => {
    const processor = createPdfLosslessSlicerProcessor();
    expect(processor).toBeInstanceOf(PdfLosslessSlicerProcessor);
  });

  it('should slice blueprint PDF pages losslessly successfully', async () => {
    const result = await slicePDFLossless([mockFile], {
      sliceX: 0.1,
      sliceY: 0.1,
      sliceWidth: 0.8,
      sliceHeight: 0.8,
      pageNumber: 1,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('large_blueprint_sliced_p1.pdf');
  });
});
