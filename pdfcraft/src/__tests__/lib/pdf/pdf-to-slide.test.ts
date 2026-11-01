import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PDFToSlideProcessor,
  createPDFToSlideProcessor,
  reconstructPDFToSlide
} from '@/lib/pdf/processors/pdf-to-slide';
import { PDFErrorCode } from '@/types/pdf';

// Mock loader for PDFJS
vi.mock('@/lib/pdf/loader', () => {
  const mockTextContent = {
    items: [
      { str: 'Introduction to Artificial Intelligence', transform: [1, 0, 0, 24, 50, 700] },
      { str: 'Neural Networks are powerful models.', transform: [1, 0, 0, 12, 50, 600] },
      { str: 'Deep learning requires large datasets.', transform: [1, 0, 0, 12, 50, 580] },
    ],
  };

  const mockPage = {
    getTextContent: vi.fn().mockResolvedValue(mockTextContent),
  };

  const mockPdfjs = {
    getDocument: vi.fn().mockImplementation(() => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn().mockResolvedValue(mockPage),
      }),
    })),
  };

  return {
    loadPdfjs: vi.fn().mockResolvedValue(mockPdfjs),
  };
});

describe('PDFToSlideProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'paper.pdf',
      size: 1024,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(1024),
    } as any;
  });

  it('should instantiate slide reconstructor correctly', () => {
    const processor = createPDFToSlideProcessor();
    expect(processor).toBeInstanceOf(PDFToSlideProcessor);
  });

  it('should validate invalid input files', async () => {
    const processor = createPDFToSlideProcessor();
    const result = await processor.process({ files: [], options: {} });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
  });

  it('should reconstruct slide presentation outline and generate OOXML PPTX file successfully', async () => {
    const result = await reconstructPDFToSlide(mockFile, {
      themeColor: '#6366f1',
    });

    expect(result.success).toBe(true);
    expect(result.filename).toBe('paper.pptx');
    
    const metadata = result.metadata as any;
    expect(metadata?.pageCount).toBe(2);
    expect(metadata?.slides).toBeDefined();
    expect(metadata?.slides.length).toBe(2);
    
    // Check first slide title extracted by largest font heuristic
    expect(metadata?.slides[0].title).toContain('Introduction to Artificial Intelligence');
    expect(metadata?.slides[0].bullets[0]).toContain('Neural Networks are powerful models.');
  });
});
