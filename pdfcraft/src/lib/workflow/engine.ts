/**
 * Workflow Execution Engine
 * Handles the execution of PDF workflow pipelines
 */

import { WorkflowNode, WorkflowEdge, WorkflowExecutionState, WorkflowValidation, WorkflowOutputFile } from '@/types/workflow';

/**
 * Build a directed graph from nodes and edges
 */
export function buildGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize
    nodes.forEach(node => {
        adjacencyList.set(node.id, []);
        inDegree.set(node.id, 0);
    });

    // Build adjacency list and in-degree map
    edges.forEach(edge => {
        const sourceList = adjacencyList.get(edge.source) || [];
        sourceList.push(edge.target);
        adjacencyList.set(edge.source, sourceList);

        const currentInDegree = inDegree.get(edge.target) || 0;
        inDegree.set(edge.target, currentInDegree + 1);
    });

    return { adjacencyList, inDegree };
}

/**
 * Perform topological sort to get execution order
 * Returns null if there's a cycle
 */
export function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] | null {
    const { adjacencyList, inDegree } = buildGraph(nodes, edges);
    const queue: string[] = [];
    const result: string[] = [];

    // Find all nodes with no incoming edges
    inDegree.forEach((degree, nodeId) => {
        if (degree === 0) {
            queue.push(nodeId);
        }
    });

    while (queue.length > 0) {
        const current = queue.shift()!;
        result.push(current);

        const neighbors = adjacencyList.get(current) || [];
        for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) || 0) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
                queue.push(neighbor);
            }
        }
    }

    // If we didn't process all nodes, there's a cycle
    if (result.length !== nodes.length) {
        return null;
    }

    return result;
}

/**
 * Perform topological grouping to get parallel execution stages.
 * Each stage contains independent nodes whose prerequisites have all completed in earlier stages.
 * Returns null if the graph has a cycle.
 */
export function getExecutionStages(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[][] | null {
    if (nodes.length === 0) return [];

    const { adjacencyList, inDegree } = buildGraph(nodes, edges);
    const inDegMap = new Map<string, number>(inDegree);
    const stages: string[][] = [];
    let processedCount = 0;

    // Current wave of ready nodes (in-degree 0)
    let currentStage: string[] = [];
    inDegMap.forEach((deg, nodeId) => {
        if (deg === 0) {
            currentStage.push(nodeId);
        }
    });

    while (currentStage.length > 0) {
        stages.push(currentStage);
        processedCount += currentStage.length;

        const nextStage: string[] = [];
        for (const nodeId of currentStage) {
            const neighbors = adjacencyList.get(nodeId) || [];
            for (const neighbor of neighbors) {
                const newDeg = (inDegMap.get(neighbor) || 0) - 1;
                inDegMap.set(neighbor, newDeg);
                if (newDeg === 0) {
                    nextStage.push(neighbor);
                }
            }
        }
        currentStage = nextStage;
    }

    if (processedCount !== nodes.length) {
        return null; // Graph has a cycle
    }

    return stages;
}

/**
 * Get all downstream node IDs that depend directly or indirectly on a given starting node
 */
export function getDownstreamNodeIds(startNodeId: string, edges: WorkflowEdge[]): Set<string> {
    const downstream = new Set<string>([startNodeId]);
    const queue = [startNodeId];
    while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const edge of edges) {
            if (edge.source === curr && !downstream.has(edge.target)) {
                downstream.add(edge.target);
                queue.push(edge.target);
            }
        }
    }
    return downstream;
}

/**
 * Find input nodes (nodes with no incoming edges)
 */
export function findInputNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    const nodesWithIncoming = new Set(edges.map(e => e.target));
    return nodes.filter(node => !nodesWithIncoming.has(node.id));
}

/**
 * Check whether a filename matches one of the node's accepted format extensions.
 */
export function fileMatchesAcceptedFormats(filename: string, acceptedFormats: string[]): boolean {
    if (acceptedFormats.length === 0 || acceptedFormats.includes('*') || acceptedFormats.includes('.*')) return true;
    const lower = filename.toLowerCase();
    return acceptedFormats.some((format) => {
        if (format === '*' || format === '.*') return true;
        if (format.includes('/')) {
            if (format === 'application/pdf' && lower.endsWith('.pdf')) return true;
            if (format.startsWith('image/') && /\.(png|jpe?g|webp|svg|gif|bmp|tiff?)$/i.test(lower)) return true;
            if (format === 'application/zip' && lower.endsWith('.zip')) return true;
            const sub = format.split('/')[1];
            return lower.endsWith(`.${sub}`);
        }
        const ext = format.startsWith('.') ? format.toLowerCase() : `.${format.toLowerCase()}`;
        return lower.endsWith(ext);
    });
}

/**
 * Assign uploaded files to workflow input nodes by each node's acceptedFormats.
 * Used when multiple parallel input nodes (e.g. PNG to PDF + JPG to PDF) share one upload.
 */
export function distributeFilesToInputNodes(
    files: File[],
    inputNodes: WorkflowNode[]
): Map<string, File[]> {
    const distribution = new Map<string, File[]>();
    const claimed = new Set<string>();

    for (const node of inputNodes) {
        distribution.set(node.id, []);
    }

    if (inputNodes.length === 0) {
        return distribution;
    }

    if (inputNodes.length === 1) {
        distribution.set(inputNodes[0].id, [...files]);
        return distribution;
    }

    for (const node of inputNodes) {
        const formats = node.data.acceptedFormats ?? [];
        const matched = files.filter(
            (f) =>
                fileMatchesAcceptedFormats(f.name, formats) &&
                !claimed.has(f.name)
        );
        matched.forEach((f) => claimed.add(f.name));
        distribution.set(node.id, matched);
    }

    for (const file of files) {
        if (claimed.has(file.name)) continue;
        for (const node of inputNodes) {
            const formats = node.data.acceptedFormats ?? [];
            if (fileMatchesAcceptedFormats(file.name, formats)) {
                distribution.get(node.id)!.push(file);
                claimed.add(file.name);
                break;
            }
        }
    }

    return distribution;
}

/**
 * Find output nodes (nodes with no outgoing edges)
 */
export function findOutputNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    const nodesWithOutgoing = new Set(edges.map(e => e.source));
    return nodes.filter(node => !nodesWithOutgoing.has(node.id));
}

/**
 * Get parent nodes for a given node
 */
export function getParentNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
    return edges.filter(e => e.target === nodeId).map(e => e.source);
}

/**
 * Get child nodes for a given node
 */
export function getChildNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
    return edges.filter(e => e.source === nodeId).map(e => e.target);
}

/**
 * Validate connection between two nodes
 */
export function validateConnection(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode
): { isValid: boolean; message?: string } {
    // Condition gateway nodes dynamically forward inputs without altering file formats
    if (sourceNode.data.toolId === 'condition-gateway' || targetNode.data.toolId === 'condition-gateway') {
        return { isValid: true };
    }

    const sourceOutput = sourceNode.data.outputFormat;
    const targetAccepted = targetNode.data.acceptedFormats;

    if (sourceOutput === '*' || targetAccepted.includes('*')) {
        return { isValid: true };
    }

    // Check if output format matches accepted formats
    const outputWithDot = sourceOutput.startsWith('.') ? sourceOutput : `.${sourceOutput}`;
    const isFormatCompatible = targetAccepted.some(format => {
        const formatLower = format.toLowerCase();
        const outputLower = outputWithDot.toLowerCase();
        return formatLower === outputLower ||
            formatLower === outputLower.replace('.', '') ||
            format.toLowerCase() === sourceOutput.toLowerCase();
    });

    if (!isFormatCompatible) {
        return {
            isValid: false,
            message: `Output format "${sourceOutput}" is not compatible with accepted formats: ${targetAccepted.join(', ')}`,
        };
    }

    return { isValid: true };
}

/**
 * Validate entire workflow
 */
export function validateWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): WorkflowValidation {
    const errors: WorkflowValidation['errors'] = [];
    const warnings: WorkflowValidation['warnings'] = [];

    // Check for empty workflow
    if (nodes.length === 0) {
        errors.push({
            message: 'Workflow is empty. Add at least one tool node.',
            type: 'missing-input',
        });
        return { isValid: false, errors, warnings };
    }

    // Check for cycles
    const executionOrder = topologicalSort(nodes, edges);
    if (executionOrder === null) {
        errors.push({
            message: 'Workflow contains a cycle. Remove circular connections.',
            type: 'cycle',
        });
        return { isValid: false, errors, warnings };
    }

    // Check connection validity
    edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);

        if (sourceNode && targetNode) {
            const validation = validateConnection(sourceNode, targetNode);
            if (!validation.isValid) {
                errors.push({
                    edgeId: edge.id,
                    message: validation.message || 'Invalid connection',
                    type: 'format',
                });
            }
        }
    });

    // Check for orphan nodes (not connected to input or output)
    const inputNodes = findInputNodes(nodes, edges);
    const connectedFromInput = new Set<string>();

    const traverse = (nodeId: string) => {
        if (connectedFromInput.has(nodeId)) return;
        connectedFromInput.add(nodeId);
        getChildNodes(nodeId, edges).forEach(traverse);
    };

    inputNodes.forEach(node => traverse(node.id));

    nodes.forEach(node => {
        if (!connectedFromInput.has(node.id) && edges.length > 0) {
            warnings.push({
                nodeId: node.id,
                message: `Node "${node.data.label}" is not connected to the main workflow.`,
            });
        }
    });

    // Warn if there are multiple input nodes
    if (inputNodes.length > 1) {
        const nodeNames = inputNodes.map(n => `"${n.data.label}"`).join(', ');
        warnings.push({
            message: `Workflow has ${inputNodes.length} input nodes (${nodeNames}). Uploaded files are routed to each input node by file type (e.g. .png to PNG to PDF, .jpg to JPG to PDF).`,
        });
    }

    // Warn if there are no input nodes
    if (inputNodes.length === 0 && nodes.length > 0) {
        errors.push({
            message: 'Workflow has no input nodes. All nodes are connected in a cycle or isolated.',
            type: 'missing-input',
        });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Create initial execution state
 */
export function createExecutionState(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowExecutionState {
    const executionOrder = topologicalSort(nodes, edges);

    return {
        status: 'idle',
        currentNodeId: null,
        executedNodes: [],
        pendingNodes: executionOrder || [],
        progress: 0,
    };
}

/**
 * Calculate overall progress based on node states
 */
export function calculateProgress(nodes: WorkflowNode[]): number {
    if (nodes.length === 0) return 0;

    const totalProgress = nodes.reduce((sum, node) => {
        if (node.data.status === 'complete') return sum + 100;
        if (node.data.status === 'processing') return sum + node.data.progress;
        return sum;
    }, 0);

    return Math.round(totalProgress / nodes.length);
}

/**
 * Get files passed between nodes
 */
export function getNodeInputFiles(
    nodeId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): (Blob | WorkflowOutputFile)[] {
    const parentNodeIds = getParentNodes(nodeId, edges);

    if (parentNodeIds.length === 0) {
        // This is an input node - files should be provided externally
        return [];
    }

    // Collect output files from all parent nodes
    const parentOutputs: (Blob | WorkflowOutputFile)[] = [];
    parentNodeIds.forEach(parentId => {
        const parentNode = nodes.find(n => n.id === parentId);
        if (parentNode?.data.outputFiles) {
            parentOutputs.push(...parentNode.data.outputFiles);
        }
    });

    return parentOutputs;
}
