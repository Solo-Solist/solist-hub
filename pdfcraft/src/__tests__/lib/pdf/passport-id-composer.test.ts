import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PassportIdComposerProcessor,
  createPassportIdComposerProcessor,
  composePassportId
} from '@/lib/pdf/processors/passport-id-composer';
import { PDFErrorCode } from '@/types/pdf';

vi.mock('@/lib/pdf/loader', () => {
  const mockPage = {
    drawPage: vi.fn(),
    drawImage: vi.fn(),
    drawText: vi.fn(),
  };

  const mockPdfLib = {
    PDFName: { of: (n: string) => n },
    StandardFonts: { Helvetica: 'Helvetica' },
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    degrees: (d: number) => d,
    PDFDocument: {
      create: vi.fn().mockImplementation(async () => {
        return {
          addPage: () => mockPage,
          embedFont: () => 'font',
          embedPages: () => [{}],
          embedJpg: vi.fn().mockResolvedValue({}),
          embedPng: vi.fn().mockResolvedValue({}),
          save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        };
      }),
      load: vi.fn().mockImplementation(async () => {
        return {
          getPageCount: () => 1,
          getPage: () => mockPage,
        };
      }),
    },
  };

  return {
    loadPdfLib: vi.fn().mockResolvedValue(mockPdfLib),
  };
});

describe('PassportIdComposerProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'front.jpg',
      size: 100,
      type: 'image/jpeg',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should instantiate correctly', () => {
    const processor = createPassportIdComposerProcessor();
    expect(processor).toBeInstanceOf(PassportIdComposerProcessor);
  });

  it('should compose double sided cards successfully', async () => {
    const result = await composePassportId([mockFile], {
      watermarkText: 'FOR TEST ONLY',
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('passport_id_composite.pdf');
  });
});
