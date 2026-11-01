'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { repairPDF } from '@/lib/pdf/processors/repair';
import type { ProcessOutput } from '@/types/pdf';

export interface RepairPDFToolProps {
    className?: string;
}

export function RepairPDFTool({ className = '' }: RepairPDFToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    const [files, setFiles] = useState<File[]>([]);
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const cancelledRef = useRef(false);

    const handleFilesSelected = useCallback((selectedFiles: File[]) => {
        setFiles(prev => [...prev, ...selectedFiles]);
        setError(null);
        setResult(null);
    }, []);

    const handleProcess = useCallback(async () => {
        if (files.length === 0) return;

        cancelledRef.current = false;
        setStatus('processing');
        setProgress(0);
        setError(null);
        setResult(null);

        try {
            // Process first file (single file API)
            const output: ProcessOutput = await repairPDF(
                files[0],
                {},
                (prog) => { if (!cancelledRef.current) setProgress(prog); }
            );

            if (output.success && output.result) {
                setResult(output.result as Blob);
                setStatus('complete');
            } else {
                setError(output.error?.message || 'Failed to repair PDF.');
                setStatus('error');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setStatus('error');
        }
    }, [files]);

    const handleRemoveFile = useCallback((index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    }, []);

    const handleClear = useCallback(() => {
        setFiles([]);
        setResult(null);
        setError(null);
        setStatus('idle');
    }, []);

    const isProcessing = status === 'processing';

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            {files.length === 0 && (
                <FileUploader
                    accept={['application/pdf', '.pdf']}
                    multiple={true}
                    maxFiles={10}
                    onFilesSelected={handleFilesSelected}
                    onError={setError}
                    disabled={isProcessing}
                    label={tTools('repairPdf.uploadLabel') || 'Upload PDF Files'}
                    description={tTools('repairPdf.uploadDescription') || 'Drag and drop PDF files to repair.'}
                />
            )}

            {error && (
                <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {files.length > 0 && (
                <>
                    <Card variant="outlined">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium">{tTools('repairPdf.filesTitle') || 'Files to Repair'} ({files.length})</h3>
                            <Button variant="ghost" size="sm" onClick={handleClear} disabled={isProcessing}>
                                {t('buttons.clearAll') || 'Clear All'}
                            </Button>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {files.map((file, index) => (
                                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                    <span className="text-sm truncate">{file.name}</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveFile(index)}
                                        disabled={isProcessing}
                                    >
                                        ×
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <div className="flex gap-4">
                        <Button
                            variant="primary"
                            size="lg"
                            onClick={handleProcess}
                            disabled={files.length === 0 || isProcessing}
                            loading={isProcessing}
                        >
                            {isProcessing
                                ? (t('status.processing') || 'Processing...')
                                : (tTools('repairPdf.repairButton') || 'Repair PDFs')
                            }
                        </Button>
                    </div>
                </>
            )}

            {isProcessing && (
                <ProcessingProgress
                    progress={progress}
                    status={status}
                    onCancel={() => { cancelledRef.current = true; setStatus('idle'); }}
                    showPercentage
                />
            )}

            {status === 'complete' && result && (
                <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="text-green-700 font-medium">
                            {tTools('repairPdf.successMessage') || 'PDF repaired successfully!'}
                        </div>
                        <DownloadButton
                            file={result}
                            filename={files.length === 1 ? `repaired_${files[0].name}` : 'repaired_pdfs.zip'}
                            variant="primary"
                            size="lg"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default RepairPDFTool;
