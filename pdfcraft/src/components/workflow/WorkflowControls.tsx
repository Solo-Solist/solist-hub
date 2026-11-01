'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { WorkflowExecutionState, WorkflowNode, WorkflowEdge, WorkflowValidation, WorkflowOutputFile } from '@/types/workflow';
import { Button } from '@/components/ui/Button';
import { FileListPanel } from './FileListPanel';
import { createZip } from '@/lib/zip';
import { logger } from '@/lib/utils/logger';
import { saveBlobFile } from '@/lib/tauri-bridge';
import {
    Play,
    Pause,
    Square,
    Download,
    Save,
    Upload,
    Trash2,
    AlertCircle,
    CheckCircle,
    XCircle,
    Loader2,
    Edit2,
    RefreshCcw,
    RotateCcw,
    Archive,
    Eye,
    PanelLeft,
    PanelRight,
    X,
} from 'lucide-react';

interface WorkflowControlsProps {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    executionState: WorkflowExecutionState;
    validation: WorkflowValidation;
    onExecute: (files: File[]) => void;
    onStop: () => void;
    onSave: (name: string, description?: string) => void;
    onClear: () => void;
    onClearState?: () => void;
    onRetry?: () => void;
    onImport: (file: File) => void;
    onFilesChange?: (files: File[]) => void;
    isPreviewVisible?: boolean;
    onTogglePreview?: () => void;
    isLeftSidebarCollapsed?: boolean;
    isRightSidebarCollapsed?: boolean;
    onToggleLeftSidebar?: () => void;
    onToggleRightSidebar?: () => void;
}

/**
 * Workflow Controls Toolbar
 * Provides execution, save, load, and validation controls
 */
export function WorkflowControls({
    nodes,
    edges,
    executionState,
    validation,
    onExecute,
    onStop,
    onSave,
    onClear,
    onClearState,
    onRetry,
    onImport,
    onFilesChange,
    isPreviewVisible,
    onTogglePreview,
    isLeftSidebarCollapsed,
    isRightSidebarCollapsed,
    onToggleLeftSidebar,
    onToggleRightSidebar,
}: WorkflowControlsProps) {
    const tWorkflow = useTranslations('workflow');
    const tCommon = useTranslations('common');

    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showFileListPanel, setShowFileListPanel] = useState(false);
    const [workflowName, setWorkflowName] = useState('');
    const [workflowDescription, setWorkflowDescription] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isZipping, setIsZipping] = useState(false);
    const [isDismissedSuccess, setIsDismissedSuccess] = useState(false);

    useEffect(() => {
        if (executionState.status === 'running') {
            setIsDismissedSuccess(false);
        }
    }, [executionState.status]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setSelectedFiles(files);
        onFilesChange?.(files);
    }, [onFilesChange]);

    // Extract files loaded directly into InputNode cards on canvas
    const nodeFiles = useMemo(() => {
        return nodes.flatMap((n) => n.data.inputFiles || []);
    }, [nodes]);

    const effectiveFiles = useMemo(() => {
        return selectedFiles.length > 0 ? selectedFiles : nodeFiles;
    }, [selectedFiles, nodeFiles]);

    const hasAnyFiles = effectiveFiles.length > 0;

    const handleExecute = useCallback(() => {
        const filesToExecute = selectedFiles.length > 0 ? selectedFiles : nodeFiles;
        if (filesToExecute.length > 0) {
            Promise.resolve(onExecute(filesToExecute)).catch((err) => {
                console.error('[Workflow] Unhandled execution error:', err);
            });
        }
    }, [selectedFiles, nodeFiles, onExecute]);

    const handleSave = useCallback(() => {
        if (workflowName.trim()) {
            onSave(workflowName.trim(), workflowDescription.trim() || undefined);
            setShowSaveDialog(false);
            setWorkflowName('');
            setWorkflowDescription('');
        }
    }, [workflowName, workflowDescription, onSave]);

    const handleImportClick = useCallback(() => {
        importInputRef.current?.click();
    }, []);

    const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImport(file);
            e.target.value = '';
        }
    }, [onImport]);

    const isRunning = executionState.status === 'running';
    const canExecute = nodes.length > 0 && hasAnyFiles && validation.isValid && !isRunning;

    // Status indicator
    const StatusIndicator = () => {
        if (executionState.status === 'running') {
            return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-full text-xs font-medium whitespace-nowrap shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                        {tWorkflow('running') || 'Running'} ({executionState.progress}%)
                    </span>
                </div>
            );
        }
        if (executionState.status === 'complete') {
            return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium whitespace-nowrap shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{tWorkflow('complete') || '已完成'}</span>
                </div>
            );
        }
        if (executionState.status === 'error') {
            return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-full text-xs font-medium whitespace-nowrap shrink-0">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{tWorkflow('error') || '出错了'}</span>
                </div>
            );
        }
        if (!validation.isValid) {
            return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full text-xs font-medium whitespace-nowrap shrink-0">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>
                        {validation.errors.length} {tWorkflow('issues') || '个待处理'}
                    </span>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="relative">
            <div className="flex items-center justify-between px-3 py-2 bg-[hsl(var(--color-background))] border-b border-[hsl(var(--color-border))] min-h-[46px] gap-2 overflow-x-auto">
                {/* Left: File input and execute */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* File selection */}
                    <div className="flex items-center gap-1.5">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif,.svg,.heic,.heif,.txt,.json,.md,.markdown,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.epub,.mobi,.azw,.azw3,.xps,.djvu,.djv,.fb2,.cbz,.zip,.eml,.msg"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isRunning}
                            className="h-8 px-2.5 text-xs whitespace-nowrap shrink-0"
                        >
                            <Upload className="w-3.5 h-3.5 mr-1.5" />
                            {tWorkflow('selectFiles') || '选择文件'}
                        </Button>
                        {selectedFiles.length > 0 ? (
                            <button
                                onClick={() => setShowFileListPanel(true)}
                                disabled={isRunning}
                                className={`
                                    flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
                                    bg-[hsl(var(--color-primary)/0.1)] 
                                    text-[hsl(var(--color-primary))]
                                    hover:bg-[hsl(var(--color-primary)/0.2)]
                                    transition-colors whitespace-nowrap shrink-0
                                    ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                                title={tWorkflow('viewEditFiles') || '查看已选文件'}
                            >
                                <span className="font-medium">
                                    {selectedFiles.length} 个文件
                                </span>
                                <Edit2 className="w-3 h-3" />
                            </button>
                        ) : nodeFiles.length > 0 ? (
                            <div
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium cursor-default whitespace-nowrap shrink-0"
                                title="源文件已载入画布输入卡片中，可直接执行"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>输入卡片就绪 ({nodeFiles.length})</span>
                            </div>
                        ) : null}
                    </div>

                    <div className="h-4 w-px bg-[hsl(var(--color-border))] mx-0.5" />

                    {/* Execute button */}
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleExecute}
                        disabled={!canExecute}
                        loading={isRunning}
                        className="h-8 px-3 text-xs whitespace-nowrap shrink-0 font-medium shadow-sm"
                    >
                        <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                        {tWorkflow('execute') || '执行'}
                    </Button>

                    {/* Preview Toggle button */}
                    {onTogglePreview && (
                        <Button
                            variant={isPreviewVisible ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={onTogglePreview}
                            disabled={!hasAnyFiles}
                            className="h-8 px-2.5 text-xs whitespace-nowrap shrink-0"
                            title={tWorkflow('preview') || '实时预览'}
                        >
                            <Eye className="w-3.5 h-3.5 mr-1.5 text-[hsl(var(--color-primary))]" />
                            <span>{tWorkflow('preview') || '预览'}</span>
                        </Button>
                    )}

                    {/* Stop button */}
                    {isRunning && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onStop}
                            className="h-8 px-2.5 text-xs text-rose-600 border-rose-300 hover:bg-rose-50 whitespace-nowrap shrink-0"
                        >
                            <Square className="w-3.5 h-3.5 mr-1.5" />
                            {tWorkflow('stop') || '停止'}
                        </Button>
                    )}

                    {/* Status indicator */}
                    <StatusIndicator />
                </div>

                {/* Right: Actions and Sidebar Toggles */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* Node count */}
                    <span className="text-xs px-2 py-1 rounded bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-foreground))] whitespace-nowrap shrink-0">
                        {nodes.length} 节点
                    </span>

                    {/* Save */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSaveDialog(true)}
                        disabled={nodes.length === 0}
                        className="h-8 px-2.5 text-xs whitespace-nowrap shrink-0"
                    >
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                        {tCommon('buttons.save') || '保存'}
                    </Button>

                    {/* Import */}
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".json,.workflow.json"
                        onChange={handleImportFile}
                        className="hidden"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleImportClick}
                        className="h-8 px-2.5 text-xs whitespace-nowrap shrink-0"
                    >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        {tWorkflow('import') || '导入'}
                    </Button>

                    {/* Clear */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        disabled={nodes.length === 0 || isRunning}
                        className="h-8 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 whitespace-nowrap shrink-0"
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {tWorkflow('clear') || '清空'}
                    </Button>

                    {/* Sidebar Toggle */}
                    {onToggleRightSidebar && (
                        <div className="flex items-center pl-1.5 border-l border-[hsl(var(--color-border))]">
                            <button
                                onClick={onToggleRightSidebar}
                                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                                    !isRightSidebarCollapsed
                                        ? 'bg-[hsl(var(--color-primary)/0.1)] text-[hsl(var(--color-primary))] border-[hsl(var(--color-primary)/0.3)]'
                                        : 'text-[hsl(var(--color-muted-foreground))] hover:bg-[hsl(var(--color-muted))] border-transparent'
                                }`}
                                title={isRightSidebarCollapsed ? '展开模板库 (宽画布模式)' : '收起模板库 (全景大画布)'}
                            >
                                <PanelRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Success Toast (Mac-style floating island, doesn't push down canvas) */}
            {executionState.status === 'complete' && executionState.outputFiles && executionState.outputFiles.length > 0 && !isDismissedSuccess && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-3.5 py-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-emerald-500/30 rounded-full shadow-lg shadow-emerald-500/10 text-xs whitespace-nowrap animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        <span>工作流执行成功 ({executionState.outputFiles.length} 个产物)</span>
                    </div>
                    <div className="h-3 w-px bg-zinc-200 dark:bg-zinc-700" />
                    <div className="flex items-center gap-1.5">
                        {executionState.outputFiles.length > 1 ? (
                            <>
                                <button
                                    disabled={isZipping}
                                    onClick={async () => {
                                        if (!executionState.outputFiles || executionState.outputFiles.length === 0) return;
                                        setIsZipping(true);
                                        try {
                                            const filesForZip = executionState.outputFiles.map((item, index) => {
                                                if (item instanceof Blob) {
                                                    return { blob: item, filename: `output_${index + 1}.pdf` };
                                                }
                                                return { blob: item.blob, filename: item.filename || `output_${index + 1}.pdf` };
                                            });
                                            const zipBlob = await createZip(filesForZip);
                                            const zipFilename = `workflow_results_${new Date().toISOString().slice(0, 10)}.zip`;
                                            await saveBlobFile(zipBlob, zipFilename);
                                        } catch (error) {
                                            logger.error('Failed to create ZIP package:', error);
                                        } finally {
                                            setIsZipping(false);
                                        }
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer"
                                >
                                    {isZipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                                    <span>打包 ZIP</span>
                                </button>
                                <button
                                    onClick={() => {
                                        executionState.outputFiles?.forEach((item, index) => {
                                            let blob: Blob = item instanceof Blob ? item : item.blob;
                                            let filename: string = item instanceof Blob ? `output_${index + 1}.pdf` : (item.filename || `output_${index + 1}.pdf`);
                                            saveBlobFile(blob, filename);
                                        });
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs transition-colors cursor-pointer"
                                >
                                    <Download className="w-3 h-3" />
                                    <span>分别下载</span>
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={async () => {
                                    const item = executionState.outputFiles![0];
                                    let blob: Blob = item instanceof Blob ? item : item.blob;
                                    let filename: string = item instanceof Blob ? `output_1.pdf` : (item.filename || `output_1.pdf`);
                                    await saveBlobFile(blob, filename);
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer"
                            >
                                <Download className="w-3 h-3" />
                                <span>立即下载结果</span>
                            </button>
                        )}
                        <button
                            onClick={() => setIsDismissedSuccess(true)}
                            className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ml-0.5 cursor-pointer"
                            title="关闭提示"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            )}

            {/* Execution error with retry option */}
            {executionState.status === 'error' && executionState.error && (
                <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1">
                            <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-red-700 mb-1">
                                    {tWorkflow('executionFailed') || 'Workflow execution failed'}
                                </p>
                                <p className="text-sm text-red-600 whitespace-pre-wrap">
                                    {executionState.error.message}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {onRetry && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onRetry}
                                    className="text-red-600 border-red-300 hover:bg-red-100"
                                >
                                    <RefreshCcw className="w-4 h-4 mr-2" />
                                    {tWorkflow('retry') || 'Retry'}
                                </Button>
                            )}
                            {onClearState && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onClearState}
                                    className="text-red-600 hover:bg-red-100"
                                >
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    {tWorkflow('reset') || 'Reset'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Validation errors */}
            {validation.errors.length > 0 && !isRunning && executionState.status !== 'error' && (
                <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-yellow-700">
                            <p className="font-semibold mb-1">{tWorkflow('validationErrors') || 'Validation Errors'}</p>
                            {validation.errors.map((error, index) => (
                                <p key={index} className="ml-2">- {error.message}</p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Validation warnings */}
            {validation.warnings.length > 0 && !isRunning && executionState.status !== 'error' && (
                <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-yellow-600">
                            <p className="font-semibold mb-1">{tWorkflow('warnings') || 'Warnings'}</p>
                            {validation.warnings.map((warning, index) => (
                                <p key={index} className="ml-2">- {warning.message}</p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Save Dialog */}
            {showSaveDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[hsl(var(--color-background))] rounded-lg shadow-xl p-6 w-[400px]">
                        <h3 className="text-lg font-semibold text-[hsl(var(--color-foreground))] mb-4">
                            {tWorkflow('saveWorkflow') || 'Save Workflow'}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                    {tWorkflow('workflowName') || 'Workflow Name'}
                                </label>
                                <input
                                    type="text"
                                    value={workflowName}
                                    onChange={(e) => setWorkflowName(e.target.value)}
                                    placeholder={tWorkflow('enterName') || 'Enter workflow name...'}
                                    className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))]"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[hsl(var(--color-foreground))] mb-1">
                                    {tWorkflow('description') || 'Description'} ({tWorkflow('optional') || 'optional'})
                                </label>
                                <textarea
                                    value={workflowDescription}
                                    onChange={(e) => setWorkflowDescription(e.target.value)}
                                    placeholder={tWorkflow('enterDescription') || 'Enter description...'}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] text-[hsl(var(--color-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary))] resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <Button
                                variant="ghost"
                                onClick={() => setShowSaveDialog(false)}
                            >
                                {tCommon('buttons.cancel') || 'Cancel'}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleSave}
                                disabled={!workflowName.trim()}
                            >
                                {tCommon('buttons.save') || 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* File List Panel */}
            {showFileListPanel && (
                <FileListPanel
                    files={selectedFiles}
                    onFilesChange={(files) => {
                        setSelectedFiles(files);
                        onFilesChange?.(files);
                    }}
                    onClose={() => setShowFileListPanel(false)}
                />
            )}
        </div>
    );
}

export default WorkflowControls;
