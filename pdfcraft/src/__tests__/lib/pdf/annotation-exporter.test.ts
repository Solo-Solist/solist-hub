import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AnnotationExporterProcessor,
  createAnnotationExporterProcessor,
  exportAnnotations
} from '@/lib/pdf/processors/annotation-exporter';
import { PDFErrorCode } from '@/types/pdf';

vi.mock('@/lib/pdf/loader', () => {
  const mockPdfjs = {
    getDocument: vi.fn().mockImplementation(() => {
      return {
        promise: Promise.resolve({
          numPages: 2,
          getPage: vi.fn().mockImplementation(async (pageNum) => {
            return {
              getAnnotations: () => Promise.resolve([
                { subtype: 'Highlight', contents: 'This is highlight', color: [1, 1, 0] },
                { subtype: 'Text', contents: 'This is note', title: 'User' },
              ]),
            };
          }),
        }),
      };
    }),
  };

  return {
    loadPdfjs: vi.fn().mockResolvedValue(mockPdfjs),
  };
});

describe('AnnotationExporterProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'notes.pdf',
      size: 100,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should instantiate correctly', () => {
    const processor = createAnnotationExporterProcessor();
    expect(processor).toBeInstanceOf(AnnotationExporterProcessor);
  });

  it('should extract annotations successfully as MD', async () => {
    const result = await exportAnnotations([mockFile], { format: 'md' });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('notes_annotations.md');
    expect(result.metadata?.annotationCount).toBe(4); // 2 pages * 2 annots
  });
});
