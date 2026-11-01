'use client';

import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { extractTables, type ExtractTablesOptions, type TableExportFormat } from '@/lib/pdf/processors/extract-tables';
import { Table } from 'lucide-react';

export interface ExtractTablesToolProps {
    /** Custom class name */
    className?: string;
}

/**
 * ExtractTablesTool Component
 * 
 * Extracts tables from PDF documents.
 */
export function ExtractTablesTool({ className = '' }: ExtractTablesToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    // State
    const [file, setFile] = useState<File | null>(null);
    const [resultBlob, setResultBlob] = useState<Blob | null>(null);
    const [resultFilename, setResultFilename] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Options
    const [format, setFormat] = useState<TableExportFormat>('json');
    const [pageRange, setPageRange] = useState<string>('');
    const [minColumns, setMinColumns] = useState(2);
    const [minRows, setMinRows] = useState(2);
    const [includePageNumbers, setIncludePageNumbers] = useState(true);

    /**
     * Handle file selected from uploader
     */
    const handleFilesSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            setFile(files[0]);
            setResultBlob(null);
            setResultFilename('');
            setError(null);
        }
    }, []);

    /**
     * Handle file upload error
     */
    const handleUploadError = useCallback((errorMessage: string) => {
        setError(errorMessage);
    }, []);

    /**
     * Handle extraction
     */
    const handleExtract = useCallback(async () => {
        if (!file) {
            setError('Please select a PDF file.');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setError(null);

        try {
            const options: ExtractTablesOptions = {
                format,
                pageRange: pageRange || undefined,
                minColumns,
                minRows,
                includePageNumbers,
            };

            const output = await extractTables(
                file,
                options,
                (prog) => setProgress(prog)
            );

            if (output.success && output.result) {
                setResultBlob(output.result as Blob);
                setResultFilename(output.filename || `tables.${format}`);
            } else {
                setError(output.error?.message || 'Failed to extract tables.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred.');
        } finally {
            setIsProcessing(false);
        }
    }, [file, format, pageRange, minColumns, minRows, includePageNumbers]);

    /**
     * Reset state
     */
    const handleReset = useCallback(() => {
        setFile(null);
        setResultBlob(null);
        setResultFilename('');
        setError(null);
        setProgress(0);
    }, []);

    const hasFile = file !== null;
    const canProcess = hasFile && !isProcessing;

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            {/* File Upload Area */}
            <FileUploader
                accept={['application/pdf', '.pdf']}
                multiple={false}
                maxFiles={1}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={isProcessing}
                label={tTools('extractTables.uploadLabel') || 'Upload PDF File'}
                description={tTools('extractTables.uploadDescription') || 'Drag and drop a PDF file to extract tables from.'}
            />

            {/* Error Message */}
            {error && (
                <div
                    className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700"
                    role="alert"
                >
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {/* File Info */}
            {hasFile && (
                <Card variant="outlined">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-[hsl(var(--color-foreground))]">{file.name}</p>
                            <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleReset} disabled={isProcessing}>
                            {t('buttons.clear') || 'Clear'}
                        </Button>
                    </div>
                </Card>
            )}

            {/* Extraction Options */}
            {hasFile && (
                <Card variant="outlined">
                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                        {tTools('extractTables.optionsTitle') || 'Extraction Options'}
                    </h3>

                    <div className="space-y-4">
                        {/* Output Format */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('extractTables.formatLabel') || 'Output Format'}
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['json', 'markdown', 'csv'] as TableExportFormat[]).map((fmt) => (
                                    <button
                                        key={fmt}
                                        type="button"
                                        onClick={() => setFormat(fmt)}
                                        disabled={isProcessing}
                                        className={`
                      px-4 py-2 rounded-[var(--radius-md)] border text-sm font-medium uppercase
                      transition-colors duration-200
                      ${format === fmt
                                                ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))]'
                                                : 'border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-muted)/0.5)]'
                                            }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                                    >
                                        {fmt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Page Range */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('extractTables.pageRangeLabel') || 'Page Range (optional)'}
                            </label>
                            <input
                                type="text"
                                value={pageRange}
                                onChange={(e) => setPageRange(e.target.value)}
                                disabled={isProcessing}
                                placeholder="e.g., 1-5, 8, 10-15"
                                className="w-full px-3 py-2 border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] text-sm"
                            />
                        </div>

                        {/* Min Columns/Rows */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                    {tTools('extractTables.minColumnsLabel') || 'Min Columns'}: {minColumns}
                                </label>
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={minColumns}
                                    onChange={(e) => setMinColumns(Number(e.target.value))}
                                    disabled={isProcessing}
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[hsl(var(--color-muted))]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                    {tTools('extractTables.minRowsLabel') || 'Min Rows'}: {minRows}
                                </label>
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={minRows}
                                    onChange={(e) => setMinRows(Number(e.target.value))}
                                    disabled={isProcessing}
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[hsl(var(--color-muted))]"
                                />
                            </div>
                        </div>

                        {/* Include Page Numbers */}
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includePageNumbers}
                                onChange={(e) => setIncludePageNumbers(e.target.checked)}
                                disabled={isProcessing}
                                className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--color-primary))] focus:ring-[hsl(var(--color-primary))]"
                            />
                            <span className="text-sm text-[hsl(var(--color-foreground))]">
                                {tTools('extractTables.includePageNumbersLabel') || 'Include page numbers in output'}
                            </span>
                        </label>
                    </div>
                </Card>
            )}

            {/* Processing Progress */}
            {isProcessing && (
                <ProcessingProgress
                    progress={progress}
                    status="processing"
                    message="Extracting tables..."
                    showPercentage
                />
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4">
                <Button
                    variant="primary"
                    size="lg"
                    onClick={handleExtract}
                    disabled={!canProcess}
                    loading={isProcessing}
                >
                    <Table className="w-4 h-4 mr-2" />
                    {isProcessing
                        ? (t('status.processing') || 'Processing...')
                        : (tTools('extractTables.extractButton') || 'Extract Tables')
                    }
                </Button>

                {resultBlob && (
                    <DownloadButton
                        file={resultBlob}
                        filename={resultFilename}
                        variant="secondary"
                        size="lg"
                    />
                )}
            </div>

            {/* Success Message */}
            {resultBlob && (
                <div
                    className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
                    role="status"
                >
                    <p className="text-sm font-medium">
                        {tTools('extractTables.successMessage') || 'Tables extracted successfully! Click download to save.'}
                    </p>
                </div>
            )}
        </div>
    );
}

export default ExtractTablesTool;
