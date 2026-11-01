'use client';

import React, { memo, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { ToolNodeData } from '@/types/workflow';
import { GitFork, X, Check, AlertCircle } from 'lucide-react';

interface ConditionalNodeProps {
    id: string;
    data: ToolNodeData;
    selected?: boolean;
    isConnectable?: boolean;
}

/**
 * Format condition settings into a clean human-readable summary badge
 */
function getConditionSummary(settings?: Record<string, unknown>): string {
    if (!settings) return '文件数量 > 1';

    const condType = (settings.conditionType as string) || 'file-count';
    const op = (settings.operator as string) || 'greater-than';
    const val = settings.value ?? 1;

    const opSymbols: Record<string, string> = {
        'equals': '==',
        'not-equals': '≠',
        'greater-than': '>',
        'less-than': '<',
        'greater-or-equal': '≥',
        'less-or-equal': '≤',
        'contains': '包含',
        'not-contains': '不包含',
        'matches': '正则匹配',
    };

    const symbol = opSymbols[op] || op;

    if (condType === 'file-count') {
        return `文件数量 ${symbol} ${val}`;
    }
    if (condType === 'file-size') {
        const unit = (settings.sizeUnit as string) || 'MB';
        return `文件大小 ${symbol} ${val} ${unit}`;
    }
    if (condType === 'file-format') {
        return `格式 ${symbol} ${String(val).toUpperCase()}`;
    }

    return `条件 ${symbol} ${val}`;
}

/**
 * Custom Condition Gateway Node for ReactFlow
 * Provides 1 input handle and 2 output handles (True / False branches)
 */
export const ConditionalNode = memo(({ id, data, selected = false, isConnectable = true }: ConditionalNodeProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const { deleteElements } = useReactFlow();

    const handleDelete = (event: React.MouseEvent) => {
        event.stopPropagation();
        deleteElements({ nodes: [{ id }] });
    };

    const conditionSummary = getConditionSummary(data.settings);

    // Node boundary status colors
    const statusClasses = {
        idle: 'border-indigo-400 dark:border-indigo-500 bg-[hsl(var(--color-card))]',
        processing: 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 animate-pulse',
        complete: data.activeBranch === 'true'
            ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20'
            : data.activeBranch === 'false'
                ? 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/20'
                : 'border-green-500 bg-[hsl(var(--color-card))]',
        error: 'border-red-500 bg-red-50/50 dark:bg-red-950/20',
        skipped: 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-100/60 dark:bg-gray-800/40 opacity-60',
    };

    return (
        <div
            className={`
                relative px-4 py-3 rounded-xl shadow-md border-2 transition-all duration-200
                ${statusClasses[data.status]}
                ${selected ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}
                ${isHovered ? 'shadow-lg scale-[1.02]' : ''}
                min-w-[210px] max-w-[240px]
            `}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Delete button on hover */}
            {isHovered && (
                <button
                    onClick={handleDelete}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-all z-20"
                    title="删除节点"
                >
                    <X className="w-3 h-3" />
                </button>
            )}

            {/* Target input handle (Left) */}
            <Handle
                type="target"
                position={Position.Left}
                isConnectable={isConnectable}
                className="!w-3.5 !h-3.5 !bg-indigo-500 !border-2 !border-white dark:!border-gray-900 transition-transform hover:scale-125"
                title="输入连线"
            />

            {/* Header: Icon + Title */}
            <div className="flex items-center gap-2.5 pb-2 border-b border-[hsl(var(--color-border)/0.6)]">
                <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                    <GitFork className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[hsl(var(--color-foreground))] truncate">
                        {data.label || '条件分流'}
                    </p>
                    <p className="text-[10px] text-[hsl(var(--color-muted-foreground))]">
                        Condition Gateway
                    </p>
                </div>
            </div>

            {/* Condition rule summary */}
            <div className="mt-2.5 px-2 py-1.5 rounded-md bg-[hsl(var(--color-muted)/0.5)] border border-[hsl(var(--color-border)/0.5)]">
                <p className="text-[11px] font-mono text-[hsl(var(--color-foreground))] truncate" title={conditionSummary}>
                    {conditionSummary}
                </p>
            </div>

            {/* Execution status indicator */}
            {data.status === 'complete' && data.activeBranch && (
                <div className="mt-2 flex items-center gap-1 text-[11px] font-medium">
                    {data.activeBranch === 'true' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Check className="w-3 h-3" /> 已走 True 分支
                        </span>
                    ) : (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Check className="w-3 h-3" /> 已走 False 分支
                        </span>
                    )}
                </div>
            )}

            {data.status === 'skipped' && (
                <div className="mt-1.5 text-[10px] text-gray-500 italic">
                    上游分支未激活 (已跳过)
                </div>
            )}

            {data.status === 'error' && data.error && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-red-500 truncate" title={data.error}>
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span className="truncate">{data.error}</span>
                </div>
            )}

            {/* Output branch handles (Right) */}
            <div className="mt-3 pt-2 border-t border-[hsl(var(--color-border)/0.6)] space-y-2">
                {/* True branch handle label */}
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground text-[10px]">满足条件:</span>
                    <span className={`font-semibold flex items-center gap-1 ${
                        data.activeBranch === 'true'
                            ? 'text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-400 rounded px-1'
                            : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                        ✓ True
                    </span>
                </div>

                {/* False branch handle label */}
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground text-[10px]">不满足/默认:</span>
                    <span className={`font-semibold flex items-center gap-1 ${
                        data.activeBranch === 'false'
                            ? 'text-amber-600 dark:text-amber-400 ring-1 ring-amber-400 rounded px-1'
                            : 'text-amber-600 dark:text-amber-400'
                    }`}>
                        ✗ False
                    </span>
                </div>
            </div>

            {/* Source Handle: True Branch */}
            <Handle
                type="source"
                id="true"
                position={Position.Right}
                style={{ top: '68%' }}
                isConnectable={isConnectable}
                className="!w-3.5 !h-3.5 !bg-emerald-500 !border-2 !border-white dark:!border-gray-900 transition-transform hover:scale-125"
                title="True 分支 (满足条件)"
            />

            {/* Source Handle: False Branch */}
            <Handle
                type="source"
                id="false"
                position={Position.Right}
                style={{ top: '88%' }}
                isConnectable={isConnectable}
                className="!w-3.5 !h-3.5 !bg-amber-500 !border-2 !border-white dark:!border-gray-900 transition-transform hover:scale-125"
                title="False 分支 (不满足条件)"
            />
        </div>
    );
});

ConditionalNode.displayName = 'ConditionalNode';

export default ConditionalNode;
