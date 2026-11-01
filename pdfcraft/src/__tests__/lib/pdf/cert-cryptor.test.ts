import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CertCryptorProcessor,
  createCertCryptorProcessor,
  encryptAndSignCert
} from '@/lib/pdf/processors/cert-cryptor';
import { PDFErrorCode } from '@/types/pdf';

// Mock loader
vi.mock('@/lib/pdf/loader', () => {
  const mockPdfName = {
    of: (name: string) => ({ name, isPDFName: true }),
  };

  const mockPdfString = {
    of: (str: string) => ({ value: str, isPDFString: true }),
  };

  const mockPage = {
    ref: {},
    node: {
      get: vi.fn(),
      set: vi.fn(),
    },
    getWidth: () => 600,
    getHeight: () => 800,
    drawCircle: vi.fn(),
    drawRectangle: vi.fn(),
    drawLine: vi.fn(),
  };

  const mockPdfLib = {
    PDFName: mockPdfName,
    PDFString: mockPdfString,
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    PDFDocument: {
      load: vi.fn().mockImplementation(async () => {
        return {
          getPageCount: () => 3,
          getPage: () => mockPage,
          catalog: {
            get: vi.fn(),
            set: vi.fn(),
          },
          context: {
            obj: (props: any) => props,
            register: (obj: any) => obj,
          },
          encrypt: vi.fn(),
          save: vi.fn().mockResolvedValue(new Uint8Array([4, 4, 4])),
        };
      }),
    },
  };

  return {
    loadPdfLib: vi.fn().mockResolvedValue(mockPdfLib),
  };
});

describe('CertCryptorProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'diploma.pdf',
      size: 300,
      type: 'application/pdf',
      arrayBuffer: async () => new ArrayBuffer(300),
    } as any;
  });

  it('should instantiate cert cryptor processor correctly', () => {
    const processor = createCertCryptorProcessor();
    expect(processor).toBeInstanceOf(CertCryptorProcessor);
  });

  it('should validate empty input files', async () => {
    const processor = createCertCryptorProcessor();
    const result = await processor.process({ files: [], options: {} });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(PDFErrorCode.INVALID_OPTIONS);
  });

  it('should sign and encrypt document with wax seal stamp successfully', async () => {
    const result = await encryptAndSignCert(mockFile, {
      waxColor: 'gold',
      encryptWithCert: true,
      pfxPassword: 'secretpassword',
    });

    expect(result.success).toBe(true);
    expect(result.filename).toBe('diploma_signed.pdf');
    expect(result.metadata?.certified).toBe(true);
    expect(result.metadata?.encrypted).toBe(true);
  });
});
