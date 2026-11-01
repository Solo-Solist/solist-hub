/**
 * src/lib/utils/asset-loader.ts
 * 
 * General-purpose utility to fetch and reassemble chunked assets.
 * Used to bypass 25MB file size limits on platforms like Cloudflare Pages.
 * 
 * Enhanced with Cache Storage API caching for WebAssembly assets to prevent 
 * timeouts on slow networks, and support for real-time progress callbacks.
 */

interface ChunkManifest {
    filename: string;
    chunks: number;
    totalSize: number;
    chunkSize: number;
}

export interface FetchProgress {
    loadedBytes: number;
    totalBytes: number;
}

export type ProgressCallback = (progress: FetchProgress) => void;

const CACHE_NAME = 'pdfcraft-wasm-cache-v1';

/**
 * Check if the asset is in browser Cache Storage.
 */
async function getCachedBlob(url: string): Promise<Blob | null> {
    if (typeof caches === 'undefined') return null;
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(url);
        if (cachedResponse) {
            console.log(`[asset-loader] Cache hit for ${url}`);
            return await cachedResponse.blob();
        }
    } catch (e) {
        console.warn(`[asset-loader] Failed to read from Cache Storage:`, e);
    }
    return null;
}

/**
 * Cache the asset in browser Cache Storage.
 */
async function putCachedBlob(url: string, blob: Blob): Promise<void> {
    if (typeof caches === 'undefined') return;
    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(
            url,
            new Response(blob, {
                headers: {
                    'Content-Type': blob.type,
                    'Content-Length': blob.size.toString(),
                    'Cache-Control': 'public, max-age=31536000, immutable',
                },
            })
        );
        console.log(`[asset-loader] Cached ${url} successfully (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (e) {
        console.warn(`[asset-loader] Failed to write to Cache Storage:`, e);
    }
}

/**
 * Helper to fetch a file/chunk and stream its contents to track progress.
 */
async function fetchWithProgress(
    url: string,
    onProgress?: (loaded: number) => void
): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch chunk: ${url} (HTTP ${res.status})`);
    }

    const contentLength = res.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!res.body || !onProgress) {
        return res.arrayBuffer();
    }

    const reader = res.body.getReader();
    let loaded = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            loaded += value.length;
            onProgress(loaded);
        }
    }

    const assembled = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        assembled.set(chunk, offset);
        offset += chunk.length;
    }

    return assembled.buffer;
}

/**
 * Fetches an asset, potentially reassembling it from chunks if a manifest exists.
 * Bypasses the network if the asset is already present in Cache Storage.
 * 
 * @param url The base URL of the asset (e.g., /libreoffice-wasm/soffice.wasm)
 * @param onProgress Optional callback to track the loading progress in bytes
 * @returns A Blob containing the reassembled or directly fetched asset
 */
export async function fetchAssembledBlob(
    url: string,
    onProgress?: ProgressCallback
): Promise<Blob> {
    // 1. Check Cache Storage first
    const cached = await getCachedBlob(url);
    if (cached) {
        onProgress?.({ loadedBytes: cached.size, totalBytes: cached.size });
        return cached;
    }

    // Determine the manifest URL by stripping query parameters and appending .manifest.json
    const [baseUrl, query] = url.split('?');
    const queryString = query ? `?${query}` : '';
    const manifestUrl = `${baseUrl}.manifest.json${queryString}`;
    
    let manifest: ChunkManifest | null = null;
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) {
        try {
            const manifestRes = await fetch(manifestUrl);
            if (manifestRes.ok) {
                manifest = await manifestRes.json();
            }
        } catch (err) {
            console.debug(`[asset-loader] Manifest check skipped for ${url}:`, err);
        }
    }

    let resultBlob: Blob;

    // 2. Fetch and assemble from either chunks or directly
    if (manifest) {
        console.log(`[asset-loader] Manifest found for ${manifest.filename}. Reassembling from ${manifest.chunks} chunks...`);
        
        const chunkBytesLoaded = new Array(manifest.chunks).fill(0);
        const totalSize = manifest.totalSize;

        const reportOverallProgress = () => {
            if (!onProgress) return;
            const loadedBytes = chunkBytesLoaded.reduce((a, b) => a + b, 0);
            onProgress({ loadedBytes, totalBytes: totalSize });
        };

        // Fetch chunks in parallel, reporting combined progress
        const chunkPromises: Promise<ArrayBuffer>[] = [];
        for (let i = 0; i < manifest.chunks; i++) {
            const chunkUrl = `${baseUrl}.part_${i}${queryString}`;
            chunkPromises.push(
                fetchWithProgress(chunkUrl, (loaded) => {
                    chunkBytesLoaded[i] = loaded;
                    reportOverallProgress();
                }).then(buf => {
                    chunkBytesLoaded[i] = buf.byteLength;
                    reportOverallProgress();
                    return buf;
                })
            );
        }

        const chunks = await Promise.all(chunkPromises);

        // Determine MIME type based on extension
        let mimeType = 'application/octet-stream';
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('.wasm')) mimeType = 'application/wasm';
        else if (lowerUrl.includes('.js')) mimeType = 'application/javascript';
        else if (lowerUrl.includes('.ttf')) mimeType = 'font/ttf';
        else if (lowerUrl.includes('.otf')) mimeType = 'font/otf';
        else if (lowerUrl.includes('.woff2')) mimeType = 'font/woff2';

        resultBlob = new Blob(chunks as unknown as BlobPart[], { type: mimeType });
    } else {
        // Fallback: Fetch the file directly with progress
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch asset: ${url} (HTTP ${res.status})`);
        }

        const contentLength = res.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        
        if (!res.body || totalBytes === 0 || !onProgress) {
            const blob = await res.blob();
            onProgress?.({ loadedBytes: blob.size, totalBytes: blob.size });
            resultBlob = blob;
        } else {
            const reader = res.body.getReader();
            let loadedBytes = 0;
            const chunks: Uint8Array[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                    chunks.push(value);
                    loadedBytes += value.length;
                    onProgress({ loadedBytes, totalBytes });
                }
            }

            let mimeType = 'application/octet-stream';
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.includes('.wasm')) mimeType = 'application/wasm';
            else if (lowerUrl.includes('.js')) mimeType = 'application/javascript';
            else if (lowerUrl.includes('.ttf')) mimeType = 'font/ttf';
            else if (lowerUrl.includes('.otf')) mimeType = 'font/otf';
            else if (lowerUrl.includes('.woff2')) mimeType = 'font/woff2';

            resultBlob = new Blob(chunks as unknown as BlobPart[], { type: mimeType });
        }
    }

    // 3. Cache the final Blob persistently
    await putCachedBlob(url, resultBlob);
    return resultBlob;
}
