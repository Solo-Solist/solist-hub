/**
 * Detect whether the page can use SharedArrayBuffer (LibreOffice WASM, etc.).
 */
export function isCrossOriginIsolated(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return window.crossOriginIsolated === true;
}
