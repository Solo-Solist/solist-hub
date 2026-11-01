import type { ToolNodeData } from '@/types/workflow';

export const WORKFLOW_TOOL_DROP_EVENT = 'workflow-tool-drop';

export interface WorkflowToolDropEventDetail {
    nodeData: ToolNodeData;
    clientX: number;
    clientY: number;
}
