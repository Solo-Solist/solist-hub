import { describe, it, expect } from 'vitest';
import type { ProcessOutput } from '@/types/pdf';
import type { WorkflowOutputFile } from '@/types/workflow';
import {
  buildNodeOutputsFromResult,
  deriveWorkflowFailureContext,
} from '@/lib/workflow/execution-utils';

describe('workflow execution utils', () => {
  describe('deriveWorkflowFailureContext', () => {
    it('uses current node and executed count when error has no node context', () => {
      const context = deriveWorkflowFailureContext(
        new Error('Something failed'),
        'node-2',
        ['node-1']
      );

      expect(context.failedNodeId).toBe('node-2');
      expect(context.successfulCount).toBe(1);
      expect(context.errorMessage).toBe('Something failed');
      expect(context.isCancelled).toBe(false);
    });

    it('prefers nodeId and code from error context', () => {
      const error = new Error('Node failed') as Error & { nodeId?: string; code?: string };
      error.nodeId = 'node-3';
      error.code = 'PROCESSING_FAILED';

      const context = deriveWorkflowFailureContext(error, 'node-2', ['node-1', 'node-2']);

      expect(context.failedNodeId).toBe('node-3');
      expect(context.successfulCount).toBe(2);
      expect(context.errorCode).toBe('PROCESSING_FAILED');
    });

    it('detects cancellation error messages', () => {
      const context = deriveWorkflowFailureContext(
        new Error('Execution cancelled by user'),
        'node-2',
        []
      );

      expect(context.isCancelled).toBe(true);
    });
  });

  describe('buildNodeOutputsFromResult', () => {
    it('uses comma-separated filenames for array results (split case)', () => {
      const result: ProcessOutput = {
        success: true,
        result: [new Blob(['a']), new Blob(['b'])],
        filename: 'part_1.pdf, part_2.pdf',
      };

      const outputs = buildNodeOutputsFromResult(result, 'Split PDF', []);
      expect(outputs).toHaveLength(2);
      expect(outputs[0].filename).toBe('part_1.pdf');
      expect(outputs[1].filename).toBe('part_2.pdf');
    });

    it('preserves extension when indexing a single filename for multiple outputs', () => {
      const result: ProcessOutput = {
        success: true,
        result: [new Blob(['a']), new Blob(['b'])],
        filename: 'images.zip',
      };

      const outputs = buildNodeOutputsFromResult(result, 'PDF to Image', []);
      expect(outputs[0].filename).toBe('images_1.zip');
      expect(outputs[1].filename).toBe('images_2.zip');
    });

    it('prefers metadata.outputFiles when provided', () => {
      const result: ProcessOutput = {
        success: true,
        result: [new Blob(['a']), new Blob(['b'])],
        filename: 'fallback.pdf',
        metadata: {
          outputFiles: ['meta-a.pdf', 'meta-b.pdf'],
        },
      };

      const outputs = buildNodeOutputsFromResult(result, 'Split PDF', []);
      expect(outputs[0].filename).toBe('meta-a.pdf');
      expect(outputs[1].filename).toBe('meta-b.pdf');
    });

    it('falls back to sanitized node label for unnamed single result', () => {
      const result: ProcessOutput = {
        success: true,
        result: new Blob(['one']),
      };

      const outputs = buildNodeOutputsFromResult(result, 'My Node', []);
      expect(outputs).toHaveLength(1);
      expect(outputs[0].filename).toBe('My_Node_output.pdf');
    });

    it('passes through input files when result is missing', () => {
      const file = new File([new Blob(['input'])], 'source.pdf', { type: 'application/pdf' });
      const outputWithName: WorkflowOutputFile = {
        blob: new Blob(['prev']),
        filename: 'prev.pdf',
      };
      const rawBlob = new Blob(['raw']);

      const result: ProcessOutput = {
        success: true,
      };

      const outputs = buildNodeOutputsFromResult(result, 'Node', [file, outputWithName, rawBlob]);
      expect(outputs).toHaveLength(3);
      expect(outputs[0].filename).toBe('source.pdf');
      expect(outputs[1].filename).toBe('prev.pdf');
      expect(outputs[2].filename).toBe('passthrough_3.pdf');
    });
  });
});
