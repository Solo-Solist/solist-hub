/**
 * Unit Tests for PDF to CBZ Comic Converter Processor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PDFToCBZProcessor,
  createPDFToCBZProcessor,
} from '@/lib/pdf/processors/pdf-to-cbz';
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

describe('PDFToCBZProcessor', () => {
  let processor: PDFToCBZProcessor;

  beforeEach(() => {
    processor = createPDFToCBZProcessor();
  });

  describe('process - input validation', () => {
    it('should return error when no files are provided', async () => {
      const result = await processor.process({
        files: [],
        options: { title: 'Test Comic' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
      expect(result.error?.message).toContain('exactly one PDF file');
    });

    it('should return error when multiple files are provided', async () => {
      const file1 = await createRealPDFFile('c1.pdf');
      const file2 = await createRealPDFFile('c2.pdf');

      const result = await processor.process({
        files: [file1, file2],
        options: { title: 'Test Comic' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
    });
  });

  describe('factory helper', () => {
    it('should create independent PDFToCBZProcessor instances', () => {
      const p1 = createPDFToCBZProcessor();
      const p2 = createPDFToCBZProcessor();
      expect(p1).toBeInstanceOf(PDFToCBZProcessor);
      expect(p1).not.toBe(p2);
    });
  });
});
