import { describe, it, expect, beforeEach } from 'vitest';
import {
  PdfDeskewAlignerProcessor,
  createPdfDeskewAlignerProcessor,
  deskewPDFAligner
} from '@/lib/pdf/processors/pdf-deskew-aligner';

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

describe('PdfDeskewAlignerProcessor', () => {
  let mockFile: File;

  beforeEach(async () => {
    mockFile = await createRealPDFFile('scanned_tilted.pdf', 1);
  });

  it('should instantiate correctly', () => {
    const processor = createPdfDeskewAlignerProcessor();
    expect(processor).toBeInstanceOf(PdfDeskewAlignerProcessor);
  });

  it('should deskew and align PDF pages successfully', async () => {
    const result = await deskewPDFAligner([mockFile], {
      threshold: 10,
      dpi: 150,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('scanned_tilted_deskewed_aligned.pdf');
  });
});
