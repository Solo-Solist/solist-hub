import type { ProcessOutput } from '@/types/pdf';
import type { WorkflowOutputFile } from '@/types/workflow';

type WorkflowInputFile = File | Blob | WorkflowOutputFile;

type ErrorWithContext = Error & {
  nodeId?: string;
  code?: string;
};

export interface WorkflowFailureContext {
  failedNodeId: string;
  successfulCount: number;
  errorMessage: string;
  errorCode?: string;
  isCancelled: boolean;
}

function sanitizeLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, '_');
  return normalized || 'workflow_node';
}

function splitFilenameList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function withIndexedSuffix(filename: string, index: number): string {
  const dot = filename.lastIndexOf('.');
  if (dot > 0 && dot < filename.length - 1) {
    const stem = filename.slice(0, dot);
    const ext = filename.slice(dot);
    return `${stem}_${index + 1}${ext}`;
  }
  return `${filename}_${index + 1}`;
}

function normalizeMetadataFilenames(metadata: ProcessOutput['metadata']): string[] {
  if (!metadata) return [];
  const outputFiles = (metadata as Record<string, unknown>).outputFiles;
  if (!Array.isArray(outputFiles)) return [];
  return outputFiles
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toWorkflowOutput(input: WorkflowInputFile, index: number): WorkflowOutputFile {
  if (input instanceof File) {
    return { blob: input, filename: input.name };
  }
  if ('blob' in input && 'filename' in input) {
    return input;
  }
  return { blob: input as Blob, filename: `passthrough_${index + 1}.pdf` };
}

export function buildNodeOutputsFromResult(
  result: ProcessOutput,
  nodeLabel: string,
  inputFiles: WorkflowInputFile[]
): WorkflowOutputFile[] {
  if (!result.result) {
    return inputFiles.map((input, index) => toWorkflowOutput(input, index));
  }

  if (Array.isArray(result.result)) {
    const blobs = result.result;
    let filenames = normalizeMetadataFilenames(result.metadata);

    if (filenames.length !== blobs.length && result.filename) {
      const splitNames = splitFilenameList(result.filename);
      if (splitNames.length === blobs.length) {
        filenames = splitNames;
      } else {
        filenames = blobs.map((_, index) => withIndexedSuffix(result.filename as string, index));
      }
    }

    if (filenames.length !== blobs.length) {
      const fallbackName = `${sanitizeLabel(nodeLabel)}_output.pdf`;
      filenames = blobs.map((_, index) => withIndexedSuffix(fallbackName, index));
    }

    return blobs.map((blob, index) => ({
      blob,
      filename: filenames[index],
    }));
  }

  return [{
    blob: result.result,
    filename: (result.filename && result.filename.trim()) || `${sanitizeLabel(nodeLabel)}_output.pdf`,
  }];
}

export function deriveWorkflowFailureContext(
  error: unknown,
  currentNodeId: string | null,
  executedNodeIds: string[]
): WorkflowFailureContext {
  const err = error as ErrorWithContext;
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
  const isCancelled = /cancelled by user/i.test(errorMessage);

  return {
    failedNodeId: err?.nodeId || currentNodeId || '',
    successfulCount: executedNodeIds.length,
    errorMessage,
    errorCode: err?.code,
    isCancelled,
  };
}
