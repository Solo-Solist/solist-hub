/**
 * LibreOffice WASM Converter
 * 
 * Uses @matbee/libreoffice-converter WorkerBrowserConverter for document conversion.
 * 
 * Key design decisions:
 * 1. Uses WorkerBrowserConverter instead of BrowserConverter — runs WASM in a
 *    dedicated Web Worker, avoiding main-thread blocking and eliminating the need
 *    for fragile loadModule patches / Cloudflare Rocket Loader workarounds
 * 2. Uses uncompressed paths (soffice.wasm / soffice.data) — works natively with
 *    all servers (Next.js dev, Vercel, Netlify, etc.). For Nginx production,
 *    gzip_static automatically serves the .gz version when available.
 * 3. Specifies browserWorkerJs for the library's internal worker communication
 * 4. Checks SharedArrayBuffer support upfront — fails fast with a clear error
 * 
 * IMPORTANT: The browser.worker.global.js in public/libreoffice-wasm/ MUST match
 * the version from @matbee/libreoffice-converter/dist/. Do NOT modify it — the
 * library's WorkerBrowserConverter expects an unmodified worker script. If you
 * need CJK font support, fonts must be pre-baked into soffice.data.
 * 
 * How pthreads work:
 * - soffice.js (Emscripten glue) creates 4 pthread Workers via
 *   new Worker(Module["mainScriptUrlOrBlob"]) — loading soffice.js itself
 * - Each pthread Worker detects ENVIRONMENT_IS_PTHREAD from self.name ("em-pthread-N")
 * - These are NESTED Workers (created from inside the browser.worker.global.js Worker)
 * - They must NOT run from a Blob URL parent, or nested Worker creation breaks
 */

import { WorkerBrowserConverter } from '@matbee/libreoffice-converter/browser';
import { fetchAssembledBlob } from '../utils/asset-loader';
import { withBasePath } from '../utils/path';
import { isTauri } from '../tauri-bridge';

const LIBREOFFICE_PATH = withBasePath('/libreoffice-wasm/');
const ASSET_VERSION = '20240212-4';
// Request uncompressed names. In production, nginx gzip_static serves the .gz variant
// with correct Content-Encoding and MIME headers (required for WebAssembly streaming).
const SOFFICE_WASM_FILE = 'soffice.wasm.bin';
const SOFFICE_DATA_FILE = 'soffice.data.bin';

function normalizeBasePath(path: string): string {
    return path.endsWith('/') ? path : `${path}/`;
}

export interface LoadProgress {
    phase: 'loading' | 'initializing' | 'converting' | 'complete' | 'ready';
    percent: number;
    message: string;
}

export type ProgressCallback = (progress: LoadProgress) => void;

// Singleton for converter instance
let converterInstance: LibreOfficeConverter | null = null;

export class LibreOfficeConverter {
    private converter: WorkerBrowserConverter | null = null;
    private initialized = false;
    private initPromise: Promise<void> | null = null;
    private basePath: string;
    /** Total size of all WASM assets in MB, computed during environment check */
    private totalAssetSizeMB = 0;
    /** Replaceable progress callback — allows late-binding when preload started without one */
    private progressCallback?: ProgressCallback;
    /** Track Blob URLs for cleanup */
    private blobUrls: string[] = [];

    constructor(basePath?: string) {
        this.basePath = normalizeBasePath(basePath || LIBREOFFICE_PATH);
    }

    async initialize(onProgress?: ProgressCallback): Promise<void> {
        // Allow hot-swapping the progress callback even if init is already in flight.
        // This covers the case where preload started silently (no callback), and later
        // the user clicks "Convert" which provides a real callback.
        if (onProgress) this.progressCallback = onProgress;

        if (this.initialized) return;

        // If already initializing, wait for the existing promise
        if (this.initPromise) return this.initPromise;

        this.initPromise = this._doInitialize();
        try {
            await this.initPromise;
        } catch (e) {
            // Allow retry on failure
            this.initPromise = null;
            throw e;
        }
    }

    /**
     * Build a human-readable progress message.
     * When totalAssetSizeMB is known, shows "Downloading: X MB / Y MB".
     */
    private buildProgressMessage(info: { percent: number }): string {
        if (this.totalAssetSizeMB > 0 && info.percent < 95) {
            const downloadedMB = (info.percent / 100 * this.totalAssetSizeMB).toFixed(1);
            const totalMB = this.totalAssetSizeMB.toFixed(1);
            return `Downloading: ${downloadedMB} MB / ${totalMB} MB`;
        }
        if (info.percent >= 95 && info.percent < 100) {
            return 'Initializing conversion engine...';
        }
        return `Loading conversion engine (${Math.round(info.percent)}%)...`;
    }

    private async _doInitialize(): Promise<void> {
        try {
            this.progressCallback?.({ phase: 'loading', percent: 0, message: 'Checking environment...' });

            // Fail fast if SharedArrayBuffer / COOP+COEP is missing
            await this.checkEnvironment();

            const totalInfo = this.totalAssetSizeMB > 0
                ? ` (${this.totalAssetSizeMB.toFixed(1)} MB to download)`
                : '';
            this.progressCallback?.({ phase: 'loading', percent: 5, message: `Loading conversion engine${totalInfo}...` });

            let sofficeWasmUrl: string;
            let sofficeDataUrl: string;
            let fontArrayBuffer: ArrayBuffer;

            let useDirectStreaming = false;
            if (isTauri()) {
                try {
                    const testRes = await fetch(`${this.basePath}${SOFFICE_WASM_FILE}?v=${ASSET_VERSION}`, { method: 'HEAD' });
                    useDirectStreaming = testRes.ok;
                } catch {
                    useDirectStreaming = false;
                }
            }

            if (useDirectStreaming) {
                console.log('[LibreOffice] Running in Tauri environment with unchunked assets: using direct asset URLs for zero-copy streaming');
                sofficeWasmUrl = `${this.basePath}${SOFFICE_WASM_FILE}?v=${ASSET_VERSION}`;
                sofficeDataUrl = `${this.basePath}${SOFFICE_DATA_FILE}?v=${ASSET_VERSION}`;

                this.progressCallback?.({ phase: 'loading', percent: 15, message: 'Loading fonts...' });
                const fontRes = await fetch(withBasePath(`/fonts/NotoSansSC-Regular.ttf?v=${ASSET_VERSION}`));
                if (!fontRes.ok) {
                    throw new Error(`Failed to load font: ${fontRes.statusText}`);
                }
                fontArrayBuffer = await fontRes.arrayBuffer();
            } else {
                const filesToFetch = [
                    { name: 'soffice.wasm.bin', url: `${this.basePath}${SOFFICE_WASM_FILE}?v=${ASSET_VERSION}`, estSize: 147 * 1024 * 1024 },
                    { name: 'soffice.data.bin', url: `${this.basePath}${SOFFICE_DATA_FILE}?v=${ASSET_VERSION}`, estSize: 99 * 1024 * 1024 },
                    { name: 'NotoSansSC-Regular.ttf', url: withBasePath(`/fonts/NotoSansSC-Regular.ttf?v=${ASSET_VERSION}`), estSize: 16.4 * 1024 * 1024 }
                ];

                const totalBytesEst = filesToFetch.reduce((sum, f) => sum + f.estSize, 0);
                const loadedBytesMap: { [key: string]: number } = {};

                const reportProgress = () => {
                    const currentLoaded = Object.values(loadedBytesMap).reduce((a, b) => a + b, 0);
                    const pct = Math.min(90, Math.round((currentLoaded / totalBytesEst) * 90));
                    this.progressCallback?.({
                        phase: 'loading',
                        percent: pct,
                        message: this.buildProgressMessage({ percent: pct }),
                    });
                };

                // Fetch and reassemble assets (handles chunking on Cloudflare Pages)
                const [sofficeWasmBlob, sofficeDataBlob, fontBlob] = await Promise.all(
                    filesToFetch.map(f => fetchAssembledBlob(f.url, (p) => {
                        loadedBytesMap[f.name] = p.loadedBytes;
                        reportProgress();
                    }))
                );

                sofficeWasmUrl = URL.createObjectURL(sofficeWasmBlob);
                sofficeDataUrl = URL.createObjectURL(sofficeDataBlob);
                this.blobUrls = [sofficeWasmUrl, sofficeDataUrl];
                fontArrayBuffer = await fontBlob.arrayBuffer();
            }

            this.converter = new WorkerBrowserConverter({
                sofficeJs: `${this.basePath}soffice.js?v=${ASSET_VERSION}`,
                sofficeWasm: sofficeWasmUrl,
                sofficeData: sofficeDataUrl,
                sofficeWorkerJs: `${this.basePath}soffice.worker.js?v=${ASSET_VERSION}`,
                browserWorkerJs: `${this.basePath}browser.worker.global.js?v=${ASSET_VERSION}`,
                verbose: false,
                fonts: [
                    { filename: 'NotoSansSC-Regular.ttf', data: fontArrayBuffer }
                ],
                onProgress: (info: { phase: string; percent: number; message: string }) => {
                    // Use this.progressCallback so a late-arriving callback from the UI gets picked up
                    if (this.progressCallback && !this.initialized) {
                        this.progressCallback({
                            phase: info.phase as LoadProgress['phase'],
                            percent: info.percent,
                            message: this.buildProgressMessage(info),
                        });
                    }
                },
                onReady: () => {
                    console.log('[LibreOffice] Ready!');
                },
                onError: (error: Error) => {
                    console.error('[LibreOffice] Error:', error);
                },
            });

            console.log('[LibreOffice] Starting initialization via WorkerBrowserConverter...');
            const initStart = performance.now();
            await this.converter.initialize();
            const initDuration = Math.round(performance.now() - initStart);
            console.log(`[LibreOffice] Initialization completed in ${initDuration}ms`);

            this.initialized = true;

            // Signal completion
            this.progressCallback?.({ phase: 'ready', percent: 100, message: 'Conversion engine ready!' });

            // Null out the callback to prevent any late-firing progress updates
            this.progressCallback = undefined;
        } catch (e) {
            this.converter = null;
            this.initialized = false;
            throw e;
        }
    }

    /**
     * Diagnose environment issues — fail fast if SharedArrayBuffer is not available.
     * SharedArrayBuffer requires Cross-Origin Isolation (COOP + COEP headers).
     */
    private async checkEnvironment(): Promise<void> {
        console.warn('[LibreOffice] === Environment Check ===');

        // In Tauri desktop app, headers are provided natively by Tauri (app.security.headers).
        // Any registered ServiceWorker should be removed to prevent it from intercepting
        // or corrupting local asset loading.
        // In browser environments, preserve coi-serviceworker for cross-origin isolation.
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            try {
                const inTauri = isTauri();
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) {
                    const scriptUrl = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
                    if (!inTauri && scriptUrl.includes('coi-serviceworker')) {
                        console.log(`[LibreOffice] Preserving coi-serviceworker for cross-origin isolation: ${scriptUrl}`);
                        continue;
                    }
                    await reg.unregister();
                    console.warn(`[LibreOffice] Unregistered conflicting Service Worker: ${reg.scope}`);
                }
            } catch (e) {
                console.warn('[LibreOffice] Failed to check Service Worker:', e);
            }
        }

        // 1. Check COOP/COEP — this is the #1 cause of WASM timeout
        const isIsolated = typeof window !== 'undefined' ? window.crossOriginIsolated : false;
        console.warn(`[LibreOffice] Cross-Origin Isolated: ${isIsolated ? 'YES ✅' : 'NO ❌'}`);

        // 2. Check SharedArrayBuffer directly
        const hasSAB = typeof SharedArrayBuffer !== 'undefined';
        console.warn(`[LibreOffice] SharedArrayBuffer: ${hasSAB ? 'Available ✅' : 'NOT available ❌'}`);

        if (!isIsolated || !hasSAB) {
            if (!isTauri() && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                try {
                    const basePath = window.location.pathname.startsWith('/pdfcraft') ? '/pdfcraft/' : '/';
                    navigator.serviceWorker.register(`${basePath}coi-serviceworker.js`).then((reg) => {
                        if (reg.active && !navigator.serviceWorker.controller) {
                            window.location.reload();
                        }
                    }).catch(() => {});
                } catch (_) {}
            }

            const errorMsg = [
                'LibreOffice WASM requires SharedArrayBuffer for multi-threading.',
                '',
                'SharedArrayBuffer is only available in Cross-Origin Isolated contexts.',
                'If self-hosting (Nginx/Docker), ensure your server returns:',
                '  Cross-Origin-Opener-Policy: same-origin',
                '  Cross-Origin-Embedder-Policy: require-corp',
                '  Cross-Origin-Resource-Policy: cross-origin',
                '',
                `Current state: crossOriginIsolated=${isIsolated}, SharedArrayBuffer=${hasSAB}`,
                'A cross-origin isolation service worker has been initialized. Please reload the page if this error persists.',
            ].join('\n');
            console.error(`[LibreOffice] ${errorMsg}`);
            throw new Error(
                `SharedArrayBuffer is not available (crossOriginIsolated=${isIsolated}). ` +
                'Your server must set Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers. ' +
                'If using static hosting, reload the page to allow the isolation worker to take effect.'
            );
        }

        // 3. Check file connectivity (parallel for speed) & accumulate total size
        const files = [
            SOFFICE_WASM_FILE,
            SOFFICE_DATA_FILE,
            'soffice.js',
            'soffice.worker.js',
            'browser.worker.global.js',
        ];
        let totalBytes = 0;
        await Promise.all(files.map(async (file) => {
            const url = `${this.basePath}${file}?v=${ASSET_VERSION}`;
            try {
                const start = performance.now();
                // Check for the file itself or its chunk manifest
                let res = await fetch(url, { method: 'HEAD' });
                
                if (!res.ok) {
                    const manifestUrl = `${this.basePath}${file}.manifest.json?v=${ASSET_VERSION}`;
                    const mRes = await fetch(manifestUrl, { method: 'HEAD' });
                    if (mRes.ok) {
                        res = mRes;
                        console.warn(`[LibreOffice] ${file}: Found chunk manifest instead of raw file.`);
                    }
                }

                const duration = Math.round(performance.now() - start);

                if (res.ok) {
                    const size = res.headers.get('content-length');
                    const type = res.headers.get('content-type');
                    // Note: manifest size is small, so totalAssetSizeMB will be undercounted 
                    // if files are chunked, but that's acceptable for an environment check.
                    const sizeNum = size ? parseInt(size) : 0;
                    if (sizeNum > 0) totalBytes += sizeNum;
                    const sizeMb = sizeNum > 0 ? (sizeNum / 1024 / 1024).toFixed(2) + 'MB' : 'unknown size';
                    console.warn(
                        `[LibreOffice] ${file}: OK (${res.status}) ${duration}ms | ${sizeMb} | type=${type}`
                    );
                } else {
                    console.error(`[LibreOffice] ${file}: FAILED (${res.status} ${res.statusText})`);
                    throw new Error(`Required file ${file} returned HTTP ${res.status}`);
                }
            } catch (e) {
                if (e instanceof Error && e.message.startsWith('Required file')) throw e;
                console.error(`[LibreOffice] ${file}: NETWORK ERROR`, e);
                throw new Error(`Cannot fetch ${file}: ${e}`);
            }
        }));

        this.totalAssetSizeMB = totalBytes / (1024 * 1024);
        if (this.totalAssetSizeMB > 0) {
            console.warn(`[LibreOffice] Total asset size: ${this.totalAssetSizeMB.toFixed(1)} MB`);
        }
        console.warn('[LibreOffice] === Environment Check Passed ✅ ===');
    }

    isReady(): boolean {
        return this.initialized && this.converter !== null;
    }

    async convert(file: File, outputFormat: string): Promise<Blob> {
        if (!this.converter) {
            throw new Error('Converter not initialized');
        }

        console.log(`[LibreOffice] Converting ${file.name} to ${outputFormat}...`);
        console.log(`[LibreOffice] File type: ${file.type}, Size: ${file.size} bytes`);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const ext = file.name.split('.').pop()?.toLowerCase() || '';

            console.log(`[LibreOffice] Detected format from extension: ${ext}`);

            const startTime = Date.now();
            const result = await this.converter.convert(uint8Array, {
                outputFormat: outputFormat as any,
                inputFormat: ext as any,
            }, file.name);

            const duration = Date.now() - startTime;
            console.log(`[LibreOffice] Conversion complete! Duration: ${duration}ms, Size: ${result.data.length} bytes`);

            // SharedArrayBuffer-backed data cannot be passed to Blob directly;
            // copy only when necessary to avoid unnecessary allocation.
            const isSAB = typeof SharedArrayBuffer !== 'undefined'
                && result.data.buffer instanceof SharedArrayBuffer;
            const outputData = isSAB
                ? new Uint8Array(result.data) // copies into a regular ArrayBuffer
                : result.data;
            return new Blob([outputData as BlobPart], { type: result.mimeType });
        } catch (error) {
            console.error(`[LibreOffice] Conversion FAILED for ${file.name}:`, error);
            throw error;
        }
    }

    async convertToPdf(file: File): Promise<Blob> {
        return this.convert(file, 'pdf');
    }

    async wordToPdf(file: File): Promise<Blob> {
        return this.convertToPdf(file);
    }

    async pptToPdf(file: File): Promise<Blob> {
        return this.convertToPdf(file);
    }

    async excelToPdf(file: File): Promise<Blob> {
        return this.convertToPdf(file);
    }

    async destroy(): Promise<void> {
        if (this.converter) {
            await this.converter.destroy();
        }
        
        // Revoke Blob URLs to release memory
        this.blobUrls.forEach(url => URL.revokeObjectURL(url));
        this.blobUrls = [];
        
        this.converter = null;
        this.initialized = false;
    }
}

export function getLibreOfficeConverter(basePath?: string): LibreOfficeConverter {
    if (!converterInstance) {
        converterInstance = new LibreOfficeConverter(basePath);
    }
    return converterInstance;
}
