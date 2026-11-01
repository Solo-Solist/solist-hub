import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BatchWatermarkRemoverProcessor,
  createBatchWatermarkRemoverProcessor,
  removeBatchWatermarks
} from '@/lib/pdf/processors/batch-watermark-remover';
import { PDFErrorCode } from '@/types/pdf';

vi.mock('@/lib/pdf/loader', () => {
  const mockContentStream = {
    getUncompressedContents: () => new TextEncoder().encode('(Confidential) Tj'),
    setContent: vi.fn(),
  };

  const mockXObject = {
    keys: () => ['/Im1'],
    get: () => ({
      dict: {
        get: () => 'Image',
      },
    }),
    delete: vi.fn(),
  };

  const mockPage = {
    node: {
      get: vi.fn().mockImplementation((name: any) => {
        if (name.name === 'Contents') return [{}];
        if (name.name === 'Resources') {
          return {
            get: () => mockXObject,
          };
        }
        return null;
      }),
    },
  };

  const mockPdfLib = {
    PDFName: { of: (n: string) => ({ name: n }) },
    PDFStream: class {},
    PDFDict: class {},
    PDFDocument: {
      load: vi.fn().mockImplementation(async () => {
        return {
          getPages: () => [mockPage],
          getPageCount: () => 1,
          context: {
            lookup: (ref: any) => {
              // Return Content Stream or XObject stream based on lookup mock
              if (ref === mockContentStream || typeof ref === 'object') {
                return Object.assign(Object.create(mockContentStream), {
                  dict: { get: () => ({ name: 'Image' }) }
                });
              }
              return null;
            },
          },
          save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        };
      }),
    },
  };

  return {
    loadPdfLib: vi.fn().mockResolvedValue(mockPdfLib),
  };
});

describe('BatchWatermarkRemoverProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'report.pdf',
      size: 100,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should instantiate correctly', () => {
    const processor = createBatchWatermarkRemoverProcessor();
    expect(processor).toBeInstanceOf(BatchWatermarkRemoverProcessor);
  });

  it('should remove watermarks successfully', async () => {
    const result = await removeBatchWatermarks([mockFile], {
      watermarkText: 'Confidential',
      removeImages: true,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('report_watermarked_purged.pdf');
  });
});
