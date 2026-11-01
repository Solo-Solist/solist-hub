/**
 * Table of Contents Worker V2
 * Use explicit versioning to bypass browser cache
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

    const basePath = '/pymupdf-wasm/';
    await pyodide.loadPackage(basePath + 'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl');

    // CJK Font will be downloaded on-demand by the Python script
    self.postMessage({ type: 'status', message: 'Initializing TOC generator...' });

    pyodide.runPython(`
import pymupdf
import io
import os

def check_bookmarks_need_cjk(toc):
    """Check if any bookmark title contains non-ASCII characters"""
    for level, bookmark_title, page_num in toc:
        if not all(ord(c) < 128 for c in bookmark_title):
            return True
    return False

async def download_cjk_font_if_needed(needs_cjk):
    if not needs_cjk:
        return False
        
    if os.path.exists('cjk_font.ttf'):
        return True
        
    import pyodide_js
    from js import fetch
    
    try:
        url = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf'
        response = await fetch(url)
        if response.ok:
            array_buffer = await response.arrayBuffer()
            data = array_buffer.to_py()
            with open('cjk_font.ttf', 'wb') as f:
                f.write(bytes(data))
            return True
    except Exception as e:
        print(f"Font download error: {e}")
        return False
    return False

async def generate_toc_with_cjk(input_bytes, title, font_size, font_family, add_bookmark):
    """Generate a table of contents page"""
    try:
        # Open the PDF
        src_pdf = pymupdf.open(stream=bytes(input_bytes), filetype="pdf")
        
        # Get the table of contents (bookmarks)
        toc = src_pdf.get_toc()
        
        if not toc:
            return {"status": "error", "message": "This PDF does not have any bookmarks."}
            
        # Check if we need CJK font
        # Also check the TOC title itself
        title_needs_cjk = not all(ord(c) < 128 for c in title)
        needs_cjk = title_needs_cjk or check_bookmarks_need_cjk(toc)
        
        font_file = None
        font_name = "helv" # Default PDF font (Times, Helvetica, Courier)
        
        if needs_cjk:
            # Try to download font if needed
            has_font = await download_cjk_font_if_needed(True)
            if has_font:
                font_file = 'cjk_font.ttf'
                font_name = "cjk"
            else:
                print("Warning: CJK font needed but could not be loaded. Falling back to Helvetica.")
        else:
            # No CJK needed, use standard fonts directly
            # e.g. "helv", "hebo", "times", "cour", etc.
            font_name = font_family
        
        # Create a new PDF for the TOC page
        toc_pdf = pymupdf.open()
        
        # Page dimensions
        page_width = 595  # A4
        page_height = 842
        margin = 72
        
        # Create first TOC page
        toc_page = toc_pdf.new_page(width=page_width, height=page_height)
        y_position = margin
        
        # Title
        title_fontsize = font_size + 6
        toc_page.insert_text(
            (margin, y_position + title_fontsize),
            title,
            fontsize=title_fontsize,
            fontname=font_name,
            fontfile=font_file,
            color=(0, 0, 0)
        )
        y_position += title_fontsize * 2
        line_height = font_size * 1.8
        
        # First pass: calculate TOC pages
        temp_y = y_position
        temp_pages = 1
        for level, bookmark_title, page_num in toc:
            if temp_y + line_height > page_height - margin:
                temp_pages += 1
                temp_y = margin
            temp_y += line_height
        
        num_toc_pages = temp_pages
        
        # Generate TOC entries
        toc_entries = []
        
        for level, bookmark_title, page_num in toc:
            indent = (level - 1) * 20
            if y_position + line_height > page_height - margin:
                toc_page = toc_pdf.new_page(width=page_width, height=page_height)
                y_position = margin
            
            adjusted_page_num = page_num + num_toc_pages
            entry_text = bookmark_title
            page_text = str(adjusted_page_num)
            
            x_start = margin + indent
            x_end = page_width - margin
            
            toc_page.insert_text((x_start, y_position + font_size), entry_text, fontsize=font_size, fontname=font_name, fontfile=font_file, color=(0.1, 0.1, 0.3))
            
            page_num_width = len(page_text) * font_size * 0.5
            toc_page.insert_text((x_end - page_num_width - 10, y_position + font_size), page_text, fontsize=font_size, fontname=font_name, fontfile=font_file, color=(0.4, 0.4, 0.4))
            
            link_rect = pymupdf.Rect(x_start, y_position, x_end, y_position + line_height)
            toc_entries.append({
                "rect": link_rect,
                "target_page": page_num - 1 + num_toc_pages,
                "toc_page_num": len(toc_pdf) - 1
            })
            
            y_position += line_height
        
        src_pdf.insert_pdf(toc_pdf, start_at=0)
        
        for entry in toc_entries:
            page = src_pdf[entry["toc_page_num"]]
            link = {
                "kind": pymupdf.LINK_GOTO,
                "from": entry["rect"],
                "page": entry["target_page"],
                "to": pymupdf.Point(0, 0)
            }
            page.insert_link(link)
        
        if add_bookmark:
            new_toc = [[1, title, 1]]
            for level, bookmark_title, page_num in toc:
                new_toc.append([level, bookmark_title, page_num + num_toc_pages])
            src_pdf.set_toc(new_toc)
        
        # Get result bytes safely
        print("Python: Generating bytes...")
        result_bytes = src_pdf.tobytes()
        print(f"Python: Generated {len(result_bytes)} bytes")
        
        toc_pdf.close()
        src_pdf.close()
        
        return {"status": "success", "pdf_bytes": result_bytes}
    except Exception as e:
        print(f"Python Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}
    `);

    return pyodide;
}

self.onmessage = async (event) => {
    const { command, pdfData, title, fontSize, fontFamily, addBookmark } = event.data;

    if (command === 'generate-toc') {
        try {
            if (!initPromise) initPromise = init();
            await initPromise;

            self.postMessage({ type: 'status', message: 'Generating table of contents...' });

            const inputBytes = new Uint8Array(pdfData);

            const generateFunc = pyodide.globals.get('generate_toc_with_cjk');

            // Execute Python function (async)
            const coroutine = generateFunc(inputBytes, title, fontSize, fontFamily, addBookmark);
            const resultProxy = await coroutine;
            const resultMap = resultProxy.toJs();
            resultProxy.destroy();
            coroutine.destroy();

            const status = resultMap.get('status');

            if (status === 'error') {
                self.postMessage({
                    status: 'error',
                    message: resultMap.get('message')
                });
            } else {
                // ROBUST DATA EXTRACTION
                const pdfBytesProxy = resultMap.get('pdf_bytes');

                // Explicitly create a NEW Uint8Array to detach from Pyodide memory
                // This is the critical fix for the 0-byte/corrupt file issue
                let safePdfBytes;

                if (pdfBytesProxy instanceof Uint8Array) {
                    safePdfBytes = new Uint8Array(pdfBytesProxy);
                } else if (pdfBytesProxy.toJs) {
                    // If it's a PyProxy, convert it first
                    const temp = pdfBytesProxy.toJs();
                    safePdfBytes = new Uint8Array(temp);
                    pdfBytesProxy.destroy();
                } else {
                    // Fallback using from() to ensure deep copy
                    safePdfBytes = Uint8Array.from(pdfBytesProxy);
                }

                console.log('Worker generated PDF size:', safePdfBytes.length);

                if (safePdfBytes.length === 0) {
                    console.error('Worker: FATAL - 0 bytes generated');
                    throw new Error('Generated PDF has 0 bytes');
                }

                // Use Blob for robust transfer, similar to word-to-pdf worker
                const pdfBlob = new Blob([safePdfBytes], { type: 'application/pdf' });
                console.log('Worker: Created Blob size:', pdfBlob.size);

                self.postMessage({
                    status: 'success',
                    pdfBlob: pdfBlob
                });
            }
        } catch (error) {
            console.error('TOC Worker error:', error);
            self.postMessage({
                status: 'error',
                message: error.message || 'Unknown error occurred during table of contents generation.'
            });
        }
    }
};
