import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HandwritingInkContrastBoosterProcessor,
  createHandwritingInkContrastBoosterProcessor,
  boostHandwritingInkContrast
} from '@/lib/pdf/processors/handwriting-ink-contrast-booster';

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

describe('HandwritingInkContrastBoosterProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = {
      name: 'ink_signature.png',
      size: 100,
      type: 'image/png',
      arrayBuffer: async () => new ArrayBuffer(100),
    } as any;
  });

  it('should instantiate correctly', () => {
    const processor = createHandwritingInkContrastBoosterProcessor();
    expect(processor).toBeInstanceOf(HandwritingInkContrastBoosterProcessor);
  });

  it('should boost handwriting ink contrast successfully', async () => {
    const result = await boostHandwritingInkContrast([mockFile], {
      threshold: 200,
      contrast: 1.5,
      inkType: 'auto',
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('ink_signature_ink_boosted.png');
  });
});
