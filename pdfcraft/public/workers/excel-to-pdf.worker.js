/**
 * Excel to PDF Worker (via Pyodide + openpyxl + PyMuPDF)
 */

import { loadPyodide } from '/pymupdf-wasm/pyodide.js';

let pyodide = null;
let initPromise = null;
let cjkFontLoaded = false;

function hasCJKCharacters(text) {
    if (!text) return false;
    return /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(text);
}

async function extractTextFromXLSX(arrayBuffer) {
    try {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
        return (text.match(/<t[^>]*>([^<]*)<\/t>/gi) || []).map(m => m.replace(/<[^>]+>/g, '')).join(' ');
    } catch (e) {
        return '';
    }
}

async function loadCJKFont() {
    if (cjkFontLoaded) return true;
    try {
        const res = await fetch('/fonts/NotoSansSC-Regular.ttf');
        if (res.ok) {
            const data = await res.arrayBuffer();
            if (data.byteLength > 100000) {
                pyodide.FS.writeFile('/cjk_font.ttf', new Uint8Array(data));
                cjkFontLoaded = true;
                return true;
            }
        }
    } catch (e) {
        // Fallback gracefully to PyMuPDF's built-in CJK fonts (e.g. china-s)
    }
    return false;
}

async function init(needsCJK = false) {
    if (pyodide) {
        if (needsCJK && !cjkFontLoaded) {
            await loadCJKFont();
        }
        return pyodide;
    }

    self.postMessage({ type: 'status', message: 'Loading Python environment...' });
    pyodide = await loadPyodide({ indexURL: '/pymupdf-wasm/', fullStdLib: false });

    self.postMessage({ type: 'status', message: 'Installing dependencies...' });
    const base = '/pymupdf-wasm/';
    await pyodide.loadPackage(base + 'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl');
    await pyodide.loadPackage(base + 'et_xmlfile-2.0.0-py3-none-any.whl');
    await pyodide.loadPackage(base + 'openpyxl-3.1.5-py2.py3-none-any.whl');
    await pyodide.loadPackage(base + 'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl');

    if (needsCJK) await loadCJKFont();

    self.postMessage({ type: 'status', message: 'Initializing converter...' });
    initPython();
    return pyodide;
}

function initPython() {
    pyodide.runPython(`
import pymupdf
from openpyxl import load_workbook
import io
import os

def convert_excel_to_pdf(input_obj):
    if hasattr(input_obj, "to_py"):
        input_bytes = bytes(input_obj.to_py())
    else:
        input_bytes = bytes(input_obj)
    
    wb = load_workbook(io.BytesIO(input_bytes), data_only=True)
    pdf = pymupdf.open()
    
    page_width, page_height = 842, 595
    margin = 30
    content_width = page_width - 2 * margin
    
    fontsize = 9
    header_fontsize = 10
    cell_padding = 3
    min_row_height = fontsize + cell_padding * 2 + 2
    header_row_height = header_fontsize + cell_padding * 2 + 4
    
    header_bg = (0.2, 0.4, 0.7)
    header_text_color = (1, 1, 1)
    alt_row_bg = (0.95, 0.97, 1)
    border_color = (0.7, 0.7, 0.7)
    
    # Use china-s for CJK support (PyMuPDF built-in)
    font_name = "china-s"
    
    for sheet in wb.worksheets:
        title = sheet.title
        
        if sheet.max_row is None or sheet.max_column is None or sheet.max_row == 0:
            page = pdf.new_page(width=page_width, height=page_height)
            page.insert_text((margin, margin + 15), title, fontsize=14, fontname=font_name, color=(0.2, 0.2, 0.2))
            page.insert_text((margin, margin + 35), "(Empty)", fontsize=10, fontname=font_name, color=(0.5, 0.5, 0.5))
            continue
        
        rows = []
        for r in range(1, sheet.max_row + 1):
            row = []
            for c in range(1, sheet.max_column + 1):
                v = sheet.cell(r, c).value
                row.append(str(v) if v is not None else "")
            rows.append(row)
        
        if not rows or all(all(c == "" for c in r) for r in rows):
            page = pdf.new_page(width=page_width, height=page_height)
            page.insert_text((margin, margin + 15), title, fontsize=14, fontname=font_name, color=(0.2, 0.2, 0.2))
            page.insert_text((margin, margin + 35), "(Empty)", fontsize=10, fontname=font_name, color=(0.5, 0.5, 0.5))
            continue
        
        col_count = sheet.max_column
        col_widths = [60] * col_count
        
        for row in rows:
            for i, txt in enumerate(row):
                if i < col_count and txt:
                    w = len(txt) * fontsize * 0.6 + cell_padding * 2
                    col_widths[i] = max(col_widths[i], min(w, 200))
        
        total = sum(col_widths)
        if total > content_width:
            scale = content_width / total
            col_widths = [w * scale for w in col_widths]
        
        current_page = None
        y = 0
        
        def new_page(cont=False):
            nonlocal current_page, y
            current_page = pdf.new_page(width=page_width, height=page_height)
            y = margin
            t = title + (" (cont.)" if cont else "")
            current_page.insert_text((margin, y + 12), t, fontsize=12, fontname=font_name, color=(0.2, 0.2, 0.2))
            y += 25
        
        new_page()
        
        for ri, row in enumerate(rows):
            is_header = (ri == 0)
            rh = header_row_height if is_header else min_row_height
            
            if y + rh > page_height - margin:
                new_page(True)
                # Repeat header
                if rows:
                    hr = rows[0]
                    x = margin
                    for ci in range(col_count):
                        rect = pymupdf.Rect(x, y, x + col_widths[ci], y + header_row_height)
                        current_page.draw_rect(rect, color=header_bg, fill=header_bg)
                        current_page.draw_rect(rect, color=border_color, width=0.5)
                        txt = hr[ci] if ci < len(hr) else ""
                        if txt:
                            # Truncate text to fit cell
                            max_chars = int((col_widths[ci] - cell_padding * 2) / (header_fontsize * 0.6))
                            if len(txt) > max_chars:
                                txt = txt[:max_chars-2] + ".."
                            text_y = y + cell_padding + header_fontsize
                            current_page.insert_text((x + cell_padding, text_y), txt, fontsize=header_fontsize, fontname=font_name, color=header_text_color)
                        x += col_widths[ci]
                    y += header_row_height
            
            x = margin
            bg = header_bg if is_header else (alt_row_bg if ri % 2 == 0 else None)
            tc = header_text_color if is_header else (0, 0, 0)
            fs = header_fontsize if is_header else fontsize
            
            for ci in range(col_count):
                rect = pymupdf.Rect(x, y, x + col_widths[ci], y + rh)
                if bg:
                    current_page.draw_rect(rect, color=bg, fill=bg)
                current_page.draw_rect(rect, color=border_color, width=0.5)
                
                txt = row[ci] if ci < len(row) else ""
                if txt:
                    # Truncate text to fit cell
                    max_chars = int((col_widths[ci] - cell_padding * 2) / (fs * 0.6))
                    if len(txt) > max_chars:
                        txt = txt[:max_chars-2] + ".."
                    text_y = y + cell_padding + fs
                    current_page.insert_text((x + cell_padding, text_y), txt, fontsize=fs, fontname=font_name, color=tc)
                x += col_widths[ci]
            y += rh
    
    wb.close()
    if len(pdf) == 0:
        page = pdf.new_page(width=page_width, height=page_height)
        page.insert_text((margin, margin + 20), "Empty workbook", fontsize=12)
    
    return pdf.tobytes(garbage=4, deflate=True, clean=True)
`);
}

async function detectCJK(buf) {
    try {
        const text = await extractTextFromXLSX(buf);
        return hasCJKCharacters(text) || hasCJKCharacters(new TextDecoder().decode(buf));
    } catch { return false; }
}

self.onmessage = async (event) => {
    const { type, id, data } = event.data;
    try {
        if (type === 'init') {
            if (!initPromise) initPromise = init(true);
            await initPromise;
            self.postMessage({ id, type: 'init-complete' });
            return;
        }
        if (type === 'convert') {
            const buf = await data.file.arrayBuffer();
            const bytes = new Uint8Array(buf);

            self.postMessage({ type: 'status', message: 'Analyzing...' });
            const needsCJK = await detectCJK(buf);

            if (!pyodide) {
                if (!initPromise) initPromise = init(needsCJK);
                await initPromise;
            } else if (needsCJK && !cjkFontLoaded) {
                await loadCJKFont();
            }

            self.postMessage({ type: 'status', message: 'Converting...' });
            const fn = pyodide.globals.get('convert_excel_to_pdf');
            const result = fn(bytes);
            const out = result.toJs();
            result.destroy();

            self.postMessage({ id, type: 'convert-complete', result: new Blob([out], { type: 'application/pdf' }) });
        }
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({ id, type: 'error', error: error.message || String(error) });
    }
};
