'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { redactSmartData, type SmartRedactOptions } from '@/lib/pdf/processors/smart-data-redactor';
import type { ProcessOutput } from '@/types/pdf';
import { ShieldCheck, EyeOff, Crosshair, HelpCircle } from 'lucide-react';

export interface SmartDataRedactorToolProps {
  className?: string;
}

export function SmartDataRedactorTool({ className = '' }: SmartDataRedactorToolProps) {
  const t = useTranslations('common');
  const [file, setFile] = useState<File | null>(null);
  const [emailRedact, setEmailRedact] = useState(true);
  const [phoneRedact, setPhoneRedact] = useState(true);
  const [idRedact, setIdRedact] = useState(false);
  const [customKeywords, setCustomKeywords] = useState('');

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const handleFileSelected = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setFile(selectedFiles[0]);
    setError(null);
    setResultBlob(null);
  }, []);

  const handleRedact = async () => {
    if (!file) return;
    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);

    const patterns: ('email' | 'phone' | 'idcard' | 'custom')[] = [];
    if (emailRedact) patterns.push('email');
    if (phoneRedact) patterns.push('phone');
    if (idRedact) patterns.push('idcard');
    
    const keywords = customKeywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    if (keywords.length > 0) {
      patterns.push('custom');
    }

    try {
      const output: ProcessOutput = await redactSmartData(
        [file],
        {
          patterns,
          customKeywords: keywords,
          redactColor: { r: 0, g: 0, b: 0 },
        },
        (prog, message) => {
          if (!cancelledRef.current) {
            setProgress(prog);
            setProgressMessage(message || 'Masking privacy records...');
          }
        }
      );

      if (cancelledRef.current) {
        setStatus('idle');
        return;
      }

      if (output.success && output.result) {
        setResultBlob(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to apply automatic redaction.');
        setStatus('error');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Error applying redactor.');
        setStatus('error');
      }
    }
  };

  const handleClear = () => {
    setFile(null);
    setResultBlob(null);
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
          label={t('smartDataRedactor.uploadLabel')}
          description={t('smartDataRedactor.uploadDescription')}
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
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  {t('smartDataRedactor.previewTitle')}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={status === 'processing'}>
                  {t('smartDataRedactor.clearButton')}
                </Button>
              </div>

              {/* Laser laser sweep cleaning wave effect mock */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                {status === 'processing' && (
                  <div className="absolute inset-0 bg-red-500/5 flex flex-col items-center justify-center pointer-events-none">
                    <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin absolute" />
                    <Crosshair className="w-16 h-16 text-red-500 animate-pulse" />
                  </div>
                )}
                <div className="max-w-md text-center space-y-3">
                  <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto text-red-500">
                    👁️‍🌫️
                  </div>
                  <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    {file.name}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    {t('smartDataRedactor.emptyStateDescription')}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <Card variant="default" className="p-6 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-850 rounded-[2rem] shadow-xl flex flex-col justify-between min-h-[380px]">
              <div className="space-y-6">
                <div className="border-b border-zinc-150 dark:border-zinc-800 pb-3 flex items-center gap-2">
                  <EyeOff className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-200">{t('smartDataRedactor.optionsTitle')}</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="email"
                      checked={emailRedact}
                      onChange={(e) => setEmailRedact(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4"
                    />
                    <label htmlFor="email" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {t('smartDataRedactor.emailRedactLabel')}
                    </label>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="phone"
                      checked={phoneRedact}
                      onChange={(e) => setPhoneRedact(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4"
                    />
                    <label htmlFor="phone" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {t('smartDataRedactor.phoneRedactLabel')}
                    </label>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="idcard"
                      checked={idRedact}
                      onChange={(e) => setIdRedact(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4"
                    />
                    <label htmlFor="idcard" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {t('smartDataRedactor.idRedactLabel')}
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 flex items-center gap-1">
                      {t('smartDataRedactor.customKeywordsLabel')}
                      <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
                    </label>
                    <input
                      type="text"
                      value={customKeywords}
                      onChange={(e) => setCustomKeywords(e.target.value)}
                      placeholder={t('smartDataRedactor.customKeywordsPlaceholder')}
                      className="w-full text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 mt-6">
                {status === 'complete' && resultBlob ? (
                  <DownloadButton
                    file={resultBlob}
                    filename={`${file.name.replace(/\.pdf$/i, '')}_redacted.pdf`}
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
                    onClick={handleRedact}
                    disabled={status === 'processing'}
                  >
                    {t('smartDataRedactor.processButton')}
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

export default SmartDataRedactorTool;
