/**
 * Post-build script: Decompress LibreOffice WASM .gz files
 * 
 * Problem: soffice.wasm (~147MB) and soffice.data (~100MB) exceed GitHub's 
 * 100MB file size limit, so only .bin.gz compressed versions are committed to Git.
 * However, browsers request the uncompressed filenames (soffice.wasm.bin, soffice.data.bin).
 * 
 * Solution: After `next build` generates the `out/` directory, this script
 * decompresses all .bin.gz files in out/libreoffice-wasm/ so both versions exist.
 * This ensures compatibility across all deployment platforms:
 * - Docker/Nginx: Uses gzip_static to serve .bin.gz efficiently
 * - Vercel/Netlify/Cloudflare Pages: Serves the decompressed originals
 * - GitHub Pages: Serves decompressed originals (but lacks COOP/COEP headers)
 */

import { createReadStream, createWriteStream, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';

const targetArg = process.argv[2] || 'out';

const BASE_PATH = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '';
const CLEAN_BASE_PATH = BASE_PATH.startsWith('/') ? BASE_PATH.slice(1) : BASE_PATH;

let WASM_DIR;
if (targetArg === 'public') {
    WASM_DIR = join(process.cwd(), 'public', 'libreoffice-wasm');
} else {
    const WASM_DIR_STANDARD = join(process.cwd(), 'out', 'libreoffice-wasm');
    const WASM_DIR_SUBPATH = CLEAN_BASE_PATH ? join(process.cwd(), 'out', CLEAN_BASE_PATH, 'libreoffice-wasm') : null;
    WASM_DIR = (WASM_DIR_SUBPATH && existsSync(WASM_DIR_SUBPATH)) ? WASM_DIR_SUBPATH : WASM_DIR_STANDARD;
}

async function decompressFile(gzPath, outPath) {
    const gunzip = createGunzip();
    const source = createReadStream(gzPath);
    const destination = createWriteStream(outPath);
    await pipeline(source, gunzip, destination);
}

async function main() {
    if (process.env.DOCKER_BUILD === 'true') {
        console.log('[postbuild] DOCKER_BUILD detected, skipping decompression.');
        return;
    }

    if (!existsSync(WASM_DIR)) {
        console.log(`[postbuild] No libreoffice-wasm directory found at ${WASM_DIR}, skipping.`);
        return;
    }

    const files = readdirSync(WASM_DIR).filter(f => f.endsWith('.gz'));

    if (files.length === 0) {
        console.log(`[postbuild] No .gz files found at ${WASM_DIR}, skipping.`);
        return;
    }

    console.log(`[postbuild] Decompressing ${files.length} WASM .gz file(s)...`);

    for (const gzFile of files) {
        const gzPath = join(WASM_DIR, gzFile);
        let outFile = gzFile.replace(/\.gz$/, '');
        if (outFile === 'soffice.wasm') {
            outFile = 'soffice.wasm.bin';
        } else if (outFile === 'soffice.data') {
            outFile = 'soffice.data.bin';
        }
        const outPath = join(WASM_DIR, outFile);

        // Skip if already decompressed
        if (existsSync(outPath)) {
            const gzStat = statSync(gzPath);
            const outStat = statSync(outPath);
            // If decompressed file is larger than gz, it's likely already good
            if (outStat.size > gzStat.size) {
                console.log(`[postbuild]   ${outFile} already exists (${(outStat.size / 1024 / 1024).toFixed(1)}MB), skipping.`);
                continue;
            }
        }

        try {
            const gzStat = statSync(gzPath);
            console.log(`[postbuild]   Decompressing ${gzFile} (${(gzStat.size / 1024 / 1024).toFixed(1)}MB)...`);
            await decompressFile(gzPath, outPath);
            const outStat = statSync(outPath);
            console.log(`[postbuild]   → ${outFile} (${(outStat.size / 1024 / 1024).toFixed(1)}MB)`);
        } catch (err) {
            console.error(`[postbuild]   Failed to decompress ${gzFile}:`, err.message);
        }
    }

    console.log('[postbuild] WASM decompression complete.');
}

main().catch(err => {
    console.error('[postbuild] Error:', err);
    // Don't fail the build if decompression fails
    process.exit(0);
});
