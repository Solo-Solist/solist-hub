'use client';

import React, { memo, useState, useRef } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { ToolNodeData, WorkflowNode } from '@/types/workflow';
import { Upload, X, FileText, Image as ImageIcon, Trash2, Plus, CheckCircle2, Eye } from 'lucide-react';

interface InputNodeProps {
    id: string;
    data: ToolNodeData;
    selected?: boolean;
    isConnectable?: boolean;
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Dedicated Input Node inspired by BentoPDF
 * Allows users to upload and preview input files directly on the canvas node
 */
const InputNode: React.FC<InputNodeProps> = ({
    id,
    data,
    selected = false,
    isConnectable = true,
}) => {
    const { setNodes, setEdges } = useReactFlow();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const isImageNode = data.toolId === 'image-input';
    const isPdfNode = data.toolId === 'pdf-input';
    const files = data.inputFiles || [];

    const acceptedExtensions = isImageNode
        ? ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.svg', '.heic']
        : isPdfNode
        ? ['.pdf']
        : data.acceptedFormats || ['.pdf'];

    const acceptString = acceptedExtensions.join(',');

    const handleDeleteNode = (e: React.MouseEvent) => {
        e.stopPropagation();
        setNodes((nodes) => nodes.filter((node) => node.id !== id));
        setEdges((edges) => edges.filter((edge) => edge.source !== id && edge.target !== id));
    };

    const handleFilesAdded = (newFiles: FileList | File[]) => {
        const validFiles: File[] = [];
        for (let i = 0; i < newFiles.length; i++) {
            const file = newFiles[i];
            const ext = '.' + file.name.split('.').pop()?.toLowerCase();
            if (
                acceptedExtensions.includes('*') ||
                acceptedExtensions.some((a) => a.toLowerCase() === ext)
            ) {
                validFiles.push(file);
            }
        }

        if (validFiles.length === 0) return;

        setNodes((nodes: WorkflowNode[]) =>
            nodes.map((node) => {
                if (node.id === id) {
                    const currentFiles = node.data.inputFiles || [];
                    const updatedFiles = [...currentFiles, ...validFiles];
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            inputFiles: updatedFiles,
                            status: 'complete',
                            error: undefined,
                        },
                    };
                }
                return node;
            })
        );
    };

    const handleRemoveFile = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setNodes((nodes: WorkflowNode[]) =>
            nodes.map((node) => {
                if (node.id === id) {
                    const currentFiles = node.data.inputFiles || [];
                    const updatedFiles = currentFiles.filter((_, i) => i !== index);
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            inputFiles: updatedFiles,
                            status: updatedFiles.length > 0 ? 'complete' : 'idle',
                        },
                    };
                }
                return node;
            })
        );
    };

    const handleClearAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        setNodes((nodes: WorkflowNode[]) =>
            nodes.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            inputFiles: [],
                            status: 'idle',
                        },
                    };
                }
                return node;
            })
        );
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesAdded(e.dataTransfer.files);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const socketColor = isImageNode
        ? { bg: '#10b981', border: '#059669', label: 'Images' }
        : { bg: '#6366f1', border: '#4f46e5', label: 'PDF' };

    return (
        <div
            className={`relative min-w-[280px] max-w-[340px] rounded-xl border-2 transition-all duration-200 bg-[hsl(var(--color-card))] shadow-md text-[hsl(var(--color-card-foreground))] ${
                selected
                    ? 'border-emerald-500 shadow-lg shadow-emerald-500/20'
                    : 'border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-400'
            }`}
        >
            {/* Header Banner */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent border-b border-emerald-100 dark:border-emerald-900/40 rounded-t-[10px]">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-500 text-white shadow-sm">
                        {isImageNode ? <ImageIcon size={16} /> : <FileText size={16} />}
                    </div>
                    <div>
                        <h4 className="text-xs font-semibold text-[hsl(var(--color-foreground))]">
                            {data.label || (isImageNode ? '图片输入 (Image Input)' : 'PDF 输入 (PDF Input)')}
                        </h4>
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            数据输入源 (Input Node)
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {files.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            title="清空已选文件"
                            className="p-1 rounded text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleDeleteNode}
                        title="删除节点"
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-3 space-y-2.5">
                {/* Hidden File Input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={acceptString}
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files) {
                            handleFilesAdded(e.target.files);
                            e.target.value = '';
                        }
                    }}
                />

                {/* File List Summary & Adaptive Dropzone */}
                {files.length > 0 ? (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 size={12} /> 已加载 {files.length} 个文件
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        window.dispatchEvent(new CustomEvent('workflow:open-preview'));
                                    }}
                                    className="flex items-center gap-0.5 text-xs text-[hsl(var(--color-primary))] hover:underline cursor-pointer"
                                    title="打开实时预览窗口"
                                >
                                    <Eye size={11} /> 预览
                                </button>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                                >
                                    <Plus size={11} /> 追加
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1 max-h-[105px] overflow-y-auto pr-0.5">
                            {files.map((file, idx) => (
                                <div
                                    key={`${file.name}-${idx}`}
                                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-[hsl(var(--color-muted)/0.5)] border border-[hsl(var(--color-border))] text-[11px]"
                                >
                                    <span className="truncate max-w-[155px] font-mono text-[11px]" title={file.name}>
                                        {file.name}
                                    </span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[10px] text-muted-foreground">
                                            {formatFileSize(file.size)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => handleRemoveFile(idx, e)}
                                            className="text-muted-foreground hover:text-rose-500 transition-colors p-0.5 cursor-pointer"
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Compact Append Strip */}
                        <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                            className={`cursor-pointer rounded border border-dashed py-1 px-2 text-center transition-all ${
                                isDragOver
                                    ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40'
                                    : 'border-[hsl(var(--color-border))] hover:border-emerald-400 hover:bg-emerald-50/10 dark:hover:bg-emerald-950/10'
                            }`}
                        >
                            <span className="text-[10px] text-muted-foreground">
                                拖放或点击可追加更多文件
                            </span>
                        </div>
                    </div>
                ) : (
                    /* Initial Empty Dropzone */
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => fileInputRef.current?.click()}
                        className={`cursor-pointer rounded-lg border border-dashed p-3 text-center transition-all ${
                            isDragOver
                                ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 scale-[0.99]'
                                : 'border-[hsl(var(--color-border))] hover:border-emerald-400 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20'
                        }`}
                    >
                        <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                            <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
                                <Upload size={16} />
                            </div>
                            <div className="text-[11px] font-medium text-foreground">
                                拖放文件至此，或 <span className="text-emerald-600 dark:text-emerald-400 underline">点击上传</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                支持 {acceptedExtensions.join(', ')}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Output Socket Handle */}
            <Handle
                type="source"
                position={Position.Right}
                isConnectable={isConnectable}
                style={{
                    backgroundColor: socketColor.bg,
                    borderColor: socketColor.border,
                    width: 12,
                    height: 12,
                    right: -6,
                }}
            />
            {/* Output Socket Label Badge */}
            <div className="absolute right-2.5 bottom-1 text-[9px] font-mono text-muted-foreground pointer-events-none">
                输出 ➔
            </div>
        </div>
    );
};

export default memo(InputNode);