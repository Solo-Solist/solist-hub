/**
 * Dev setup script: Decompress LibreOffice WASM .gz files in public/ for local development
 * 
 * Problem: soffice.wasm (~147MB) and soffice.data (~100MB) exceed GitHub's 100MB
 * file size limit, so only .bin.gz versions are committed. However, Next.js dev server
 * serves .bin.gz files with Content-Type: application/gzip, which breaks WASM loading.
 * 
 * Solution: Decompress .bin.gz files in public/libreoffice-wasm/ before starting dev.
 * The decompressed files are in .gitignore so they won't be committed.
 * 
 * This runs automatically via the "predev" npm script.
 */

import { createReadStream, createWriteStream, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';

const WASM_DIR = join(process.cwd(), 'public', 'libreoffice-wasm');

async function decompressFile(gzPath, outPath) {
    const gunzip = createGunzip();
    const source = createReadStream(gzPath);
    const destination = createWriteStream(outPath);
    await pipeline(source, gunzip, destination);
}

async function main() {
    if (!existsSync(WASM_DIR)) {
        console.log('[predev] No public/libreoffice-wasm/ directory found, skipping WASM decompression.');
        return;
    }

    const files = readdirSync(WASM_DIR).filter(f => f.endsWith('.gz'));

    if (files.length === 0) {
        console.log('[predev] No .gz files found in public/libreoffice-wasm/, skipping.');
        return;
    }

    let decompressedCount = 0;

    for (const gzFile of files) {
        const gzPath = join(WASM_DIR, gzFile);
        let outFile = gzFile.replace(/\.gz$/, '');
        if (outFile === 'soffice.wasm') {
            outFile = 'soffice.wasm.bin';
        } else if (outFile === 'soffice.data') {
            outFile = 'soffice.data.bin';
        }
        const outPath = join(WASM_DIR, outFile);

        // Skip if already decompressed and larger than gz (valid decompression)
        if (existsSync(outPath)) {
            const gzStat = statSync(gzPath);
            const outStat = statSync(outPath);
            if (outStat.size > gzStat.size) {
                continue; // Already decompressed, skip silently
            }
        }

        try {
            const gzStat = statSync(gzPath);
            console.log(`[predev] Decompressing ${gzFile} (${(gzStat.size / 1024 / 1024).toFixed(1)}MB)...`);
            await decompressFile(gzPath, outPath);
            const outStat = statSync(outPath);
            console.log(`[predev]   → ${outFile} (${(outStat.size / 1024 / 1024).toFixed(1)}MB)`);
            decompressedCount++;
        } catch (err) {
            console.error(`[predev] Failed to decompress ${gzFile}:`, err.message);
        }
    }

    if (decompressedCount > 0) {
        console.log(`[predev] Decompressed ${decompressedCount} WASM file(s). Ready for development.`);
    }
}

main().catch(err => {
    console.error('[predev] Error:', err);
    // Don't block dev server if decompression fails
    process.exit(0);
});
