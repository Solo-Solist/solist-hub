/**
 * Word to PDF via Pyodide worker (python-docx + PyMuPDF).
 * Used when Cross-Origin Isolation is unavailable (no SharedArrayBuffer / LibreOffice WASM).
 * Supports .docx only.
 */

import { withBasePath } from '@/lib/utils/path';

const WORKER_PATH = withBasePath('/workers/word-to-pdf.worker.js');
const INIT_TIMEOUT_MS = 3 * 60 * 1000;
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000;

let worker: Worker | null = null;
let workerReady = false;
let initPromise: Promise<void> | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(WORKER_PATH, { type: 'module' });
  }
  return worker;
}

async function ensureWorkerReady(
  onStatus?: (message: string) => void
): Promise<void> {
  if (workerReady) return;

  if (!initPromise) {
    initPromise = new Promise<void>((resolve, reject) => {
      const w = getWorker();
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Word converter worker initialization timed out.'));
      }, INIT_TIMEOUT_MS);

      const handleMessage = (event: MessageEvent) => {
        const { type, error, message } = event.data;
        if (type === 'status' && message) {
          onStatus?.(message);
        }
        if (type === 'init-complete') {
          workerReady = true;
          cleanup();
          resolve();
        }
        if (type === 'error') {
          cleanup();
          reject(new Error(error || 'Worker initialization failed'));
        }
      };

      const handleError = () => {
        cleanup();
        reject(new Error('Word converter worker failed to load.'));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        w.removeEventListener('message', handleMessage);
        w.removeEventListener('error', handleError);
      };

      w.addEventListener('message', handleMessage);
      w.addEventListener('error', handleError);
      w.postMessage({ type: 'init', id: 'init', data: {} });
    }).catch((err) => {
      initPromise = null;
      throw err;
    });
  }

  await initPromise;
}

export async function convertWordToPdfPyodide(
  file: File,
  onStatus?: (message: string) => void
): Promise<Blob> {
  await ensureWorkerReady(onStatus);

  return new Promise<Blob>((resolve, reject) => {
    const w = getWorker();
    const msgId = `convert-${Date.now()}`;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Word conversion timed out.'));
    }, CONVERT_TIMEOUT_MS);

    const handleMessage = (event: MessageEvent) => {
      const { type, id, result, error, message } = event.data;
      if (type === 'status' && message) {
        onStatus?.(message);
        return;
      }
      if (id !== msgId) return;

      if (type === 'convert-complete') {
        cleanup();
        resolve(result);
      } else if (type === 'error') {
        cleanup();
        reject(new Error(error || 'Conversion failed'));
      }
    };

    const handleError = (err: ErrorEvent) => {
      cleanup();
      reject(new Error(err.message || 'Worker error'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      w.removeEventListener('message', handleMessage);
      w.removeEventListener('error', handleError);
    };

    w.addEventListener('message', handleMessage);
    w.addEventListener('error', handleError);
    w.postMessage({ type: 'convert', id: msgId, data: { file } });
  });
}
