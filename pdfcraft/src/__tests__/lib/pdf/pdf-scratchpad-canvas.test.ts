import { describe, it, expect, beforeEach } from 'vitest';
import {
  PdfScratchpadCanvasProcessor,
  createPdfScratchpadCanvasProcessor,
  stitchScratchpadCanvas
} from '@/lib/pdf/processors/pdf-scratchpad-canvas';

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

describe('PdfScratchpadCanvasProcessor', () => {
  let mockFile: File;

  beforeEach(async () => {
    mockFile = await createRealPDFFile('notes.pdf', 1);
  });

  it('should instantiate correctly', () => {
    const processor = createPdfScratchpadCanvasProcessor();
    expect(processor).toBeInstanceOf(PdfScratchpadCanvasProcessor);
  });

  it('should stitch scratchpad canvas to page boundaries successfully', async () => {
    const result = await stitchScratchpadCanvas([mockFile], {
      padPosition: 'right',
      padSize: 200,
      gridType: 'grid',
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('notes_with_scratchpad.pdf');
  });
});
