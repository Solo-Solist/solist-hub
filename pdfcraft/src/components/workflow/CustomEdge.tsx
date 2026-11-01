'use client';

import React from 'react';
import { 
    EdgeProps, 
    getBezierPath, 
    EdgeLabelRenderer,
    BaseEdge,
    useReactFlow
} from 'reactflow';
import { X } from 'lucide-react';

/**
 * Custom Edge with Conditional Branch Badges & Delete Button
 * Displays True/False labels for condition gateways, and a delete button when selected
 */
export function CustomEdge({
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    selected,
    animated,
    sourceHandleId,
}: EdgeProps) {
    const { setEdges, getNode } = useReactFlow();
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const onEdgeDelete = () => {
        setEdges((edges) => edges.filter((edge) => edge.id !== id));
    };

    const isTrueBranch = sourceHandleId === 'true';
    const isFalseBranch = sourceHandleId === 'false';

    const sourceNode = getNode(source);
    const targetNode = getNode(target);
    const isProcessing = sourceNode?.data?.status === 'processing' || targetNode?.data?.status === 'processing' || animated;

    let strokeColor = (style?.stroke as string) || (selected ? '#3b82f6' : '#94a3b8');
    if (isTrueBranch) {
        strokeColor = selected ? '#059669' : '#10b981';
    } else if (isFalseBranch) {
        strokeColor = selected ? '#d97706' : '#f59e0b';
    } else if (isProcessing) {
        strokeColor = '#3b82f6';
    }

    return (
        <>
            <BaseEdge 
                path={edgePath} 
                markerEnd={markerEnd} 
                interactionWidth={20}
                style={{
                    ...style,
                    strokeWidth: selected ? 3 : (isProcessing ? 2.5 : 1.75),
                    stroke: strokeColor,
                    strokeDasharray: isProcessing ? '6 4' : undefined,
                    animation: isProcessing ? 'flowDash 1s linear infinite' : undefined,
                }}
            />
            {isProcessing && (
                <style>{`
                    @keyframes flowDash {
                        from { stroke-dashoffset: 20; }
                        to { stroke-dashoffset: 0; }
                    }
                `}</style>
            )}
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        fontSize: 12,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan flex items-center gap-1.5"
                >
                    {isTrueBranch && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-400 shadow-sm select-none">
                            ✓ True
                        </span>
                    )}

                    {isFalseBranch && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border border-amber-400 shadow-sm select-none">
                            ✗ False
                        </span>
                    )}

                    {selected && (
                        <button
                            onClick={onEdgeDelete}
                            className="w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"
                            title="删除连接 (Delete)"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
}

export default CustomEdge;
