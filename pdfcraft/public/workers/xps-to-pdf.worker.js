/**
 * XPS to PDF Worker (via Pyodide + PyMuPDF)
 * PyMuPDF natively supports opening XPS files
 */

import { loadPyodide } from '/pymupdf-wasm/pyodide.js';

let pyodide = null;
let initPromise = null;

async function init() {
    if (pyodide) return pyodide;

    self.postMessage({ type: 'status', message: 'Loading Python environment...' });

    // Initialize Pyodide
    pyodide = await loadPyodide({
        indexURL: '/pymupdf-wasm/',
        fullStdLib: false
    });

    self.postMessage({ type: 'status', message: 'Installing dependencies...' });

    const install = async (url) => {
        await pyodide.loadPackage(url);
    };

    const basePath = '/pymupdf-wasm/';

    // Install PyMuPDF
    await install(basePath + 'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl');
    await install(basePath + 'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl');

    self.postMessage({ type: 'status', message: 'Initializing converter script...' });

    // Define the Python conversion script
    pyodide.runPython(`
import pymupdf

def convert_xps_to_pdf(input_obj):
    # Convert JsProxy (Uint8Array) to bytes
    if hasattr(input_obj, "to_py"):
        input_bytes = bytes(input_obj.to_py())
    else:
        input_bytes = bytes(input_obj)
    
    # Write XPS to virtual filesystem
    with open("input.xps", "wb") as f:
        f.write(input_bytes)
    
    # Open XPS file with PyMuPDF (it natively supports XPS)
    doc = pymupdf.open("input.xps")
    
    # Convert to PDF
    pdf_bytes = doc.convert_to_pdf()
    doc.close()
    
    # Clean up
    import os
    if os.path.exists("input.xps"):
        os.remove("input.xps")
    
    return pdf_bytes
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

            const { file } = data;
            const arrayBuffer = await file.arrayBuffer();
            const inputBytes = new Uint8Array(arrayBuffer);

            self.postMessage({ type: 'status', message: 'Converting XPS to PDF...' });

            // Call Python function
            const convertFunc = pyodide.globals.get('convert_xps_to_pdf');
            const resultProxy = convertFunc(inputBytes);
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
