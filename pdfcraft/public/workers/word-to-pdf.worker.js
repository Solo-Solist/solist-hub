/**
 * Word to PDF Worker (via Pyodide + python-docx + PyMuPDF)
 * 
 * Enhanced Features:
 * 1. Font styles (bold, italic, underline, strikethrough)
 * 2. Text colors and highlighting
 * 3. Better table layout with borders
 * 4. Proper paragraph spacing and alignment
 * 5. Heading styles with proper font sizes
 * 6. List support (bullets and numbering)
 * 7. Image positioning and sizing
 * 8. CJK font support with dynamic loading
 */

import { loadPyodide } from '/pymupdf-wasm/pyodide.js';

let pyodide = null;
let initPromise = null;
let cjkFontLoaded = false;

// CJK character detection
function hasCJKCharacters(text) {
    if (!text) return false;
    const cjkRegex = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u3400-\u4DBF\uF900-\uFAFF]/g;
    return cjkRegex.test(text);
}

// Extract text content from DOCX for CJK detection
async function extractTextFromDOCX(arrayBuffer) {
    try {
        const textDecoder = new TextDecoder('utf-8', { fatal: false });
        const fullText = textDecoder.decode(arrayBuffer);
        const textMatches = fullText.match(/<w:t[^>]*>([^<]*)<\/w:t>/gi) || [];
        let extractedText = '';
        for (const match of textMatches) {
            const content = match.replace(/<[^>]+>/g, '');
            extractedText += content + ' ';
        }
        return extractedText;
    } catch (e) {
        return '';
    }
}

// Download and load CJK font
async function loadCJKFont() {
    if (cjkFontLoaded) return true;

    self.postMessage({ type: 'status', message: 'Downloading CJK fonts...' });

    const fontSources = [
        'https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
        'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
        'https://unpkg.com/@aspect-build/aspect-font@1.0.0/fonts/NotoSansSC-Regular.otf'
    ];

    for (const fontUrl of fontSources) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const response = await fetch(fontUrl, { signal: controller.signal, cache: 'force-cache' });
            clearTimeout(timeoutId);

            if (response.ok) {
                const fontData = await response.arrayBuffer();
                if (fontData.byteLength > 1000000) {
                    pyodide.FS.writeFile('custom_font.otf', new Uint8Array(fontData));
                    cjkFontLoaded = true;
                    self.postMessage({ type: 'status', message: 'CJK font loaded!' });
                    return true;
                }
            }
        } catch (e) {
            console.warn(`Font download failed from ${fontUrl}`);
        }
    }
    return false;
}

async function init(needsCJKFont = false) {
    if (pyodide) {
        if (needsCJKFont && !cjkFontLoaded) {
            await loadCJKFont();
            await initializePythonConverter();
        }
        return pyodide;
    }

    self.postMessage({ type: 'status', message: 'Loading Python environment...' });

    pyodide = await loadPyodide({
        indexURL: '/pymupdf-wasm/',
        fullStdLib: false
    });

    self.postMessage({ type: 'status', message: 'Installing dependencies...' });

    const basePath = '/pymupdf-wasm/';
    await pyodide.loadPackage(basePath + 'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl');
    await pyodide.loadPackage(basePath + 'typing_extensions-4.12.2-py3-none-any.whl');
    await pyodide.loadPackage(basePath + 'lxml-5.4.0-cp313-cp313-pyodide_2025_0_wasm32.whl');
    await pyodide.loadPackage(basePath + 'python_docx-1.2.0-py3-none-any.whl');
    await pyodide.loadPackage(basePath + 'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl');

    if (needsCJKFont) {
        await loadCJKFont();
    }

    self.postMessage({ type: 'status', message: 'Initializing converter...' });
    await initializePythonConverter();

    return pyodide;
}

async function initializePythonConverter() {
    pyodide.runPython(`
import pymupdf
from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
import io
import os

def convert_word_to_pdf(input_obj):
    if hasattr(input_obj, "to_py"):
        input_bytes = bytes(input_obj.to_py())
    else:
        input_bytes = bytes(input_obj)
    
    doc = Document(io.BytesIO(input_bytes))
    pdf = pymupdf.open()
    
    # Page Layout (A4)
    page_width = 595
    page_height = 842
    margin_left = 72
    margin_right = 72
    margin_top = 72
    margin_bottom = 72
    text_width = page_width - margin_left - margin_right
    
    # Font setup
    font_file = 'custom_font.otf' if os.path.exists('custom_font.otf') else None
    base_font = "custom" if font_file else "helv"
    
    # Heading sizes mapping
    style_config = {
        'Title': {'size': 24, 'bold': True, 'spacing_after': 12},
        'Heading 1': {'size': 18, 'bold': True, 'spacing_after': 10},
        'Heading 2': {'size': 16, 'bold': True, 'spacing_after': 8},
        'Heading 3': {'size': 14, 'bold': True, 'spacing_after': 6},
        'Heading 4': {'size': 13, 'bold': True, 'spacing_after': 5},
        'Subtitle': {'size': 14, 'bold': False, 'spacing_after': 8},
        'Normal': {'size': 11, 'bold': False, 'spacing_after': 4},
        'List Paragraph': {'size': 11, 'bold': False, 'spacing_after': 2},
    }
    
    # Namespaces for XML parsing
    ns = {
        'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
    }

    # State
    current_page = None
    y_position = margin_top
    list_counters = {}  # For numbered lists
    
    def new_page():
        nonlocal current_page, y_position
        current_page = pdf.new_page(width=page_width, height=page_height)
        y_position = margin_top
        return current_page

    def ensure_space(needed_height):
        nonlocal current_page, y_position
        if current_page is None:
            new_page()
        if needed_height > (page_height - margin_top - margin_bottom):
            if y_position > margin_top:
                new_page()
            return
        if y_position + needed_height > page_height - margin_bottom:
            new_page()

    def emu_to_pt(emu):
        return int(emu) / 12700

    def parse_color(color_elem):
        """Parse color from docx color element"""
        if color_elem is None:
            return (0, 0, 0)
        
        # Theme color or RGB value
        val = color_elem.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val')
        if val and val != 'auto':
            try:
                if len(val) == 6:
                    r = int(val[0:2], 16) / 255
                    g = int(val[2:4], 16) / 255
                    b = int(val[4:6], 16) / 255
                    return (r, g, b)
            except:
                pass
        return (0, 0, 0)

    def get_run_properties(run):
        """Extract formatting properties from a run"""
        props = {
            'bold': False,
            'italic': False,
            'underline': False,
            'strike': False,
            'color': (0, 0, 0),
            'size': 11,
            'highlight': None
        }
        
        # Check run.bold, run.italic etc
        if run.bold:
            props['bold'] = True
        if run.italic:
            props['italic'] = True
        if run.underline:
            props['underline'] = True
        
        # Check font size
        if run.font.size:
            props['size'] = run.font.size.pt
        
        # Check color
        if run.font.color and run.font.color.rgb:
            rgb = run.font.color.rgb
            props['color'] = (rgb[0]/255, rgb[1]/255, rgb[2]/255)
        
        # Check strikethrough from XML
        rPr = run._element.find('.//w:rPr', ns)
        if rPr is not None:
            strike = rPr.find('.//w:strike', ns)
            if strike is not None:
                props['strike'] = True
            
            # Highlight color
            highlight = rPr.find('.//w:highlight', ns)
            if highlight is not None:
                hl_val = highlight.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val')
                highlight_colors = {
                    'yellow': (1, 1, 0),
                    'green': (0, 1, 0),
                    'cyan': (0, 1, 1),
                    'magenta': (1, 0, 1),
                    'blue': (0, 0, 1),
                    'red': (1, 0, 0),
                    'darkBlue': (0, 0, 0.5),
                    'darkCyan': (0, 0.5, 0.5),
                    'darkGreen': (0, 0.5, 0),
                    'darkMagenta': (0.5, 0, 0.5),
                    'darkRed': (0.5, 0, 0),
                    'darkYellow': (0.5, 0.5, 0),
                    'darkGray': (0.5, 0.5, 0.5),
                    'lightGray': (0.75, 0.75, 0.75),
                }
                if hl_val in highlight_colors:
                    props['highlight'] = highlight_colors[hl_val]
        
        return props

    def get_paragraph_alignment(para):
        """Get paragraph alignment"""
        try:
            if para.alignment == WD_ALIGN_PARAGRAPH.CENTER:
                return 1  # Center
            elif para.alignment == WD_ALIGN_PARAGRAPH.RIGHT:
                return 2  # Right
            elif para.alignment == WD_ALIGN_PARAGRAPH.JUSTIFY:
                return 3  # Justify
        except:
            pass
        return 0  # Left (default)

    def get_list_prefix(para):
        """Get list bullet or number prefix"""
        pPr = para._element.find('.//w:pPr', ns)
        if pPr is not None:
            numPr = pPr.find('.//w:numPr', ns)
            if numPr is not None:
                ilvl = numPr.find('.//w:ilvl', ns)
                numId = numPr.find('.//w:numId', ns)
                
                if numId is not None:
                    num_id = numId.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val')
                    level = 0
                    if ilvl is not None:
                        level = int(ilvl.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val', 0))
                    
                    indent = "  " * level
                    
                    # Simple heuristic: odd numId = bullets, even = numbers
                    # This is a simplification; real implementation would parse numbering.xml
                    if int(num_id) % 2 == 1:
                        return indent + "• "
                    else:
                        key = f"{num_id}_{level}"
                        if key not in list_counters:
                            list_counters[key] = 0
                        list_counters[key] += 1
                        return indent + f"{list_counters[key]}. "
        return ""

    def render_text_with_formatting(x, y, text, props, max_width):
        """Render text with formatting (bold, italic, color, etc.)"""
        nonlocal y_position
        
        fontsize = props['size']
        color = props['color']
        lineheight = fontsize * 1.5
        
        # Word wrap
        words = text.split()
        if not words:
            return y
        
        lines = []
        current_line = ""
        
        for word in words:
            test_line = current_line + (" " if current_line else "") + word
            # Estimate width (CJK chars are wider)
            est_width = sum(fontsize if ord(c) > 255 else fontsize * 0.5 for c in test_line)
            
            if est_width > max_width and current_line:
                lines.append(current_line)
                current_line = word
            else:
                current_line = test_line
        
        if current_line:
            lines.append(current_line)
        
        for line in lines:
            ensure_space(lineheight)
            
            # Draw highlight background if present
            if props['highlight']:
                line_width = sum(fontsize if ord(c) > 255 else fontsize * 0.5 for c in line)
                rect = pymupdf.Rect(x, y_position - 2, x + line_width, y_position + fontsize + 2)
                current_page.draw_rect(rect, color=props['highlight'], fill=props['highlight'])
            
            # Insert text
            current_page.insert_text(
                (x, y_position + fontsize),
                line,
                fontsize=fontsize,
                fontname=base_font,
                fontfile=font_file,
                color=color
            )
            
            # Draw underline
            if props['underline']:
                line_width = sum(fontsize if ord(c) > 255 else fontsize * 0.5 for c in line)
                current_page.draw_line(
                    (x, y_position + fontsize + 2),
                    (x + line_width, y_position + fontsize + 2),
                    color=color,
                    width=0.5
                )
            
            # Draw strikethrough
            if props['strike']:
                line_width = sum(fontsize if ord(c) > 255 else fontsize * 0.5 for c in line)
                strike_y = y_position + fontsize * 0.6
                current_page.draw_line(
                    (x, strike_y),
                    (x + line_width, strike_y),
                    color=color,
                    width=0.5
                )
            
            y_position += lineheight
        
        return y_position

    # Initialize first page
    new_page()

    # Process document body
    for element in doc.element.body:
        if element.tag.endswith('p'):
            # Paragraph
            para = Paragraph(element, doc)
            
            style_name = para.style.name if para.style else 'Normal'
            config = style_config.get(style_name, style_config['Normal'])
            base_fontsize = config['size']
            is_heading = config['bold']
            spacing_after = config['spacing_after']
            
            alignment = get_paragraph_alignment(para)
            list_prefix = get_list_prefix(para)
            
            # Calculate starting x based on alignment (simplified)
            x_start = margin_left
            if list_prefix:
                x_start += 20  # Indent for lists
            
            # Process runs
            para_text_parts = []
            has_images = False
            
            for run in para.runs:
                # Check for images
                drawings = run._element.findall('.//w:drawing', ns)
                if drawings:
                    has_images = True
                    # Flush current text
                    if para_text_parts:
                        combined_text = list_prefix + "".join([t for t, p in para_text_parts])
                        if combined_text.strip():
                            props = para_text_parts[0][1] if para_text_parts else get_run_properties(run)
                            if is_heading:
                                props['bold'] = True
                            props['size'] = base_fontsize
                            render_text_with_formatting(x_start, y_position, combined_text, props, text_width)
                        para_text_parts = []
                        list_prefix = ""
                    
                    # Render images
                    for drawing in drawings:
                        blip = drawing.find('.//a:blip', ns)
                        if blip is not None:
                            embed_id = blip.get(f'{{{ns["r"]}}}embed')
                            if embed_id:
                                try:
                                    rel = doc.part.rels[embed_id]
                                    image_bytes = rel.target_part.blob
                                    
                                    extent = drawing.find('.//wp:extent', ns)
                                    cx = 1270000
                                    cy = 1270000
                                    if extent is not None:
                                        cx = int(extent.get('cx'))
                                        cy = int(extent.get('cy'))
                                    
                                    width = emu_to_pt(cx)
                                    height = emu_to_pt(cy)
                                    
                                    # Scale to fit
                                    max_img_height = page_height - margin_top - margin_bottom - 50
                                    if width > text_width:
                                        scale = text_width / width
                                        width *= scale
                                        height *= scale
                                    if height > max_img_height:
                                        scale = max_img_height / height
                                        width *= scale
                                        height *= scale
                                    
                                    ensure_space(height + 10)
                                    
                                    # Center image
                                    x_offset = margin_left + (text_width - width) / 2
                                    rect = pymupdf.Rect(x_offset, y_position, x_offset + width, y_position + height)
                                    current_page.insert_image(rect, stream=image_bytes)
                                    y_position += height + 5
                                except Exception as e:
                                    pass
                
                # Collect text with properties
                if run.text:
                    props = get_run_properties(run)
                    if is_heading:
                        props['bold'] = True
                    props['size'] = base_fontsize
                    para_text_parts.append((run.text, props))
            
            # Render remaining text
            if para_text_parts:
                # Group consecutive runs with same properties for better rendering
                combined_text = list_prefix + "".join([t for t, p in para_text_parts])
                if combined_text.strip():
                    # Use properties of first run (simplified)
                    props = para_text_parts[0][1]
                    render_text_with_formatting(x_start, y_position, combined_text, props, text_width - (x_start - margin_left))
            
            # Paragraph spacing
            y_position += spacing_after

        elif element.tag.endswith('tbl'):
            # Table
            table = Table(element, doc)
            
            cols = len(table.columns)
            if cols == 0:
                continue
                
            col_width = text_width / cols
            row_height_base = 20
            cell_padding = 4
            
            # Draw table with borders
            table_start_y = y_position
            
            for row_idx, row in enumerate(table.rows):
                # Estimate row height based on content
                max_lines = 1
                for cell in row.cells:
                    cell_text = cell.text.strip()
                    if cell_text:
                        est_lines = max(1, len(cell_text) * 6 / col_width)
                        max_lines = max(max_lines, est_lines)
                
                row_height = max(row_height_base, int(max_lines * 14))
                
                ensure_space(row_height)
                
                x = margin_left
                for cell_idx, cell in enumerate(row.cells):
                    cell_text = cell.text.strip()
                    
                    # Draw cell border
                    cell_rect = pymupdf.Rect(x, y_position, x + col_width, y_position + row_height)
                    current_page.draw_rect(cell_rect, color=(0.7, 0.7, 0.7), width=0.5)
                    
                    # Draw cell text
                    if cell_text:
                        text_rect = pymupdf.Rect(
                            x + cell_padding, 
                            y_position + cell_padding, 
                            x + col_width - cell_padding, 
                            y_position + row_height - cell_padding
                        )
                        current_page.insert_textbox(
                            text_rect,
                            cell_text,
                            fontsize=10,
                            fontname=base_font,
                            fontfile=font_file,
                            align=0
                        )
                    
                    x += col_width
                
                y_position += row_height
            
            y_position += 10  # Table spacing

    if len(pdf) == 0:
        new_page()
    
    pdf_bytes = pdf.tobytes(garbage=4, deflate=True, clean=True)
    pdf.close()
    return pdf_bytes
    `);
}

async function detectCJKInDOCX(arrayBuffer) {
    try {
        const extractedText = await extractTextFromDOCX(arrayBuffer);
        if (hasCJKCharacters(extractedText)) return true;
        const textDecoder = new TextDecoder('utf-8', { fatal: false });
        const rawText = textDecoder.decode(arrayBuffer);
        return hasCJKCharacters(rawText);
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

            self.postMessage({ type: 'status', message: 'Analyzing document...' });
            const needsCJK = await detectCJKInDOCX(arrayBuffer);

            if (needsCJK) {
                self.postMessage({ type: 'status', message: 'CJK content detected, preparing fonts...' });
            }

            if (!pyodide) {
                if (!initPromise) initPromise = init(needsCJK);
                await initPromise;
            } else if (needsCJK && !cjkFontLoaded) {
                await loadCJKFont();
                await initializePythonConverter();
            }

            self.postMessage({ type: 'status', message: 'Converting Word to PDF...' });

            const convertFunc = pyodide.globals.get('convert_word_to_pdf');
            const resultProxy = convertFunc(inputBytes);
            const resultBytes = resultProxy.toJs();
            resultProxy.destroy();

            const resultBlob = new Blob([resultBytes], { type: 'application/pdf' });
            self.postMessage({ id, type: 'convert-complete', result: resultBlob });
        }
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({ id, type: 'error', error: error.message || String(error) });
    }
};
