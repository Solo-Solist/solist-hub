import { describe, it, expect, beforeEach } from 'vitest';
import {
  PdfSignatureAnchorHelperProcessor,
  createPdfSignatureAnchorHelperProcessor,
  injectSignatureAnchors
} from '@/lib/pdf/processors/pdf-signature-anchor-helper';

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

describe('PdfSignatureAnchorHelperProcessor', () => {
  let mockFile: File;

  beforeEach(async () => {
    mockFile = await createRealPDFFile('agreement_to_sign.pdf', 1);
  });

  it('should instantiate correctly', () => {
    const processor = createPdfSignatureAnchorHelperProcessor();
    expect(processor).toBeInstanceOf(PdfSignatureAnchorHelperProcessor);
  });

  it('should inject interactive signature anchor guides successfully', async () => {
    const result = await injectSignatureAnchors([mockFile], {
      anchorX: 0.8,
      anchorY: 0.8,
      pageNumber: 1,
      anchorLabel: 'Sign Here',
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('agreement_to_sign_signed_guided.pdf');
  });
});
