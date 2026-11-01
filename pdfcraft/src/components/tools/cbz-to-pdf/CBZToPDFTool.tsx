'use client';

import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cbzToPDF, type CbzToPDFOptions, type CbzPageSize } from '@/lib/pdf/processors/cbz-to-pdf';
import { BookOpen } from 'lucide-react';

export interface CBZToPDFToolProps {
    className?: string;
}

export function CBZToPDFTool({ className = '' }: CBZToPDFToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    const [file, setFile] = useState<File | null>(null);
    const [resultBlob, setResultBlob] = useState<Blob | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const [pageSize, setPageSize] = useState<CbzPageSize>('original');
    const [quality, setQuality] = useState(85);
    const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);

    const handleFilesSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            setFile(files[0]);
            setResultBlob(null);
            setError(null);
        }
    }, []);

    const handleUploadError = useCallback((errorMessage: string) => {
        setError(errorMessage);
    }, []);

    const handleConvert = useCallback(async () => {
        if (!file) {
            setError('Please select a CBZ file.');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setError(null);

        try {
            const options: CbzToPDFOptions = {
                pageSize,
                quality,
                maintainAspectRatio,
            };

            const output = await cbzToPDF(file, options, (prog) => setProgress(prog));

            if (output.success && output.result) {
                setResultBlob(output.result as Blob);
            } else {
                setError(output.error?.message || 'Failed to convert CBZ.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred.');
        } finally {
            setIsProcessing(false);
        }
    }, [file, pageSize, quality, maintainAspectRatio]);

    const handleReset = useCallback(() => {
        setFile(null);
        setResultBlob(null);
        setError(null);
        setProgress(0);
    }, []);

    const hasFile = file !== null;
    const canProcess = hasFile && !isProcessing;

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            <FileUploader
                accept={['.cbz', 'application/x-cbz', 'application/zip']}
                multiple={false}
                maxFiles={1}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={isProcessing}
                label={tTools('cbzToPdf.uploadLabel') || 'Upload CBZ File'}
                description={tTools('cbzToPdf.uploadDescription') || 'Drag and drop a comic book archive (.cbz) to convert to PDF.'}
            />

            {error && (
                <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {hasFile && (
                <Card variant="outlined">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-[hsl(var(--color-foreground))]">{file.name}</p>
                            <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleReset} disabled={isProcessing}>
                            {t('buttons.clear') || 'Clear'}
                        </Button>
                    </div>
                </Card>
            )}

            {hasFile && (
                <Card variant="outlined">
                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                        {tTools('cbzToPdf.optionsTitle') || 'Conversion Options'}
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('cbzToPdf.pageSizeLabel') || 'Page Size'}
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {(['original', 'a4', 'letter', 'comic'] as CbzPageSize[]).map((size) => (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => setPageSize(size)}
                                        disabled={isProcessing}
                                        className={`px-4 py-2 rounded-[var(--radius-md)] border text-sm font-medium capitalize transition-colors duration-200
                      ${pageSize === size ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))]' : 'border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted)/0.5)]'}
                      disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('cbzToPdf.qualityLabel') || 'Image Quality'}: {quality}%
                            </label>
                            <input
                                type="range"
                                min="50"
                                max="100"
                                value={quality}
                                onChange={(e) => setQuality(Number(e.target.value))}
                                disabled={isProcessing}
                                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[hsl(var(--color-muted))]"
                            />
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={maintainAspectRatio}
                                onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                                disabled={isProcessing}
                                className="w-4 h-4 rounded"
                            />
                            <span className="text-sm text-[hsl(var(--color-foreground))]">
                                {tTools('cbzToPdf.preserveAspectLabel') || 'Preserve aspect ratio'}
                            </span>
                        </label>
                    </div>
                </Card>
            )}

            {isProcessing && (
                <ProcessingProgress progress={progress} status="processing" message="Converting comic to PDF..." showPercentage />
            )}

            <div className="flex flex-wrap items-center gap-4">
                <Button variant="primary" size="lg" onClick={handleConvert} disabled={!canProcess} loading={isProcessing}>
                    <BookOpen className="w-4 h-4 mr-2" />
                    {isProcessing ? (t('status.processing') || 'Processing...') : (tTools('cbzToPdf.convertButton') || 'Convert to PDF')}
                </Button>

                {resultBlob && (
                    <DownloadButton
                        file={resultBlob}
                        filename={file ? `${file.name.replace(/\.cbz$/i, '')}.pdf` : 'comic.pdf'}
                        variant="secondary"
                        size="lg"
                    />
                )}
            </div>

            {resultBlob && (
                <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700" role="status">
                    <p className="text-sm font-medium">{tTools('cbzToPdf.successMessage') || 'Comic converted successfully!'}</p>
                </div>
            )}
        </div>
    );
}

export default CBZToPDFTool;
