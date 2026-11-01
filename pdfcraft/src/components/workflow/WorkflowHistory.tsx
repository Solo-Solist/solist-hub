'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { 
    Clock, 
    CheckCircle, 
    XCircle, 
    FileText, 
    Trash2,
    RotateCcw,
    TrendingUp,
    Calendar,
    Timer,
    Layers
} from 'lucide-react';
import { loadExecutionHistory, deleteExecutionRecord, clearExecutionHistory, getExecutionStatistics } from '@/lib/workflow/history';
import type { WorkflowExecutionRecord } from '@/types/workflow-history';
import { logger } from '@/lib/utils/logger';

interface WorkflowHistoryProps {
    onLoadFromHistory?: (record: WorkflowExecutionRecord) => void;
}

/**
 * Workflow Execution History Viewer
 * Displays past workflow executions with details and statistics
 */
export function WorkflowHistory({ onLoadFromHistory }: WorkflowHistoryProps) {
    const tWorkflow = useTranslations('workflow');
    const [records, setRecords] = useState<WorkflowExecutionRecord[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<WorkflowExecutionRecord | null>(null);
    const [statistics, setStatistics] = useState<ReturnType<typeof getExecutionStatistics> | null>(null);

    // Load history on mount
    useEffect(() => {
        refreshHistory();
    }, []);

    const refreshHistory = () => {
        const history = loadExecutionHistory();
        setRecords(history);
        setStatistics(getExecutionStatistics());
    };

    const handleDelete = (id: string) => {
        if (confirm(tWorkflow('confirmDelete') || 'Are you sure you want to delete this history record?')) {
            deleteExecutionRecord(id);
            refreshHistory();
            if (selectedRecord?.id === id) {
                setSelectedRecord(null);
            }
        }
    };

    const handleClearAll = () => {
        if (confirm(tWorkflow('confirmClearAllHistory') || 'Are you sure you want to clear all history? This cannot be undone.')) {
            clearExecutionHistory();
            refreshHistory();
            setSelectedRecord(null);
        }
    };

    const formatDuration = (ms?: number): string => {
        if (!ms) return '-';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    const formatDate = (date: Date): string => {
        return new Intl.DateTimeFormat('default', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'failed':
                return <XCircle className="w-5 h-5 text-red-500" />;
            case 'running':
                return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
            default:
                return <Clock className="w-5 h-5 text-gray-400" />;
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'completed':
                return tWorkflow('complete') || 'Completed';
            case 'failed':
                return tWorkflow('error') || 'Failed';
            case 'running':
                return tWorkflow('running') || 'Running';
            default:
                return status;
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Statistics Panel */}
            {statistics && (
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-blue-600">
                                {statistics.total}
                            </div>
                            <div className="text-xs text-gray-600">
                                {tWorkflow('totalExecutions') || 'Total Runs'}
                            </div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-green-600">
                                {statistics.successRate.toFixed(0)}%
                            </div>
                            <div className="text-xs text-gray-600">
                                {tWorkflow('successRate') || 'Success Rate'}
                            </div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-purple-600">
                                {formatDuration(statistics.avgDuration)}
                            </div>
                            <div className="text-xs text-gray-600">
                                {tWorkflow('avgDuration') || 'Avg Duration'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-gray-600" />
                        <h3 className="font-semibold text-gray-900">
                            {tWorkflow('executionHistory') || 'Execution History'}
                        </h3>
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                            {records.length}
                        </span>
                    </div>
                    {records.length > 0 && (
                        <button
                            onClick={handleClearAll}
                            className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                        >
                            <Trash2 className="w-3 h-3" />
                            {tWorkflow('clearAll') || 'Clear All'}
                        </button>
                    )}
                </div>
            </div>

            {/* History List */}
            <div className="flex-1 overflow-y-auto">
                {records.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <Clock className="w-16 h-16 text-gray-300 mb-4" />
                        <p className="text-gray-500 mb-2">
                            {tWorkflow('noHistory') || 'No execution history yet'}
                        </p>
                        <p className="text-sm text-gray-400">
                            {tWorkflow('noHistoryHint') || 'Run a workflow to see history here'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {records.map((record) => (
                            <div
                                key={record.id}
                                className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                                    selectedRecord?.id === record.id ? 'bg-blue-50' : ''
                                }`}
                                onClick={() => setSelectedRecord(selectedRecord?.id === record.id ? null : record)}
                            >
                                {/* Record Header */}
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-start gap-3 flex-1">
                                        {getStatusIcon(record.status)}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-medium text-gray-900 truncate">
                                                    {record.workflowName || tWorkflow('unnamedWorkflow') || 'Unnamed Workflow'}
                                                </h4>
                                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                                    record.status === 'completed' 
                                                        ? 'bg-green-100 text-green-700'
                                                        : record.status === 'failed'
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {getStatusText(record.status)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {formatDate(record.startTime)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Timer className="w-3 h-3" />
                                                    {formatDuration(record.duration)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Layers className="w-3 h-3" />
                                                    {record.nodes?.length || 0} {tWorkflow('nodes') || 'nodes'}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <FileText className="w-3 h-3" />
                                                    {record.fileCount || 0} {tWorkflow('filesCount') || 'files'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(record.id);
                                        }}
                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Expanded Details */}
                                {selectedRecord?.id === record.id && (
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                        {/* Node Statistics */}
                                        <div className="flex items-center gap-4 text-sm mb-3">
                                            <span className="text-green-600">
                                                ✓ {record.successfulNodes || 0}/{record.totalNodes || 0} {tWorkflow('nodesSuccess') || 'nodes succeeded'}
                                            </span>
                                            {(record.totalNodes || 0) - (record.successfulNodes || 0) > 0 && (
                                                <span className="text-red-600">
                                                    ✗ {(record.totalNodes || 0) - (record.successfulNodes || 0)} {tWorkflow('nodesFailed') || 'failed'}
                                                </span>
                                            )}
                                        </div>

                                        {/* Error Message */}
                                        {record.errorMessage && (
                                            <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-3">
                                                <span className="font-medium">{tWorkflow('error') || 'Error'}:</span> {record.errorMessage}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-2">
                                            {onLoadFromHistory && record.nodes && record.edges && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onLoadFromHistory(record);
                                                    }}
                                                    className="flex-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <RotateCcw className="w-4 h-4" />
                                                    {tWorkflow('loadWorkflow') || 'Load Workflow'}
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    logger.log('Workflow Details:', {
                                                        nodes: record.nodes || [],
                                                        edges: record.edges || [],
                                                        record,
                                                    });
                                                    alert(tWorkflow('detailsInConsole') || 'Details logged to console (F12)');
                                                }}
                                                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center gap-2"
                                            >
                                                <TrendingUp className="w-4 h-4" />
                                                {tWorkflow('viewDetails') || 'View Details'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
