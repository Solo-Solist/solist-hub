/**
 * Unit Tests for RFC 3161 Trusted Timestamp Processor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TimestampPDFProcessor,
  createTimestampProcessor,
} from '@/lib/pdf/processors/timestamp';
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

describe('TimestampPDFProcessor', () => {
  let processor: TimestampPDFProcessor;

  beforeEach(() => {
    processor = createTimestampProcessor();
  });

  describe('process - input validation', () => {
    it('should return error when no files are provided', async () => {
      const result = await processor.process({
        files: [],
        options: { tsaServer: 'MeSign' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
      expect(result.error?.message).toContain('1 PDF file is required');
    });

    it('should return error when multiple files are provided', async () => {
      const file1 = await createRealPDFFile('doc1.pdf');
      const file2 = await createRealPDFFile('doc2.pdf');

      const result = await processor.process({
        files: [file1, file2],
        options: { tsaServer: 'MeSign' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
    });
  });

  describe('factory helper', () => {
    it('should create independent TimestampPDFProcessor instances', () => {
      const p1 = createTimestampProcessor();
      const p2 = createTimestampProcessor();
      expect(p1).toBeInstanceOf(TimestampPDFProcessor);
      expect(p1).not.toBe(p2);
    });
  });
});
