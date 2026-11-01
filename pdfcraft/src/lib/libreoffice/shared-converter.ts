/**
 * Shared LibreOffice converter loader for document-to-PDF processors.
 * Resets the init promise on failure so retries (e.g. workflow nodes) can recover.
 */

import type { LibreOfficeConverter, ProgressCallback } from './converter';
import { isCrossOriginIsolated } from '@/lib/utils/cross-origin-isolated';

let converterPromise: Promise<LibreOfficeConverter> | null = null;
let converterInstance: LibreOfficeConverter | null = null;
let libreOfficeFailed = false;

export function isLibreOfficeFailed(): boolean {
  return libreOfficeFailed;
}

export function isLibreOfficeReady(): boolean {
  return converterInstance?.isReady() === true;
}

export function resetLibreOfficeState(): void {
  converterPromise = null;
  converterInstance = null;
  libreOfficeFailed = false;
}

export async function getSharedLibreOfficeConverter(
  onProgress?: (percent: number, message: string) => void
): Promise<LibreOfficeConverter> {
  const { getLibreOfficeConverter } = await import('./converter');
  const instance = getLibreOfficeConverter();
  if (instance.isReady()) {
    converterInstance = instance;
    libreOfficeFailed = false;
    return instance;
  }

  if (converterInstance?.isReady()) {
    libreOfficeFailed = false;
    return converterInstance;
  }

  if (!converterPromise) {
    converterPromise = (async () => {
      await instance.initialize((progress) => {
        onProgress?.(progress.percent, progress.message);
      });
      converterInstance = instance;
      libreOfficeFailed = false;
      return instance;
    })().catch((error) => {
      converterPromise = null;
      converterInstance = null;
      libreOfficeFailed = true;
      throw error;
    });
  }

  try {
    return await converterPromise;
  } catch (error) {
    converterPromise = null;
    converterInstance = null;
    libreOfficeFailed = true;
    throw error;
  }
}

/** Tool IDs that require LibreOffice WASM */
export const LIBREOFFICE_TOOL_IDS = new Set([
  'word-to-pdf',
  'excel-to-pdf',
  'pptx-to-pdf',
  'ppt-to-pdf',
  'rtf-to-pdf',
]);

export async function preloadLibreOfficeConverter(
  onProgress?: ProgressCallback
): Promise<void> {
  if (!isCrossOriginIsolated()) {
    return;
  }
  await getSharedLibreOfficeConverter((percent, message) => {
    onProgress?.({ phase: 'loading', percent, message });
  });
}
