/**
 * Excel to PDF via Pyodide worker (openpyxl + PyMuPDF).
 * Used when Cross-Origin Isolation is unavailable or when LibreOffice WASM fails/times out.
 * Supports .xlsx and .csv.
 */

import { withBasePath } from '@/lib/utils/path';

const WORKER_PATH = withBasePath('/workers/excel-to-pdf.worker.js');
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
        reject(new Error('Excel converter worker initialization timed out.'));
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
        reject(new Error('Excel converter worker failed to load.'));
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

export function isExcelPyodideReady(): boolean {
  return workerReady;
}

export async function preloadExcelPyodide(
  onStatus?: (message: string) => void
): Promise<void> {
  if (workerReady) {
    onStatus?.('Conversion engine ready.');
    return;
  }
  await ensureWorkerReady(onStatus);
}

export async function convertExcelToPdfPyodide(
  file: File,
  onStatus?: (message: string) => void
): Promise<Blob> {
  await ensureWorkerReady(onStatus);

  return new Promise<Blob>((resolve, reject) => {
    const w = getWorker();
    const msgId = `convert-${Date.now()}`;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Excel conversion timed out.'));
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
