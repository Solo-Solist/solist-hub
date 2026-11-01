/**
 * PDF to PPTX Worker (via Pyodide + PyMuPDF + python-pptx)
 * 
 * Converts PDF pages to images and creates a PPTX with each page as a slide.
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

    // Mock missing non-critical dependencies
    pyodide.runPython(`
    import sys
    from types import ModuleType
    
    # Mock tqdm (used for progress bars)
    tqdm_mod = ModuleType("tqdm")
    def tqdm(iterable=None, *args, **kwargs):
        return iterable if iterable else []
    tqdm_mod.tqdm = tqdm
    sys.modules["tqdm"] = tqdm_mod
  `);

    // Install required packages
    // Install Pillow (local wheel)
    self.postMessage({ type: 'status', message: 'Installing Pillow...' });
    await install(basePath + 'pillow-11.2.1-cp313-cp313-pyodide_2025_0_wasm32.whl');

    await install(basePath + 'typing_extensions-4.12.2-py3-none-any.whl');
    await install(basePath + 'lxml-5.4.0-cp313-cp313-pyodide_2025_0_wasm32.whl');
    await install(basePath + 'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl');

    // Install python-pptx and its dependency
    self.postMessage({ type: 'status', message: 'Installing python-pptx...' });
    await install(basePath + 'python_pptx-1.0.2-py3-none-any.whl');

    // Define the python processing script
    self.postMessage({ type: 'status', message: 'Initializing converter script...' });

    pyodide.runPython(`
import os
import io
import fitz  # PyMuPDF
from pptx import Presentation
from pptx.util import Inches, Emu

def convert_pdf_to_pptx(input_obj, dpi=150):
    """
    Convert PDF to PPTX by rendering each page as an image and adding to slides.
    """
    # Convert JsProxy to bytes
    if hasattr(input_obj, "to_py"):
        input_bytes = input_obj.to_py()
    else:
        input_bytes = input_obj

    # Open PDF
    pdf_doc = fitz.open(stream=input_bytes, filetype="pdf")
    
    # Create presentation
    prs = Presentation()
    
    # Process each page
    for page_num in range(len(pdf_doc)):
        page = pdf_doc[page_num]
        
        # Get page dimensions
        rect = page.rect
        width_pt = rect.width
        height_pt = rect.height
        
        # Set slide dimensions to match PDF page aspect ratio
        # Standard slide is 10x7.5 inches, but we'll match PDF aspect ratio
        aspect_ratio = width_pt / height_pt
        
        # Use standard width of 10 inches
        slide_width = Inches(10)
        slide_height = Emu(slide_width / aspect_ratio)
        
        prs.slide_width = slide_width
        prs.slide_height = slide_height
        
        # Render page to image
        mat = fitz.Matrix(dpi / 72, dpi / 72)  # Scale for DPI
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_bytes = pix.tobytes("png")
        
        # Add blank slide
        blank_layout = prs.slide_layouts[6]  # Blank layout
        slide = prs.slides.add_slide(blank_layout)
        
        # Save image temporarily
        img_path = f"temp_page_{page_num}.png"
        with open(img_path, "wb") as f:
            f.write(img_bytes)
        
        # Add image to slide (full slide size)
        slide.shapes.add_picture(
            img_path,
            left=0,
            top=0,
            width=slide_width,
            height=slide_height
        )
        
        # Cleanup temp image
        os.remove(img_path)
    
    pdf_doc.close()
    
    # Save presentation to bytes
    output = io.BytesIO()
    prs.save(output)
    output.seek(0)
    pptx_bytes = output.read()
    
    return pptx_bytes
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

            const { file, dpi = 150 } = data;
            const arrayBuffer = await file.arrayBuffer();
            const inputBytes = new Uint8Array(arrayBuffer);

            self.postMessage({ type: 'status', message: 'Converting PDF pages to slides...' });

            // Call Python function
            const convertFunc = pyodide.globals.get('convert_pdf_to_pptx');
            const resultProxy = convertFunc(inputBytes, dpi);
            const resultBytes = resultProxy.toJs();
            resultProxy.destroy();

            const resultBlob = new Blob([resultBytes], {
                type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            });

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
