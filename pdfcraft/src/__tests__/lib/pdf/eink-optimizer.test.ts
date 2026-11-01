import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EinkOptimizerProcessor,
  createEinkOptimizerProcessor,
  optimizeEink
} from '@/lib/pdf/processors/eink-optimizer';
import { PDFErrorCode } from '@/types/pdf';

// Mock loader
vi.mock('@/lib/pdf/loader', () => {
  const mockPage = {
    getViewport: () => ({ width: 100, height: 150 }),
    render: () => ({ promise: Promise.resolve() }),
  };

  const mockPdfjs = {
    getDocument: vi.fn().mockImplementation(() => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      }),
    })),
  };

  const mockPdfLib = {
    PDFDocument: {
      load: vi.fn().mockImplementation(async () => {
        return {
          getPageCount: () => 1,
          copyPages: vi.fn().mockImplementation(async () => [{}]),
        };
      }),
      create: vi.fn().mockImplementation(async () => {
        return {
          addPage: vi.fn().mockImplementation(() => ({
            drawImage: vi.fn(),
          })),
          copyPages: vi.fn().mockImplementation(async () => [{}]),
          embedJpg: vi.fn().mockResolvedValue({}),
          save: vi.fn().mockResolvedValue(new Uint8Array([7, 7, 7])),
        };
      }),
    },
  };

  return {
    loadPdfjs: vi.fn().mockResolvedValue(mockPdfjs),
    loadPdfLib: vi.fn().mockResolvedValue(mockPdfLib),
  };
});

describe('EinkOptimizerProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'gray_scan.pdf',
      size: 400,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(400),
    } as any;
  });

  it('should instantiate eink optimizer processor correctly', () => {
    const processor = createEinkOptimizerProcessor();
    expect(processor).toBeInstanceOf(EinkOptimizerProcessor);
  });

  it('should validate invalid input files', async () => {
    const processor = createEinkOptimizerProcessor();
    const result = await processor.process({ files: [], options: {} });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
  });

  it('should optimize scanned documents for e-Ink contrast successfully (bypass in non-browser test environment)', async () => {
    const result = await optimizeEink(mockFile, {
      contrastOffset: 10,
      dilationAmount: 1,
    });

    expect(result.success).toBe(true);
    expect(result.filename).toBe('gray_scan_eink.pdf');
    expect(result.metadata?.pageCount).toBe(1);
  });
});
