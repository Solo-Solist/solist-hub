/**
 * Unit Tests for Professional PDF to TIFF Processor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PDFToTIFFProcessor,
  createPDFToTIFFProcessor,
} from '@/lib/pdf/processors/pdf-to-tiff';
import { PDFErrorCode } from '@/types/pdf';

// Helper to create a real minimal PDF using pdf-lib
async function createRealPDFFile(name: string, pageCount: number = 1): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage([612, 792]);
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

describe('PDFToTIFFProcessor', () => {
  let processor: PDFToTIFFProcessor;

  beforeEach(() => {
    processor = createPDFToTIFFProcessor();
  });

  describe('process - input validation', () => {
    it('should return error when no files are provided', async () => {
      const result = await processor.process({
        files: [],
        options: { colorMode: 'color' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
      expect(result.error?.message).toContain('Exactly 1 PDF file');
    });

    it('should return error when multiple files are provided', async () => {
      const file1 = await createRealPDFFile('t1.pdf');
      const file2 = await createRealPDFFile('t2.pdf');

      const result = await processor.process({
        files: [file1, file2],
        options: { colorMode: 'color' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
    });
  });

  describe('factory helper', () => {
    it('should create independent PDFToTIFFProcessor instances', () => {
      const p1 = createPDFToTIFFProcessor();
      const p2 = createPDFToTIFFProcessor();
      expect(p1).toBeInstanceOf(PDFToTIFFProcessor);
      expect(p1).not.toBe(p2);
    });
  });
});
