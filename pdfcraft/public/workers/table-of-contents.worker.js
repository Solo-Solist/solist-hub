/**
 * Table of Contents Worker (via Pyodide + PyMuPDF)
 * Generates clickable TOC from PDF bookmarks with CJK font support
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

  // Download CJK Font for multi-language support
  self.postMessage({ type: 'status', message: 'Downloading fonts...' });
  try {
    const response = await fetch('https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf');
    if (response.ok) {
      const fontData = await response.arrayBuffer();
      pyodide.FS.writeFile('cjk_font.ttf', new Uint8Array(fontData));
    } else {
      console.warn('CJK Font download failed');
    }
  } catch (e) {
    console.warn('CJK Font download error:', e);
  }

  self.postMessage({ type: 'status', message: 'Initializing TOC generator...' });

  pyodide.runPython(`
import pymupdf
import io
import os

def generate_toc_with_cjk(input_bytes, title, font_size, add_bookmark):
    """Generate a table of contents page with CJK font support"""
    
    # Open the PDF
    src_pdf = pymupdf.open(stream=bytes(input_bytes), filetype="pdf")
    
    # Get the table of contents (bookmarks)
    toc = src_pdf.get_toc()
    
    if not toc:
        return {"status": "error", "message": "This PDF does not have any bookmarks. Please add bookmarks first using the Edit Bookmarks tool."}
    
    # Create a new PDF for the TOC page
    toc_pdf = pymupdf.open()
    
    # Page dimensions
    page_width = 595  # A4
    page_height = 842
    margin = 72
    text_width = page_width - 2 * margin
    
    # Font setup
    font_file = 'cjk_font.ttf' if os.path.exists('cjk_font.ttf') else None
    font_name = "cjk" if font_file else "helv"
    
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
    
    # Line height
    line_height = font_size * 1.8
    
    # First pass: calculate how many TOC pages we'll need
    temp_y = y_position
    temp_pages = 1
    for level, bookmark_title, page_num in toc:
        if temp_y + line_height > page_height - margin:
            temp_pages += 1
            temp_y = margin
        temp_y += line_height
    
    num_toc_pages = temp_pages
    
    # Generate TOC entries with adjusted page numbers
    toc_entries = []
    
    for level, bookmark_title, page_num in toc:
        # Indentation based on level
        indent = (level - 1) * 20
        
        # Check if we need a new page
        if y_position + line_height > page_height - margin:
            toc_page = toc_pdf.new_page(width=page_width, height=page_height)
            y_position = margin
        
        # Calculate adjusted page number (original + number of TOC pages)
        adjusted_page_num = page_num + num_toc_pages
        
        # Format entry text
        entry_text = bookmark_title
        page_text = str(adjusted_page_num)  # Display adjusted page number
        
        # Calculate positions
        x_start = margin + indent
        x_end = page_width - margin
        
        # Insert bookmark title
        toc_page.insert_text(
            (x_start, y_position + font_size),
            entry_text,
            fontsize=font_size,
            fontname=font_name,
            fontfile=font_file,
            color=(0.1, 0.1, 0.3)
        )
        
        # Insert page number (right-aligned)
        page_num_width = len(page_text) * font_size * 0.5
        toc_page.insert_text(
            (x_end - page_num_width - 10, y_position + font_size),
            page_text,
            fontsize=font_size,
            fontname=font_name,
            fontfile=font_file,
            color=(0.4, 0.4, 0.4)
        )
        
        # Add a link annotation to jump to the page
        # The link rect covers the entire entry line
        link_rect = pymupdf.Rect(x_start, y_position, x_end, y_position + line_height)
        
        # Store entry info for link creation after merge
        # Target page is 0-based index: original_page_num - 1 + num_toc_pages
        toc_entries.append({
            "rect": link_rect,
            "target_page": page_num - 1 + num_toc_pages,  # 0-based target page index after insertion
            "toc_page_num": len(toc_pdf) - 1  # 0-based TOC page number
        })
        
        y_position += line_height
    
    # Merge TOC pages at the beginning of the original PDF
    # First, insert the TOC pages at the beginning
    src_pdf.insert_pdf(toc_pdf, start_at=0)
    
    # Now add links on the TOC pages
    for entry in toc_entries:
        toc_page_idx = entry["toc_page_num"]  # TOC page index (0-based)
        target_page = entry["target_page"]  # Already calculated correctly
        
        page = src_pdf[toc_page_idx]
        
        # Create a link to the target page
        link = {
            "kind": pymupdf.LINK_GOTO,
            "from": entry["rect"],
            "page": target_page,
            "to": pymupdf.Point(0, 0)  # Top of the page
        }
        page.insert_link(link)
    
    # Update the document's TOC to include a bookmark for the new TOC page
    if add_bookmark:
        new_toc = [[1, title, 1]]  # Level 1, title, page 1
        # Adjust existing TOC entries
        for level, bookmark_title, page_num in toc:
            new_toc.append([level, bookmark_title, page_num + num_toc_pages])
        src_pdf.set_toc(new_toc)
    
    # Save result
    result_bytes = src_pdf.tobytes()
    
    toc_pdf.close()
    src_pdf.close()
    
    return {"status": "success", "pdf_bytes": result_bytes}
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
      const resultProxy = generateFunc(inputBytes, title, fontSize, addBookmark);

      // Convert the Python dict to JS Map
      const resultMap = resultProxy.toJs();
      resultProxy.destroy();

      const status = resultMap.get('status');

      if (status === 'error') {
        self.postMessage({
          status: 'error',
          message: resultMap.get('message')
        });
      } else {
        // Get the PDF bytes - it's a Uint8Array after toJs()
        const pdfBytesProxy = resultMap.get('pdf_bytes');

        // Convert to Uint8Array if needed
        let pdfBytes;
        if (pdfBytesProxy instanceof Uint8Array) {
          pdfBytes = pdfBytesProxy;
        } else if (pdfBytesProxy.toJs) {
          pdfBytes = new Uint8Array(pdfBytesProxy.toJs());
          pdfBytesProxy.destroy();
        } else {
          pdfBytes = new Uint8Array(pdfBytesProxy);
        }

        // Create a copy using slice() to extract only the actual PDF bytes
        // DO NOT use pdfBytes.buffer.slice(0) as that copies the entire WASM memory!
        const pdfBuffer = pdfBytes.slice().buffer;

        self.postMessage(
          {
            status: 'success',
            pdfBytes: pdfBuffer
          },
          [pdfBuffer]
        );
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
