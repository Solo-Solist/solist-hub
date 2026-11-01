/**
 * Markdown to PDF Processor
 * 
 * Converts Markdown content to PDF using marked parser and html2pdf.js.
 * Supports CommonMark and GitHub Flavored Markdown (GFM).
 */

import type {
    ProcessInput,
    ProcessOutput,
    ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';


/**
 * Page size options
 */
export type MarkdownPageSize = 'a4' | 'letter' | 'legal';

/**
 * Theme options
 */
export type MarkdownTheme = 'light' | 'dark' | 'github';

/**
 * Markdown to PDF options
 */
export interface MarkdownToPDFOptions {
    /** Page size */
    pageSize: MarkdownPageSize;
    /** Theme for styling */
    theme: MarkdownTheme;
    /** Enable GitHub Flavored Markdown features */
    gfm: boolean;
    /** Enable syntax highlighting for code blocks */
    syntaxHighlight: boolean;
    /** Custom CSS (optional) */
    customCSS?: string;
    /** Page margins in points */
    margins: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
}

/**
 * Default markdown options
 */
const DEFAULT_MARKDOWN_OPTIONS: MarkdownToPDFOptions = {
    pageSize: 'a4',
    theme: 'light',
    gfm: true,
    syntaxHighlight: true,
    margins: {
        top: 50,
        right: 50,
        bottom: 50,
        left: 50,
    },
};

/**
 * Theme CSS styles
 */
const THEME_STYLES: Record<MarkdownTheme, string> = {
    light: `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #24292e;
      background-color: #ffffff;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3, h4, h5, h6 { color: #1a1a1a; margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
    h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background-color: rgba(27,31,35,0.05); padding: 0.2em 0.4em; border-radius: 3px; font-size: 85%; }
    pre { background-color: #f6f8fa; padding: 16px; overflow-x: auto; border-radius: 6px; }
    pre code { background-color: transparent; padding: 0; }
    blockquote { border-left: 4px solid #dfe2e5; padding-left: 16px; color: #6a737d; margin: 0; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #dfe2e5; padding: 8px 12px; text-align: left; }
    th { background-color: #f6f8fa; font-weight: 600; }
    ul, ol { padding-left: 2em; }
    li { margin: 0.25em 0; }
    hr { border: none; border-top: 1px solid #eaecef; margin: 24px 0; }
    img { max-width: 100%; height: auto; }
  `,
    dark: `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #c9d1d9;
      background-color: #0d1117;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3, h4, h5, h6 { color: #f0f6fc; margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
    h1 { font-size: 2em; border-bottom: 1px solid #30363d; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #30363d; padding-bottom: 0.3em; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background-color: rgba(110,118,129,0.4); padding: 0.2em 0.4em; border-radius: 3px; font-size: 85%; }
    pre { background-color: #161b22; padding: 16px; overflow-x: auto; border-radius: 6px; }
    pre code { background-color: transparent; padding: 0; }
    blockquote { border-left: 4px solid #30363d; padding-left: 16px; color: #8b949e; margin: 0; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #30363d; padding: 8px 12px; text-align: left; }
    th { background-color: #161b22; font-weight: 600; }
    ul, ol { padding-left: 2em; }
    li { margin: 0.25em 0; }
    hr { border: none; border-top: 1px solid #30363d; margin: 24px 0; }
    img { max-width: 100%; height: auto; }
  `,
    github: `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      color: #1f2328;
      background-color: #ffffff;
      max-width: 1012px;
      margin: 0 auto;
      padding: 32px;
    }
    h1, h2, h3, h4, h5, h6 { 
      margin-top: 24px; 
      margin-bottom: 16px; 
      font-weight: 600; 
      line-height: 1.25;
    }
    h1 { font-size: 2em; border-bottom: 1px solid hsla(210,18%,87%,1); padding-bottom: .3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid hsla(210,18%,87%,1); padding-bottom: .3em; }
    h3 { font-size: 1.25em; }
    a { color: #0969da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { 
      background-color: rgba(175,184,193,0.2); 
      padding: .2em .4em; 
      margin: 0;
      font-size: 85%; 
      white-space: break-spaces;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    }
    pre { 
      background-color: #f6f8fa; 
      padding: 16px; 
      overflow-x: auto; 
      border-radius: 6px;
      font-size: 85%;
      line-height: 1.45;
    }
    pre code { background-color: transparent; padding: 0; font-size: 100%; }
    blockquote { 
      border-left: .25em solid #d0d7de; 
      padding: 0 1em; 
      color: #656d76; 
      margin: 0 0 16px 0; 
    }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; display: block; overflow: auto; }
    th, td { border: 1px solid #d0d7de; padding: 6px 13px; }
    th { font-weight: 600; background-color: #f6f8fa; }
    tr:nth-child(2n) { background-color: #f6f8fa; }
    ul, ol { padding-left: 2em; margin: 0 0 16px 0; }
    li { margin: 0.25em 0; }
    li + li { margin-top: .25em; }
    hr { 
      height: .25em; 
      padding: 0; 
      margin: 24px 0; 
      background-color: #d0d7de; 
      border: 0; 
    }
    img { max-width: 100%; height: auto; box-sizing: content-box; }
    .task-list-item { list-style-type: none; }
    .task-list-item input { margin: 0 .2em .25em -1.4em; vertical-align: middle; }
  `,
};

/**
 * Simple markdown parser (fallback when marked is not available)
 */
async function simpleMarkdownToHtml(markdown: string, gfm: boolean, syntaxHighlight: boolean): Promise<string> {
    let html = markdown;

    // Escape HTML
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Headers
    html = html.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Code blocks with syntax highlighting
    if (syntaxHighlight) {
        const hljs = (await import('highlight.js')).default;

        // Process fenced code blocks with language
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            try {
                if (lang && hljs.getLanguage(lang)) {
                    const highlighted = hljs.highlight(code.trim(), { language: lang }).value;
                    return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
                } else if (lang) {
                    // Unknown language, try auto-detect
                    const highlighted = hljs.highlightAuto(code.trim()).value;
                    return `<pre><code class="hljs">${highlighted}</code></pre>`;
                } else {
                    // No language specified
                    const highlighted = hljs.highlightAuto(code.trim()).value;
                    return `<pre><code class="hljs">${highlighted}</code></pre>`;
                }
            } catch {
                return `<pre><code>${code}</code></pre>`;
            }
        });
    } else {
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    }
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Links and images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Blockquotes
    html = html.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^(---|\*\*\*|___)$/gm, '<hr>');

    // Lists
    html = html.replace(/^-\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>');

    // GFM: Strikethrough
    if (gfm) {
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
        // Task lists
        html = html.replace(/<li>\[\s?\]\s+(.*)$/gm, '<li class="task-list-item"><input type="checkbox" disabled> $1</li>');
        html = html.replace(/<li>\[x\]\s+(.*)$/gm, '<li class="task-list-item"><input type="checkbox" checked disabled> $1</li>');
    }

    // Paragraphs (simple)
    html = html.split(/\n\n+/).map(block => {
        if (block.startsWith('<') || block.trim() === '') {
            return block;
        }
        return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
}

/**
 * Markdown to PDF Processor
 */
export class MarkdownToPDFProcessor extends BasePDFProcessor {
    /**
     * Process markdown file and convert to PDF
     */
    async process(
        input: ProcessInput,
        onProgress?: ProgressCallback
    ): Promise<ProcessOutput> {
        this.reset();
        this.onProgress = onProgress;

        const { files, options } = input;
        const mdOptions: MarkdownToPDFOptions = {
            ...DEFAULT_MARKDOWN_OPTIONS,
            ...(options as Partial<MarkdownToPDFOptions>),
        };

        // Validate single file
        if (files.length !== 1) {
            return this.createErrorOutput(
                PDFErrorCode.INVALID_OPTIONS,
                'Please provide exactly one Markdown file.',
                `Received ${files.length} file(s).`
            );
        }

        const file = files[0];

        try {
            this.updateProgress(5, 'Reading Markdown file...');

            // Read file as text
            const markdownContent = await file.text();

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(20, 'Converting Markdown to HTML...');

            // Convert markdown to HTML
            const htmlContent = await simpleMarkdownToHtml(markdownContent, mdOptions.gfm, mdOptions.syntaxHighlight);

            if (this.checkCancelled()) {
                return this.createErrorOutput(
                    PDFErrorCode.PROCESSING_CANCELLED,
                    'Processing was cancelled.'
                );
            }

            this.updateProgress(40, 'Loading PDF engine...');

            // Dynamically import jsPDF and html2canvas
            const { jsPDF } = await import('jspdf');
            const html2canvas = (await import('html2canvas')).default;

            this.updateProgress(60, 'Converting to PDF...');

            // Page size dimensions (in mm)
            const pageSizes: Record<string, [number, number]> = {
                'a4': [210, 297],
                'letter': [215.9, 279.4],
                'legal': [215.9, 355.6],
            };
            const [width, height] = pageSizes[mdOptions.pageSize] || pageSizes['a4'];
            const pxWidth = width * 3.7795; // 1mm ≈ 3.7795px at 96dpi

            // Determine colors based on theme
            const themeColors: Record<MarkdownTheme, { bg: string; color: string }> = {
                light: { bg: '#ffffff', color: '#24292e' },
                dark: { bg: '#0d1117', color: '#c9d1d9' },
                github: { bg: '#ffffff', color: '#1f2328' },
            };
            const colors = themeColors[mdOptions.theme] || themeColors.light;

            // Get theme CSS
            const themeCSS = THEME_STYLES[mdOptions.theme] || THEME_STYLES.light;
            const customCSS = mdOptions.customCSS || '';
            const marginPx = mdOptions.margins.top / 2.83 * 3.7795;

            // Highlight.js CSS (GitHub style)
            const highlightCSS = mdOptions.syntaxHighlight ? `
                .hljs {
                    display: block;
                    overflow-x: auto;
                    padding: 1em;
                }
                .hljs-comment, .hljs-quote { color: ${mdOptions.theme === 'dark' ? '#8b949e' : '#6a737d'}; font-style: italic; }
                .hljs-keyword, .hljs-selector-tag, .hljs-subst { color: ${mdOptions.theme === 'dark' ? '#ff7b72' : '#d73a49'}; font-weight: bold; }
                .hljs-number, .hljs-literal, .hljs-variable, .hljs-template-variable, .hljs-tag .hljs-attr { color: ${mdOptions.theme === 'dark' ? '#79c0ff' : '#005cc5'}; }
                .hljs-string, .hljs-doctag { color: ${mdOptions.theme === 'dark' ? '#a5d6ff' : '#032f62'}; }
                .hljs-title, .hljs-section, .hljs-selector-id { color: ${mdOptions.theme === 'dark' ? '#d2a8ff' : '#6f42c1'}; font-weight: bold; }
                .hljs-type, .hljs-class .hljs-title { color: ${mdOptions.theme === 'dark' ? '#ffa657' : '#e36209'}; }
                .hljs-tag, .hljs-name, .hljs-attribute { color: ${mdOptions.theme === 'dark' ? '#7ee787' : '#22863a'}; }
                .hljs-regexp, .hljs-link { color: ${mdOptions.theme === 'dark' ? '#7ee787' : '#22863a'}; }
                .hljs-symbol, .hljs-bullet { color: ${mdOptions.theme === 'dark' ? '#f2cc60' : '#e36209'}; }
                .hljs-built_in, .hljs-builtin-name { color: ${mdOptions.theme === 'dark' ? '#ffa657' : '#005cc5'}; }
                .hljs-meta { color: ${mdOptions.theme === 'dark' ? '#8b949e' : '#6a737d'}; font-weight: bold; }
                .hljs-deletion { color: ${mdOptions.theme === 'dark' ? '#ffa198' : '#b31d28'}; background-color: ${mdOptions.theme === 'dark' ? 'rgba(255,129,130,0.15)' : '#ffeef0'}; }
                .hljs-addition { color: ${mdOptions.theme === 'dark' ? '#7ee787' : '#22863a'}; background-color: ${mdOptions.theme === 'dark' ? 'rgba(63,185,80,0.15)' : '#e6ffed'}; }
                .hljs-emphasis { font-style: italic; }
                .hljs-strong { font-weight: bold; }
            ` : '';

            // Create an iframe to isolate rendering (prevents layout changes on main page)
            const iframe = document.createElement('iframe');
            iframe.style.cssText = `
                position: fixed;
                left: -9999px;
                top: 0;
                width: ${pxWidth}px;
                height: 10000px;
                border: none;
                visibility: hidden;
            `;
            document.body.appendChild(iframe);

            // Wait for iframe to be ready
            await new Promise(resolve => setTimeout(resolve, 100));

            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc) {
                document.body.removeChild(iframe);
                throw new Error('Failed to access iframe document');
            }

            // Build the full HTML for the iframe
            const fullHTML = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            width: ${pxWidth}px;
                            background: ${colors.bg};
                            color: ${colors.color};
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                            font-size: 14px;
                            line-height: 1.6;
                        }
                        ${themeCSS}
                        ${highlightCSS}
                        ${customCSS}
                    </style>
                </head>
                <body>
                    <div style="padding: ${marginPx}px; background: ${colors.bg};">
                        ${htmlContent}
                    </div>
                </body>
                </html>
            `;

            iframeDoc.open();
            iframeDoc.write(fullHTML);
            iframeDoc.close();

            // Wait for content to render
            await new Promise(resolve => setTimeout(resolve, 500));

            // Get actual content height and adjust iframe
            const contentHeight = iframeDoc.body.scrollHeight;
            iframe.style.height = `${contentHeight}px`;

            // Make iframe visible for html2canvas (but still off-screen)
            iframe.style.visibility = 'visible';

            try {
                // Get the content div inside iframe body
                const contentDiv = iframeDoc.body.querySelector('div') || iframeDoc.body;

                // Use html2canvas to render the content
                const canvas = await html2canvas(contentDiv as HTMLElement, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: colors.bg,
                    width: pxWidth,
                    height: contentHeight,
                    windowWidth: pxWidth,
                });

                // Create jsPDF instance
                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: [width, height],
                });

                // Calculate image dimensions
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const imgWidth = width;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;

                // Handle multi-page PDFs
                const pageHeight = height;
                let heightLeft = imgHeight;
                let position = 0;

                // Add first page
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;

                // Add additional pages if needed
                while (heightLeft > 0) {
                    position = position - pageHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }

                // Get PDF as blob
                const pdfBlob = pdf.output('blob');

                // Cleanup
                document.body.removeChild(iframe);

                this.updateProgress(100, 'Complete!');

                // Generate output filename
                const outputFilename = generatePdfFilename(file.name);

                return this.createSuccessOutput(pdfBlob, outputFilename, {
                    theme: mdOptions.theme,
                    pageSize: mdOptions.pageSize,
                    gfm: mdOptions.gfm,
                });
            } catch (canvasError) {
                // Cleanup on error
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                throw canvasError;
            }

        } catch (error) {
            return this.createErrorOutput(
                PDFErrorCode.PROCESSING_FAILED,
                'Failed to convert Markdown to PDF.',
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }

    /**
     * Get accepted file types
     */
    protected getAcceptedTypes(): string[] {
        return ['text/markdown', 'text/plain', 'text/x-markdown'];
    }
}

/**
 * Generate PDF filename from markdown filename
 */
function generatePdfFilename(originalName: string): string {
    const lastDot = originalName.lastIndexOf('.');
    const baseName = lastDot === -1 ? originalName : originalName.slice(0, lastDot);
    return `${baseName}.pdf`;
}

/**
 * Create a new instance of the markdown processor
 */
export function createMarkdownToPDFProcessor(): MarkdownToPDFProcessor {
    return new MarkdownToPDFProcessor();
}

/**
 * Convert Markdown to PDF (convenience function)
 */
export async function markdownToPDF(
    file: File,
    options?: Partial<MarkdownToPDFOptions>,
    onProgress?: ProgressCallback
): Promise<ProcessOutput> {
    const processor = createMarkdownToPDFProcessor();
    return processor.process(
        {
            files: [file],
            options: options || {},
        },
        onProgress
    );
}
