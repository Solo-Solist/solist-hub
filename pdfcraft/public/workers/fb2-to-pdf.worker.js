/**
 * FB2 to PDF Worker (via Pyodide + PyMuPDF)
 * PyMuPDF has native FB2 (FictionBook) support, providing high-quality conversion!
 * 
 * Note: FB2 format is primarily used for Cyrillic text (Russian, Ukrainian, etc.)
 * PyMuPDF's built-in fonts support Cyrillic characters, so no additional font download is needed.
 * 
 * Uses PyMuPDF's native convert_to_pdf() for optimal file size and text preservation.
 */

import { loadPyodide } from '/pymupdf-wasm/pyodide.js';

let pyodide = null;
let initPromise = null;

async function init() {
    if (pyodide) return pyodide;

    self.postMessage({ type: 'status', message: 'Loading Python environment...' });

    pyodide = await loadPyodide({
        indexURL: '/pymupdf-wasm/',
        fullStdLib: false
    });

    self.postMessage({ type: 'status', message: 'Installing dependencies...' });

    const install = async (url) => {
        await pyodide.loadPackage(url);
    };

    const basePath = '/pymupdf-wasm/';
    await install(basePath + 'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl');
    await install(basePath + 'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl');

    self.postMessage({ type: 'status', message: 'Initializing converter...' });

    pyodide.runPython(`
import pymupdf
import gc
import zipfile
import io

def convert_fb2_to_pdf(input_obj, quality='medium'):
    """
    Convert FB2 (FictionBook) to PDF using PyMuPDF's native conversion.
    
    This method preserves text as vector content (not images), resulting in:
    - Much smaller file sizes
    - Searchable/selectable text
    - Better quality at any zoom level
    
    Supports both .fb2 and .fb2.zip files.
    """
    if hasattr(input_obj, "to_py"):
        input_bytes = bytes(input_obj.to_py())
    else:
        input_bytes = bytes(input_obj)
    
    # Check if it's a zipped FB2
    fb2_bytes = input_bytes
    try:
        with zipfile.ZipFile(io.BytesIO(input_bytes)) as zf:
            fb2_files = [name for name in zf.namelist() if name.lower().endswith('.fb2')]
            if fb2_files:
                fb2_bytes = zf.read(fb2_files[0])
    except:
        pass
    
    # Open FB2 with PyMuPDF
    fb2_doc = pymupdf.open(stream=fb2_bytes, filetype="fb2")
    
    # Use PyMuPDF's native PDF conversion - preserves text, much smaller file size
    pdf_bytes = fb2_doc.convert_to_pdf()
    
    fb2_doc.close()
    gc.collect()
    
    # Optionally optimize the PDF
    pdf_doc = pymupdf.open("pdf", pdf_bytes)
    
    # Save with compression and garbage collection
    optimized_bytes = pdf_doc.tobytes(
        garbage=4,      # Maximum garbage collection
        deflate=True,   # Compress streams
        clean=True      # Clean up redundant objects
    )
    
    pdf_doc.close()
    gc.collect()
    
    return optimized_bytes
    `);

    return pyodide;
}

self.onmessage = async (event) => {
    const { type, id, data } = event.data;

    try {
        if (type === 'init') {
            if (!initPromise) initPromise = init();
            await initPromise;
            self.postMessage({ id, type: 'init-complete' });
            return;
        }

        if (type === 'convert') {
            if (!pyodide) {
                if (!initPromise) initPromise = init();
                await initPromise;
            }

            const { file, quality = 'medium' } = data;
            const arrayBuffer = await file.arrayBuffer();
            const inputBytes = new Uint8Array(arrayBuffer);

            self.postMessage({ type: 'status', message: 'Converting FB2 to PDF...' });

            const convertFunc = pyodide.globals.get('convert_fb2_to_pdf');
            const resultProxy = convertFunc(inputBytes, quality);
            const resultBytes = resultProxy.toJs();
            resultProxy.destroy();

            const resultBlob = new Blob([resultBytes], { type: 'application/pdf' });

            self.postMessage({
                id,
                type: 'convert-complete',
                result: resultBlob
            });
        }

    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({
            id,
            type: 'error',
            error: error.message || String(error)
        });
    }
};
