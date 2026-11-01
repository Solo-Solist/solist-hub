import { describe, it, expect, beforeEach } from 'vitest';
import {
  PdfTwoColumnReflowerProcessor,
  createPdfTwoColumnReflowerProcessor,
  reflowTwoColumnPDF
} from '@/lib/pdf/processors/pdf-two-column-reflower';

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

describe('PdfTwoColumnReflowerProcessor', () => {
  let mockFile: File;

  beforeEach(async () => {
    mockFile = await createRealPDFFile('academic_paper.pdf', 1);
  });

  it('should instantiate correctly', () => {
    const processor = createPdfTwoColumnReflowerProcessor();
    expect(processor).toBeInstanceOf(PdfTwoColumnReflowerProcessor);
  });

  it('should reflow academic two column PDF losslessly', async () => {
    const result = await reflowTwoColumnPDF([mockFile], {
      middleGapRatio: 0.5,
      horizontalReading: false,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('academic_paper_single_column.pdf');
  });
});
