import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GlobalInvoiceParserProcessor,
  createGlobalInvoiceParserProcessor,
  parseGlobalInvoice
} from '@/lib/pdf/processors/global-invoice-parser';

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
                  { str: 'Total Amount Due' },
                  { str: '$ 150.00' },
                ],
              }),
            };
          }),
        }),
      };
    }),
  };

  const mockPage = {
    getSize: () => ({ width: 595.28, height: 841.89 }),
    drawRectangle: vi.fn(),
    drawText: vi.fn(),
    drawLine: vi.fn(),
  };

  const mockPdfLib = {
    PDFName: { of: (n: string) => ({ name: n }) },
    StandardFonts: { HelveticaBold: 'HelveticaBold', Helvetica: 'Helvetica' },
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    PDFDocument: {
      load: vi.fn().mockImplementation(async () => {
        return {
          getPageCount: () => 1,
          getPage: () => mockPage,
          embedFont: () => 'font',
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

describe('GlobalInvoiceParserProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'invoice_en.pdf',
      size: 100,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should instantiate correctly', () => {
    const processor = createGlobalInvoiceParserProcessor();
    expect(processor).toBeInstanceOf(GlobalInvoiceParserProcessor);
  });

  it('should parse and apply currency exchange stamp successfully', async () => {
    const result = await parseGlobalInvoice([mockFile], {
      targetCurrency: 'CNY',
      exchangeRate: 7.2,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('invoice_en_converted.pdf');
    expect(result.metadata?.originalAmount).toBe(150.0);
    expect(result.metadata?.convertedAmount).toBe(1080.0);
  });
});
