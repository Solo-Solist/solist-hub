'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Trash2, RefreshCw, CheckCircle2, AlertCircle, Settings2 } from 'lucide-react';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { djvuToPDF } from '@/lib/pdf/processors/djvu-to-pdf';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface DJVUToPDFToolProps {
    className?: string;
}

export function DJVUToPDFTool({ className = '' }: DJVUToPDFToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    const [file, setFile] = useState<UploadedFile | null>(null);
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [result, setResult] = useState<Blob | Blob[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dpi, setDpi] = useState(150);
    const [quality, setQuality] = useState(0.92);
    const cancelledRef = useRef(false);

    const handleFilesSelected = useCallback((newFiles: File[]) => {
        if (newFiles.length > 0) {
            const uploadedFile: UploadedFile = {
                id: generateId(),
                file: newFiles[0],
                status: 'pending' as const,
            };
            setFile(uploadedFile);
            setError(null);
            setResult(null);
            setStatus('idle');
            setProgress(0);
        }
    }, []);

    const handleUploadError = useCallback((errorMessage: string) => {
        setError(errorMessage);
    }, []);

    const handleRemoveFile = useCallback(() => {
        setFile(null);
        setResult(null);
        setError(null);
        setStatus('idle');
        setProgress(0);
    }, []);

    const handleConvert = useCallback(async () => {
        if (!file) {
            setError(t('errors.uploadFile') || 'Please upload a DJVU file.');
            return;
        }

        cancelledRef.current = false;
        setStatus('processing');
        setProgress(0);
        setError(null);
        setResult(null);

        try {
            const output: ProcessOutput = await djvuToPDF(
                file.file,
                { dpi, quality },
                (prog, message) => {
                    if (!cancelledRef.current) {
                        setProgress(prog);
                        setProgressMessage(message || '');
                    }
                }
            );

            if (cancelledRef.current) {
                setStatus('idle');
                return;
            }

            if (output.success && output.result) {
                setResult(output.result);
                setStatus('complete');
            } else {
                setError(output.error?.message || 'Failed to convert DJVU to PDF.');
                setStatus('error');
            }
        } catch (err) {
            if (!cancelledRef.current) {
                setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
                setStatus('error');
            }
        }
    }, [file, t, dpi, quality]);

    const handleCancel = useCallback(() => {
        cancelledRef.current = true;
        setStatus('idle');
        setProgress(0);
    }, []);

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const isProcessing = status === 'processing' || status === 'uploading';
    const canConvert = file && !isProcessing;

    return (
        <div className={`space-y-8 ${className}`.trim()}>
            <FileUploader
                accept={['.djvu', '.djv', 'image/x-djvu', 'image/vnd.djvu']}
                multiple={false}
                maxFiles={1}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={isProcessing}
                label={tTools('djvuToPdf.uploadLabel') || 'Upload DJVU File'}
                description={tTools('djvuToPdf.uploadDescription') || 'Drag and drop a DJVU file here, or click to browse.'}
            />

            {error && (
                <div className="p-4 rounded-xl bg-red-50/50 border border-red-200 text-red-700 flex items-start gap-3 animate-in fade-in slide-in-from-top-2" role="alert">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            {file && (
                <Card variant="outlined" size="lg" className="glass-card">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[hsl(var(--color-primary)/0.1)] flex items-center justify-center text-[hsl(var(--color-primary))]">
                                <FileText className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="font-semibold text-[hsl(var(--color-foreground))]">{file.file.name}</p>
                                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{formatSize(file.file.size)}</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleRemoveFile} disabled={isProcessing} className="text-[hsl(var(--color-muted-foreground))] hover:text-red-500 hover:bg-red-50">
                            <Trash2 className="w-5 h-5" />
                        </Button>
                    </div>
                </Card>
            )}

            {/* Options */}
            <Card variant="outlined" size="lg" className="glass-card">
                <div className="flex items-center gap-2 mb-4">
                    <Settings2 className="w-5 h-5 text-[hsl(var(--color-primary))]" />
                    <h3 className="font-semibold text-[hsl(var(--color-foreground))]">
                        {tTools('djvuToPdf.optionsTitle') || 'Conversion Options'}
                    </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                            {tTools('djvuToPdf.dpiLabel') || 'Output DPI'}
                        </label>
                        <select
                            value={dpi}
                            onChange={(e) => setDpi(Number(e.target.value))}
                            disabled={isProcessing}
                            className="w-full px-4 py-2.5 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                        >
                            <option value={72}>72 DPI (Web)</option>
                            <option value={150}>150 DPI (Standard)</option>
                            <option value={300}>300 DPI (Print)</option>
                        </select>
                        <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                            {tTools('djvuToPdf.dpiHint') || 'Higher DPI = larger file size, better quality'}
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                            {tTools('djvuToPdf.qualityLabel') || 'Image Quality'}
                        </label>
                        <select
                            value={quality}
                            onChange={(e) => setQuality(Number(e.target.value))}
                            disabled={isProcessing}
                            className="w-full px-4 py-2.5 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                        >
                            <option value={0.7}>70% (Smaller file)</option>
                            <option value={0.85}>85% (Balanced)</option>
                            <option value={0.92}>92% (High quality)</option>
                            <option value={1.0}>100% (Maximum)</option>
                        </select>
                        <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                            {tTools('djvuToPdf.qualityHint') || 'JPEG compression quality for pages'}
                        </p>
                    </div>
                </div>
            </Card>

            {isProcessing && (
                <ProcessingProgress progress={progress} status={status} message={progressMessage} onCancel={handleCancel} showPercentage />
            )}

            <div className="flex flex-wrap items-center justify-center gap-4">
                <Button variant="primary" size="lg" onClick={handleConvert} disabled={!canConvert} loading={isProcessing} className="min-w-[200px] shadow-lg hover:shadow-primary/25 transition-all hover:-translate-y-0.5">
                    {!isProcessing && <RefreshCw className="w-5 h-5 mr-2" />}
                    {isProcessing ? (t('status.processing') || 'Converting...') : (tTools('djvuToPdf.convertButton') || 'Convert to PDF')}
                </Button>

                {result && !Array.isArray(result) && (
                    <DownloadButton file={result as Blob} filename={`${file?.file.name.replace(/\.(djvu|djv)$/i, '')}.pdf`} variant="secondary" size="lg" showFileSize className="min-w-[200px] shadow-lg transition-all hover:-translate-y-0.5" />
                )}
            </div>

            {status === 'complete' && result && (
                <div className="p-6 rounded-2xl bg-green-50/50 border border-green-200 text-green-700 text-center animate-in fade-in zoom-in-95 duration-300" role="status">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{tTools('successTitle') || 'Conversion Successful!'}</h3>
                    <p className="text-green-800/80 max-w-md mx-auto">
                        {tTools('djvuToPdf.successMessage') || 'Your DJVU file has been converted to PDF.'}
                    </p>
                </div>
            )}
        </div>
    );
}

export default DJVUToPDFTool;
