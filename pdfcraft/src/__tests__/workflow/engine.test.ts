/**
 * Workflow Engine Tests
 * Tests for workflow validation, graph algorithms, and execution planning
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    buildGraph,
    topologicalSort,
    findInputNodes,
    findOutputNodes,
    getParentNodes,
    getChildNodes,
    validateConnection,
    validateWorkflow,
    calculateProgress,
    distributeFilesToInputNodes,
    fileMatchesAcceptedFormats,
    getExecutionStages,
    getDownstreamNodeIds,
} from '@/lib/workflow/engine';
import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';

describe('Workflow Engine', () => {
    // Sample nodes for testing
    let nodes: WorkflowNode[];
    let edges: WorkflowEdge[];

    beforeEach(() => {
        // Create a simple linear workflow: merge -> compress -> encrypt
        nodes = [
            {
                id: 'node1',
                type: 'toolNode',
                position: { x: 0, y: 0 },
                data: {
                    toolId: 'merge-pdf',
                    label: 'Merge PDF',
                    icon: 'file-plus',
                    category: 'organize',
                    acceptedFormats: ['.pdf'],
                    outputFormat: '.pdf',
                    status: 'idle',
                    progress: 0,
                },
            },
            {
                id: 'node2',
                type: 'toolNode',
                position: { x: 200, y: 0 },
                data: {
                    toolId: 'compress-pdf',
                    label: 'Compress PDF',
                    icon: 'minimize',
                    category: 'optimize',
                    acceptedFormats: ['.pdf'],
                    outputFormat: '.pdf',
                    status: 'idle',
                    progress: 0,
                },
            },
            {
                id: 'node3',
                type: 'toolNode',
                position: { x: 400, y: 0 },
                data: {
                    toolId: 'encrypt-pdf',
                    label: 'Encrypt PDF',
                    icon: 'lock',
                    category: 'security',
                    acceptedFormats: ['.pdf'],
                    outputFormat: '.pdf',
                    status: 'idle',
                    progress: 0,
                },
            },
        ];

        edges = [
            { id: 'e1-2', source: 'node1', target: 'node2' },
            { id: 'e2-3', source: 'node2', target: 'node3' },
        ];
    });

    describe('buildGraph', () => {
        it('should build correct adjacency list and in-degree map', () => {
            const { adjacencyList, inDegree } = buildGraph(nodes, edges);

            expect(adjacencyList.get('node1')).toEqual(['node2']);
            expect(adjacencyList.get('node2')).toEqual(['node3']);
            expect(adjacencyList.get('node3')).toEqual([]);

            expect(inDegree.get('node1')).toBe(0);
            expect(inDegree.get('node2')).toBe(1);
            expect(inDegree.get('node3')).toBe(1);
        });
    });

    describe('topologicalSort', () => {
        it('should return correct execution order for linear workflow', () => {
            const order = topologicalSort(nodes, edges);
            expect(order).toEqual(['node1', 'node2', 'node3']);
        });

        it('should return null for workflow with cycles', () => {
            const cyclicEdges: WorkflowEdge[] = [
                ...edges,
                { id: 'e3-1', source: 'node3', target: 'node1' }, // Creates cycle
            ];
            const order = topologicalSort(nodes, cyclicEdges);
            expect(order).toBeNull();
        });

        it('should handle workflow with multiple paths', () => {
            const branchNode: WorkflowNode = {
                id: 'node4',
                type: 'toolNode',
                position: { x: 200, y: 100 },
                data: {
                    toolId: 'rotate-pdf',
                    label: 'Rotate PDF',
                    icon: 'rotate-cw',
                    category: 'organize',
                    acceptedFormats: ['.pdf'],
                    outputFormat: '.pdf',
                    status: 'idle',
                    progress: 0,
                },
            };

            const multiPathNodes = [...nodes, branchNode];
            const multiPathEdges: WorkflowEdge[] = [
                { id: 'e1-2', source: 'node1', target: 'node2' },
                { id: 'e1-4', source: 'node1', target: 'node4' },
                { id: 'e2-3', source: 'node2', target: 'node3' },
                { id: 'e4-3', source: 'node4', target: 'node3' },
            ];

            const order = topologicalSort(multiPathNodes, multiPathEdges);
            expect(order).toBeTruthy();
            expect(order).toHaveLength(4);
            expect(order![0]).toBe('node1'); // First node
            expect(order![3]).toBe('node3'); // Last node
        });
    });

    describe('findInputNodes', () => {
        it('should find nodes with no incoming edges', () => {
            const inputNodes = findInputNodes(nodes, edges);
            expect(inputNodes).toHaveLength(1);
            expect(inputNodes[0].id).toBe('node1');
        });

        it('should return all nodes when no edges exist', () => {
            const inputNodes = findInputNodes(nodes, []);
            expect(inputNodes).toHaveLength(3);
        });
    });

    describe('findOutputNodes', () => {
        it('should find nodes with no outgoing edges', () => {
            const outputNodes = findOutputNodes(nodes, edges);
            expect(outputNodes).toHaveLength(1);
            expect(outputNodes[0].id).toBe('node3');
        });
    });

    describe('getParentNodes', () => {
        it('should return parent node IDs', () => {
            const parents = getParentNodes('node2', edges);
            expect(parents).toEqual(['node1']);
        });

        it('should return empty array for input nodes', () => {
            const parents = getParentNodes('node1', edges);
            expect(parents).toEqual([]);
        });
    });

    describe('getChildNodes', () => {
        it('should return child node IDs', () => {
            const children = getChildNodes('node1', edges);
            expect(children).toEqual(['node2']);
        });

        it('should return empty array for output nodes', () => {
            const children = getChildNodes('node3', edges);
            expect(children).toEqual([]);
        });
    });

    describe('validateConnection', () => {
        it('should validate compatible PDF to PDF connection', () => {
            const result = validateConnection(nodes[0], nodes[1]);
            expect(result.isValid).toBe(true);
        });

        it('should reject incompatible format connection', () => {
            const imageNode: WorkflowNode = {
                id: 'img',
                type: 'toolNode',
                position: { x: 0, y: 0 },
                data: {
                    toolId: 'jpg-to-pdf',
                    label: 'JPG to PDF',
                    icon: 'image',
                    category: 'convert',
                    acceptedFormats: ['.jpg', '.jpeg'],
                    outputFormat: '.pdf',
                    status: 'idle',
                    progress: 0,
                },
            };

            const result = validateConnection(nodes[0], imageNode);
            expect(result.isValid).toBe(false);
            expect(result.message).toContain('not compatible');
        });
    });

    describe('validateWorkflow', () => {
        it('should validate correct linear workflow', () => {
            const validation = validateWorkflow(nodes, edges);
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should detect empty workflow', () => {
            const validation = validateWorkflow([], []);
            expect(validation.isValid).toBe(false);
            expect(validation.errors[0].type).toBe('missing-input');
        });

        it('should detect cycles', () => {
            const cyclicEdges: WorkflowEdge[] = [
                ...edges,
                { id: 'e3-1', source: 'node3', target: 'node1' },
            ];
            const validation = validateWorkflow(nodes, cyclicEdges);
            expect(validation.isValid).toBe(false);
            expect(validation.errors[0].type).toBe('cycle');
        });

        it('should detect format incompatibility', () => {
            const incompatibleNode: WorkflowNode = {
                id: 'bad',
                type: 'toolNode',
                position: { x: 0, y: 0 },
                data: {
                    toolId: 'jpg-to-pdf',
                    label: 'JPG to PDF',
                    icon: 'image',
                    category: 'convert',
                    acceptedFormats: ['.jpg'],
                    outputFormat: '.pdf',
                    status: 'idle',
                    progress: 0,
                },
            };

            const badNodes = [nodes[0], incompatibleNode];
            const badEdges: WorkflowEdge[] = [
                { id: 'e1-bad', source: 'node1', target: 'bad' },
            ];

            const validation = validateWorkflow(badNodes, badEdges);
            expect(validation.isValid).toBe(false);
            expect(validation.errors[0].type).toBe('format');
        });

        it('should warn about multiple input nodes', () => {
            const twoInputEdges: WorkflowEdge[] = [
                { id: 'e2-3', source: 'node2', target: 'node3' },
            ];
            const validation = validateWorkflow(nodes, twoInputEdges);
            expect(validation.warnings.length).toBeGreaterThan(0);
        });
    });

    describe('calculateProgress', () => {
        it('should calculate 0% for all idle nodes', () => {
            const progress = calculateProgress(nodes);
            expect(progress).toBe(0);
        });

        it('should calculate 100% for all complete nodes', () => {
            const completeNodes = nodes.map(n => ({
                ...n,
                data: { ...n.data, status: 'complete' as const, progress: 100 },
            }));
            const progress = calculateProgress(completeNodes);
            expect(progress).toBe(100);
        });

        it('should calculate average progress', () => {
            const mixedNodes: WorkflowNode[] = [
                { ...nodes[0], data: { ...nodes[0].data, status: 'complete', progress: 100 } },
                { ...nodes[1], data: { ...nodes[1].data, status: 'processing', progress: 50 } },
                { ...nodes[2], data: { ...nodes[2].data, status: 'idle', progress: 0 } },
            ];
            const progress = calculateProgress(mixedNodes);
            expect(progress).toBe(Math.round((100 + 50 + 0) / 3));
        });
    });

    describe('fileMatchesAcceptedFormats', () => {
        it('matches extensions with or without leading dot', () => {
            expect(fileMatchesAcceptedFormats('photo.PNG', ['.png'])).toBe(true);
            expect(fileMatchesAcceptedFormats('photo.jpg', ['.jpeg'])).toBe(false);
            expect(fileMatchesAcceptedFormats('photo.jpeg', ['.jpg', '.jpeg'])).toBe(true);
        });
    });

    describe('distributeFilesToInputNodes', () => {
        const pngNode: WorkflowNode = {
            id: 'png',
            type: 'toolNode',
            position: { x: 0, y: 0 },
            data: {
                toolId: 'png-to-pdf',
                label: 'PNG to PDF',
                icon: 'image-up',
                category: 'convert-to-pdf',
                acceptedFormats: ['.png'],
                outputFormat: 'pdf',
                status: 'idle',
                progress: 0,
            },
        };

        const jpgNode: WorkflowNode = {
            id: 'jpg',
            type: 'toolNode',
            position: { x: 200, y: 0 },
            data: {
                toolId: 'jpg-to-pdf',
                label: 'JPG to PDF',
                icon: 'image-up',
                category: 'convert-to-pdf',
                acceptedFormats: ['.jpg', '.jpeg'],
                outputFormat: 'pdf',
                status: 'idle',
                progress: 0,
            },
        };

        it('routes each file to the matching input node only', () => {
            const png = new File([new Blob(['p'])], 'a.png', { type: 'image/png' });
            const jpg = new File([new Blob(['j'])], 'b.jpg', { type: 'image/jpeg' });
            const map = distributeFilesToInputNodes([png, jpg], [pngNode, jpgNode]);

            expect(map.get('png')).toEqual([png]);
            expect(map.get('jpg')).toEqual([jpg]);
        });

        it('gives all files to a single input node', () => {
            const png = new File([new Blob(['p'])], 'a.png', { type: 'image/png' });
            const jpg = new File([new Blob(['j'])], 'b.jpg', { type: 'image/jpeg' });
            const map = distributeFilesToInputNodes([png, jpg], [pngNode]);

            expect(map.get('png')).toEqual([png, jpg]);
        });
    });

    describe('getExecutionStages (Parallel DAG Stages)', () => {
        it('returns empty array when nodes array is empty', () => {
            expect(getExecutionStages([], [])).toEqual([]);
        });

        it('groups linear pipeline nodes into consecutive single-node stages', () => {
            const linearNodes: WorkflowNode[] = [
                { id: '1', type: 'toolNode', position: { x: 0, y: 0 }, data: { toolId: 'a', label: 'A', icon: 'file', category: 'cat', acceptedFormats: [], outputFormat: '', status: 'idle', progress: 0 } },
                { id: '2', type: 'toolNode', position: { x: 0, y: 0 }, data: { toolId: 'b', label: 'B', icon: 'file', category: 'cat', acceptedFormats: [], outputFormat: '', status: 'idle', progress: 0 } },
                { id: '3', type: 'toolNode', position: { x: 0, y: 0 }, data: { toolId: 'c', label: 'C', icon: 'file', category: 'cat', acceptedFormats: [], outputFormat: '', status: 'idle', progress: 0 } },
            ];
            const linearEdges: WorkflowEdge[] = [
                { id: 'e1', source: '1', target: '2' },
                { id: 'e2', source: '2', target: '3' },
            ];

            const stages = getExecutionStages(linearNodes, linearEdges);
            expect(stages).toEqual([['1'], ['2'], ['3']]);
        });

        it('groups parallel independent branches into the same stage for concurrent execution', () => {
            const diamondNodes: WorkflowNode[] = [
                { id: 'start', type: 'toolNode', position: { x: 0, y: 0 }, data: { toolId: 'a', label: 'Start', icon: 'file', category: 'cat', acceptedFormats: [], outputFormat: '', status: 'idle', progress: 0 } },
                { id: 'b1', type: 'toolNode', position: { x: 0, y: 0 }, data: { toolId: 'b', label: 'Branch 1', icon: 'file', category: 'cat', acceptedFormats: [], outputFormat: '', status: 'idle', progress: 0 } },
                { id: 'b2', type: 'toolNode', position: { x: 0, y: 0 }, data: { toolId: 'c', label: 'Branch 2', icon: 'file', category: 'cat', acceptedFormats: [], outputFormat: '', status: 'idle', progress: 0 } },
                { id: 'end', type: 'toolNode', position: { x: 0, y: 0 }, data: { toolId: 'd', label: 'End', icon: 'file', category: 'cat', acceptedFormats: [], outputFormat: '', status: 'idle', progress: 0 } },
            ];
            const diamondEdges: WorkflowEdge[] = [
                { id: 'e1', source: 'start', target: 'b1' },
                { id: 'e2', source: 'start', target: 'b2' },
                { id: 'e3', source: 'b1', target: 'end' },
                { id: 'e4', source: 'b2', target: 'end' },
            ];

            const stages = getExecutionStages(diamondNodes, diamondEdges);
            expect(stages).toHaveLength(3);
            expect(stages![0]).toEqual(['start']);
            expect(stages![1]).toEqual(expect.arrayContaining(['b1', 'b2']));
            expect(stages![1]).toHaveLength(2);
            expect(stages![2]).toEqual(['end']);
        });

        it('returns null if there is a cycle in the workflow graph', () => {
            const cyclicNodes: WorkflowNode[] = [
                { id: '1', type: 'toolNode', position: { x: 0, y: 0 }, data: { toolId: 'a', label: 'A', icon: 'file', category: 'cat', acceptedFormats: [], outputFormat: '', status: 'idle', progress: 0 } },
                { id: '2', type: 'toolNode', position: { x: 0, y: 0 }, data: { toolId: 'b', label: 'B', icon: 'file', category: 'cat', acceptedFormats: [], outputFormat: '', status: 'idle', progress: 0 } },
            ];
            const cyclicEdges: WorkflowEdge[] = [
                { id: 'e1', source: '1', target: '2' },
                { id: 'e2', source: '2', target: '1' },
            ];

            expect(getExecutionStages(cyclicNodes, cyclicEdges)).toBeNull();
        });
    });

    describe('getDownstreamNodeIds', () => {
        it('returns only the start node if it has no children', () => {
            const edges: WorkflowEdge[] = [
                { id: 'e1', source: 'a', target: 'b' },
            ];
            const downstream = getDownstreamNodeIds('b', edges);
            expect(Array.from(downstream)).toEqual(['b']);
        });

        it('returns all transitive downstream nodes', () => {
            const edges: WorkflowEdge[] = [
                { id: 'e1', source: 'a', target: 'b' },
                { id: 'e2', source: 'b', target: 'c' },
                { id: 'e3', source: 'c', target: 'd' },
                { id: 'e4', source: 'a', target: 'e' },
            ];
            const downstream = getDownstreamNodeIds('b', edges);
            expect(Array.from(downstream).sort()).toEqual(['b', 'c', 'd'].sort());
        });
    });
});
