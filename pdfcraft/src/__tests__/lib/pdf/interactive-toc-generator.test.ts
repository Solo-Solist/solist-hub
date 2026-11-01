import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InteractiveTocGeneratorProcessor,
  createInteractiveTocGeneratorProcessor,
  generateInteractiveToc
} from '@/lib/pdf/processors/interactive-toc-generator';

vi.mock('@/lib/pdf/loader', () => {
  const mockPdfjs = {
    getDocument: vi.fn().mockImplementation(() => {
      return {
        promise: Promise.resolve({
          numPages: 2,
          getPage: vi.fn().mockImplementation(async () => {
            return {
              getTextContent: () => Promise.resolve({
                items: [
                  { str: 'Chapter 1: Foundations', transform: [20, 0, 0, 20, 100, 200] },
                ],
              }),
            };
          }),
        }),
      };
    }),
  };

  const mockPage = {
    ref: {},
    getSize: () => ({ width: 595.28, height: 841.89 }),
    drawRectangle: vi.fn(),
    drawText: vi.fn(),
    drawLine: vi.fn(),
    node: {
      get: vi.fn(),
      set: vi.fn(),
    },
  };

  const mockPdfLib = {
    PDFName: { of: (n: string) => ({ name: n }) },
    PDFArray: class {},
    PDFDict: class {},
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    StandardFonts: {
      Helvetica: 'Helvetica',
      HelveticaBold: 'Helvetica-Bold',
    },
    PDFDocument: {
      load: vi.fn().mockImplementation(async () => {
        return {
          getPageCount: () => 2,
          getPages: () => [mockPage, mockPage, mockPage],
          getPage: () => mockPage,
          insertPage: () => mockPage,
          embedFont: () => ({
            widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.6,
          }),
          context: {
            obj: (props: any) => props,
            register: (obj: any) => obj,
          },
          save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        };
      }),
    },
  };

  return {
    loadPdfjs: vi.fn().mockResolvedValue(mockPdfjs),
    loadPdfLib: vi.fn().mockResolvedValue(mockPdfLib),
  };
});

describe('InteractiveTocGeneratorProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'book.pdf',
      size: 100,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should instantiate correctly', () => {
    const processor = createInteractiveTocGeneratorProcessor();
    expect(processor).toBeInstanceOf(InteractiveTocGeneratorProcessor);
  });

  it('should generate interactive TOC page successfully', async () => {
    const result = await generateInteractiveToc([mockFile], {
      title: 'TOC Index',
      insertIndex: 0,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('book_toc_interactive.pdf');
    expect(result.metadata?.tocEntries).toBe(2); // 2 pages * 1 heading each
  });
});
