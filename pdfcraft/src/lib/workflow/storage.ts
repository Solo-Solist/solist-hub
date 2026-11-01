/**
 * Workflow Storage Utilities
 * Handle saving and loading workflows from localStorage
 */

import { SavedWorkflow, WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { logger } from '@/lib/utils/logger';
import { saveBlobFile } from '@/lib/tauri-bridge';

const STORAGE_KEY = 'pdfcraft_workflows';
const MAX_WORKFLOWS = 50;

/**
 * Get all saved workflows from localStorage
 */
export function getSavedWorkflows(): SavedWorkflow[] {
    if (typeof window === 'undefined') return [];

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];

        const workflows = JSON.parse(stored) as SavedWorkflow[];
        // Sort by updatedAt descending
        return workflows.sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    } catch (error) {
        logger.error('Failed to load workflows:', error);
        return [];
    }
}

/**
 * Save a workflow to localStorage
 */
export function saveWorkflow(
    name: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    description?: string,
    existingId?: string
): SavedWorkflow {
    const workflows = getSavedWorkflows();
    const now = new Date().toISOString();

    // Clean nodes data for storage (remove runtime data)
    const cleanNodes = nodes.map(node => ({
        ...node,
        data: {
            ...node.data,
            status: 'idle' as const,
            progress: 0,
            error: undefined,
            inputFiles: undefined,
            outputFiles: undefined,
        },
    }));

    if (existingId) {
        // Update existing workflow
        const index = workflows.findIndex(w => w.id === existingId);
        if (index !== -1) {
            workflows[index] = {
                ...workflows[index],
                name,
                description,
                nodes: cleanNodes,
                edges,
                updatedAt: now,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
            return workflows[index];
        }
    }

    // Create new workflow
    const newWorkflow: SavedWorkflow = {
        id: `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        description,
        nodes: cleanNodes,
        edges,
        createdAt: now,
        updatedAt: now,
    };

    // Add to beginning and limit total
    workflows.unshift(newWorkflow);
    if (workflows.length > MAX_WORKFLOWS) {
        workflows.pop();
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
    return newWorkflow;
}

/**
 * Delete a workflow from localStorage
 */
export function deleteWorkflow(id: string): boolean {
    try {
        const workflows = getSavedWorkflows();
        const filtered = workflows.filter(w => w.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        return true;
    } catch (error) {
        logger.error('Failed to delete workflow:', error);
        return false;
    }
}

/**
 * Toggle workflow favorite status
 */
export function toggleWorkflowFavorite(id: string): boolean {
    try {
        const workflows = getSavedWorkflows();
        const workflow = workflows.find(w => w.id === id);
        if (workflow) {
            workflow.isFavorite = !workflow.isFavorite;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
            return workflow.isFavorite;
        }
        return false;
    } catch (error) {
        logger.error('Failed to toggle favorite:', error);
        return false;
    }
}

/**
 * Duplicate a workflow
 */
export function duplicateWorkflow(id: string): SavedWorkflow | null {
    const workflows = getSavedWorkflows();
    const original = workflows.find(w => w.id === id);

    if (!original) return null;

    return saveWorkflow(
        `${original.name} (Copy)`,
        original.nodes,
        original.edges,
        original.description
    );
}

/**
 * Export workflow as JSON file
 */
export function exportWorkflow(workflow: SavedWorkflow): void {
    const dataStr = JSON.stringify(workflow, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const filename = `${workflow.name.replace(/[^a-z0-9]/gi, '_')}.workflow.json`;
    saveBlobFile(blob, filename);
}

/**
 * Import workflow from JSON file
 */
export async function importWorkflow(file: File): Promise<SavedWorkflow | null> {
    try {
        const text = await file.text();
        const workflow = JSON.parse(text) as SavedWorkflow;

        // Validate basic structure
        if (!workflow.name || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
            throw new Error('Invalid workflow file format');
        }

        // Validate node structure
        for (const node of workflow.nodes) {
            if (!node.id || !node.type || !node.data) {
                throw new Error('Invalid node structure: missing id, type, or data');
            }
            if (!node.data.toolId || !node.data.label) {
                throw new Error('Invalid node data: missing toolId or label');
            }
            if (!Array.isArray(node.data.acceptedFormats) || typeof node.data.outputFormat !== 'string') {
                throw new Error('Invalid node data: missing acceptedFormats or outputFormat');
            }
        }

        // Validate edge structure
        for (const edge of workflow.edges) {
            if (!edge.id || !edge.source || !edge.target) {
                throw new Error('Invalid edge structure: missing id, source, or target');
            }
            // Verify edge references valid nodes
            const sourceExists = workflow.nodes.some(n => n.id === edge.source);
            const targetExists = workflow.nodes.some(n => n.id === edge.target);
            if (!sourceExists || !targetExists) {
                throw new Error('Invalid edge: references non-existent node');
            }
        }

        // Save as new workflow
        return saveWorkflow(
            workflow.name,
            workflow.nodes,
            workflow.edges,
            workflow.description
        );
    } catch (error) {
        logger.error('Failed to import workflow:', error);
        return null;
    }
}

/**
 * Get favorite workflows
 */
export function getFavoriteWorkflows(): SavedWorkflow[] {
    return getSavedWorkflows().filter(w => w.isFavorite);
}

/**
 * Search workflows by name or description
 */
export function searchWorkflows(query: string): SavedWorkflow[] {
    const lowerQuery = query.toLowerCase();
    return getSavedWorkflows().filter(w =>
        w.name.toLowerCase().includes(lowerQuery) ||
        (w.description && w.description.toLowerCase().includes(lowerQuery))
    );
}
