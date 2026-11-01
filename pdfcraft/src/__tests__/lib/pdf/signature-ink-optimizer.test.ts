import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SignatureInkOptimizerProcessor,
  createSignatureInkOptimizerProcessor,
  optimizeSignatureInk
} from '@/lib/pdf/processors/signature-ink-optimizer';

// Setup Mock global browser APIs for canvas
if (typeof window === 'undefined') {
  (global as any).window = {};
}

const mockCanvas = {
  width: 100,
  height: 100,
  getContext: () => ({
    drawImage: vi.fn(),
    getImageData: () => ({
      data: new Uint8ClampedArray(40000), // 100x100x4 pixels
    }),
    putImageData: vi.fn(),
  }),
  toBlob: vi.fn().mockImplementation((callback) => callback(new Blob())),
};

(global as any).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return mockCanvas;
    return {};
  },
};

(global as any).createImageBitmap = vi.fn().mockResolvedValue({
  width: 100,
  height: 100,
});

describe('SignatureInkOptimizerProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'signature.png',
      size: 100,
      type: 'image/png',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should instantiate correctly', () => {
    const processor = createSignatureInkOptimizerProcessor();
    expect(processor).toBeInstanceOf(SignatureInkOptimizerProcessor);
  });

  it('should optimize and purify ink signatures successfully', async () => {
    const result = await optimizeSignatureInk([mockFile], {
      threshold: 200,
      inkType: 'auto',
      contrast: 1.5,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('signature_ink_purified.png');
  });
});
