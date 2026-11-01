/**
 * Global Invoice Parser & Translator Processor
 * 
 * Analyzes invoice layout, extracts currency totals, runs exchange rate calculations,
 * and physically stamps a premium local-currency translation ledger onto the PDF.
 */

import type {
  ProcessInput,
  ProcessOutput,
  ProgressCallback,
} from '@/types/pdf';
import { PDFErrorCode } from '@/types/pdf';
import { BasePDFProcessor } from '../processor';
import { loadPdfLib, loadPdfjs } from '../loader';

export interface GlobalInvoiceOptions {
  targetCurrency?: string; // 'CNY', 'USD', 'EUR', 'JPY' etc., default: 'CNY'
  exchangeRate?: number;   // custom rate, e.g. 7.25
  translateLabels?: boolean;
}

const DEFAULT_OPTIONS: GlobalInvoiceOptions = {
  targetCurrency: 'CNY',
  exchangeRate: 7.25, // Default USD to CNY
  translateLabels: true,
};

// Common exchange rates if not provided (relative to USD)
const CURRENCY_RATES: Record<string, number> = {
  CNY: 7.25,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 156.5,
  USD: 1.0,
};

export class GlobalInvoiceParserProcessor extends BasePDFProcessor {
  async process(
    input: ProcessInput,
    onProgress?: ProgressCallback
  ): Promise<ProcessOutput> {
    this.reset();
    this.onProgress = onProgress;

    const { files, options } = input;
    const invoiceOptions: GlobalInvoiceOptions = {
      ...DEFAULT_OPTIONS,
      ...(options as Partial<GlobalInvoiceOptions>),
    };

    if (files.length !== 1) {
      return this.createErrorOutput(
        PDFErrorCode.INVALID_OPTIONS,
        'Please upload exactly one PDF invoice.'
      );
    }

    const file = files[0];

    try {
      this.updateProgress(15, 'Extracting invoice typography layout...');
      const pdfjs = await loadPdfjs();
      const pdfLib = await loadPdfLib();

      const fileBytes = await file.arrayBuffer();
      const pdfjsDoc = await pdfjs.getDocument({ data: fileBytes.slice(0) }).promise;
      const pdfLibDoc = await pdfLib.PDFDocument.load(fileBytes);
      const totalPages = pdfLibDoc.getPageCount();

      this.updateProgress(40, 'Scanning currency structures...');
      
      let detectedAmount = 0.0;
      let detectedCurrency = 'USD';
      let foundTotal = false;

      // Scan page 1 (usually invoices are 1 page or totals are on page 1)
      const page = await pdfjsDoc.getPage(1);
      const textContent = await page.getTextContent();

      // Look for Currency symbols and numbers
      const moneyRegex = /(?:[\$\u00A3\u20AC\u00A5])\s?(\d+(?:[.,]\d{2})?)/;
      const totalKeywords = ['total', 'amount', 'due', 'grand total', 'subtotal', '总计', '合计'];

      for (let idx = 0; idx < textContent.items.length; idx++) {
        const item = textContent.items[idx];
        if (!('str' in item)) continue;
        const text = item.str.toLowerCase();

        // If line contains 'total' keywords, search nearby text for money
        const isTotalLine = totalKeywords.some(kw => text.includes(kw));
        
        if (isTotalLine || !foundTotal) {
          // Look inside current or next 3 items
          for (let offset = 0; offset < 4; offset++) {
            const nextIdx = idx + offset;
            if (nextIdx >= textContent.items.length) break;
            const nextItem = textContent.items[nextIdx];
            if (!('str' in nextItem)) continue;

            const valStr = nextItem.str;
            const match = moneyRegex.exec(valStr);
            if (match) {
              const amountStr = match[1].replace(/,/g, '');
              const amount = parseFloat(amountStr);
              if (!isNaN(amount) && amount > detectedAmount) {
                detectedAmount = amount;
                foundTotal = true;
                
                // Deduce currency from symbol
                if (valStr.includes('$')) detectedCurrency = 'USD';
                else if (valStr.includes('\u20AC')) detectedCurrency = 'EUR';
                else if (valStr.includes('\u00A3')) detectedCurrency = 'GBP';
                else if (valStr.includes('\u00A5')) detectedCurrency = 'JPY';
              }
            }
          }
        }
      }

      this.updateProgress(75, 'Computing exchange rates & local translation...');
      
      // Calculate exchange conversion
      const targetCurr = invoiceOptions.targetCurrency || 'CNY';
      let rate = invoiceOptions.exchangeRate;
      
      if (!rate) {
        // Compute cross rate
        const srcRate = CURRENCY_RATES[detectedCurrency] || 1.0;
        const destRate = CURRENCY_RATES[targetCurr] || 7.25;
        rate = destRate / srcRate;
      }

      const convertedAmount = detectedAmount * rate;

      // Physically stamp currency conversion table at the bottom corner of A4 page
      const firstPage = pdfLibDoc.getPage(0);
      const { width: pWidth, height: pHeight } = firstPage.getSize();

      this.updateProgress(85, 'Stamping premium currency ledger...');

      // Draw elegant semi-transparent ledger block
      firstPage.drawRectangle({
        x: pWidth - 260,
        y: 40,
        width: 220,
        height: 100,
        color: pdfLib.rgb(0.97, 0.98, 1.0),
        borderColor: pdfLib.rgb(0.09, 0.44, 0.9),
        borderWidth: 1.5,
        opacity: 0.95,
      });

      const titleFont = await pdfLibDoc.embedFont(pdfLib.StandardFonts.HelveticaBold);
      const valueFont = await pdfLibDoc.embedFont(pdfLib.StandardFonts.Helvetica);

      firstPage.drawText('CURRENCY CONVERSION', {
        x: pWidth - 245,
        y: 118,
        size: 11,
        font: titleFont,
        color: pdfLib.rgb(0.09, 0.44, 0.9),
      });

      firstPage.drawLine({
        start: { x: pWidth - 245, y: 110 },
        end: { x: pWidth - 60, y: 110 },
        thickness: 1,
        color: pdfLib.rgb(0.85, 0.88, 0.93),
      });

      // Original total text
      const origText = `Original: ${detectedAmount.toFixed(2)} ${detectedCurrency}`;
      firstPage.drawText(origText, {
        x: pWidth - 245,
        y: 92,
        size: 11,
        font: valueFont,
        color: pdfLib.rgb(0.2, 0.25, 0.35),
      });

      // Rate text
      const rateText = `Rate: 1 ${detectedCurrency} = ${rate.toFixed(4)} ${targetCurr}`;
      firstPage.drawText(rateText, {
        x: pWidth - 245,
        y: 76,
        size: 10,
        font: valueFont,
        color: pdfLib.rgb(0.4, 0.45, 0.55),
      });

      // Converted total text
      const convertedText = `Total: ${convertedAmount.toFixed(2)} ${targetCurr}`;
      firstPage.drawText(convertedText, {
        x: pWidth - 245,
        y: 56,
        size: 13,
        font: titleFont,
        color: pdfLib.rgb(0.1, 0.6, 0.3), // Green for success
      });

      this.updateProgress(95, 'Generating translated invoice...');
      const pdfBytes = await pdfLibDoc.save({ useObjectStreams: true });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

      this.updateProgress(100, 'Complete!');

      return this.createSuccessOutput(blob, `${file.name.replace(/\.pdf$/i, '')}_converted.pdf`, {
        pageCount: totalPages,
        originalAmount: detectedAmount,
        originalCurrency: detectedCurrency,
        convertedAmount,
        targetCurrency: targetCurr,
        rateApplied: rate,
      });

    } catch (error) {
      return this.createErrorOutput(
        PDFErrorCode.PROCESSING_FAILED,
        'Failed to translate global invoice.',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  protected getAcceptedTypes(): string[] {
    return ['application/pdf'];
  }
}

export function createGlobalInvoiceParserProcessor(): GlobalInvoiceParserProcessor {
  return new GlobalInvoiceParserProcessor();
}

export async function parseGlobalInvoice(
  files: File[],
  options?: Partial<GlobalInvoiceOptions>,
  onProgress?: ProgressCallback
): Promise<ProcessOutput> {
  const processor = createGlobalInvoiceParserProcessor();
  return processor.process({ files, options: options || {} }, onProgress);
}
