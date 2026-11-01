import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BookmarksAutoGeneratorProcessor,
  createBookmarksAutoGeneratorProcessor,
  autoGenerateBookmarks
} from '@/lib/pdf/processors/bookmarks-auto-generator';
import { PDFErrorCode } from '@/types/pdf';

vi.mock('@/lib/pdf/loader', () => {
  const mockPdfjs = {
    getDocument: vi.fn().mockImplementation(() => {
      return {
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn().mockImplementation(async () => {
            return {
              getTextContent: () => Promise.resolve({
                items: [
                  { str: 'Chapter 1: The Beginning', transform: [20, 0, 0, 20, 100, 200] },
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
  };

  const mockPdfLib = {
    PDFName: { of: (n: string) => ({ name: n }) },
    PDFArray: {
      withContext: () => ({
        push: vi.fn(),
      }),
    },
    PDFDict: {
      withContext: () => ({
        set: vi.fn(),
      }),
    },
    PDFNumber: { of: (n: number) => n },
    PDFHexString: { fromText: (t: string) => t },
    PDFDocument: {
      load: vi.fn().mockImplementation(async () => {
        return {
          getPageCount: () => 1,
          getPage: () => mockPage,
          catalog: {
            set: vi.fn(),
          },
          context: {
            obj: (props: any) => props,
            register: (obj: any) => obj,
            lookup: () => ({
              set: vi.fn(),
            }),
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

describe('BookmarksAutoGeneratorProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'plain.pdf',
      size: 100,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should instantiate correctly', () => {
    const processor = createBookmarksAutoGeneratorProcessor();
    expect(processor).toBeInstanceOf(BookmarksAutoGeneratorProcessor);
  });

  it('should auto generate bookmarks and inject successfully', async () => {
    const result = await autoGenerateBookmarks([mockFile], {
      detectStrategy: 'both',
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('plain_bookmarked.pdf');
    expect(result.metadata?.bookmarksAdded).toBe(1);
  });
});
