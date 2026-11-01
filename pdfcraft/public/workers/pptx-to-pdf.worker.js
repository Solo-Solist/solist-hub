/**
 * PowerPoint to PDF Worker (via Pyodide + PyMuPDF)
 * 
 * Enhanced Features:
 * 1. Fixed CJK text width calculation
 * 2. Proper text wrapping with textbox
 * 3. Better slide layout
 * 4. CJK font support
 */

import { loadPyodide } from '/pymupdf-wasm/pyodide.js';

let pyodide = null;
let initPromise = null;
let cjkFontLoaded = false;

function hasCJKCharacters(text) {
    if (!text) return false;
    const cjkRegex = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u3400-\u4DBF\uF900-\uFAFF]/g;
    return cjkRegex.test(text);
}

async function extractTextFromPPTX(arrayBuffer) {
    try {
        const textDecoder = new TextDecoder('utf-8', { fatal: false });
        const fullText = textDecoder.decode(arrayBuffer);
        const textMatches = fullText.match(/<a:t[^>]*>([^<]*)<\/a:t>/gi) || [];
        let extractedText = '';
        for (const match of textMatches) {
            extractedText += match.replace(/<[^>]+>/g, '') + ' ';
        }
        return extractedText;
    } catch (e) {
        return '';
    }
}

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
    await pyodide.loadPackage(basePath + 'lxml-5.4.0-cp313-cp313-pyodide_2025_0_wasm32.whl');
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
import zipfile
import io
import re
import os
from lxml import etree

def convert_pptx_to_pdf(input_obj):
    if hasattr(input_obj, "to_py"):
        input_bytes = bytes(input_obj.to_py())
    else:
        input_bytes = bytes(input_obj)
    
    try:
        pptx_zip = zipfile.ZipFile(io.BytesIO(input_bytes), 'r')
    except zipfile.BadZipFile:
        raise ValueError("Invalid PPTX file")
    
    pdf = pymupdf.open()
    
    # Slide dimensions (16:9 landscape, similar to standard PPTX)
    page_width = 960
    page_height = 540
    margin = 20
    
    # PPTX uses EMUs: 914400 EMUs = 1 inch = 72 points
    # Standard slide: 9144000 x 6858000 EMUs = 720 x 540 points
    # We use 960x540 for better text readability
    pptx_width_emu = 9144000
    pptx_height_emu = 6858000
    scale_x = (page_width - 2 * margin) / (pptx_width_emu / 12700)
    scale_y = (page_height - 2 * margin) / (pptx_height_emu / 12700)
    
    # Font setup
    font_file = 'custom_font.otf' if os.path.exists('custom_font.otf') else None
    base_font = "custom" if font_file else "helv"
    
    # Namespaces
    ns = {
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    }
    
    def get_slide_files():
        files = []
        for name in pptx_zip.namelist():
            if name.startswith('ppt/slides/slide') and name.endswith('.xml'):
                match = re.search(r'slide(\\d+)\\.xml$', name)
                if match:
                    files.append((int(match.group(1)), name))
        files.sort(key=lambda x: x[0])
        return files

    def get_relationships(slide_filename):
        dirname = os.path.dirname(slide_filename)
        basename = os.path.basename(slide_filename)
        rels_path = f"{dirname}/_rels/{basename}.rels"
        
        rels = {}
        if rels_path in pptx_zip.namelist():
            try:
                content = pptx_zip.read(rels_path)
                root = etree.fromstring(content)
                for rel in root.iter('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                    rid = rel.get('Id')
                    target = rel.get('Target')
                    if target.startswith('../'):
                        target = 'ppt/' + target[3:]
                    elif not target.startswith('ppt/'):
                        target = 'ppt/slides/' + target
                    rels[rid] = target
            except:
                pass
        return rels

    def emu_to_pt(emu):
        if emu is None:
            return 0
        try:
            return int(emu) / 12700
        except:
            return 0

    def parse_color(elem, ns):
        """Parse color from DrawingML"""
        if elem is None:
            return None
        
        srgbClr = elem.find('.//a:srgbClr', ns)
        if srgbClr is not None:
            val = srgbClr.get('val')
            if val and len(val) == 6:
                try:
                    return (int(val[0:2], 16)/255, int(val[2:4], 16)/255, int(val[4:6], 16)/255)
                except:
                    pass
        
        schemeClr = elem.find('.//a:schemeClr', ns)
        if schemeClr is not None:
            val = schemeClr.get('val')
            colors = {
                'tx1': (0, 0, 0), 'tx2': (0.3, 0.3, 0.3),
                'bg1': (1, 1, 1), 'bg2': (0.95, 0.95, 0.95),
                'accent1': (0.2, 0.4, 0.8), 'accent2': (0.8, 0.3, 0.2),
                'dk1': (0, 0, 0), 'dk2': (0.2, 0.2, 0.2),
                'lt1': (1, 1, 1), 'lt2': (0.9, 0.9, 0.9),
            }
            return colors.get(val, (0, 0, 0))
        
        return None

    def render_textbox(page, x, y, width, height, text, fontsize, color, align=0):
        """Render text in a textbox with automatic wrapping"""
        if not text or not text.strip():
            return
        
        # Ensure minimum dimensions
        width = max(width, 50)
        height = max(height, fontsize * 2)
        
        # Create text rectangle
        rect = pymupdf.Rect(x, y, x + width, y + height)
        
        # Use insert_textbox for automatic text wrapping
        page.insert_textbox(
            rect,
            text,
            fontsize=fontsize,
            fontname=base_font,
            fontfile=font_file,
            color=color if color else (0, 0, 0),
            align=align  # 0=left, 1=center, 2=right, 3=justify
        )

    def process_shape_text(shape, ns):
        """Extract all text from a shape with formatting"""
        txBody = shape.find('.//p:txBody', ns)
        if txBody is None:
            txBody = shape.find('.//a:txBody', ns)
        if txBody is None:
            return []
        
        paragraphs = []
        
        for para in txBody.findall('a:p', ns):
            para_text = ""
            para_fontsize = 18
            para_color = (0, 0, 0)
            para_align = 0
            para_bullet = ""
            
            # Paragraph properties
            pPr = para.find('a:pPr', ns)
            if pPr is not None:
                algn = pPr.get('algn')
                if algn == 'ctr':
                    para_align = 1
                elif algn == 'r':
                    para_align = 2
                elif algn == 'just':
                    para_align = 3
                
                # Level for indentation
                lvl = pPr.get('lvl')
                indent = int(lvl) if lvl else 0
                
                # Bullet
                buChar = pPr.find('.//a:buChar', ns)
                if buChar is not None:
                    para_bullet = "  " * indent + buChar.get('char', '•') + " "
                buAutoNum = pPr.find('.//a:buAutoNum', ns)
                if buAutoNum is not None:
                    para_bullet = "  " * indent + "• "
            
            # Collect text runs
            for run in para.findall('a:r', ns):
                rPr = run.find('a:rPr', ns)
                if rPr is not None:
                    sz = rPr.get('sz')
                    if sz:
                        try:
                            para_fontsize = int(sz) / 100
                        except:
                            pass
                    
                    solidFill = rPr.find('a:solidFill', ns)
                    if solidFill is not None:
                        c = parse_color(solidFill, ns)
                        if c:
                            para_color = c
                
                t = run.find('a:t', ns)
                if t is not None and t.text:
                    para_text += t.text
            
            # Also check for field text (like slide numbers)
            for fld in para.findall('a:fld', ns):
                t = fld.find('a:t', ns)
                if t is not None and t.text:
                    para_text += t.text
            
            if para_text or para_bullet:
                paragraphs.append({
                    'text': para_bullet + para_text,
                    'fontsize': para_fontsize,
                    'color': para_color,
                    'align': para_align
                })
        
        return paragraphs

    slide_files = get_slide_files()
    
    for slide_idx, (slide_num, slide_path) in enumerate(slide_files):
        page = pdf.new_page(width=page_width, height=page_height)
        
        # White background
        page.draw_rect(pymupdf.Rect(0, 0, page_width, page_height), 
                      color=(1, 1, 1), fill=(1, 1, 1))
        
        relationships = get_relationships(slide_path)
        
        try:
            content = pptx_zip.read(slide_path)
            root = etree.fromstring(content)
            
            spTree = root.find('.//p:spTree', ns)
            if spTree is None:
                continue
            
            for child in spTree:
                tag = child.tag
                
                # Pictures
                if tag.endswith('pic'):
                    try:
                        blip = child.find('.//a:blip', ns)
                        if blip is not None:
                            embed_id = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                            if embed_id and embed_id in relationships:
                                img_path = relationships[embed_id]
                                if img_path in pptx_zip.namelist():
                                    img_data = pptx_zip.read(img_path)
                                    
                                    xfrm = child.find('.//a:xfrm', ns)
                                    if xfrm is not None:
                                        off = xfrm.find('a:off', ns)
                                        ext = xfrm.find('a:ext', ns)
                                        
                                        if off is not None and ext is not None:
                                            x = emu_to_pt(off.get('x')) * scale_x + margin
                                            y = emu_to_pt(off.get('y')) * scale_y + margin
                                            w = emu_to_pt(ext.get('cx')) * scale_x
                                            h = emu_to_pt(ext.get('cy')) * scale_y
                                            
                                            # Clamp to page bounds
                                            x = max(margin, min(x, page_width - margin - 10))
                                            y = max(margin, min(y, page_height - margin - 10))
                                            w = min(w, page_width - x - margin)
                                            h = min(h, page_height - y - margin)
                                            
                                            if w > 5 and h > 5:
                                                rect = pymupdf.Rect(x, y, x + w, y + h)
                                                page.insert_image(rect, stream=img_data)
                    except Exception as e:
                        pass
                
                # Shapes (text boxes, etc.)
                elif tag.endswith('sp'):
                    # Get shape position and size
                    spPr = child.find('p:spPr', ns)
                    x = margin
                    y = margin
                    width = page_width - 2 * margin
                    height = 100
                    
                    if spPr is not None:
                        xfrm = spPr.find('a:xfrm', ns)
                        if xfrm is not None:
                            off = xfrm.find('a:off', ns)
                            ext = xfrm.find('a:ext', ns)
                            
                            if off is not None:
                                x = emu_to_pt(off.get('x')) * scale_x + margin
                                y = emu_to_pt(off.get('y')) * scale_y + margin
                            
                            if ext is not None:
                                width = emu_to_pt(ext.get('cx')) * scale_x
                                height = emu_to_pt(ext.get('cy')) * scale_y
                        
                        # Shape fill (background)
                        solidFill = spPr.find('a:solidFill', ns)
                        if solidFill is not None:
                            fill_color = parse_color(solidFill, ns)
                            if fill_color and fill_color != (1, 1, 1):
                                rect = pymupdf.Rect(x, y, x + width, y + height)
                                page.draw_rect(rect, color=fill_color, fill=fill_color)
                    
                    # Clamp position to page
                    x = max(margin, min(x, page_width - margin - 50))
                    y = max(margin, min(y, page_height - margin - 20))
                    width = min(width, page_width - x - margin)
                    height = min(height, page_height - y - margin)
                    
                    # Get paragraphs
                    paragraphs = process_shape_text(child, ns)
                    
                    if paragraphs:
                        current_y = y
                        for para in paragraphs:
                            text = para['text']
                            fontsize = min(para['fontsize'] * 0.8, 28)  # Scale down and cap
                            color = para['color']
                            align = para['align']
                            
                            if not text.strip():
                                current_y += fontsize * 0.5
                                continue
                            
                            # Calculate required height for this paragraph
                            # Estimate: chars per line based on font size and width
                            chars_per_line = max(1, int(width / (fontsize * 0.6)))
                            num_lines = max(1, (len(text) + chars_per_line - 1) // chars_per_line)
                            para_height = num_lines * fontsize * 1.3 + 5
                            
                            # Don't overflow page
                            if current_y + para_height > page_height - margin:
                                break
                            
                            render_textbox(
                                page, x, current_y, width, para_height,
                                text, fontsize, color, align
                            )
                            
                            current_y += para_height
            
            # Slide number (bottom right)
            page.insert_text(
                (page_width - margin - 25, page_height - 12),
                str(slide_idx + 1),
                fontsize=10,
                fontname=base_font,
                fontfile=font_file,
                color=(0.5, 0.5, 0.5)
            )
            
        except Exception as e:
            page.insert_text((margin, margin + 20), f"Error: {str(e)[:60]}", 
                           fontsize=10, color=(1, 0, 0))
    
    if len(pdf) == 0:
        pdf.new_page(width=page_width, height=page_height)
    
    pptx_zip.close()
    return pdf.tobytes(garbage=4, deflate=True, clean=True)
    `);
}

async function detectCJKInPPTX(arrayBuffer) {
    try {
        const extractedText = await extractTextFromPPTX(arrayBuffer);
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

            self.postMessage({ type: 'status', message: 'Analyzing presentation...' });
            const needsCJK = await detectCJKInPPTX(arrayBuffer);

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

            self.postMessage({ type: 'status', message: 'Converting PowerPoint to PDF...' });

            const convertFunc = pyodide.globals.get('convert_pptx_to_pdf');
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
