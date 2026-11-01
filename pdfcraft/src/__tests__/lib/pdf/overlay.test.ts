/**
 * Unit Tests for PDF Overlay & Underlay Processor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OverlayPDFProcessor,
  createOverlayProcessor,
  overlayPDF,
} from '@/lib/pdf/processors/overlay';
import { PDFErrorCode } from '@/types/pdf';

// Helper to create a real minimal PDF using pdf-lib
async function createRealPDFFile(name: string, pageCount: number = 1): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([612, 792]);
    // Draw an invisible character to enforce /Contents stream creation in pdf-lib
    page.drawText(' ', { x: 0, y: 0 });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const file = new File([blob], name, { type: 'application/pdf' }) as any;
  file.arrayBuffer = async () => pdfBytes.buffer.slice(0) as ArrayBuffer;
  return file as File;
}

describe('OverlayPDFProcessor', () => {
  let processor: OverlayPDFProcessor;

  beforeEach(() => {
    processor = createOverlayProcessor();
  });

  describe('process - input validation', () => {
    it('should return error when no files are provided', async () => {
      const result = await processor.process({
        files: [],
        options: { mode: 'overlay' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
      expect(result.error?.message).toContain('Exactly 2 PDF files');
    });

    it('should return error when only 1 file is provided', async () => {
      const file1 = await createRealPDFFile('doc1.pdf');

      const result = await processor.process({
        files: [file1],
        options: { mode: 'overlay' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
    });

    it('should return error when 3 files are provided', async () => {
      const file1 = await createRealPDFFile('doc1.pdf');
      const file2 = await createRealPDFFile('doc2.pdf');
      const file3 = await createRealPDFFile('doc3.pdf');

      const result = await processor.process({
        files: [file1, file2, file3],
        options: { mode: 'overlay' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
    });
  });

  describe('process - overlay functionality', () => {
    it('should successfully overlay two documents', async () => {
      const base = await createRealPDFFile('base.pdf', 3);
      const layer = await createRealPDFFile('layer.pdf', 1);

      const result = await overlayPDF([base, layer], {
        mode: 'overlay',
        pageRange: '',
        loop: true,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeInstanceOf(Blob);
      expect(result.filename).toBe('base_overlay.pdf');
    });

    it('should successfully underlay two documents with page boundaries', async () => {
      const base = await createRealPDFFile('base.pdf', 5);
      const layer = await createRealPDFFile('layer.pdf', 2);

      const result = await overlayPDF([base, layer], {
        mode: 'underlay',
        pageRange: '1-3, 5',
        loop: false,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeInstanceOf(Blob);
    });
  });

  describe('factory helper', () => {
    it('should create independent OverlayPDFProcessor instances', () => {
      const p1 = createOverlayProcessor();
      const p2 = createOverlayProcessor();
      expect(p1).toBeInstanceOf(OverlayPDFProcessor);
      expect(p1).not.toBe(p2);
    });
  });
});
