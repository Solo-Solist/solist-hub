/**
 * Workflow Types
 * Type definitions for the PDF workflow system
 */

import { Node, Edge } from 'reactflow';

/**
 * Workflow output file with metadata
 */
export interface WorkflowOutputFile {
    blob: Blob;
    filename?: string;
}

/**
 * Tool node data structure
 */
export interface ToolNodeData {
    /** Tool ID from tools config */
    toolId: string;
    /** Display label */
    label: string;
    /** Tool icon name */
    icon: string;
    /** Tool category */
    category: string;
    /** Accepted input formats */
    acceptedFormats: string[];
    /** Output format */
    outputFormat: string;
    /** Current processing status */
    status: 'idle' | 'processing' | 'complete' | 'error' | 'skipped';
    /** Active branch for conditional gateway nodes */
    activeBranch?: 'true' | 'false';
    /** Processing progress (0-100) */
    progress: number;
    /** Error message if any */
    error?: string;
    /** Input file(s) */
    inputFiles?: File[];
    /** Output file(s) */
    outputFiles?: (Blob | WorkflowOutputFile)[];
    /** Tool-specific settings */
    settings?: Record<string, unknown>;
    /** Node role kind: input, process, output, gateway */
    nodeKind?: 'input' | 'process' | 'output' | 'gateway';
    /** Custom title or override label */
    customTitle?: string;
    /** Output file name or pattern for download nodes */
    downloadFilename?: string;
    /** Conditional branching configuration (optional, for future use) */
    conditional?: {
        enabled: boolean;
        logic: 'any' | 'all';
        branches: Array<{
            id: string;
            label: string;
            targetNodeId: string;
            conditions: Array<{
                type: string;
                operator: string;
                value: unknown;
            }>;
        }>;
    };
}

/**
 * Workflow node (extends ReactFlow Node)
 */
export type WorkflowNode = Node<ToolNodeData>;

/**
 * Workflow edge for connecting tools
 */
export type WorkflowEdge = Edge & {
    /** Whether this connection is valid */
    isValid?: boolean;
};

/**
 * Workflow template
 */
export interface WorkflowTemplate {
    /** Unique template ID */
    id: string;
    /** Template name (for display, may be translation key) */
    name: string;
    /** Template description (for display, may be translation key) */
    description: string;
    /** Translation key for template name (optional) */
    nameKey?: string;
    /** Translation key for template description (optional) */
    descriptionKey?: string;
    /** Template category */
    category: 'common' | 'conversion' | 'optimization' | 'security' | 'custom';
    /** Preview image URL */
    previewImage?: string;
    /** Nodes in the template */
    nodes: WorkflowNode[];
    /** Edges in the template */
    edges: WorkflowEdge[];
    /** Creation date */
    createdAt: string;
    /** Last modified date */
    updatedAt: string;
}


/**
 * Saved workflow
 */
export interface SavedWorkflow {
    /** Unique workflow ID */
    id: string;
    /** Workflow name */
    name: string;
    /** Workflow description */
    description?: string;
    /** Nodes in the workflow */
    nodes: WorkflowNode[];
    /** Edges in the workflow */
    edges: WorkflowEdge[];
    /** Creation date */
    createdAt: string;
    /** Last modified date */
    updatedAt: string;
    /** Whether this is a favorite */
    isFavorite?: boolean;
}

/**
 * Workflow execution state
 */
export interface WorkflowExecutionState {
    /** Current execution status */
    status: 'idle' | 'running' | 'paused' | 'complete' | 'error';
    /** Currently executing node ID */
    currentNodeId: string | null;
    /** Executed node IDs in order */
    executedNodes: string[];
    /** Pending node IDs */
    pendingNodes: string[];
    /** Overall progress (0-100) */
    progress: number;
    /** Execution start time */
    startTime?: Date;
    /** Execution end time */
    endTime?: Date;
    /** Error information */
    error?: {
        nodeId: string;
        message: string;
    };
    /** Final output files */
    outputFiles?: (Blob | WorkflowOutputFile)[];
}

/**
 * Tool category for sidebar grouping
 */
export interface ToolCategory {
    id: string;
    name: string;
    icon: string;
    tools: {
        id: string;
        label: string;
        icon: string;
        acceptedFormats: string[];
        outputFormat: string;
    }[];
}

/**
 * Workflow validation result
 */
export interface WorkflowValidation {
    isValid: boolean;
    errors: {
        nodeId?: string;
        edgeId?: string;
        message: string;
        type: 'connection' | 'format' | 'cycle' | 'orphan' | 'missing-input';
    }[];
    warnings: {
        nodeId?: string;
        message: string;
    }[];
}

/**
 * Workflow context for React context
 */
export interface WorkflowContextType {
    /** Current workflow nodes */
    nodes: WorkflowNode[];
    /** Current workflow edges */
    edges: WorkflowEdge[];
    /** Set nodes */
    setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>;
    /** Set edges */
    setEdges: React.Dispatch<React.SetStateAction<WorkflowEdge[]>>;
    /** Execution state */
    executionState: WorkflowExecutionState;
    /** Start workflow execution */
    executeWorkflow: (inputFiles: File[]) => Promise<void>;
    /** Stop workflow execution */
    stopExecution: () => void;
    /** Validate workflow */
    validateWorkflow: () => WorkflowValidation;
    /** Save current workflow */
    saveWorkflow: (name: string, description?: string) => void;
    /** Load a saved workflow */
    loadWorkflow: (workflow: SavedWorkflow) => void;
    /** Load a template */
    loadTemplate: (template: WorkflowTemplate) => void;
    /** Clear current workflow */
    clearWorkflow: () => void;
    /** Get saved workflows */
    savedWorkflows: SavedWorkflow[];
    /** Delete a saved workflow */
    deleteWorkflow: (id: string) => void;
}
