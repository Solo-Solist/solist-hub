/**
 * Sync PDF.js worker files to public/workers directory
 * 
 * This script copies the worker files from node_modules to public/workers
 * to ensure offline availability of PDF.js functionality.
 * 
 * Run this script after installing/updating pdfjs-dist packages:
 * - npm run postinstall
 * - or manually: node scripts/sync-pdfjs-workers.js
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const workerFiles = [
    {
        src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
        dest: 'public/workers/pdf.worker.min.mjs',
        name: 'pdfjs-dist v4.x worker'
    },
    {
        src: 'node_modules/pdfjs-dist-legacy/build/pdf.worker.min.js',
        dest: 'public/workers/pdf.worker.legacy.min.js',
        name: 'pdfjs-dist-legacy v2.x worker'
    }
];

// Ensure workers directory exists
const workersDir = join(rootDir, 'public/workers');
if (!existsSync(workersDir)) {
    mkdirSync(workersDir, { recursive: true });
}

console.log('Syncing PDF.js worker files...\n');

for (const worker of workerFiles) {
    const srcPath = join(rootDir, worker.src);
    const destPath = join(rootDir, worker.dest);

    if (!existsSync(srcPath)) {
        console.warn(`⚠️  Source not found: ${worker.src}`);
        console.warn(`   Skipping ${worker.name}\n`);
        continue;
    }

    try {
        copyFileSync(srcPath, destPath);
        console.log(`✓ Copied ${worker.name}`);
        console.log(`  From: ${worker.src}`);
        console.log(`  To:   ${worker.dest}`);

        // Also create a .js copy for hosts that serve .mjs as application/octet-stream
        if (destPath.endsWith('.mjs')) {
            const jsDestPath = destPath.replace(/\.mjs$/, '.js');
            copyFileSync(srcPath, jsDestPath);
            console.log(`  To:   ${jsDestPath.replace(rootDir + '/', '')}`);
        }
        console.log('');
    } catch (error) {
        console.error(`✗ Failed to copy ${worker.name}:`, error.message);
    }
}

console.log('PDF.js worker sync complete!');
