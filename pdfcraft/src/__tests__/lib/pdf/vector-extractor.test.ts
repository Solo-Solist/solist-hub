import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  VectorExtractorProcessor, 
  createVectorExtractorProcessor, 
  extractVectors 
} from '@/lib/pdf/processors/vector-extractor';
import { PDFErrorCode } from '@/types/pdf';

// Mock loader-legacy
vi.mock('@/lib/pdf/loader-legacy', () => {
  const mockSVGElement = {
    removeAttribute: vi.fn(),
    setAttribute: vi.fn(),
    outerHTML: '<svg viewBox="0 0 400 600"><rect width="100%" height="100%" fill="none"/><path d="M10 10 L50 50" stroke="black" stroke-width="2"/></svg>',
  };

  const mockPdfjs = {
    getDocument: vi.fn().mockImplementation(() => {
      return {
        promise: Promise.resolve({
          numPages: 5,
          getPage: vi.fn().mockImplementation(async (pageNum) => {
            return {
              getViewport: () => ({ width: 400, height: 600 }),
              getOperatorList: () => Promise.resolve({}),
              commonObjs: {},
              objs: {},
            };
          }),
        }),
      };
    }),
    SVGGraphics: vi.fn().mockImplementation(() => {
      return {
        getSVG: vi.fn().mockResolvedValue(mockSVGElement),
      };
    }),
  };

  return {
    loadPdfjsLegacy: vi.fn().mockResolvedValue(mockPdfjs),
    loadSVGGraphics: vi.fn().mockResolvedValue(mockPdfjs.SVGGraphics),
  };
});

describe('VectorExtractorProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'sample.pdf',
      size: 100,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should instantiate vector extractor correctly', () => {
    const processor = createVectorExtractorProcessor();
    expect(processor).toBeInstanceOf(VectorExtractorProcessor);
  });

  it('should validate invalid input files', async () => {
    const processor = createVectorExtractorProcessor();
    const result = await processor.process({ files: [], options: {} });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
  });

  it('should compile page rendering operator list and fallback to mock SVG in Node environment', async () => {
    const result = await extractVectors(mockFile, { pageNum: 2, cleanGrid: true });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('sample_page_2.svg');

    const metadata = result.metadata;
    expect(metadata?.pageCount).toBe(5);
    expect(metadata?.targetPage).toBe(2);
    expect(metadata?.width).toBe(400);
    expect(metadata?.height).toBe(600);
    
    // SVG mock fallback assertions
    const svgContent = metadata?.svgContent;
    expect(svgContent).toBeDefined();
    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('viewBox="0 0 400 600"');
    expect(svgContent).toContain('<path d="M10 10 L50 50"');
  });
});
