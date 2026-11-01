/**
 * AI PDF Layout Reflower Processor
 * Extracts structured semantic text streams from PDF pages, 
 * supporting auto-reflow, double-column alignment, and MathJax formula parser.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfjs } from '../loader';

export interface AIPDFReflowerOptions {
  theme?: 'sepia' | 'dark' | 'green' | 'light';
  fontSize?: number;
  exportFormat?: 'markdown' | 'epub' | 'json';
}

export interface ReflowParagraph {
  type: 'p' | 'h1' | 'h2' | 'h3' | 'li';
  text: string;
  pageNum: number;
}

export class AIPDFReflowerProcessor extends BasePDFProcessor {
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const reflowOptions: AIPDFReflowerOptions = {
      theme: 'sepia',
      fontSize: 16,
      exportFormat: 'markdown',
      ...(options as Partial<AIPDFReflowerOptions>),
    };

    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Exactly one PDF file is required for reflowing.'
      );
    }

    const file = files[0];

    try {
      this.updateProgress(5, 'Loading PDF.js engine...');
      const pdfjs = await loadPdfjs();

      this.updateProgress(15, 'Loading PDF document...');
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdfDoc.numPages;

      const paragraphs: ReflowParagraph[] = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (this.checkCancelled()) {
          return this.createErrorOutput(
            PDFErrorCode.PROCESSING_CANCELLED,
            'Reflow cancelled.'
          );
        }

        this.updateProgress(
          20 + Math.floor((60 * pageNum) / totalPages),
          `Analyzing layout of page ${pageNum}/${totalPages}...`
        );

        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        const pageWidth = viewport.width;

        // Group text items by raw coordinates
        const items = textContent.items.map((item: any) => {
          // transform matrix: [scaleX, skewX, skewY, scaleY, x, y]
          const matrix = item.transform;
          return {
            text: item.str,
            fontSize: matrix[3],
            x: matrix[4],
            y: matrix[5],
            width: item.width,
            height: item.height,
          };
        }).filter((item) => item.text.trim().length > 0);

        if (items.length === 0) continue;

        // Detect dual columns
        const middleX = pageWidth / 2;
        let leftCount = 0;
        let rightCount = 0;
        let spanCount = 0;

        items.forEach((item) => {
          if (item.x + item.width <= middleX) {
            leftCount++;
          } else if (item.x >= middleX) {
            rightCount++;
          } else {
            spanCount++;
          }
        });

        const isDualColumn = leftCount > 5 && rightCount > 5 && (spanCount / items.length) < 0.25;

        let sortedItems = [];
        if (isDualColumn) {
          // Sort left column then right column
          const leftItems = items.filter((item) => item.x + item.width / 2 < middleX);
          const rightItems = items.filter((item) => item.x + item.width / 2 >= middleX);

          // Sorting logic: Sort by Y desc (top to bottom), then by X asc (left to right)
          const sortByCoords = (a: any, b: any) => {
            if (Math.abs(a.y - b.y) < 4) {
              return a.x - b.x;
            }
            return b.y - a.y;
          };

          leftItems.sort(sortByCoords);
          rightItems.sort(sortByCoords);

          sortedItems = [...leftItems, ...rightItems];
        } else {
          // Standard single column sorting
          sortedItems = [...items].sort((a, b) => {
            if (Math.abs(a.y - b.y) < 4) {
              return a.x - b.x;
            }
            return b.y - a.y;
          });
        }

        // Reconstruct paragraphs
        let currentParaText = '';
        let lastItem: any = null;
        let avgFontSize = sortedItems.reduce((acc, item) => acc + item.fontSize, 0) / sortedItems.length;

        for (let i = 0; i < sortedItems.length; i++) {
          const item = sortedItems[i];

          // Parse MathJax style formula (e.g. standard LaTeX symbols like \sum, \alpha)
          let itemText = item.text;
          if (itemText.includes('\\sum') || itemText.includes('\\alpha') || itemText.includes('\\beta') || itemText.includes('f(x)')) {
            // Treat as math block
            itemText = ` $${itemText.trim()}$ `;
          }

          if (!lastItem) {
            currentParaText = itemText;
            lastItem = item;
            continue;
          }

          const yDiff = Math.abs(item.y - lastItem.y);
          const xDiff = item.x - (lastItem.x + lastItem.width);
          
          // Determine if we need to start a new paragraph
          // 1. Large vertical jump (indicating paragraph spacing)
          // 2. Dual column switch (X coordinates jump backwards)
          const isNewParagraph = yDiff > lastItem.fontSize * 1.8 || (isDualColumn && item.x < lastItem.x && yDiff > 50);

          if (isNewParagraph) {
            if (currentParaText.trim().length > 0) {
              // Determine paragraph type (h1, h2, h3, p) based on font size relative to average
              let type: 'p' | 'h1' | 'h2' | 'h3' | 'li' = 'p';
              const cleanText = currentParaText.trim();
              
              if (cleanText.startsWith('•') || cleanText.startsWith('-') || cleanText.match(/^\d+\./)) {
                type = 'li';
              } else if (lastItem.fontSize > avgFontSize * 1.5) {
                type = 'h1';
              } else if (lastItem.fontSize > avgFontSize * 1.25) {
                type = 'h2';
              } else if (lastItem.fontSize > avgFontSize * 1.1) {
                type = 'h3';
              }

              paragraphs.push({
                type,
                text: cleanText,
                pageNum,
              });
            }
            currentParaText = itemText;
          } else {
            // Append to current paragraph
            // Add space if there is a gap or if it's English/alphabetic characters
            const needsSpace = xDiff > 2 || lastItem.text.match(/[A-Za-z0-9]$/) && itemText.match(/^[A-Za-z0-9]/);
            currentParaText += (needsSpace ? ' ' : '') + itemText;
          }

          lastItem = item;
        }

        // Push final paragraph of the page
        if (currentParaText.trim().length > 0) {
          let type: 'p' | 'h1' | 'h2' | 'h3' | 'li' = 'p';
          const cleanText = currentParaText.trim();
          if (cleanText.startsWith('•') || cleanText.startsWith('-') || cleanText.match(/^\d+\./)) {
            type = 'li';
          } else if (lastItem && lastItem.fontSize > avgFontSize * 1.4) {
            type = 'h1';
          } else if (lastItem && lastItem.fontSize > avgFontSize * 1.2) {
            type = 'h2';
          }

          paragraphs.push({
            type,
            text: cleanText,
            pageNum,
          });
        }
      }

      this.updateProgress(90, 'Formatting export output...');

      // Generate export file content
      let outputBlob: Blob;
      let outputFilename = `${file.name.replace(/\.pdf$/i, '')}_reflowed`;

      if (reflowOptions.exportFormat === 'markdown') {
        const mdText = paragraphs.map((p) => {
          switch (p.type) {
            case 'h1': return `# ${p.text}\n`;
            case 'h2': return `## ${p.text}\n`;
            case 'h3': return `### ${p.text}\n`;
            case 'li': return `* ${p.text}`;
            default: return `${p.text}\n`;
          }
        }).join('\n');
        outputBlob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
        outputFilename += '.md';
      } else if (reflowOptions.exportFormat === 'epub') {
        // Quick EPUB package representation (simplified HTML container)
        const htmlText = `
        <?xml version="1.0" encoding="utf-8"?>
        <!DOCTYPE html>
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
          <title>${file.name.replace(/\.pdf$/i, '')}</title>
          <style>
            body { font-family: sans-serif; line-height: 1.6; padding: 20px; }
            h1 { color: #333; margin-top: 1.5em; }
            h2 { color: #555; margin-top: 1.3em; }
            p { margin-bottom: 1em; text-indent: 2em; }
            li { margin-bottom: 0.5em; }
          </style>
        </head>
        <body>
          ${paragraphs.map((p) => {
            if (p.type === 'li') return `<li>${p.text}</li>`;
            return `<${p.type}>${p.text}</${p.type}>`;
          }).join('\n')}
        </body>
        </html>`;
        outputBlob = new Blob([htmlText], { type: 'application/epub+zip' });
        outputFilename += '.epub';
      } else {
        const jsonText = JSON.stringify(paragraphs, null, 2);
        outputBlob = new Blob([jsonText], { type: 'application/json' });
        outputFilename += '.json';
      }

      this.updateProgress(100, 'Reflow complete!');

      return this.createSuccessOutput(outputBlob, outputFilename, {
        paragraphs,
        pageCount: totalPages,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to reflow PDF content.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  protected getAcceptedTypes(): string[] {
    return ['application/pdf'];
  }
}

export function createAIPDFReflowerProcessor(): AIPDFReflowerProcessor {
  return new AIPDFReflowerProcessor();
}

export async function reflowPDF(
  file: File,
  options?: Partial<AIPDFReflowerOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createAIPDFReflowerProcessor();
  return processor.process(
    {
      files: [file],
      options: options || {},
    },
    onProgress
  );
}
