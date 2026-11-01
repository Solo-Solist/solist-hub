import createModule from './editcore.js';

const inBrowser = typeof window !== 'undefined';

const ENGINE_VERSION = 'release';

const wasmUrl = new URL('editcore.wasm', import.meta.url).href;

export const ENGINE_BUILD = `bentopdf-pdfium@${ENGINE_VERSION}`;

export function createEngineModule(options) {
  return createModule({
    ...(options ?? {}),
    locateFile: (file, prefix) =>
      file.endsWith('.wasm')
        ? (wasmUrl ?? `${prefix}editcore.wasm`)
        : `${prefix}${file}`,
  });
}
