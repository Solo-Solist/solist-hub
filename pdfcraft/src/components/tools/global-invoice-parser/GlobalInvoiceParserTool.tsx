'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { parseGlobalInvoice, type GlobalInvoiceOptions } from '@/lib/pdf/processors/global-invoice-parser';
import type { ProcessOutput } from '@/types/pdf';
import { Landmark, Sliders, CheckSquare, Sparkles } from 'lucide-react';

export interface GlobalInvoiceParserToolProps {
  className?: string;
}

export function GlobalInvoiceParserTool({ className = '' }: GlobalInvoiceParserToolProps) {
  const t = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [targetCurrency, setTargetCurrency] = useState('CNY');
  const [customRate, setCustomRate] = useState<string>('');

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  // Stats from invoice
  const [invoiceStats, setInvoiceStats] = useState<any | null>(null);

  const handleFileSelected = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setFile(selectedFiles[0]);
    setError(null);
    setResultBlob(null);
    setInvoiceStats(null);
  }, []);

  const handleParse = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    const rate = customRate ? parseFloat(customRate) : undefined;

    try {
      const output: ProcessOutput = await parseGlobalInvoice(
        [file],
        {
          targetCurrency,
          exchangeRate: rate,
          translateLabels: true,
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Translating invoice terms...');
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result && output.metadata) {
        setResultBlob(output.result as Blob);
        setInvoiceStats(output.metadata);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to translate invoice.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error converting invoice.');
        setStatus('error');
      }
    }
  };

  const handleClear = () => {
    setFile(null);
    setResultBlob(null);
    setInvoiceStats(null);
    setStatus('idle');
  };

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && (
        <FileUploader
          accept={['application/pdf']}
          multiple={false}
          onFilesSelected={handleFileSelected}
          onError={setError}
          disabled={status === 'processing'}
          label={t('globalInvoiceParser.uploadLabel')}
          description={t('globalInvoiceParser.uploadDescription')}
        />
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {file && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-4">
            <Card variant="outlined" className="p-6 bg-zinc-50 dark:bg-zinc-950/40 relative overflow-hidden rounded-[2rem] min-h-[380px] flex flex-col justify-between border-2">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-zinc-500 flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-primary" />
                  {t('globalInvoiceParser.previewTitle')}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={status === 'processing'}>
                  {t('globalInvoiceParser.clearButton')}
                </Button>
              </div>

              {/* Converted statistics summary slot-machine spinning effect mockup */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                {status === 'processing' && (
                  <div className="absolute inset-0 bg-primary/5 flex flex-col items-center justify-center pointer-events-none">
                    <Sparkles className="w-12 h-12 text-primary animate-bounce" />
                  </div>
                )}
                
                {invoiceStats ? (
                  <div className="space-y-4 text-center max-w-sm">
                    <div className="text-[10px] font-black text-green-500 tracking-widest uppercase">
                      Converted successfully
                    </div>
                    <div className="text-3xl font-black text-zinc-800 dark:text-zinc-100 flex items-center justify-center gap-1">
                      <span>{invoiceStats.convertedAmount.toFixed(2)}</span>
                      <span className="text-xs font-light text-zinc-400">{invoiceStats.targetCurrency}</span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      {t('globalInvoiceParser.convertRateApplied', {
                        rate: invoiceStats.rateApplied.toFixed(4),
                        original: invoiceStats.originalAmount.toFixed(2),
                        currency: invoiceStats.originalCurrency
                      })}
                    </p>
                  </div>
                ) : (
                  <div className="max-w-md text-center space-y-3">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto text-primary">
                      💵
                    </div>
                    <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                      {file.name}
                    </h4>
                    <p className="text-xs text-zinc-400">
                      {t('globalInvoiceParser.emptyStateDescription')}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card variant="default" className="p-6 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-850 rounded-[2rem] shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="space-y-6">
                <div className="border-b border-zinc-150 dark:border-zinc-800 pb-3 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('globalInvoiceParser.optionsTitle')}</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-zinc-500 font-bold">{t('globalInvoiceParser.targetCurrencyLabel')}</label>
                    <select
                      value={targetCurrency}
                      onChange={(e) => setTargetCurrency(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    >
                      <option value="CNY">{t('globalInvoiceParser.cnyLabel')}</option>
                      <option value="USD">{t('globalInvoiceParser.usdLabel')}</option>
                      <option value="EUR">{t('globalInvoiceParser.eurLabel')}</option>
                      <option value="JPY">{t('globalInvoiceParser.jpyLabel')}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-500 font-bold">{t('globalInvoiceParser.customRateLabel')}</label>
                    <input
                      type="text"
                      value={customRate}
                      onChange={(e) => setCustomRate(e.target.value)}
                      placeholder={t('globalInvoiceParser.customRatePlaceholder')}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename={`${file.name.replace(/\.pdf$/i, '')}_converted.pdf`}
                    variant="primary"
                    size="lg"
                    className="w-full py-4 font-bold shadow-lg shadow-primary/25 rounded-2xl"
                    showFileSize
                  />
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full py-4 font-bold rounded-2xl"
                    onClick={handleParse}
                    disabled={status === 'processing'}
                  >
                    {t('globalInvoiceParser.processButton')}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {status === 'processing' && (
        <ProcessingProgress
          progress={progress}
          status={status}
          message={progressMessage}
          onCancel={() => { cancelledRef.current = true; setStatus('idle'); }}
          showPercentage
        />
      )}
    </div>
  );
}

export default GlobalInvoiceParserTool;
