'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { pdfToSVG, type PDFToSVGOptions, type SVGResult } from '@/lib/pdf/processors/pdf-to-svg';
import type { UploadedFile, ProcessOutput } from '@/types/pdf';
import JSZip from 'jszip';
import { saveBlobFile } from '@/lib/tauri-bridge';

/**
 * Generate a unique ID for files
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface PDFToSVGToolProps {
    /** Custom class name */
    className?: string;
}

/**
 * PDFToSVGTool Component
 * 
 * Converts PDF pages to SVG (Scalable Vector Graphics).
 * Supports preview and individual export.
 */
export function PDFToSVGTool({ className = '' }: PDFToSVGToolProps) {
    const t = useTranslations('common');
    const tTools = useTranslations('tools');

    // State
    const [file, setFile] = useState<UploadedFile | null>(null);
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [result, setResult] = useState<Blob | Blob[] | null>(null);
    const [svgResults, setSvgResults] = useState<SVGResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);

    // Options state
    const [scale, setScale] = useState(2);
    const [pageRange, setPageRange] = useState('');

    // Ref for cancellation
    const cancelledRef = useRef(false);

    /**
     * Handle file selected from uploader
     */
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
            setSvgResults([]);
            setPreviewIndex(null);
        }
    }, []);

    /**
     * Handle file upload error
     */
    const handleUploadError = useCallback((errorMessage: string) => {
        setError(errorMessage);
    }, []);

    /**
     * Remove the file
     */
    const handleRemoveFile = useCallback(() => {
        setFile(null);
        setResult(null);
        setSvgResults([]);
        setError(null);
        setStatus('idle');
        setProgress(0);
        setPreviewIndex(null);
    }, []);

    /**
     * Parse page range string to array of page numbers
     */
    const parsePageRange = (rangeStr: string): number[] => {
        if (!rangeStr.trim()) return [];

        const pages: number[] = [];
        const parts = rangeStr.split(',');

        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('-')) {
                const [start, end] = trimmed.split('-').map(s => parseInt(s.trim(), 10));
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = start; i <= end; i++) {
                        if (!pages.includes(i)) pages.push(i);
                    }
                }
            } else {
                const num = parseInt(trimmed, 10);
                if (!isNaN(num) && !pages.includes(num)) {
                    pages.push(num);
                }
            }
        }

        return pages.sort((a, b) => a - b);
    };

    /**
     * Handle convert operation
     */
    const handleConvert = useCallback(async () => {
        if (!file) {
            setError('Please upload a PDF file.');
            return;
        }

        cancelledRef.current = false;
        setStatus('processing');
        setProgress(0);
        setError(null);
        setResult(null);
        setSvgResults([]);
        setPreviewIndex(null);

        const options: Partial<PDFToSVGOptions> = {
            scale,
            pages: parsePageRange(pageRange),
        };

        try {
            const output: ProcessOutput = await pdfToSVG(
                file.file,
                options,
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
                if (output.metadata?.svgResults) {
                    setSvgResults(output.metadata.svgResults as SVGResult[]);
                }
                setStatus('complete');
            } else {
                setError(output.error?.message || 'Failed to convert PDF to SVG.');
                setStatus('error');
            }
        } catch (err) {
            if (!cancelledRef.current) {
                setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
                setStatus('error');
            }
        }
    }, [file, scale, pageRange]);

    /**
     * Handle cancel operation
     */
    const handleCancel = useCallback(() => {
        cancelledRef.current = true;
        setStatus('idle');
        setProgress(0);
    }, []);

    /**
     * Download all SVGs as ZIP
     */
    const handleDownloadZip = useCallback(async () => {
        if (!result || !Array.isArray(result) || !file) return;

        const zip = new JSZip();
        const baseName = file.file.name.replace(/\.pdf$/i, '');

        result.forEach((blob, index) => {
            zip.file(`${baseName}_page_${index + 1}.svg`, blob);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        await saveBlobFile(zipBlob, `${baseName}_svg.zip`);
    }, [result, file]);

    /**
     * Format file size
     */
    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    /**
     * Open preview modal
     */
    const openPreview = (index: number) => {
        setPreviewIndex(index);
    };

    /**
     * Close preview modal
     */
    const closePreview = () => {
        setPreviewIndex(null);
    };

    const isProcessing = status === 'processing' || status === 'uploading';
    const canConvert = file && !isProcessing;
    const isMultipleSVGs = Array.isArray(result) && result.length > 1;

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
                label={tTools('pdfToSvg.uploadLabel') || 'Upload PDF'}
                description={tTools('pdfToSvg.uploadDescription') || 'Drag and drop a PDF file here, or click to browse.'}
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
            {file && (
                <Card variant="outlined" size="lg">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[hsl(var(--color-primary)/0.1)] flex items-center justify-center">
                                <svg className="w-5 h-5 text-[hsl(var(--color-primary))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-medium text-[hsl(var(--color-foreground))]">{file.file.name}</p>
                                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{formatSize(file.file.size)}</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            disabled={isProcessing}
                        >
                            {t('buttons.remove') || 'Remove'}
                        </Button>
                    </div>
                </Card>
            )}


            {/* Options Panel */}
            {file && (
                <Card variant="outlined">
                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                        {tTools('pdfToSvg.optionsTitle') || 'Conversion Options'}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Scale/Resolution */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('pdfToSvg.resolution') || 'Resolution'}
                            </label>
                            <select
                                value={scale}
                                onChange={(e) => setScale(parseFloat(e.target.value))}
                                disabled={isProcessing}
                                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                            >
                                <option value="1">72 DPI (Low)</option>
                                <option value="2">144 DPI (Medium)</option>
                                <option value="3">216 DPI (High)</option>
                                <option value="4">288 DPI (Very High)</option>
                            </select>
                            <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                                {tTools('pdfToSvg.resolutionHint') || 'Higher resolution produces larger, more detailed SVG files.'}
                            </p>
                        </div>

                        {/* Page Range */}
                        <div>
                            <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-2">
                                {tTools('pdfToSvg.pageRange') || 'Page Range'}
                            </label>
                            <input
                                type="text"
                                value={pageRange}
                                onChange={(e) => setPageRange(e.target.value)}
                                placeholder={tTools('pdfToSvg.pageRangePlaceholder') || 'e.g., 1-3, 5, 7'}
                                disabled={isProcessing}
                                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                            />
                            <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-1">
                                {tTools('pdfToSvg.pageRangeHint') || 'Leave empty for all pages'}
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Processing Progress */}
            {isProcessing && (
                <ProcessingProgress
                    progress={progress}
                    status={status}
                    message={progressMessage}
                    onCancel={handleCancel}
                    showPercentage
                />
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4">
                <Button
                    variant="primary"
                    size="lg"
                    onClick={handleConvert}
                    disabled={!canConvert}
                    loading={isProcessing}
                >
                    {isProcessing
                        ? (t('status.processing') || 'Processing...')
                        : (tTools('pdfToSvg.convertButton') || 'Convert to SVG')
                    }
                </Button>

                {result && !isMultipleSVGs && (
                    <DownloadButton
                        file={result as Blob}
                        filename={`${file?.file.name.replace(/\.pdf$/i, '')}.svg`}
                        variant="secondary"
                        size="lg"
                        showFileSize
                    />
                )}

                {isMultipleSVGs && (
                    <Button
                        variant="secondary"
                        size="lg"
                        onClick={handleDownloadZip}
                    >
                        {tTools('pdfToSvg.downloadZip') || `Download All (${(result as Blob[]).length} SVGs)`}
                    </Button>
                )}
            </div>

            {/* SVG Preview Grid */}
            {svgResults.length > 0 && (
                <Card variant="outlined" size="lg">
                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-4">
                        {tTools('pdfToSvg.previewTitle') || 'Converted SVGs'} ({svgResults.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {svgResults.map((svgResult, index) => (
                            <div key={index} className="relative group">
                                <div
                                    className="aspect-[3/4] rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] overflow-hidden bg-[hsl(var(--color-muted)/0.3)] cursor-pointer hover:border-[hsl(var(--color-primary))] transition-colors"
                                    onClick={() => openPreview(index)}
                                >
                                    <div
                                        className="w-full h-full flex items-center justify-center"
                                        dangerouslySetInnerHTML={{
                                            __html: svgResult.svg.replace(/<\?xml[^>]*\?>/, '').replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, 'height="100%"')
                                        }}
                                    />
                                </div>
                                <span className="absolute top-2 left-2 px-2 py-1 rounded bg-black/50 text-white text-xs">
                                    {svgResult.pageNumber}
                                </span>
                                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openPreview(index);
                                        }}
                                        className="bg-black/50 text-white hover:bg-black/70"
                                    >
                                        👁
                                    </Button>
                                    <DownloadButton
                                        file={svgResult.blob}
                                        filename={`${file?.file.name.replace(/\.pdf$/i, '')}_page_${svgResult.pageNumber}.svg`}
                                        variant="ghost"
                                        size="sm"
                                        className="bg-black/50 text-white hover:bg-black/70"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Preview Modal */}
            {previewIndex !== null && svgResults[previewIndex] && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={closePreview}
                >
                    <div
                        className="relative max-w-[90vw] max-h-[90vh] bg-white rounded-lg overflow-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                            <h4 className="font-medium">
                                {tTools('pdfToSvg.previewPage') || 'Page'} {svgResults[previewIndex].pageNumber}
                            </h4>
                            <div className="flex items-center gap-2">
                                <DownloadButton
                                    file={svgResults[previewIndex].blob}
                                    filename={`${file?.file.name.replace(/\.pdf$/i, '')}_page_${svgResults[previewIndex].pageNumber}.svg`}
                                    variant="secondary"
                                    size="sm"
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={closePreview}
                                >
                                    ✕
                                </Button>
                            </div>
                        </div>
                        <div
                            className="p-4"
                            dangerouslySetInnerHTML={{ __html: svgResults[previewIndex].svg.replace(/<\?xml[^>]*\?>/, '') }}
                        />
                    </div>
                </div>
            )}

            {/* Success Message */}
            {status === 'complete' && result && (
                <div
                    className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700"
                    role="status"
                >
                    <p className="text-sm font-medium">
                        {tTools('pdfToSvg.successMessage') || 'PDF converted to SVG successfully! Click on thumbnails to preview or download individual files.'}
                    </p>
                </div>
            )}
        </div>
    );
}

export default PDFToSVGTool;
