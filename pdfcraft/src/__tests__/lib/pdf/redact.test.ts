/**
 * Unit Tests for Redact PDF Processor
 * Requirements: 5.1
 * 
 * Tests redaction functionality including validation and area processing.
 */

import { describe, it, expect, vi } from 'vitest';
import { 
  validateRedactionAreas,
  applySolidFill,
  applyPixelate,
  applyBlur,
  renderRedactionAreaOnCanvas,
  renderBrushOnCanvas,
  redactPDF,
  type RedactionArea,
} from '@/lib/pdf/processors/redact';

describe('Redact Processor', () => {
  describe('validateRedactionAreas', () => {
    it('returns invalid when no areas are provided', () => {
      const result = validateRedactionAreas([], 5);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No redaction areas specified');
    });

    it('returns valid for correct areas', () => {
      const areas: RedactionArea[] = [
        { page: 1, x: 100, y: 200, width: 150, height: 50 },
        { page: 2, x: 50, y: 100, width: 200, height: 30 },
      ];

      const result = validateRedactionAreas(areas, 5);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects invalid page numbers - page 0', () => {
      const areas: RedactionArea[] = [
        { page: 0, x: 100, y: 200, width: 150, height: 50 },
      ];

      const result = validateRedactionAreas(areas, 5);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('page number'))).toBe(true);
    });

    it('detects invalid page numbers - page exceeds count', () => {
      const areas: RedactionArea[] = [
        { page: 10, x: 50, y: 100, width: 200, height: 30 },
      ];

      const result = validateRedactionAreas(areas, 5);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('page number'))).toBe(true);
    });

    it('detects negative width', () => {
      const areas: RedactionArea[] = [
        { page: 1, x: 100, y: 200, width: -50, height: 50 },
      ];

      const result = validateRedactionAreas(areas, 5);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Width'))).toBe(true);
    });

    it('detects negative height', () => {
      const areas: RedactionArea[] = [
        { page: 1, x: 100, y: 200, width: 50, height: -50 },
      ];

      const result = validateRedactionAreas(areas, 5);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Height'))).toBe(true);
    });

    it('detects negative x coordinate', () => {
      const areas: RedactionArea[] = [
        { page: 1, x: -100, y: 200, width: 50, height: 50 },
      ];

      const result = validateRedactionAreas(areas, 5);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('X coordinate'))).toBe(true);
    });

    it('detects negative y coordinate', () => {
      const areas: RedactionArea[] = [
        { page: 1, x: 100, y: -200, width: 50, height: 50 },
      ];

      const result = validateRedactionAreas(areas, 5);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Y coordinate'))).toBe(true);
    });

    it('reports multiple errors for multiple invalid areas', () => {
      const areas: RedactionArea[] = [
        { page: 0, x: -100, y: -200, width: -50, height: -50 },
      ];

      const result = validateRedactionAreas(areas, 5);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('Canvas Pixel Operations', () => {
    it('applies solid fill to canvas context', () => {
      const fillRectMock = vi.fn();
      const fillTextMock = vi.fn();
      const saveMock = vi.fn();
      const restoreMock = vi.fn();

      const mockCtx = {
        save: saveMock,
        restore: restoreMock,
        fillRect: fillRectMock,
        fillText: fillTextMock,
        fillStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        canvas: { width: 200, height: 200 },
      } as unknown as CanvasRenderingContext2D;

      applySolidFill(mockCtx, 10, 20, 50, 60, '#000000', 'REDACTED');

      expect(saveMock).toHaveBeenCalled();
      expect(restoreMock).toHaveBeenCalled();
      expect(fillRectMock).toHaveBeenCalledWith(10, 20, 50, 60);
      expect(fillTextMock).toHaveBeenCalledWith('REDACTED', 35, 50, 46);
    });

    it('applies pixelate / mosaic to image data', () => {
      const width = 20;
      const height = 20;
      const buffer = new Uint8ClampedArray(width * height * 4);
      // Fill with gradient
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = (i / 4) % 255;
        buffer[i + 1] = 100;
        buffer[i + 2] = 150;
        buffer[i + 3] = 255;
      }

      const mockImageData = {
        data: buffer,
        width,
        height,
      } as ImageData;

      const getImageDataMock = vi.fn(() => mockImageData);
      const putImageDataMock = vi.fn();

      const mockCtx = {
        canvas: { width: 100, height: 100 },
        getImageData: getImageDataMock,
        putImageData: putImageDataMock,
      } as unknown as CanvasRenderingContext2D;

      applyPixelate(mockCtx, 0, 0, 20, 20, 5);

      expect(getImageDataMock).toHaveBeenCalled();
      expect(putImageDataMock).toHaveBeenCalledWith(mockImageData, 0, 0);
    });

    it('applies blur to image data', () => {
      const width = 20;
      const height = 20;
      const buffer = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 200;
        buffer[i + 1] = 100;
        buffer[i + 2] = 50;
        buffer[i + 3] = 255;
      }

      const mockImageData = {
        data: buffer,
        width,
        height,
      } as ImageData;

      const getImageDataMock = vi.fn(() => mockImageData);
      const putImageDataMock = vi.fn();

      const mockCtx = {
        canvas: { width: 100, height: 100 },
        getImageData: getImageDataMock,
        putImageData: putImageDataMock,
      } as unknown as CanvasRenderingContext2D;

      applyBlur(mockCtx, 0, 0, 20, 20, 4);

      expect(getImageDataMock).toHaveBeenCalled();
      expect(putImageDataMock).toHaveBeenCalledWith(mockImageData, 0, 0);
    });

    it('renderRedactionAreaOnCanvas dispatches correct style operations', () => {
      const fillRectMock = vi.fn();
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: fillRectMock,
        fillText: vi.fn(),
        fillStyle: '',
        canvas: { width: 500, height: 500 },
      } as unknown as CanvasRenderingContext2D;

      const blackoutArea: RedactionArea = {
        page: 1,
        x: 10,
        y: 10,
        width: 100,
        height: 50,
        pageWidth: 500,
        pageHeight: 500,
        style: 'blackout',
      };

      renderRedactionAreaOnCanvas(mockCtx, blackoutArea, 500, 500);
      expect(fillRectMock).toHaveBeenCalledWith(10, 10, 100, 50);

      const whiteoutArea: RedactionArea = {
        page: 1,
        x: 20,
        y: 30,
        width: 60,
        height: 40,
        pageWidth: 500,
        pageHeight: 500,
        style: 'whiteout',
      };

      renderRedactionAreaOnCanvas(mockCtx, whiteoutArea, 500, 500);
      expect(fillRectMock).toHaveBeenCalledWith(20, 30, 60, 40);
    });

    it('exports redactPDF function for processor execution', () => {
      expect(typeof redactPDF).toBe('function');
    });

    it('validates brush areas properly', () => {
      const validBrushArea: RedactionArea = {
        type: 'brush',
        page: 1,
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        strokeWidth: 20,
        path: [
          { x: 10, y: 10 },
          { x: 50, y: 50 },
        ],
      };
      const validResult = validateRedactionAreas([validBrushArea], 2);
      expect(validResult.valid).toBe(true);

      const emptyPathArea: RedactionArea = {
        type: 'brush',
        page: 1,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        path: [],
      };
      const emptyResult = validateRedactionAreas([emptyPathArea], 2);
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.errors.some((e) => e.includes('Brush path cannot be empty'))).toBe(true);

      const invalidWidthArea: RedactionArea = {
        type: 'brush',
        page: 1,
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        strokeWidth: -5,
        path: [{ x: 10, y: 10 }],
      };
      const invalidWidthResult = validateRedactionAreas([invalidWidthArea], 2);
      expect(invalidWidthResult.valid).toBe(false);
      expect(invalidWidthResult.errors.some((e) => e.includes('stroke width must be positive'))).toBe(true);
    });

    it('renderBrushOnCanvas draws stroke on canvas context', () => {
      const beginPathMock = vi.fn();
      const moveToMock = vi.fn();
      const lineToMock = vi.fn();
      const strokeMock = vi.fn();
      const saveMock = vi.fn();
      const restoreMock = vi.fn();

      const mockCtx = {
        save: saveMock,
        restore: restoreMock,
        beginPath: beginPathMock,
        moveTo: moveToMock,
        lineTo: lineToMock,
        stroke: strokeMock,
        arc: vi.fn(),
        fill: vi.fn(),
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
        canvas: { width: 400, height: 400 },
      } as unknown as CanvasRenderingContext2D;

      const brushArea: RedactionArea = {
        type: 'brush',
        page: 1,
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        strokeWidth: 24,
        style: 'blackout',
        path: [
          { x: 10, y: 10 },
          { x: 50, y: 80 },
          { x: 90, y: 40 },
        ],
      };

      renderBrushOnCanvas(mockCtx, brushArea, 400, 400);

      expect(saveMock).toHaveBeenCalled();
      expect(beginPathMock).toHaveBeenCalled();
      expect(moveToMock).toHaveBeenCalledWith(10, 10);
      expect(lineToMock).toHaveBeenCalledWith(50, 80);
      expect(lineToMock).toHaveBeenCalledWith(90, 40);
      expect(strokeMock).toHaveBeenCalled();
      expect(restoreMock).toHaveBeenCalled();
      expect(mockCtx.strokeStyle).toBe('#000000');
    });

    it('renderRedactionAreaOnCanvas delegates to brush rendering when type is brush', () => {
      const beginPathMock = vi.fn();
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: beginPathMock,
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
        canvas: { width: 500, height: 500 },
      } as unknown as CanvasRenderingContext2D;

      const brushArea: RedactionArea = {
        type: 'brush',
        page: 1,
        x: 20,
        y: 30,
        width: 50,
        height: 50,
        strokeWidth: 15,
        style: 'whiteout',
        path: [
          { x: 20, y: 30 },
          { x: 40, y: 60 },
        ],
      };

      renderRedactionAreaOnCanvas(mockCtx, brushArea, 500, 500);
      expect(beginPathMock).toHaveBeenCalled();
      expect(mockCtx.strokeStyle).toBe('#ffffff');
    });
  });
});
