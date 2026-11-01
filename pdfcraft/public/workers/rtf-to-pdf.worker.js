/**
 * RTF to PDF Worker (via Pyodide + PyMuPDF)
 * Uses PyMuPDF's Story feature to render RTF content
 * 
 * Improvements:
 * 1. Enhanced CJK detection by scanning actual document content
 * 2. Dynamic font loading support with multiple fallback sources
 * 3. Support for Chinese/Japanese/Korean text in RTF files
 */

import { loadPyodide } from '/pymupdf-wasm/pyodide.js';

let pyodide = null;
let initPromise = null;
let cjkFontLoaded = false;

// CJK character detection
function hasCJKCharacters(text) {
    if (!text) return false;
    // CJK Unicode ranges: Chinese, Japanese, Korean, CJK Extension A, Compatibility
    const cjkRegex = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u3400-\u4DBF\uF900-\uFAFF]/g;
    return cjkRegex.test(text);
}

// Download and load CJK font
async function loadCJKFont() {
    if (cjkFontLoaded) return true;

    self.postMessage({ type: 'status', message: 'Downloading CJK fonts for Chinese/Japanese/Korean support...' });

    // Font sources in priority order
    const fontSources = [
        'https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
        'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
        'https://unpkg.com/@aspect-build/aspect-font@1.0.0/fonts/NotoSansSC-Regular.otf'
    ];

    for (const fontUrl of fontSources) {
        try {
            self.postMessage({ type: 'status', message: `Trying font source: ${new URL(fontUrl).hostname}...` });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(fontUrl, {
                signal: controller.signal,
                cache: 'force-cache'
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const fontData = await response.arrayBuffer();

                if (fontData.byteLength > 1000000) {
                    pyodide.FS.writeFile('custom_font.otf', new Uint8Array(fontData));
                    cjkFontLoaded = true;
                    self.postMessage({ type: 'status', message: 'CJK font loaded successfully!' });
                    return true;
                }
            }
        } catch (e) {
            console.warn(`Font download failed from ${fontUrl}:`, e.message);
        }
    }

    console.warn('All CJK font sources failed');
    self.postMessage({ type: 'status', message: 'Warning: CJK font download failed.' });
    return false;
}

async function init(needsCJKFont = false) {
    if (pyodide) {
        if (needsCJKFont && !cjkFontLoaded) {
            await loadCJKFont();
            await reinitializePythonConverter();
        }
        return pyodide;
    }

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

    if (needsCJKFont) {
        await loadCJKFont();
    }

    self.postMessage({ type: 'status', message: 'Initializing converter script...' });

    await initializePythonConverter();

    return pyodide;
}

async function initializePythonConverter() {
    pyodide.runPython(`
import pymupdf
import re
import os

def strip_rtf(text):
    """Simple RTF to plain text converter"""
    # Remove RTF control words and groups
    text = re.sub(r'\\\\[a-z]+\\d* ?', '', text)
    text = re.sub(r'[{}]', '', text)
    text = re.sub(r'\\\\\\\\', '\\\\', text)
    text = re.sub(r"\\\\'([0-9a-fA-F]{2})", lambda m: chr(int(m.group(1), 16)), text)
    # Clean up extra whitespace
    text = re.sub(r'\\n+', '\\n', text)
    text = text.strip()
    return text

def convert_rtf_to_pdf(input_obj):
    # Convert JsProxy (Uint8Array) to bytes
    if hasattr(input_obj, "to_py"):
        input_bytes = bytes(input_obj.to_py())
    else:
        input_bytes = bytes(input_obj)
    
    # Decode RTF content
    try:
        rtf_text = input_bytes.decode('utf-8')
    except:
        rtf_text = input_bytes.decode('latin-1')
    
    # Extract plain text from RTF
    plain_text = strip_rtf(rtf_text)
    
    # Create PDF with the text content
    doc = pymupdf.open()
    
    # Page dimensions (A4)
    page_width = 595
    page_height = 842
    margin = 72  # 1 inch margin
    
    # Font setup
    font_file = None
    font_name = "helv"
    if os.path.exists('custom_font.otf'):
        font_file = 'custom_font.otf'
        font_name = "custom"
    
    fontsize = 11
    lineheight = fontsize * 1.5
    
    # Split text into lines
    lines = plain_text.split('\\n')
    
    # Calculate available area
    text_width = page_width - 2 * margin
    max_lines_per_page = int((page_height - 2 * margin) / lineheight)
    
    current_line = 0
    page = None
    y_position = 0
    
    for line in lines:
        if page is None or current_line >= max_lines_per_page:
            page = doc.new_page(width=page_width, height=page_height)
            current_line = 0
            y_position = margin
        
        # Insert text
        if line.strip():
            page.insert_text(
                (margin, y_position + fontsize),
                line,
                fontsize=fontsize,
                fontname=font_name,
                fontfile=font_file
            )
        
        y_position += lineheight
        current_line += 1
    
    # If no content, create at least one page
    if len(doc) == 0:
        doc.new_page(width=page_width, height=page_height)
    
    # Save to bytes
    pdf_bytes = doc.tobytes()
    doc.close()
    
    return pdf_bytes
  `);
}

async function reinitializePythonConverter() {
    self.postMessage({ type: 'status', message: 'Reinitializing converter with CJK font support...' });
    await initializePythonConverter();
}

// Detect CJK in RTF content
async function detectCJKInRTF(arrayBuffer) {
    try {
        const textDecoder = new TextDecoder('utf-8', { fatal: false });
        const text = textDecoder.decode(arrayBuffer);
        return hasCJKCharacters(text);
    } catch (e) {
        return false;
    }
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
            const { file } = data;
            const arrayBuffer = await file.arrayBuffer();
            const inputBytes = new Uint8Array(arrayBuffer);

            // Enhanced CJK detection
            self.postMessage({ type: 'status', message: 'Analyzing document content...' });
            const needsCJK = await detectCJKInRTF(arrayBuffer);

            if (needsCJK) {
                self.postMessage({ type: 'status', message: 'Chinese/Japanese/Korean content detected, preparing fonts...' });
            }

            if (!pyodide) {
                if (!initPromise) initPromise = init(needsCJK);
                await initPromise;
            } else if (needsCJK && !cjkFontLoaded) {
                await loadCJKFont();
                await reinitializePythonConverter();
            }

            self.postMessage({ type: 'status', message: 'Converting RTF to PDF...' });

            const convertFunc = pyodide.globals.get('convert_rtf_to_pdf');
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
