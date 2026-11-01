import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PdfSpineBookbinderProcessor,
  createPdfSpineBookbinderProcessor,
  designPDFSpine
} from '@/lib/pdf/processors/pdf-spine-bookbinder';

describe('PdfSpineBookbinderProcessor', () => {
  it('should instantiate correctly', () => {
    const processor = createPdfSpineBookbinderProcessor();
    expect(processor).toBeInstanceOf(PdfSpineBookbinderProcessor);
  });

  it('should calculate and design spine layout cover successfully', async () => {
    const result = await designPDFSpine([], {
      pageCount: 120,
      paperGsm: 100,
      coverWidthPt: 595.27,
      coverHeightPt: 841.89,
      bookTitle: 'Binding Book Test',
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('book_cover_spine_layout.pdf');
  });
});
