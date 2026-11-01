import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  AIPDFReflowerProcessor, 
  createAIPDFReflowerProcessor, 
  reflowPDF 
} from '@/lib/pdf/processors/ai-pdf-reflower';
import { PDFErrorCode } from '@/types/pdf';

// Mock the pdf loader
vi.mock('@/lib/pdf/loader', () => {
  return {
    loadPdfjs: vi.fn().mockImplementation(async () => {
      return {
        getDocument: vi.fn().mockImplementation(() => {
          return {
            promise: Promise.resolve({
              numPages: 2,
              getPage: vi.fn().mockImplementation(async (pageNum) => {
                // Mock layout content
                if (pageNum === 1) {
                  // Single Column page
                  return {
                    getViewport: () => ({ width: 600, height: 800 }),
                    getTextContent: async () => ({
                      items: [
                        { str: 'First Title Paragraph', transform: [15, 0, 0, 15, 50, 750], width: 200, height: 15 },
                        { str: 'Standard paragraph line one.', transform: [10, 0, 0, 10, 50, 700], width: 150, height: 10 },
                        { str: 'Formula \\sum_{i=1}^n x_i represents math.', transform: [10, 0, 0, 10, 50, 650], width: 220, height: 10 },
                      ],
                    }),
                  };
                } else {
                  // Dual Column page
                  return {
                    getViewport: () => ({ width: 600, height: 800 }),
                    getTextContent: async () => ({
                      items: [
                        // Left column
                        { str: 'Left column first line', transform: [10, 0, 0, 10, 50, 700], width: 100, height: 10 },
                        { str: 'Left column second line', transform: [10, 0, 0, 10, 50, 680], width: 100, height: 10 },
                        // Right column
                        { str: 'Right column first line', transform: [10, 0, 0, 10, 350, 700], width: 100, height: 10 },
                        { str: 'Right column second line', transform: [10, 0, 0, 10, 350, 680], width: 100, height: 10 },
                      ],
                    }),
                  };
                }
              }),
            }),
          };
        }),
      };
    }),
  };
});

describe('AIPDFReflowerProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'sample.pdf',
      size: 100,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should create independent processor instances', () => {
    const p1 = createAIPDFReflowerProcessor();
    const p2 = createAIPDFReflowerProcessor();
    expect(p1).toBeInstanceOf(AIPDFReflowerProcessor);
    expect(p1).not.toBe(p2);
  });

  it('should return error if no files are provided', async () => {
    const processor = createAIPDFReflowerProcessor();
    const result = await processor.process({ files: [], options: {} });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
  });

  it('should return error if multiple files are provided', async () => {
    const processor = createAIPDFReflowerProcessor();
    const file2 = new File([new ArrayBuffer(50)], 'sample2.pdf', { type: 'application/pdf' });
    const result = await processor.process({ files: [mockFile, file2], options: {} });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
  });

  it('should correctly reflow single-column text and LaTeX formulas', async () => {
    const result = await reflowPDF(mockFile, { exportFormat: 'json' });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('sample_reflowed.json');

    const metadata = result.metadata as any;
    expect(metadata?.pageCount).toBe(2);
    
    const paragraphs = metadata?.paragraphs;
    expect(paragraphs).toBeDefined();
    
    // First paragraph (Title)
    expect(paragraphs[0].text).toBe('First Title Paragraph');
    expect(paragraphs[0].pageNum).toBe(1);

    // Second paragraph should contain the LaTeX MathJax formatting
    const mathPara = paragraphs.find((p: any) => p.text.includes('$'));
    expect(mathPara).toBeDefined();
    expect(mathPara.text).toContain('$Formula \\sum_{i=1}^n x_i represents math.$');
  });

  it('should export to Markdown format correctly', async () => {
    const result = await reflowPDF(mockFile, { exportFormat: 'markdown' });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('sample_reflowed.md');
    
    // Assert blob type is markdown
    expect(result.result).toBeInstanceOf(Blob);
    expect((result.result as Blob).type).toContain('markdown');
  });

  it('should export to EPUB format correctly', async () => {
    const result = await reflowPDF(mockFile, { exportFormat: 'epub' });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('sample_reflowed.epub');
    
    expect(result.result).toBeInstanceOf(Blob);
    expect((result.result as Blob).type).toContain('epub');
  });
});
