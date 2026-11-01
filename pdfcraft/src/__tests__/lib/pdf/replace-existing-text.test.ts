import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  replaceExistingText,
} from '@/lib/pdf/processors/replace-existing-text';
import type { TextMatch } from '@/lib/pdf/processors/find-and-redact';
import { loadPyMuPDF } from '@/lib/pdf/pymupdf-loader';

vi.mock('@/lib/pdf/pymupdf-loader', () => ({
  loadPyMuPDF: vi.fn(),
}));

const matches: TextMatch[] = [
  {
    page: 1,
    text: 'Original',
    x: 10,
    y: 20,
    width: 50,
    height: 12,
    id: 'first',
    selected: true,
  },
  {
    page: 2,
    text: 'Original',
    x: 15,
    y: 25,
    width: 50,
    height: 12,
    id: 'second',
    selected: false,
  },
];

describe('replaceExistingText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes only selected coordinates to the local PyMuPDF engine', async () => {
    const output = new Blob(['edited'], { type: 'application/pdf' });
    const diagnostics = {
      usedFallbackFont: false,
      overflowDetected: false,
      hasDigitalSignatures: false,
    };
    const replaceExistingTextMock = vi.fn().mockResolvedValue({
      blob: output,
      diagnostics,
    });
    vi.mocked(loadPyMuPDF).mockResolvedValue({
      replaceExistingText: replaceExistingTextMock,
    });
    const file = new File(['pdf'], 'sample.pdf', { type: 'application/pdf' });

    const result = await replaceExistingText(file, matches, {
      replacementText: 'Updated',
      selectedMatchIds: ['first'],
    });

    expect(result).toEqual({
      success: true,
      result: output,
      replacedCount: 1,
      diagnostics,
    });
    expect(replaceExistingTextMock).toHaveBeenCalledWith(
      file,
      [{ page: 1, x: 10, y: 20, width: 50, height: 12 }],
      'Updated',
      'preserve'
    );
  });

  it('passes the requested overflow strategy to the engine', async () => {
    const output = new Blob(['edited'], { type: 'application/pdf' });
    const diagnostics = {
      usedFallbackFont: true,
      overflowDetected: true,
      hasDigitalSignatures: true,
    };
    const replaceExistingTextMock = vi.fn().mockResolvedValue({
      blob: output,
      diagnostics,
    });
    vi.mocked(loadPyMuPDF).mockResolvedValue({
      replaceExistingText: replaceExistingTextMock,
    });

    const result = await replaceExistingText(
      new File(['pdf'], 'sample.pdf', { type: 'application/pdf' }),
      matches,
      {
        replacementText: 'A much longer replacement',
        selectedMatchIds: ['first'],
        fitMode: 'shrink',
      }
    );

    expect(replaceExistingTextMock).toHaveBeenCalledWith(
      expect.any(File),
      [{ page: 1, x: 10, y: 20, width: 50, height: 12 }],
      'A much longer replacement',
      'shrink'
    );
    expect(result.diagnostics).toEqual(diagnostics);
  });

  it('rejects an empty selection without loading the PDF engine', async () => {
    const file = new File(['pdf'], 'sample.pdf', { type: 'application/pdf' });

    const result = await replaceExistingText(file, matches, {
      replacementText: 'Updated',
      selectedMatchIds: ['missing'],
    });

    expect(result.success).toBe(false);
    expect(result.replacedCount).toBe(0);
    expect(loadPyMuPDF).not.toHaveBeenCalled();
  });

  it('reports engine errors without returning a partial PDF', async () => {
    vi.mocked(loadPyMuPDF).mockResolvedValue({
      replaceExistingText: vi.fn().mockRejectedValue(new Error('WASM failed')),
    });
    const file = new File(['pdf'], 'sample.pdf', { type: 'application/pdf' });

    const result = await replaceExistingText(file, matches, {
      replacementText: 'Updated',
    });

    expect(result).toEqual({
      success: false,
      replacedCount: 0,
      error: 'WASM failed',
    });
  });
});
