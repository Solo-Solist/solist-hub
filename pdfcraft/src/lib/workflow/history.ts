/**
 * Workflow Execution History Manager
 * Tracks and stores workflow execution history
 */

import type { WorkflowExecutionRecord, WorkflowHistoryStorage } from '@/types/workflow-history';
import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { logger } from '@/lib/utils/logger';

const STORAGE_KEY = 'pdfcraft_workflow_history';
const MAX_RECORDS = 50; // Keep last 50 executions

/**
 * Load execution history from localStorage
 */
export function loadExecutionHistory(): WorkflowExecutionRecord[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];

        const storage: WorkflowHistoryStorage = JSON.parse(stored);
        
        // Convert date strings back to Date objects
        return storage.records.map(record => ({
            ...record,
            startTime: new Date(record.startTime),
            endTime: record.endTime ? new Date(record.endTime) : undefined,
        }));
    } catch (error) {
        logger.error('[Workflow History] Failed to load history:', error);
        return [];
    }
}

/**
 * Save execution history to localStorage
 */
function saveExecutionHistory(records: WorkflowExecutionRecord[]): void {
    try {
        // Keep only the most recent records
        const limitedRecords = records.slice(-MAX_RECORDS);
        
        const storage: WorkflowHistoryStorage = {
            records: limitedRecords,
            maxRecords: MAX_RECORDS,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    } catch (error) {
        logger.error('[Workflow History] Failed to save history:', error);
    }
}

/**
 * Create a new execution record
 */
export function createExecutionRecord(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    fileCount: number,
    workflowName?: string,
    workflowId?: string
): WorkflowExecutionRecord {
    // Deep copy nodes but strip non-serializable data (File/Blob objects)
    const serializableNodes = nodes.map(node => ({
        ...node,
        data: {
            ...node.data,
            inputFiles: undefined,
            outputFiles: undefined,
        },
    }));

    return {
        id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        workflowName,
        workflowId,
        nodes: JSON.parse(JSON.stringify(serializableNodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        fileCount,
        startTime: new Date(),
        status: 'running',
        successfulNodes: 0,
        totalNodes: nodes.length,
    };
}

/**
 * Add a new execution record to history
 */
export function addExecutionRecord(record: WorkflowExecutionRecord): void {
    const history = loadExecutionHistory();
    history.push(record);
    saveExecutionHistory(history);
}

/**
 * Update an existing execution record
 */
export function updateExecutionRecord(
    id: string,
    updates: Partial<WorkflowExecutionRecord>
): void {
    const history = loadExecutionHistory();
    const index = history.findIndex(r => r.id === id);
    
    if (index !== -1) {
        history[index] = { ...history[index], ...updates };
        saveExecutionHistory(history);
    }
}

/**
 * Complete an execution record
 */
export function completeExecutionRecord(
    id: string,
    status: 'completed' | 'failed' | 'cancelled',
    successfulNodes: number,
    errorMessage?: string,
    failedNodeId?: string
): void {
    const history = loadExecutionHistory();
    const index = history.findIndex(r => r.id === id);
    
    if (index !== -1) {
        const record = history[index];
        const endTime = new Date();
        const duration = endTime.getTime() - record.startTime.getTime();

        history[index] = {
            ...record,
            status,
            endTime,
            duration,
            successfulNodes,
            errorMessage,
            failedNodeId,
        };

        saveExecutionHistory(history);
    }
}

/**
 * Delete an execution record
 */
export function deleteExecutionRecord(id: string): void {
    const history = loadExecutionHistory();
    const filtered = history.filter(r => r.id !== id);
    saveExecutionHistory(filtered);
}

/**
 * Clear all execution history
 */
export function clearExecutionHistory(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        logger.error('[Workflow History] Failed to clear history:', error);
    }
}

/**
 * Get execution statistics
 */
export function getExecutionStatistics() {
    const history = loadExecutionHistory();
    
    const total = history.length;
    const completed = history.filter(r => r.status === 'completed').length;
    const failed = history.filter(r => r.status === 'failed').length;
    const cancelled = history.filter(r => r.status === 'cancelled').length;
    
    const completedRecords = history.filter(r => r.status === 'completed' && r.duration);
    const avgDuration = completedRecords.length > 0
        ? completedRecords.reduce((sum, r) => sum + (r.duration || 0), 0) / completedRecords.length
        : 0;

    return {
        total,
        completed,
        failed,
        cancelled,
        avgDuration,
        successRate: total > 0 ? (completed / total) * 100 : 0,
    };
}
