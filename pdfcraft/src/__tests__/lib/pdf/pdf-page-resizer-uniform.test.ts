import { describe, it, expect, beforeEach } from 'vitest';
import {
  PdfPageResizerUniformProcessor,
  createPdfPageResizerUniformProcessor,
  resizePDFPagesUniform
} from '@/lib/pdf/processors/pdf-page-resizer-uniform';

async function createRealPDFFile(name: string, pageCount: number = 1): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([612, 792]);
    page.drawText('Dummy contents for testing resizer', { x: 50, y: 50, size: 10 });
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

describe('PdfPageResizerUniformProcessor', () => {
  let mockFile: File;

  beforeEach(async () => {
    mockFile = await createRealPDFFile('invoice_multi_spec.pdf', 1);
  });

  it('should instantiate correctly', () => {
    const processor = createPdfPageResizerUniformProcessor();
    expect(processor).toBeInstanceOf(PdfPageResizerUniformProcessor);
  });

  it('should resize and unify multi spec PDF pages successfully', async () => {
    const result = await resizePDFPagesUniform([mockFile], {
      targetSize: 'A4',
      scaleMode: 'fit',
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('invoice_multi_spec_resized_uniform.pdf');
  });
});
