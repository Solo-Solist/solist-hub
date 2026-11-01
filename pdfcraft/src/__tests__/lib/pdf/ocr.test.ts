import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OCRProcessor,
  createOCRProcessor,
  ocrPDF,
  detectFileType,
  preprocessCanvas,
  generateMarkdownOutput,
  generateJsonOutput,
} from '@/lib/pdf/processors/ocr';
import { PDFErrorCode } from '@/types/pdf';

// Mock Tesseract.js
const mockRecognize = vi.fn().mockResolvedValue({
  data: {
    text: 'Hello World 测试中文',
    words: [
      { text: 'Hello', bbox: { x0: 10, y0: 10, x1: 50, y1: 25 } },
      { text: 'World', bbox: { x0: 55, y0: 10, x1: 95, y1: 25 } },
      { text: '测试中文', bbox: { x0: 100, y0: 10, x1: 150, y1: 25 } },
    ],
  },
});

const mockTerminate = vi.fn().mockResolvedValue(undefined);

vi.mock('tesseract.js', () => ({
  default: {
    createWorker: vi.fn().mockImplementation(async (lang, oem, options) => {
      if (options?.logger) {
        options.logger({ status: 'loading tesseract core', progress: 0.5 });
      }
      return {
        recognize: mockRecognize,
        terminate: mockTerminate,
      };
    }),
  },
  createWorker: vi.fn().mockImplementation(async (lang, oem, options) => {
    if (options?.logger) {
      options.logger({ status: 'loading tesseract core', progress: 0.5 });
    }
    return {
      recognize: mockRecognize,
      terminate: mockTerminate,
    };
  }),
}));

// Mock pdf loader
const mockDrawText = vi.fn();
const mockAddPage = vi.fn().mockReturnValue({
  drawText: mockDrawText,
  drawImage: vi.fn(),
});
const mockSave = vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35]));

vi.mock('@/lib/pdf/loader', () => {
  return {
    loadPdfjs: vi.fn().mockImplementation(async () => {
      return {
        getDocument: vi.fn().mockImplementation(() => {
          return {
            promise: Promise.resolve({
              numPages: 1,
              getPage: vi.fn().mockImplementation(async () => {
                return {
                  getViewport: () => ({ width: 600, height: 800 }),
                  render: () => ({
                    promise: Promise.resolve(),
                  }),
                };
              }),
            }),
          };
        }),
      };
    }),
    loadPdfLib: vi.fn().mockImplementation(async () => {
      return {
        PDFDocument: {
          load: vi.fn().mockResolvedValue({
            getPageCount: () => 1,
            getPage: () => ({
              drawText: mockDrawText,
            }),
            embedFont: vi.fn().mockImplementation(async () => ({
              name: 'MockFont',
            })),
            registerFontkit: vi.fn(),
            setTitle: vi.fn(),
            setSubject: vi.fn(),
            setKeywords: vi.fn(),
            save: mockSave,
          }),
          create: vi.fn().mockResolvedValue({
            addPage: mockAddPage,
            embedPng: vi.fn().mockResolvedValue({ width: 400, height: 300 }),
            embedJpg: vi.fn().mockResolvedValue({ width: 400, height: 300 }),
            save: mockSave,
          }),
        },
        StandardFonts: {
          Helvetica: 'Helvetica',
        },
        rgb: vi.fn().mockReturnValue({ r: 0, g: 0, b: 0 }),
      };
    }),
  };
});

describe('OCRProcessor', () => {
  let processor: OCRProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = createOCRProcessor();

    // Mock document.createElement for canvas rendering
    if (typeof document !== 'undefined') {
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return {
            width: 600,
            height: 800,
            getContext: () => ({
              fillStyle: '',
              fillRect: vi.fn(),
              drawImage: vi.fn(),
            }),
            toBlob: (cb: (b: Blob) => void) => {
              cb(new Blob([new Uint8Array([0x89, 0x50, 0x4E, 0x47])], { type: 'image/png' }));
            },
          } as any;
        }
        return origCreateElement(tagName);
      });
    }
  });

  describe('detectFileType', () => {
    it('detects PDF file via magic bytes %PDF-', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]);
      const file = new File([pdfBytes], 'unnamed_file', { type: 'application/octet-stream' });
      const type = await detectFileType(file);
      expect(type).toBe('pdf');
    });

    it('detects PNG image via magic bytes', async () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const file = new File([pngBytes], 'document', { type: 'application/octet-stream' });
      const type = await detectFileType(file);
      expect(type).toBe('image');
    });

    it('detects JPEG image via magic bytes', async () => {
      const jpgBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
      const file = new File([jpgBytes], 'photo', { type: 'application/octet-stream' });
      const type = await detectFileType(file);
      expect(type).toBe('image');
    });

    it('detects WebP image via magic bytes', async () => {
      const webpBytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
      ]);
      const file = new File([webpBytes], 'scan', { type: 'application/octet-stream' });
      const type = await detectFileType(file);
      expect(type).toBe('image');
    });

    it('falls back to file extension or MIME type', async () => {
      const file1 = new File(['mock content'], 'test.pdf', { type: 'application/pdf' });
      expect(await detectFileType(file1)).toBe('pdf');

      const file2 = new File(['mock content'], 'test.jpg', { type: 'image/jpeg' });
      expect(await detectFileType(file2)).toBe('image');

      const file3 = new File(['plain text'], 'test.txt', { type: 'text/plain' });
      expect(await detectFileType(file3)).toBe('unknown');
    });
  });

  describe('Validation', () => {
    it('returns INVALID_OPTIONS error if no files are provided', async () => {
      const result = await processor.process({ files: [], options: {} });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
      expect(result.error?.message).toContain('No PDF or image file found');
    });

    it('returns INVALID_OPTIONS error if multiple files are provided', async () => {
      const file1 = new File(['%PDF-1.4'], 'file1.pdf', { type: 'application/pdf' });
      const file2 = new File(['%PDF-1.4'], 'file2.pdf', { type: 'application/pdf' });
      const result = await processor.process({ files: [file1, file2], options: {} });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
    });

    it('returns FILE_TYPE_INVALID error for unsupported formats', async () => {
      const file = new File(['This is plain text'], 'doc.txt', { type: 'text/plain' });
      const result = await processor.process({ files: [file], options: {} });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(PDFErrorCode.FILE_TYPE_INVALID);
    });
  });

  describe('Processing PDF with OCR', () => {
    it('successfully processes PDF to text output format', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const file = new File([pdfBytes], 'sample.pdf', { type: 'application/pdf' });

      const progressUpdates: number[] = [];
      const result = await processor.process(
        {
          files: [file],
          options: {
            languages: ['eng'],
            outputFormat: 'text',
          },
        },
        (prog) => progressUpdates.push(prog)
      );

      expect(result.success).toBe(true);
      expect(result.filename).toBe('sample_ocr.txt');
      expect(result.result).toBeInstanceOf(Blob);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });

    it('successfully creates searchable PDF and embeds invisible text layer', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const file = new File([pdfBytes], 'scanned_doc.pdf', { type: 'application/pdf' });

      const result = await processor.process({
        files: [file],
        options: {
          languages: ['eng', 'chi_sim'],
          outputFormat: 'searchable-pdf',
        },
      });

      expect(result.success).toBe(true);
      expect(result.filename).toBe('scanned_doc_searchable.pdf');
      expect(result.result).toBeInstanceOf(Blob);
      expect(mockDrawText).toHaveBeenCalled();
    });

    it('supports legacy single language string option', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const file = new File([pdfBytes], 'test.pdf', { type: 'application/pdf' });

      const result = await processor.process({
        files: [file],
        options: {
          language: 'chi_sim',
          outputFormat: 'text',
        } as any,
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.languages).toEqual(['chi_sim']);
    });

    it('processes image file by converting to searchable PDF', async () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const file = new File([pngBytes], 'scan.png', { type: 'image/png' });

      const result = await processor.process({
        files: [file],
        options: {
          languages: ['eng'],
          outputFormat: 'searchable-pdf',
        },
      });

      expect(result.success).toBe(true);
      expect(result.filename).toBe('scan_searchable.pdf');
      expect(result.result).toBeInstanceOf(Blob);
    });

    it('successfully processes PDF to markdown output with metadata stats', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const file = new File([pdfBytes], 'notes.pdf', { type: 'application/pdf' });

      const result = await processor.process({
        files: [file],
        options: {
          languages: ['eng'],
          outputFormat: 'markdown',
        },
      });

      expect(result.success).toBe(true);
      expect(result.filename).toBe('notes_ocr.md');
      expect(result.result).toBeInstanceOf(Blob);
      expect(result.metadata?.totalWords).toBeGreaterThan(0);
      expect(result.metadata?.totalChars).toBeGreaterThan(0);
      expect(result.metadata?.avgConfidence).toBeGreaterThan(0);
    });

    it('successfully processes PDF to structured json output with bounding boxes', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const file = new File([pdfBytes], 'invoice.pdf', { type: 'application/pdf' });

      const result = await processor.process({
        files: [file],
        options: {
          languages: ['eng'],
          outputFormat: 'json',
          enhanceContrast: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.filename).toBe('invoice_ocr.json');
      expect(result.result).toBeInstanceOf(Blob);
    });
  });

  describe('Pre-processing and output generators', () => {
    it('preprocessCanvas gracefully handles canvas without error', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      expect(() => preprocessCanvas(canvas)).not.toThrow();
    });

    it('generateMarkdownOutput formats sections properly', () => {
      const md = generateMarkdownOutput(
        [
          {
            pageNum: 1,
            text: 'First line\nSecond line',
            words: [{ text: 'First' }, { text: 'line' }],
          },
        ],
        'TestDocument.pdf'
      );
      expect(md).toContain('# TestDocument');
      expect(md).toContain('## Page 1');
      expect(md).toContain('First line');
    });

    it('generateJsonOutput creates valid JSON with word bbox and confidence', () => {
      const jsonStr = generateJsonOutput(
        [
          {
            pageNum: 1,
            text: 'Invoice No. 12345',
            words: [
              { text: 'Invoice', confidence: 95, x: 10, y: 20, width: 50, height: 12 },
              { text: '12345', confidence: 98, x: 65, y: 20, width: 40, height: 12 },
            ],
          },
        ],
        {
          fileName: 'invoice.pdf',
          languages: ['eng'],
          totalWords: 2,
          totalChars: 17,
          avgConfidence: 96,
        }
      );
      const parsed = JSON.parse(jsonStr);
      expect(parsed.metadata.fileName).toBe('invoice.pdf');
      expect(parsed.metadata.avgConfidence).toBe(96);
      expect(parsed.pages[0].words[0].text).toBe('Invoice');
      expect(parsed.pages[0].words[0].confidence).toBe(95);
    });
  });

  describe('Convenience ocrPDF function', () => {
    it('executes OCR via helper function', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const file = new File([pdfBytes], 'quick.pdf', { type: 'application/pdf' });

      const result = await ocrPDF(file, { outputFormat: 'text' });
      expect(result.success).toBe(true);
      expect(result.filename).toBe('quick_ocr.txt');
    });
  });
});
