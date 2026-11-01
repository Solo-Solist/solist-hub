/**
 * scripts/chunk-assets.mjs
 * 
 * General-purpose asset chunking script.
 * Splits files larger than 24MB into smaller parts to bypass Cloudflare Pages limits.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

// Limit set to 24MB (safely under Cloudflare's 25MB hard limit)
const LIMIT_SIZE = 24 * 1024 * 1024;
// Chunk size for splitting - 20MB is a good balance
const CHUNK_SIZE = 20 * 1024 * 1024;

const OUT_DIR = join(process.cwd(), 'out');

async function processFile(filePath) {
    const stat = statSync(filePath);
    if (stat.size <= LIMIT_SIZE) return;

    const fileName = filePath.split('/').pop();
    console.log(`[chunking] Splitting ${fileName} (${(stat.size / 1024 / 1024).toFixed(1)}MB)...`);

    const buffer = readFileSync(filePath);
    let offset = 0;
    let chunkIndex = 0;

    while (offset < buffer.length) {
        const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
        const chunkPath = `${filePath}.part_${chunkIndex}`;
        writeFileSync(chunkPath, chunk);
        offset += CHUNK_SIZE;
        chunkIndex++;
    }

    const manifest = {
        filename: fileName,
        chunks: chunkIndex,
        totalSize: stat.size,
        chunkSize: CHUNK_SIZE
    };

    writeFileSync(`${filePath}.manifest.json`, JSON.stringify(manifest, null, 2));
    unlinkSync(filePath);

    console.log(`[chunking]   → Created ${chunkIndex} chunks for ${fileName}.`);
}

/**
 * Recursively walk a directory and execute a callback for each file
 */
function walkDir(dir, callback) {
    if (!existsSync(dir)) return;
    const files = readdirSync(dir);
    for (const file of files) {
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath, callback);
        } else if (stat.isFile()) {
            callback(filePath);
        }
    }
}

async function main() {
    const isDesktopOrDocker =
        process.env.DOCKER_BUILD === 'true' ||
        process.env.TAURI_ENV === 'true' ||
        process.env.BUILDING_TAURI === 'true' ||
        process.env.SKIP_CHUNKING === 'true' ||
        Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM);

    if (isDesktopOrDocker) {
        console.log('[chunking] Desktop/Tauri or Docker environment detected, skipping chunking.');
        return;
    }

    if (!existsSync(OUT_DIR)) {
        console.log('[chunking] Output directory (out/) not found, skipping.');
        return;
    }

    console.log(`[chunking] Scanning ${OUT_DIR} for assets > 24MB...`);

    const largeFiles = [];
    walkDir(OUT_DIR, (filePath) => {
        // Skip already chunked parts and manifests
        if (filePath.includes('.part_') || filePath.endsWith('.manifest.json')) return;

        const stat = statSync(filePath);
        if (stat.size > LIMIT_SIZE) {
            largeFiles.push(filePath);
        }
    });

    if (largeFiles.length === 0) {
        console.log('[chunking] No large assets found.');
        return;
    }

    for (const filePath of largeFiles) {
        await processFile(filePath);
    }

    console.log('[chunking] Completed successfully.');
}

main().catch(err => {
    console.error('[chunking] Error during chunking:', err);
    process.exit(1);
});
