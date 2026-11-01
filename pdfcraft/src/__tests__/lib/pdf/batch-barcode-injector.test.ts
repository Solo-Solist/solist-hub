import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BatchBarcodeInjectorProcessor,
  createBatchBarcodeInjectorProcessor,
  injectBatchBarcodes
} from '@/lib/pdf/processors/batch-barcode-injector';
import { PDFErrorCode } from '@/types/pdf';

vi.mock('@/lib/pdf/loader', () => {
  const mockPage = {
    drawImage: vi.fn(),
  };

  const mockPdfLib = {
    PDFName: { of: (n: string) => ({ name: n }) },
    PDFDocument: {
      load: vi.fn().mockImplementation(async () => {
        return {
          getPageCount: () => 2,
          getPages: () => [mockPage, mockPage],
          embedPng: vi.fn().mockResolvedValue({}),
          save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        };
      }),
    },
  };

  return {
    loadPdfLib: vi.fn().mockResolvedValue(mockPdfLib),
  };
});

describe('BatchBarcodeInjectorProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'invoice.pdf',
      size: 100,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;

    // Mock HTMLCanvasElement for jsdom
    if (typeof window !== 'undefined' || typeof global !== 'undefined') {
      const mockContext = {
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        putImageData: vi.fn(),
        createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
      };
      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);
      HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      );
    }
  });

  it('should instantiate correctly', () => {
    const processor = createBatchBarcodeInjectorProcessor();
    expect(processor).toBeInstanceOf(BatchBarcodeInjectorProcessor);
  });

  it('should inject barcodes into PDF successfully', async () => {
    const result = await injectBatchBarcodes([mockFile], {
      barcodeType: 'qr',
      value: 'PDFCraft',
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      pages: 'all',
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('invoice_barcoded.pdf');
    expect(result.metadata?.injectedCount).toBe(2);
  });
});
