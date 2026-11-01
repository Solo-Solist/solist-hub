import { describe, it, expect } from 'vitest';
import { getAutoLayoutedNodes } from '@/lib/workflow/layout';
import { WorkflowNode, WorkflowEdge } from '@/types/workflow';

function createMockNode(id: string): WorkflowNode {
    return {
        id,
        type: 'toolNode',
        position: { x: 0, y: 0 },
        data: {
            toolId: 'test-tool',
            label: `Node ${id}`,
            icon: 'file',
            category: 'organize-manage',
            acceptedFormats: ['.pdf'],
            outputFormat: 'pdf',
            status: 'idle',
            progress: 0,
        },
    };
}

function createMockEdge(source: string, target: string): WorkflowEdge {
    return {
        id: `e-${source}-${target}`,
        source,
        target,
    };
}

describe('Workflow Auto-Layout', () => {
    it('should return an empty array when no nodes are provided', () => {
        expect(getAutoLayoutedNodes([], [])).toEqual([]);
    });

    it('should position a single node at padding offset', () => {
        const nodes = [createMockNode('n1')];
        const layouted = getAutoLayoutedNodes(nodes, [], { padding: 50 });
        expect(layouted).toHaveLength(1);
        expect(layouted[0].position).toEqual({ x: 50, y: 50 });
    });

    it('should layout a linear chain sequentially from left to right', () => {
        const nodes = [createMockNode('a'), createMockNode('b'), createMockNode('c')];
        const edges = [createMockEdge('a', 'b'), createMockEdge('b', 'c')];

        const layouted = getAutoLayoutedNodes(nodes, edges, {
            horizontalSpacing: 250,
            padding: 100,
        });

        const map = new Map(layouted.map(n => [n.id, n.position]));
        expect(map.get('a')?.x).toBe(100);
        expect(map.get('b')?.x).toBe(350);
        expect(map.get('c')?.x).toBe(600);
    });

    it('should layout branching parallel nodes at the same horizontal level with vertical separation', () => {
        const nodes = [
            createMockNode('root'),
            createMockNode('branch1'),
            createMockNode('branch2'),
            createMockNode('merge'),
        ];
        const edges = [
            createMockEdge('root', 'branch1'),
            createMockEdge('root', 'branch2'),
            createMockEdge('branch1', 'merge'),
            createMockEdge('branch2', 'merge'),
        ];

        const layouted = getAutoLayoutedNodes(nodes, edges, {
            horizontalSpacing: 300,
            verticalSpacing: 150,
            padding: 80,
        });

        const map = new Map(layouted.map(n => [n.id, n.position]));
        const rootPos = map.get('root')!;
        const b1Pos = map.get('branch1')!;
        const b2Pos = map.get('branch2')!;
        const mergePos = map.get('merge')!;

        // Root at level 0
        expect(rootPos.x).toBe(80);
        // Branches at level 1
        expect(b1Pos.x).toBe(380);
        expect(b2Pos.x).toBe(380);
        expect(b1Pos.y).not.toBe(b2Pos.y);
        // Merge at level 2
        expect(mergePos.x).toBe(680);
    });

    it('should gracefully handle disconnected nodes without crashing', () => {
        const nodes = [createMockNode('a'), createMockNode('b'), createMockNode('isolated')];
        const edges = [createMockEdge('a', 'b')];

        const layouted = getAutoLayoutedNodes(nodes, edges);
        expect(layouted).toHaveLength(3);
        const map = new Map(layouted.map(n => [n.id, n.position]));
        expect(map.get('isolated')).toBeDefined();
    });
});
