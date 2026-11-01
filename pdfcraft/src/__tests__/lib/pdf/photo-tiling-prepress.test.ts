import { describe, it, expect, beforeEach } from 'vitest';
import {
  PhotoTilingPrepressProcessor,
  createPhotoTilingPrepressProcessor,
  prepressPhotoTiling
} from '@/lib/pdf/processors/photo-tiling-prepress';

describe('PhotoTilingPrepressProcessor', () => {
  let mockFile: File;

  beforeEach(() => {
    // 1x1 smallest valid transparent PNG image stream
    const minimalPngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
      0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0,
      5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68,
      174, 66, 96, 130
    ]);
    const arrayBuffer = minimalPngBytes.buffer.slice(
      minimalPngBytes.byteOffset,
      minimalPngBytes.byteOffset + minimalPngBytes.byteLength
    ) as ArrayBuffer;

    mockFile = new File([arrayBuffer], 'passport_photo.png', { type: 'image/png' });
    Object.defineProperty(mockFile, 'arrayBuffer', {
      value: async () => arrayBuffer,
      writable: false,
    });
  });

  it('should instantiate correctly', () => {
    const processor = createPhotoTilingPrepressProcessor();
    expect(processor).toBeInstanceOf(PhotoTilingPrepressProcessor);
  });

  it('should arrange photo prepress layout matrix successfully', async () => {
    const result = await prepressPhotoTiling([mockFile], {
      photoSpec: '1-inch',
      paperSize: '6-inch',
      gapPt: 8,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe('prepress_photo_tiled_layout.pdf');
  });
});
