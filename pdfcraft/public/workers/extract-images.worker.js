/**
 * Extract Images from PDF Worker (via Pyodide + PyMuPDF)
 */

import { loadPyodide } from '/pymupdf-wasm/pyodide.js';

let pyodide = null;
let initPromise = null;

async function init() {
    if (pyodide) return pyodide;

    self.postMessage({ type: 'status', message: 'Loading Python environment...' });

    // Load Pyodide
    pyodide = await loadPyodide({
        indexURL: '/pymupdf-wasm/',
        fullStdLib: false
    });

    self.postMessage({ type: 'status', message: 'Installing dependencies...' });

    // Helper to install packages from local wheels
    const install = async (url) => {
        await pyodide.loadPackage(url);
    };

    const basePath = '/pymupdf-wasm/';

    // Install dependencies
    // We only need pymupdf for extraction, but might need basic types
    // Using the same set as other workers ensures compatibility and cached loading
    await install(basePath + 'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl');

    self.postMessage({ type: 'status', message: 'Initializing extractor...' });

    // Define the extraction function in Python
    pyodide.runPython(`
import pymupdf
import io

def extract_images_from_pdf(input_bytes, options):
    try:
        min_width = options.get('minWidth', 0)
        min_height = options.get('minHeight', 0)
        min_size = options.get('minSize', 0)
        
        doc = pymupdf.open(stream=bytes(input_bytes), filetype="pdf")
        extracted_images = []
        
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            image_list = page.get_images()
            
            for img_info in image_list:
                xref = img_info[0]
                
                try:
                    base_image = doc.extract_image(xref)
                    if not base_image:
                        continue
                        
                    image_bytes = base_image["image"]
                    ext = base_image["ext"]
                    width = base_image["width"]
                    height = base_image["height"]
                    
                    # Apply filters
                    if width < min_width or height < min_height or len(image_bytes) < min_size:
                        continue
                        
                    extracted_images.append({
                        'data': image_bytes,
                        'ext': ext,
                        'width': width,
                        'height': height,
                        'page': page_idx + 1,
                        'size': len(image_bytes)
                    })
                except Exception as e:
                    print(f"Error extracting image {xref}: {e}")
                    continue
                    
        return extracted_images
        
    except Exception as e:
        raise Exception(f"PDF processing failed: {str(e)}")
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

        if (type === 'extract') {
            if (!pyodide) {
                if (!initPromise) initPromise = init();
                await initPromise;
            }

            const { file, options } = data;

            self.postMessage({ type: 'status', message: `Processing ${file.name}...` });

            const arrayBuffer = await file.arrayBuffer();
            const inputBytes = new Uint8Array(arrayBuffer);

            // Pass options to Python
            const pyOptions = pyodide.toPy(options);

            const extractFunc = pyodide.globals.get('extract_images_from_pdf');
            const resultProxy = extractFunc(inputBytes, pyOptions);
            const results = resultProxy.toJs();

            // Convert PyProxy objects to plain JS objects/Arrays
            // The 'data' field in results needs to be converted from PyProxy/bytes to Uint8Array
            const finalResults = results.map((img, index) => {
                // Ensure data is Uint8Array
                const imgData = img.get('data');
                let validData;
                if (imgData && imgData.toJs) {
                    validData = imgData.toJs();
                } else {
                    validData = new Uint8Array(imgData);
                }

                return {
                    index: index + 1,
                    name: `image_${index + 1}.${img.get('ext')}`,
                    ext: img.get('ext'),
                    data: validData, // Will be transferred
                    width: img.get('width'),
                    height: img.get('height'),
                    pageNumber: img.get('page'),
                    size: img.get('size')
                };
            });

            resultProxy.destroy();
            pyOptions.destroy();

            self.postMessage({
                id,
                type: 'extract-complete',
                result: finalResults
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
