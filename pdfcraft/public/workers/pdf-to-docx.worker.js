/**
 * PDF to DOCX Worker (via Pyodide + pdf2docx)
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
    
    # Mock fire (CLI tool, not needed for library usage)
    fire_mod = ModuleType("fire")
    sys.modules["fire"] = fire_mod
  `);

  // Group 1: Load independent packages in parallel (no inter-dependencies)
  self.postMessage({ type: 'status', message: 'Loading core packages...' });
  await Promise.all([
    pyodide.loadPackage(basePath + 'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl'),
    pyodide.loadPackage(basePath + 'typing_extensions-4.12.2-py3-none-any.whl'),
    pyodide.loadPackage(basePath + 'packaging-24.1-py3-none-any.whl').catch(e =>
      console.warn("Failed to load packaging, fonttools might fail:", e)
    ),
    pyodide.loadPackage(basePath + 'lxml-5.4.0-cp313-cp313-pyodide_2025_0_wasm32.whl'),
    pyodide.loadPackage(basePath + 'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl'),
  ]);

  // Group 2: Load packages that depend on Group 1, in parallel
  self.postMessage({ type: 'status', message: 'Loading converters...' });
  await Promise.all([
    pyodide.loadPackage(basePath + 'fonttools-4.56.0-py3-none-any.whl'),
    pyodide.loadPackage(basePath + 'python_docx-1.2.0-py3-none-any.whl'),
    pyodide.loadPackage(basePath + 'opencv_python-4.11.0.86-cp313-cp313-pyodide_2025_0_wasm32.whl'),
  ]);

  // Group 3: pdf2docx depends on all above
  self.postMessage({ type: 'status', message: 'Installing pdf2docx...' });
  await pyodide.loadPackage(basePath + 'pdf2docx-0.5.8-py3-none-any.whl');

  self.postMessage({ type: 'status', message: 'Initializing converter...' });

  // Define Python helper functions
  pyodide.runPython(`
import os
import fitz  # PyMuPDF

# Monkey-patch Pixmap.tobytes to handle unsupported colorspaces (e.g. CMYK)
_original_tobytes = fitz.Pixmap.tobytes

def _patched_tobytes(self, output="png", *args, **kwargs):
    try:
        return _original_tobytes(self, output, *args, **kwargs)
    except ValueError as e:
        if "unsupported colorspace" in str(e):
            rgb_pix = fitz.Pixmap(fitz.csRGB, self)
            result = _original_tobytes(rgb_pix, output, *args, **kwargs)
            rgb_pix = None
            return result
        raise

fitz.Pixmap.tobytes = _patched_tobytes

from pdf2docx import Converter

def pdf_write_input(input_obj):
    """Write PDF bytes to virtual filesystem."""
    if hasattr(input_obj, "to_py"):
        input_bytes = input_obj.to_py()
    else:
        input_bytes = input_obj
    
    with open("input.pdf", "wb") as f:
        f.write(input_bytes)

def pdf_convert():
    """Convert PDF to DOCX with optimized settings. Returns page count."""
    cv = Converter("input.pdf")
    # Get page count from Converter's internal fitz doc (no extra open)
    page_count = len(cv.fitz_doc)
    cv.convert("output.docx", start=0, end=None,
        clip_image_res_ratio=1.0,
        min_svg_gap_dx=5.0,
        min_svg_gap_dy=5.0,
        min_svg_w=2.0,
        min_svg_h=2.0,
        parse_stream_table=False,
    )
    cv.close()
    return page_count

def pdf_read_result():
    """Read the DOCX result and clean up."""
    with open("output.docx", "rb") as f:
        docx_bytes = f.read()
    
    if os.path.exists("input.pdf"):
        os.remove("input.pdf")
    if os.path.exists("output.docx"):
        os.remove("output.docx")
    
    return docx_bytes
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

      // Step 1: Write PDF to virtual filesystem
      self.postMessage({ type: 'progress', message: 'Preparing PDF...', percent: 5 });
      const writeInput = pyodide.globals.get('pdf_write_input');
      writeInput(inputBytes);

      self.postMessage({
        type: 'progress',
        message: 'Converting to DOCX...',
        percent: 10
      });

      // Step 2: Convert PDF to DOCX (returns page count)
      // Using runPythonAsync so the progress message above is flushed to main thread
      const totalPages = await pyodide.runPythonAsync('pdf_convert()');

      self.postMessage({
        type: 'progress',
        message: `Converted ${totalPages} pages successfully`,
        percent: 85
      });

      self.postMessage({
        type: 'progress',
        message: 'Reading result...',
        percent: 90
      });

      // Step 3: Read result
      const readResult = pyodide.globals.get('pdf_read_result');
      const resultProxy = readResult();
      const resultBytes = resultProxy.toJs();
      resultProxy.destroy();

      const resultBlob = new Blob([resultBytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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
