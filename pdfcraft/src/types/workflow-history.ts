/**
 * Workflow Execution History Types
 */

import type { WorkflowNode, WorkflowEdge } from './workflow';

export interface WorkflowExecutionRecord {
    /** Unique execution ID */
    id: string;
    /** Workflow name (if saved) */
    workflowName?: string;
    /** Workflow ID (if saved) */
    workflowId?: string;
    /** Snapshot of nodes at execution time */
    nodes: WorkflowNode[];
    /** Snapshot of edges at execution time */
    edges: WorkflowEdge[];
    /** Number of input files */
    fileCount: number;
    /** Execution start time */
    startTime: Date;
    /** Execution end time */
    endTime?: Date;
    /** Duration in milliseconds */
    duration?: number;
    /** Execution status */
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    /** Error message if failed */
    errorMessage?: string;
    /** Failed node ID if applicable */
    failedNodeId?: string;
    /** Number of nodes executed successfully */
    successfulNodes: number;
    /** Total number of nodes */
    totalNodes: number;
}

export interface WorkflowHistoryStorage {
    /** List of execution records */
    records: WorkflowExecutionRecord[];
    /** Maximum number of records to keep */
    maxRecords: number;
}
