/**
 * Unit Tests for PDF Page Labels Processor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PageLabelsProcessor,
  createPageLabelsProcessor,
  addPageLabels,
} from '@/lib/pdf/processors/page-labels';
import { PDFErrorCode } from '@/types/pdf';

// Helper to create a real minimal PDF using pdf-lib
async function createRealPDFFile(name: string, pageCount: number = 1): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage([612, 792]); // Letter size
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const file = new File([blob], name, { type: 'application/pdf' }) as any;
  file.arrayBuffer = async () => pdfBytes.buffer.slice(0) as ArrayBuffer;
  return file as File;
}

describe('PageLabelsProcessor', () => {
  let processor: PageLabelsProcessor;

  beforeEach(() => {
    processor = createPageLabelsProcessor();
  });

  describe('process - input validation', () => {
    it('should return error when no files are provided', async () => {
      const result = await processor.process({
        files: [],
        options: { rules: [{ pageRange: '1-5', style: 'D' }] },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
      expect(result.error?.message).toContain('1 PDF file');
    });

    it('should return error when multiple files are provided', async () => {
      const file1 = await createRealPDFFile('doc1.pdf', 3);
      const file2 = await createRealPDFFile('doc2.pdf', 3);

      const result = await processor.process({
        files: [file1, file2],
        options: { rules: [{ pageRange: '1-5', style: 'D' }] },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
    });

    it('should return error when no labeling rules are provided', async () => {
      const file = await createRealPDFFile('doc.pdf', 5);

      const result = await processor.process({
        files: [file],
        options: { rules: [] },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
      expect(result.error?.message).toContain('one page labeling rule');
    });
  });

  describe('process - labeling functionality', () => {
    it('should successfully inject decimal page label rules on all pages', async () => {
      const file = await createRealPDFFile('book.pdf', 5);
      const result = await addPageLabels(file, {
        rules: [
          {
            pageRange: '', // empty means all
            style: 'D',
            prefix: 'Page-',
            startValue: 1,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeInstanceOf(Blob);
      expect(result.filename).toBe('book_labeled.pdf');
    });

    it('should successfully inject complex disjoint roman and decimal rules', async () => {
      const file = await createRealPDFFile('thesis.pdf', 10);
      const result = await addPageLabels(file, {
        rules: [
          {
            pageRange: '1-3', // Front matter
            style: 'r',       // Lowercase Roman
            startValue: 1,
          },
          {
            pageRange: '4-10', // Main body
            style: 'D',        // Decimal
            prefix: 'Ch1-',
            startValue: 1,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeInstanceOf(Blob);
    });
  });

  describe('factory helper', () => {
    it('should create independent PageLabelsProcessor instances', () => {
      const p1 = createPageLabelsProcessor();
      const p2 = createPageLabelsProcessor();
      expect(p1).toBeInstanceOf(PageLabelsProcessor);
      expect(p1).not.toBe(p2);
    });
  });
});
