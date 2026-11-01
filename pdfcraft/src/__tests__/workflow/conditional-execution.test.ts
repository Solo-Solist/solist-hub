/**
 * Conditional Execution Tests
 * Validates condition gateway evaluation, connection compatibility, and branch routing
 */

import { describe, it, expect } from 'vitest';
import { validateConnection } from '@/lib/workflow/engine';
import { executeNode, collectInputFiles } from '@/lib/workflow/executor';
import type { WorkflowNode, WorkflowEdge, WorkflowOutputFile } from '@/types/workflow';

describe('Conditional Execution & Routing', () => {
    const createGatewayNode = (settings: Record<string, unknown>): WorkflowNode => ({
        id: 'gateway-node',
        type: 'conditionalNode',
        position: { x: 100, y: 100 },
        data: {
            toolId: 'condition-gateway',
            label: 'Condition Gateway',
            icon: 'git-fork',
            category: 'flow-control',
            acceptedFormats: ['*'],
            outputFormat: '*',
            status: 'idle',
            progress: 0,
            settings,
        },
    });

    const createToolNode = (id: string, toolId: string, acceptedFormats: string[], outputFormat: string): WorkflowNode => ({
        id,
        type: 'toolNode',
        position: { x: 300, y: 100 },
        data: {
            toolId,
            label: toolId,
            icon: 'file',
            category: 'organize',
            acceptedFormats,
            outputFormat,
            status: 'idle',
            progress: 0,
        },
    });

    describe('Connection Validation', () => {
        it('allows connecting any tool to a condition gateway', () => {
            const pdfNode = createToolNode('source', 'compress-pdf', ['.pdf'], 'pdf');
            const gateway = createGatewayNode({ conditionType: 'file-count', operator: 'greater-than', value: 1 });

            const result = validateConnection(pdfNode, gateway);
            expect(result.isValid).toBe(true);
        });

        it('allows connecting a condition gateway to tools with any format', () => {
            const gateway = createGatewayNode({ conditionType: 'file-count', operator: 'greater-than', value: 1 });
            const docxNode = createToolNode('target', 'word-to-pdf', ['.docx'], 'pdf');

            const result = validateConnection(gateway, docxNode);
            expect(result.isValid).toBe(true);
        });
    });

    describe('executeNode with condition-gateway', () => {
        it('evaluates file-count > 1 correctly for true and false branches', async () => {
            const gateway = createGatewayNode({
                conditionType: 'file-count',
                operator: 'greater-than',
                value: 1,
            });

            const file1 = new File(['dummy content 1'], 'test1.pdf', { type: 'application/pdf' });
            const file2 = new File(['dummy content 2'], 'test2.pdf', { type: 'application/pdf' });

            // Test with 2 files -> condition is met (True)
            const resultTrue = await executeNode(gateway, [file1, file2]);
            expect(resultTrue.success).toBe(true);
            expect(resultTrue.metadata?.activeBranch).toBe('true');
            expect(resultTrue.metadata?.conditionMet).toBe(true);

            // Test with 1 file -> condition is not met (False)
            const resultFalse = await executeNode(gateway, [file1]);
            expect(resultFalse.success).toBe(true);
            expect(resultFalse.metadata?.activeBranch).toBe('false');
            expect(resultFalse.metadata?.conditionMet).toBe(false);
        });

        it('evaluates file-size with unit conversion', async () => {
            const gateway = createGatewayNode({
                conditionType: 'file-size',
                operator: 'less-or-equal',
                value: 1, // 1 KB
                sizeUnit: 'KB',
            });

            // 500 bytes < 1024 bytes (1 KB)
            const smallFile = new File([new ArrayBuffer(500)], 'small.pdf', { type: 'application/pdf' });
            const resultSmall = await executeNode(gateway, [smallFile]);
            expect(resultSmall.metadata?.activeBranch).toBe('true');

            // 2000 bytes > 1024 bytes (1 KB)
            const largeFile = new File([new ArrayBuffer(2000)], 'large.pdf', { type: 'application/pdf' });
            const resultLarge = await executeNode(gateway, [largeFile]);
            expect(resultLarge.metadata?.activeBranch).toBe('false');
        });

        it('evaluates file-format accurately', async () => {
            const gateway = createGatewayNode({
                conditionType: 'file-format',
                operator: 'equals',
                value: 'docx',
            });

            const docxFile = new File(['docx content'], 'report.docx');
            const pdfFile = new File(['pdf content'], 'report.pdf');

            const resDocx = await executeNode(gateway, [docxFile]);
            expect(resDocx.metadata?.activeBranch).toBe('true');

            const resPdf = await executeNode(gateway, [pdfFile]);
            expect(resPdf.metadata?.activeBranch).toBe('false');
        });
    });

    describe('collectInputFiles with active conditional branches', () => {
        const gateway = createGatewayNode({ conditionType: 'file-count', operator: 'greater-than', value: 1 });
        const trueTarget = createToolNode('true-node', 'merge-pdf', ['.pdf'], 'pdf');
        const falseTarget = createToolNode('false-node', 'split-pdf', ['.pdf'], 'pdf');

        const nodes: WorkflowNode[] = [gateway, trueTarget, falseTarget];
        const edges: WorkflowEdge[] = [
            {
                id: 'e1',
                source: 'gateway-node',
                sourceHandle: 'true',
                target: 'true-node',
            },
            {
                id: 'e2',
                source: 'gateway-node',
                sourceHandle: 'false',
                target: 'false-node',
            },
        ];

        const dummyOutput: WorkflowOutputFile[] = [
            { blob: new Blob(['sample']), filename: 'sample.pdf' },
        ];
        const nodeOutputs = new Map<string, (Blob | WorkflowOutputFile)[]>([
            ['gateway-node', dummyOutput],
        ]);

        it('routes files to true-node when activeBranch is true and leaves false-node empty', () => {
            const activeBranches = new Map<string, 'true' | 'false'>([
                ['gateway-node', 'true'],
            ]);

            const trueInputs = collectInputFiles('true-node', nodes, edges, nodeOutputs, undefined, activeBranches);
            const falseInputs = collectInputFiles('false-node', nodes, edges, nodeOutputs, undefined, activeBranches);

            expect(trueInputs.length).toBe(1);
            expect((trueInputs[0] as WorkflowOutputFile).filename).toBe('sample.pdf');
            expect(falseInputs.length).toBe(0);
        });

        it('routes files to false-node when activeBranch is false and leaves true-node empty', () => {
            const activeBranches = new Map<string, 'true' | 'false'>([
                ['gateway-node', 'false'],
            ]);

            const trueInputs = collectInputFiles('true-node', nodes, edges, nodeOutputs, undefined, activeBranches);
            const falseInputs = collectInputFiles('false-node', nodes, edges, nodeOutputs, undefined, activeBranches);

            expect(trueInputs.length).toBe(0);
            expect(falseInputs.length).toBe(1);
            expect((falseInputs[0] as WorkflowOutputFile).filename).toBe('sample.pdf');
        });
    });
});
