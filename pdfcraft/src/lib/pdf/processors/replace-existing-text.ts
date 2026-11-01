import { loadPyMuPDF } from '../pymupdf-loader';
import {
  searchTextInPDF,
  type ProgressCallback,
  type SearchOptions,
  type TextMatch,
} from './find-and-redact';

export interface ReplaceExistingTextResult {
  success: boolean;
  result?: Blob;
  replacedCount: number;
  diagnostics?: ReplaceExistingTextDiagnostics;
  error?: string;
}

export type TextFitMode = 'preserve' | 'shrink' | 'expand';

export interface ReplaceExistingTextDiagnostics {
  usedFallbackFont: boolean;
  overflowDetected: boolean;
  hasDigitalSignatures: boolean;
}

export interface ReplaceExistingTextOptions {
  replacementText: string;
  selectedMatchIds?: string[];
  fitMode?: TextFitMode;
}

export async function findExistingText(
  file: File,
  searchTerm: string,
  options: Omit<SearchOptions, 'searchTerm' | 'searchTerms'> = {
    caseSensitive: false,
    useRegex: false,
    wholeWord: false,
  },
  onProgress?: ProgressCallback
) {
  return searchTextInPDF(
    file,
    {
      searchTerm,
      caseSensitive: options.caseSensitive,
      useRegex: options.useRegex,
      wholeWord: options.wholeWord,
    },
    onProgress
  );
}

export async function replaceExistingText(
  file: File,
  matches: TextMatch[],
  options: ReplaceExistingTextOptions,
  onProgress?: ProgressCallback
): Promise<ReplaceExistingTextResult> {
  const selectedMatches = options.selectedMatchIds?.length
    ? matches.filter((match) => options.selectedMatchIds!.includes(match.id))
    : matches.filter((match) => match.selected);

  if (!file) {
    return { success: false, replacedCount: 0, error: 'No PDF file was provided.' };
  }
  if (selectedMatches.length === 0) {
    return { success: false, replacedCount: 0, error: 'No text matches were selected.' };
  }

  try {
    onProgress?.(5, 'Loading the local PDF engine…');
    const pymupdf = await loadPyMuPDF();
    onProgress?.(35, 'Removing the selected text…');

    const engineResult = await pymupdf.replaceExistingText(
      file,
      selectedMatches.map(({ page, x, y, width, height }) => ({
        page,
        x,
        y,
        width,
        height,
      })),
      options.replacementText,
      options.fitMode ?? 'preserve'
    );

    onProgress?.(100, 'Replacement complete.');
    return {
      success: true,
      result: engineResult.blob,
      replacedCount: selectedMatches.length,
      diagnostics: engineResult.diagnostics,
    };
  } catch (error) {
    return {
      success: false,
      replacedCount: 0,
      error: error instanceof Error ? error.message : 'Unable to replace the selected text.',
    };
  }
}
