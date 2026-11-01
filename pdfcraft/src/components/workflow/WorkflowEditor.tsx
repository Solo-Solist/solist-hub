'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { flushSync } from 'react-dom';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    MiniMap,
    ReactFlowProvider,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    ReactFlowInstance,
    ConnectionMode,
    Panel,
    BackgroundVariant,
    NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useTranslations } from 'next-intl';
import { logger } from '@/lib/utils/logger';
import { WorkflowNode, WorkflowEdge, ToolNodeData, WorkflowExecutionState, SavedWorkflow, WorkflowTemplate, WorkflowOutputFile } from '@/types/workflow';
import { validateWorkflow, validateConnection, topologicalSort, findInputNodes, distributeFilesToInputNodes, getExecutionStages, getDownstreamNodeIds } from '@/lib/workflow/engine';
import { executeNode, collectInputFiles } from '@/lib/workflow/executor';
import { LIBREOFFICE_TOOL_IDS, preloadLibreOfficeConverter } from '@/lib/libreoffice/shared-converter';
import { isCrossOriginIsolated } from '@/lib/utils/cross-origin-isolated';
import { buildNodeOutputsFromResult, deriveWorkflowFailureContext } from '@/lib/workflow/execution-utils';
import { saveWorkflow, getSavedWorkflows, deleteWorkflow, duplicateWorkflow, exportWorkflow, importWorkflow } from '@/lib/workflow/storage';
import { createExecutionRecord, addExecutionRecord, completeExecutionRecord } from '@/lib/workflow/history';
import type { WorkflowExecutionRecord } from '@/types/workflow-history';
import { useUndoRedo } from '@/hooks/useUndoRedo';

import ToolNode from './ToolNode';
import ConditionalNode from './ConditionalNode';
import InputNode from './InputNode';
import CustomEdge from './CustomEdge';
import { ToolSidebar } from './ToolSidebar';
import { WorkflowLibrary } from './WorkflowLibrary';
import { WorkflowControls } from './WorkflowControls';
import { NodeSettingsPanel } from './NodeSettingsPanel';
import { WorkflowPreview } from './WorkflowPreview';
import { WORKFLOW_TOOL_DROP_EVENT, type WorkflowToolDropEventDetail } from './dragEvents';
import { Undo2, Redo2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, LayoutGrid, Copy } from 'lucide-react';
import { getAutoLayoutedNodes } from '@/lib/workflow/layout';

// Global drag data cache for WebView2/Tauri compatibility
let globalDragData: ToolNodeData | null = null;

// Node types for ReactFlow
const nodeTypes = {
    toolNode: ToolNode,
    conditionalNode: ConditionalNode,
    inputNode: InputNode,
};

// Edge types for ReactFlow
const edgeTypes = {
    custom: CustomEdge,
};

// Edge styles
const defaultEdgeOptions = {
    type: 'custom',
    animated: false,
    selectable: true,
    focusable: true,
    style: { strokeWidth: 2, stroke: '#6366f1' },
};

/**
 * Generate a unique node ID using timestamp and random string
 * Format: node_<timestamp>_<random>
 * This ensures uniqueness across page refreshes and multiple instances
 */
const getNodeId = (): string => {
    const timestamp = Date.now().toString(36); // Base36 encoding for shorter string
    const random = Math.random().toString(36).substring(2, 9); // 7 random chars
    return `node_${timestamp}_${random}`;
};

/**
 * Main Workflow Editor Component
 */
function WorkflowEditorContent() {
    const tWorkflow = useTranslations('workflow');

    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

    // Nodes and edges state
    const [nodes, setNodes, onNodesChange] = useNodesState<ToolNodeData>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Saved workflows
    const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);

    // Selected node for settings panel
    const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
    const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);

    // Preview state
    const [isPreviewVisible, setIsPreviewVisible] = useState(false);

    // Sidebar collapse state
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
    const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

    // Automatically aggregate files uploaded in InputNode cards on canvas or globally
    const effectiveInputFiles = useMemo(() => {
        if (selectedFiles.length > 0) return selectedFiles;
        return (nodes as WorkflowNode[]).flatMap((n) => n.data.inputFiles || []);
    }, [selectedFiles, nodes]);

    // Track created Blob URLs for cleanup
    const createdBlobUrls = useRef<Set<string>>(new Set());

    // AbortController for cancelling workflow execution
    const executionAbortController = useRef<AbortController | null>(null);
    const lastToolDropRef = useRef<{ toolId: string; clientX: number; clientY: number; time: number } | null>(null);
    // Cache completed node outputs across steps to support resume/retry
    const completedNodeOutputsRef = useRef<Map<string, (Blob | WorkflowOutputFile)[]>>(new Map());

    /**
     * Register a Blob URL for cleanup
     */
    const registerBlobUrl = useCallback((url: string) => {
        createdBlobUrls.current.add(url);
    }, []);

    /**
     * Cleanup all registered Blob URLs
     */
    const cleanupBlobUrls = useCallback(() => {
        createdBlobUrls.current.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (error) {
                logger.warn('[Workflow] Failed to revoke Blob URL:', error);
            }
        });
        createdBlobUrls.current.clear();
    }, []);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            logger.log('[Workflow] Component unmounting, cleaning up resources');
            // Abort any running execution
            if (executionAbortController.current) {
                executionAbortController.current.abort();
            }
            cleanupBlobUrls();
        };
    }, [cleanupBlobUrls]);

    // Listen for preview open events from canvas cards
    useEffect(() => {
        const handleOpenPreview = () => {
            setIsPreviewVisible(true);
        };
        window.addEventListener('workflow:open-preview', handleOpenPreview);
        return () => window.removeEventListener('workflow:open-preview', handleOpenPreview);
    }, []);

    // Undo/Redo
    const { canUndo, canRedo, pushHistory, undo, redo, clearHistory } = useUndoRedo();

    // Execution state
    const [executionState, setExecutionState] = useState<WorkflowExecutionState>({
        status: 'idle',
        currentNodeId: null,
        executedNodes: [],
        pendingNodes: [],
        progress: 0,
    });

    // Load saved workflows on mount
    useEffect(() => {
        setSavedWorkflows(getSavedWorkflows());
    }, []);

    // Push to history when nodes or edges change (deep comparison via JSON)
    const nodesSnapshot = JSON.stringify(nodes.map(n => ({ id: n.id, position: n.position, data: n.data })));
    const edgesSnapshot = JSON.stringify(edges.map(e => ({ id: e.id, source: e.source, target: e.target })));
    useEffect(() => {
        if (nodes.length > 0 || edges.length > 0) {
            pushHistory(nodes as WorkflowNode[], edges as WorkflowEdge[]);
        }
    }, [nodesSnapshot, edgesSnapshot]);

    /**
     * Handle undo
     */
    const handleUndo = useCallback(() => {
        const state = undo();
        if (state) {
            setNodes(state.nodes);
            setEdges(state.edges as Edge[]);
        }
    }, [undo, setNodes, setEdges]);

    /**
     * Handle redo
     */
    const handleRedo = useCallback(() => {
        const state = redo();
        if (state) {
            setNodes(state.nodes);
            setEdges(state.edges as Edge[]);
        }
    }, [redo, setNodes, setEdges]);

    /**
     * Duplicate selected node
     */
    const duplicateSelectedNode = useCallback(() => {
        const targetNode = selectedNode || nodes.find(n => n.selected);
        if (!targetNode) return;

        const newNodeId = getNodeId();
        const isCondition = targetNode.data.toolId === 'condition-gateway';
        const newNode: Node<ToolNodeData> = {
            id: newNodeId,
            type: targetNode.type || (isCondition ? 'conditionalNode' : 'toolNode'),
            position: {
                x: targetNode.position.x + 40,
                y: targetNode.position.y + 40,
            },
            data: {
                ...targetNode.data,
                status: 'idle',
                progress: 0,
                error: undefined,
                inputFiles: undefined,
                outputFiles: undefined,
                activeBranch: undefined,
                settings: targetNode.data.settings ? JSON.parse(JSON.stringify(targetNode.data.settings)) : undefined,
            },
            selected: true,
        };

        const updatedNodes: Node<ToolNodeData>[] = [
            ...nodes.map(n => ({ ...n, selected: false })),
            newNode,
        ];
        setNodes(updatedNodes);
        setSelectedNode(newNode as WorkflowNode);
        pushHistory(updatedNodes as WorkflowNode[], edges as WorkflowEdge[]);
    }, [selectedNode, nodes, edges, pushHistory, setNodes]);

    /**
     * Auto-layout workflow DAG
     */
    const handleAutoLayout = useCallback(() => {
        if (nodes.length === 0) return;
        const layoutedNodes = getAutoLayoutedNodes(nodes as WorkflowNode[], edges as WorkflowEdge[], {
            direction: 'LR',
            horizontalSpacing: 280,
            verticalSpacing: 140,
            padding: 80,
        });
        setNodes(layoutedNodes);
        pushHistory(layoutedNodes as WorkflowNode[], edges as WorkflowEdge[]);
        setTimeout(() => {
            reactFlowInstance?.fitView({ padding: 0.2, duration: 400 });
        }, 50);
    }, [nodes, edges, pushHistory, reactFlowInstance, setNodes]);

    // Keyboard shortcuts for undo/redo and duplicate
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    // Redo
                    e.preventDefault();
                    handleRedo();
                } else {
                    // Undo
                    e.preventDefault();
                    handleUndo();
                }
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
                // Redo (alternative)
                e.preventDefault();
                handleRedo();
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
                // Duplicate selected node
                e.preventDefault();
                duplicateSelectedNode();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [canUndo, canRedo, handleUndo, handleRedo, duplicateSelectedNode]);

    // Validation
    const validation = useMemo(() => {
        return validateWorkflow(nodes as WorkflowNode[], edges as WorkflowEdge[]);
    }, [nodes, edges]);

    /**
     * Handle connecting nodes
     */
    const onConnect = useCallback(
        (params: Connection) => {
            // Validate connection
            const sourceNode = nodes.find(n => n.id === params.source);
            const targetNode = nodes.find(n => n.id === params.target);

            if (sourceNode && targetNode) {
                const validationResult = validateConnection(
                    sourceNode as WorkflowNode,
                    targetNode as WorkflowNode
                );

                if (!validationResult.isValid) {
                    logger.warn('Invalid connection:', validationResult.message);
                    return;
                }
            }

            const isTrueBranch = params.sourceHandle === 'true';
            const isFalseBranch = params.sourceHandle === 'false';
            const edgeColor = isTrueBranch ? '#10b981' : isFalseBranch ? '#f59e0b' : '#6366f1';

            setEdges((eds) => addEdge({
                ...params,
                type: 'custom',
                animated: false,
                style: { strokeWidth: 2, stroke: edgeColor },
            }, eds));
        },
        [nodes, setEdges]
    );

    /**
     * Handle node click to open settings panel
     */
    const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
        setSelectedNode(node as WorkflowNode);
        setIsSettingsPanelOpen(true);
    }, []);

    /**
     * Update node settings
     */
    const handleUpdateNodeSettings = useCallback((nodeId: string, settings: Record<string, unknown>) => {
        setNodes((nds) => nds.map(node =>
            node.id === nodeId
                ? { ...node, data: { ...node.data, settings } }
                : node
        ));
    }, [setNodes]);

    /**
     * Handle drag over for dropping new nodes
     */
    const onDragOver = useCallback((event: React.DragEvent) => {
        // Always allow drop in Tauri/WebView2 environment where dataTransfer may be restricted
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
    }, []);

    /**
     * Handle dropping a tool node onto the canvas
     */
    const addToolNodeAtClientPosition = useCallback((nodeData: ToolNodeData, clientX: number, clientY: number) => {
        if (!reactFlowWrapper.current || !reactFlowInstance) return;

        // Strict deduplication guard (e.g. dual triggers from pointerup + native onDrop)
        const lastDrop = lastToolDropRef.current;
        const now = Date.now();
        if (
            lastDrop &&
            lastDrop.toolId === nodeData.toolId &&
            now - lastDrop.time < 500 &&
            Math.abs(lastDrop.clientX - clientX) < 80 &&
            Math.abs(lastDrop.clientY - clientY) < 80
        ) {
            logger.log('[Workflow] Deduplicated double drop for tool:', nodeData.toolId);
            return;
        }

        lastToolDropRef.current = {
            toolId: nodeData.toolId,
            clientX,
            clientY,
            time: now,
        };

        const position = reactFlowInstance.screenToFlowPosition({
            x: clientX,
            y: clientY,
        });

        const isCondition = nodeData.toolId === 'condition-gateway';
        const isInput = nodeData.toolId === 'pdf-input' || nodeData.toolId === 'image-input' || nodeData.toolId === 'file-input' || nodeData.category === 'input';

        const newNode: Node<ToolNodeData> = {
            id: getNodeId(),
            type: isCondition ? 'conditionalNode' : isInput ? 'inputNode' : 'toolNode',
            position,
            data: { ...nodeData, settings: nodeData.settings || {} },
        };

        setNodes((nds) => nds.concat(newNode));
    }, [reactFlowInstance, setNodes]);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (!reactFlowWrapper.current || !reactFlowInstance) return;

            // Try to resolve nodeData from global variable first, fallback to dataTransfer for WebView2 compatibility
            let nodeData: ToolNodeData | null = globalDragData;
            if (!nodeData) {
                const nodeDataStr = event.dataTransfer.getData('application/reactflow');
                if (nodeDataStr) {
                    try {
                        nodeData = JSON.parse(nodeDataStr);
                    } catch (e) {
                        logger.error('Failed to parse reactflow drag data:', e);
                    }
                }
            }

            // Always reset the global drag data cache
            globalDragData = null;

            if (!nodeData) return;

            addToolNodeAtClientPosition(nodeData, event.clientX, event.clientY);
        },
        [reactFlowInstance, addToolNodeAtClientPosition]
    );

    useEffect(() => {
        const handleFallbackToolDrop = (event: Event) => {
            const { nodeData, clientX, clientY } = (event as CustomEvent<WorkflowToolDropEventDetail>).detail;
            if (!nodeData) return;

            const lastDrop = lastToolDropRef.current;
            const isDuplicateNativeDrop = lastDrop &&
                lastDrop.toolId === nodeData.toolId &&
                Math.abs(lastDrop.clientX - clientX) < 8 &&
                Math.abs(lastDrop.clientY - clientY) < 8 &&
                Date.now() - lastDrop.time < 500;

            if (isDuplicateNativeDrop) return;

            addToolNodeAtClientPosition(nodeData, clientX, clientY);
        };

        window.addEventListener(WORKFLOW_TOOL_DROP_EVENT, handleFallbackToolDrop);
        return () => window.removeEventListener(WORKFLOW_TOOL_DROP_EVENT, handleFallbackToolDrop);
    }, [addToolNodeAtClientPosition]);

    /**
     * Handle drag start from sidebar
     */
    const onDragStart = useCallback((event: React.DragEvent, nodeData: ToolNodeData) => {
        globalDragData = nodeData;
        event.dataTransfer.setData('application/reactflow', JSON.stringify(nodeData));
        // Add standard plain text format fallback to ensure drop action gets activated under WebView2/Tauri
        event.dataTransfer.setData('text/plain', nodeData.toolId);
        event.dataTransfer.effectAllowed = 'move';
    }, []);

    /**
     * Handle drag end to clean up global drag data
     */
    const onDragEnd = useCallback(() => {
        globalDragData = null;
    }, []);

    /**
     * Handle file selection for execution and preview
     */
    const handleFilesSelected = useCallback((files: File[]) => {
        setSelectedFiles(files);
    }, []);

    /**
     * Execute the workflow
     */
    const executeWorkflow = useCallback(async (inputFiles: File[], resumeFromNodeId?: string) => {
        setSelectedFiles(inputFiles);

        const executionOrder = topologicalSort(nodes as WorkflowNode[], edges as WorkflowEdge[]);
        const stages = getExecutionStages(nodes as WorkflowNode[], edges as WorkflowEdge[]);
        if (!executionOrder || !stages) {
            logger.error('Cannot execute workflow with cycles');
            return;
        }

        // Determine which nodes need execution
        let nodesToRerun: Set<string>;
        if (resumeFromNodeId) {
            nodesToRerun = getDownstreamNodeIds(resumeFromNodeId, edges as WorkflowEdge[]);
            for (const id of nodesToRerun) {
                completedNodeOutputsRef.current.delete(id);
            }
        } else {
            nodesToRerun = new Set(executionOrder);
            completedNodeOutputsRef.current.clear();
        }

        // Create AbortController for this execution
        executionAbortController.current = new AbortController();
        const abortSignal = executionAbortController.current.signal;

        // Create execution history record (inside try to prevent silent failures)
        let executionRecord: ReturnType<typeof createExecutionRecord> | null = null;
        try {
            executionRecord = createExecutionRecord(
                nodes as WorkflowNode[],
                edges as WorkflowEdge[],
                inputFiles.length
            );
            addExecutionRecord(executionRecord);
        } catch (historyError) {
            logger.warn('[Workflow] Failed to create execution history record:', historyError);
            // Continue execution even if history recording fails
        }

        // Pre-populate outputs from cached results of nodes that do not need to rerun
        const nodeOutputs = new Map<string, (Blob | WorkflowOutputFile)[]>(completedNodeOutputsRef.current);
        const localExecutedNodes: string[] = [];
        for (const nodeId of executionOrder) {
            if (!nodesToRerun.has(nodeId) && nodeOutputs.has(nodeId)) {
                localExecutedNodes.push(nodeId);
            }
        }

        flushSync(() => {
            setExecutionState({
                status: 'running',
                currentNodeId: null,
                executedNodes: [...localExecutedNodes],
                pendingNodes: executionOrder.filter(id => nodesToRerun.has(id)),
                progress: Math.round((localExecutedNodes.length / executionOrder.length) * 100),
                startTime: new Date(),
            });
        });

        // Reset statuses only for nodes that need to rerun; keep already completed nodes complete!
        flushSync(() => {
            setNodes((nds) => nds.map(node => {
                if (nodesToRerun.has(node.id)) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            status: 'idle' as const,
                            progress: 0,
                            error: undefined,
                            outputFiles: undefined,
                        },
                    };
                }
                return node;
            }));
        });

        let currentExecutingNodeId: string | null = null;

        try {
            // Find input nodes and assign files to them
            const inputNodes = findInputNodes(nodes as WorkflowNode[], edges as WorkflowEdge[]);

            if (inputNodes.length === 0) {
                throw new Error('No input nodes found in workflow. Cannot execute.');
            }

            const hasLocalFiles = inputNodes.some(n => n.data.inputFiles && n.data.inputFiles.length > 0);
            if (inputFiles.length === 0 && !hasLocalFiles) {
                throw new Error('请先上传文件（可在顶部面板上传，或直接在输入节点卡片中上传）');
            }

            logger.log(
                `[Workflow] Starting execution with ${inputFiles.length} file(s) (has local node files: ${hasLocalFiles}) ` +
                `for ${inputNodes.length} input node(s): ${inputNodes.map(n => n.data.label).join(', ')}`
            );

            const inputFileAssignments = distributeFilesToInputNodes(inputFiles, inputNodes);

            setNodes((nds) => nds.map(node => {
                if (node.data.inputFiles && node.data.inputFiles.length > 0) {
                    return node;
                }
                const assigned = inputFileAssignments.get(node.id);
                if (assigned !== undefined) {
                    return {
                        ...node,
                        data: { ...node.data, inputFiles: assigned },
                    };
                }
                return node;
            }));

            const needsLibreOffice = executionOrder.some((nodeId) => {
                const node = (nodes as WorkflowNode[]).find((n) => n.id === nodeId);
                return node ? LIBREOFFICE_TOOL_IDS.has(node.data.toolId) : false;
            });

            if (needsLibreOffice && isCrossOriginIsolated()) {
                logger.log('[Workflow] Preloading LibreOffice conversion engine...');
                await preloadLibreOfficeConverter();
            } else if (needsLibreOffice) {
                logger.log(
                    '[Workflow] Cross-Origin Isolation unavailable; Word .docx will use compatibility converter.'
                );
            }

            // Track active branches and skipped nodes for conditional routing
            const activeBranches = new Map<string, 'true' | 'false'>();
            const skippedNodes = new Set<string>();

            // Pre-populate active branches for already-completed nodes (supports resume/retry)
            (nodes as WorkflowNode[]).forEach(n => {
                if (n.data.activeBranch && !nodesToRerun.has(n.id)) {
                    activeBranches.set(n.id, n.data.activeBranch);
                }
            });

            // Execute stages in parallel (Level-by-Level DAG Execution)
            for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
                if (abortSignal.aborted) {
                    logger.log('[Workflow] Execution aborted by user');
                    throw new Error('Execution cancelled by user');
                }

                const stage = stages[stageIdx];
                const stageNodesToRun = stage.filter(nodeId => nodesToRerun.has(nodeId));
                if (stageNodesToRun.length === 0) {
                    continue;
                }

                // Determine which nodes in this stage should run vs. be skipped due to conditional branches
                const activeStageNodes: string[] = [];
                for (const nodeId of stageNodesToRun) {
                    const parentEdges = (edges as WorkflowEdge[]).filter(e => e.target === nodeId);

                    if (parentEdges.length === 0) {
                        // Input nodes with no incoming edges are always active
                        activeStageNodes.push(nodeId);
                        continue;
                    }

                    // Check if at least one incoming edge is active
                    const hasActiveIncoming = parentEdges.some(edge => {
                        // If parent node was skipped, this edge cannot provide input
                        if (skippedNodes.has(edge.source)) return false;

                        const sourceNode = (nodes as WorkflowNode[]).find(n => n.id === edge.source);
                        const sourceBranch = activeBranches.get(edge.source) ?? sourceNode?.data.activeBranch;

                        // Check if edge comes from a specific true/false branch of a condition gateway
                        if (sourceNode?.data.toolId === 'condition-gateway' || edge.sourceHandle === 'true' || edge.sourceHandle === 'false') {
                            if (edge.sourceHandle === 'true' && sourceBranch && sourceBranch !== 'true') return false;
                            if (edge.sourceHandle === 'false' && sourceBranch && sourceBranch !== 'false') return false;
                        }

                        return true;
                    });

                    if (hasActiveIncoming) {
                        activeStageNodes.push(nodeId);
                    } else {
                        // All parent branches are inactive or skipped: mark this node as skipped
                        skippedNodes.add(nodeId);
                        localExecutedNodes.push(nodeId);
                        flushSync(() => {
                            setNodes(nds => nds.map(node =>
                                node.id === nodeId
                                    ? { ...node, data: { ...node.data, status: 'skipped' as const, progress: 100 } }
                                    : node
                            ));
                        });
                        logger.log(`[Workflow] Node ${nodeId} skipped (branch not activated)`);
                    }
                }

                if (activeStageNodes.length === 0) {
                    flushSync(() => {
                        setExecutionState(prev => ({
                            ...prev,
                            executedNodes: [...localExecutedNodes],
                            pendingNodes: prev.pendingNodes.filter(id => !skippedNodes.has(id)),
                            progress: Math.round((localExecutedNodes.length / executionOrder.length) * 100),
                        }));
                    });
                    continue;
                }

                currentExecutingNodeId = activeStageNodes[0];

                flushSync(() => {
                    setExecutionState(prev => ({
                        ...prev,
                        currentNodeId: activeStageNodes[0],
                        progress: Math.round((localExecutedNodes.length / executionOrder.length) * 100),
                    }));
                });

                flushSync(() => {
                    setNodes(nds => nds.map(node =>
                        activeStageNodes.includes(node.id)
                            ? { ...node, data: { ...node.data, status: 'processing' as const, progress: 0 } }
                            : node
                    ));
                });

                // Execute all independent active nodes in this stage concurrently
                await Promise.all(
                    activeStageNodes.map(async (nodeId) => {
                        if (abortSignal.aborted) {
                            throw new Error('Execution cancelled by user');
                        }

                        const currentNode = await new Promise<WorkflowNode | undefined>((resolve) => {
                            setNodes((nds) => {
                                resolve(nds.find(n => n.id === nodeId) as WorkflowNode | undefined);
                                return nds;
                            });
                        });

                        if (!currentNode) {
                            logger.warn(`[Workflow] Node ${nodeId} not found, skipping`);
                            return;
                        }

                        logger.log(`[Workflow] Concurrent processing node: ${currentNode.data.label} (${nodeId})`);

                        // Get input files for this node (filtered by active branches)
                        const nodeInputFiles = collectInputFiles(
                            nodeId,
                            nodes as WorkflowNode[],
                            edges as WorkflowEdge[],
                            nodeOutputs,
                            inputFileAssignments,
                            activeBranches
                        );

                        const isInputNode = inputNodes.some((n) => n.id === nodeId);
                        const filesToProcess =
                            nodeInputFiles.length > 0
                                ? nodeInputFiles
                                : isInputNode
                                  ? (currentNode.data.inputFiles && currentNode.data.inputFiles.length > 0
                                      ? currentNode.data.inputFiles
                                      : (inputFileAssignments.get(nodeId) || inputFiles))
                                  : [];

                        // Execute the node
                        const result = await executeNode(
                            currentNode,
                            filesToProcess,
                            (progress) => {
                                setNodes((nds) => nds.map(node =>
                                    node.id === nodeId
                                        ? { ...node, data: { ...node.data, progress: Math.min(progress, 100) } }
                                        : node
                                ));
                            }
                        );

                        if (abortSignal.aborted) {
                            throw new Error('Execution cancelled by user');
                        }

                        if (!result.success) {
                            const errorMessage = result.error?.message || 'Processing failed';
                            const errorDetails = result.error?.details;
                            const errorCode = result.error?.code;
                            const suggestedAction = result.error?.suggestedAction;

                            let fullErrorMessage = errorMessage;
                            if (errorCode) {
                                fullErrorMessage = `[${errorCode}] ${fullErrorMessage}`;
                            }
                            if (errorDetails) {
                                fullErrorMessage += `\n\nDetails: ${errorDetails}`;
                            }
                            if (suggestedAction) {
                                fullErrorMessage += `\n\nSuggested Action: ${suggestedAction}`;
                            }

                            currentExecutingNodeId = nodeId;
                            setNodes((nds) => nds.map(node =>
                                node.id === nodeId
                                    ? {
                                        ...node,
                                        data: {
                                            ...node.data,
                                            status: 'error' as const,
                                            error: fullErrorMessage,
                                            progress: 0,
                                        }
                                    }
                                    : node
                            ));

                            const error = new Error(`Node "${currentNode.data.label}" failed: ${errorMessage}`);
                            (error as Error & { nodeId?: string; code?: string }).nodeId = nodeId;
                            (error as Error & { nodeId?: string; code?: string }).code = errorCode;
                            throw error;
                        }

                        if (!result.result) {
                            logger.warn(`[Workflow] Node "${currentNode.data.label}" produced no output blob, passing through input files`);
                        }

                        const outputs = buildNodeOutputsFromResult(result, currentNode.data.label, filesToProcess);
                        nodeOutputs.set(nodeId, outputs);
                        completedNodeOutputsRef.current.set(nodeId, outputs);
                        localExecutedNodes.push(nodeId);

                        // If this was a condition gateway, record its selected active branch
                        const activeBranch = result.metadata?.activeBranch as ('true' | 'false') | undefined;
                        if (activeBranch) {
                            activeBranches.set(nodeId, activeBranch);
                        }

                        flushSync(() => {
                            setNodes((nds) => nds.map(node =>
                                node.id === nodeId
                                    ? {
                                        ...node,
                                        data: {
                                            ...node.data,
                                            status: 'complete' as const,
                                            progress: 100,
                                            activeBranch: activeBranch || node.data.activeBranch,
                                            outputFiles: outputs,
                                        }
                                    }
                                    : node
                            ));
                        });

                        flushSync(() => {
                            setExecutionState(prev => ({
                                ...prev,
                                executedNodes: [...localExecutedNodes],
                                pendingNodes: prev.pendingNodes.filter(id => id !== nodeId),
                                progress: Math.round((localExecutedNodes.length / executionOrder.length) * 100),
                            }));
                        });
                    })
                );
            }

            // Collect final outputs from terminal nodes (nodes with no outgoing edges, excluding skipped nodes)
            const nodesWithOutgoing = new Set(edges.map(e => e.source));
            const terminalNodeIds = executionOrder.filter(id => !nodesWithOutgoing.has(id));
            const activeTerminalNodeIds = terminalNodeIds.filter(id => !skippedNodes.has(id));
            
            // If no active terminal nodes found, fall back to any non-skipped completed nodes
            const outputNodeIds = activeTerminalNodeIds.length > 0 
                ? activeTerminalNodeIds 
                : executionOrder.filter(id => !skippedNodes.has(id));
            
            const finalOutputs: (Blob | WorkflowOutputFile)[] = [];
            for (const nodeId of outputNodeIds) {
                const nodeOutput = nodeOutputs.get(nodeId);
                if (nodeOutput && nodeOutput.length > 0) {
                    finalOutputs.push(...nodeOutput);
                }
            }

            logger.log(
                `[Workflow] Execution complete. Terminal nodes: ${outputNodeIds.length}, Output files: ${finalOutputs.length}`,
                finalOutputs.map((f, i) => {
                    if ('blob' in f && (f as WorkflowOutputFile).blob) {
                        const wf = f as WorkflowOutputFile;
                        return `[${i}] "${wf.filename}" ${wf.blob.size}B`;
                    }
                    if (f instanceof Blob) return `[${i}] Blob ${f.size}B`;
                    return `[${i}] unknown`;
                }).join(', ')
            );

            flushSync(() => {
                setExecutionState(prev => ({
                    ...prev,
                    status: 'complete',
                    currentNodeId: null,
                    progress: 100,
                    endTime: new Date(),
                    outputFiles: finalOutputs,
                }));
            });

            // Update execution history record as completed
            if (executionRecord) {
                try {
                    completeExecutionRecord(
                        executionRecord.id,
                        'completed',
                        executionOrder.length
                    );
                } catch (historyError) {
                    logger.warn('[Workflow] Failed to update execution history:', historyError);
                }
            }

        } catch (error) {
            logger.error('[Workflow Execution] Workflow execution failed:', error);

            const {
                failedNodeId,
                successfulCount,
                errorMessage,
                isCancelled,
            } = deriveWorkflowFailureContext(error, currentExecutingNodeId, localExecutedNodes);
            
            // Find the failed node name for better error reporting
            const failedNode = nodes.find(n => n.id === failedNodeId);
            const failedNodeName = failedNode?.data.label || 'Unknown node';
            
            // Build user-friendly error message
            const userMessage = isCancelled 
                ? 'Workflow execution was cancelled'
                : `Workflow failed at "${failedNodeName}": ${errorMessage}`;
            
            // Update execution state with detailed error
            setExecutionState(prev => ({
                ...prev,
                status: isCancelled ? 'idle' : 'error',
                currentNodeId: null,
                endTime: new Date(),
                error: isCancelled ? undefined : {
                    nodeId: failedNodeId,
                    message: userMessage,
                },
            }));
            
            // Update execution history record
            if (executionRecord) {
                try {
                    completeExecutionRecord(
                        executionRecord.id,
                        isCancelled ? 'cancelled' : 'failed',
                        successfulCount,
                        isCancelled ? undefined : userMessage,
                        isCancelled ? undefined : failedNodeId
                    );
                } catch (historyError) {
                    logger.warn('[Workflow] Failed to update execution history:', historyError);
                }
            }
            
            // Ensure the failed node shows error status (if not cancelled)
            if (failedNodeId && !isCancelled) {
                setNodes((nds) => nds.map(node =>
                    node.id === failedNodeId && node.data.status !== 'error'
                        ? { 
                            ...node, 
                            data: { 
                                ...node.data, 
                                status: 'error' as const,
                                error: node.data.error || errorMessage,
                            } 
                          }
                        : node
                ));
            }
        } finally {
            // Clear the abort controller
            executionAbortController.current = null;
        }
    }, [nodes, edges, setNodes]);

    /**
     * Stop workflow execution
     */
    const stopExecution = useCallback(() => {
        // Abort the running execution
        if (executionAbortController.current) {
            executionAbortController.current.abort();
        }

        setExecutionState(prev => ({
            ...prev,
            status: 'idle',
            currentNodeId: null,
            endTime: new Date(),
        }));

        // Reset processing and pending nodes, but keep completed and error states
        setNodes((nds) => nds.map(node => ({
            ...node,
            data: { 
                ...node.data, 
                status: node.data.status === 'processing' ? 'idle' as const : node.data.status,
                progress: node.data.status === 'processing' ? 0 : node.data.progress,
            },
        })));
    }, [setNodes]);

    /**
     * Retry workflow from failed node
     */
    const retryFromFailedNode = useCallback(async () => {
        if (executionState.status !== 'error' || !executionState.error?.nodeId) {
            logger.warn('[Workflow] No failed node to retry from');
            return;
        }

        const failedNodeId = executionState.error.nodeId;
        logger.log(`[Workflow] Resuming execution from failed node: ${failedNodeId}`);

        // Clear error from execution state
        setExecutionState(prev => ({
            ...prev,
            status: 'idle',
            error: undefined,
        }));

        // Restart execution from the failed node, preserving upstream outputs
        if (selectedFiles.length > 0) {
            await executeWorkflow(selectedFiles, failedNodeId);
        }
    }, [executionState, selectedFiles, executeWorkflow]);

    /**
     * Clear all workflow state (reset all nodes)
     */
    const clearWorkflowState = useCallback(() => {
        logger.log('[Workflow] Clearing workflow state and cleaning up resources');
        
        // Abort any running execution
        if (executionAbortController.current) {
            executionAbortController.current.abort();
        }
        
        // Cleanup Blob URLs
        cleanupBlobUrls();

        // Clear cached node outputs
        completedNodeOutputsRef.current.clear();
        
        // Reset execution state
        setExecutionState({
            status: 'idle',
            currentNodeId: null,
            executedNodes: [],
            pendingNodes: [],
            progress: 0,
        });

        // Reset all node states and clear outputs
        setNodes((nds) => nds.map(node => ({
            ...node,
            data: { 
                ...node.data, 
                status: 'idle' as const, 
                progress: 0,
                error: undefined,
                outputFiles: undefined,
                inputFiles: undefined,
            },
        })));
    }, [setNodes, cleanupBlobUrls]);

    /**
     * Save current workflow
     */
    const handleSaveWorkflow = useCallback((name: string, description?: string) => {
        saveWorkflow(name, nodes as WorkflowNode[], edges as WorkflowEdge[], description);
        setSavedWorkflows(getSavedWorkflows());
    }, [nodes, edges]);

    /**
     * Load a saved workflow
     */
    const loadWorkflow = useCallback((workflow: SavedWorkflow) => {
        setNodes(workflow.nodes);
        setEdges(workflow.edges as Edge[]);
        clearHistory();
        setIsRightSidebarCollapsed(true);
    }, [setNodes, setEdges, clearHistory]);

    /**
     * Load workflow from execution history
     */
    const loadFromHistory = useCallback((record: WorkflowExecutionRecord) => {
        // Restore nodes and edges from history snapshot
        setNodes(record.nodes as Node[]);
        setEdges(record.edges as Edge[]);
        
        // Clear execution state
        clearWorkflowState();
        
        // Clear undo/redo history
        clearHistory();
        setIsRightSidebarCollapsed(true);
        
        logger.log('[Workflow] Loaded from history:', record.workflowName || 'Unnamed');
    }, [clearHistory, clearWorkflowState, setNodes, setEdges]);

    /**
     * Load a template
     */
    const loadTemplate = useCallback((template: WorkflowTemplate) => {
        setNodes(template.nodes);
        setEdges(template.edges as Edge[]);
        clearHistory();
        setIsRightSidebarCollapsed(true);
    }, [setNodes, setEdges, clearHistory]);

    /**
     * Clear workflow
     */
    const clearWorkflow = useCallback(() => {
        setNodes([]);
        setEdges([]);
        setSelectedNode(null);
        setIsSettingsPanelOpen(false);
        clearHistory();
        completedNodeOutputsRef.current.clear();
        setExecutionState({
            status: 'idle',
            currentNodeId: null,
            executedNodes: [],
            pendingNodes: [],
            progress: 0,
        });
    }, [setNodes, setEdges, clearHistory]);

    /**
     * Delete a saved workflow
     */
    const handleDeleteWorkflow = useCallback((id: string) => {
        deleteWorkflow(id);
        setSavedWorkflows(getSavedWorkflows());
    }, []);

    /**
     * Duplicate a workflow
     */
    const handleDuplicateWorkflow = useCallback((id: string) => {
        duplicateWorkflow(id);
        setSavedWorkflows(getSavedWorkflows());
    }, []);

    /**
     * Export a workflow
     */
    const handleExportWorkflow = useCallback((workflow: SavedWorkflow) => {
        exportWorkflow(workflow);
    }, []);

    /**
     * Import a workflow
     */
    const handleImportWorkflow = useCallback(async (file: File) => {
        const imported = await importWorkflow(file);
        if (imported) {
            setSavedWorkflows(getSavedWorkflows());
            loadWorkflow(imported);
        }
    }, [loadWorkflow]);

    return (
        <div className="flex h-full relative">
            {/* Left Sidebar - Tool Library */}
            <ToolSidebar
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isCollapsed={isLeftSidebarCollapsed}
                onToggleCollapse={() => setIsLeftSidebarCollapsed(!isLeftSidebarCollapsed)}
            />

            {/* Main Canvas Area */}
            <div className="flex-1 flex flex-col">
                {/* Controls with Undo/Redo */}
                <div className="flex items-center">
                    <div className="flex-1">
                        <WorkflowControls
                            nodes={nodes as WorkflowNode[]}
                            edges={edges as WorkflowEdge[]}
                            executionState={executionState}
                            validation={validation}
                            onExecute={executeWorkflow}
                            onStop={stopExecution}
                            onSave={handleSaveWorkflow}
                            onClear={clearWorkflow}
                            onClearState={clearWorkflowState}
                            onRetry={retryFromFailedNode}
                            onImport={handleImportWorkflow}
                            onFilesChange={setSelectedFiles}
                            isPreviewVisible={isPreviewVisible}
                            onTogglePreview={() => setIsPreviewVisible(prev => !prev)}
                            isLeftSidebarCollapsed={isLeftSidebarCollapsed}
                            isRightSidebarCollapsed={isRightSidebarCollapsed}
                            onToggleLeftSidebar={() => setIsLeftSidebarCollapsed(!isLeftSidebarCollapsed)}
                            onToggleRightSidebar={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
                        />
                    </div>
                </div>

                {/* Canvas */}
                <div 
                    className="flex-1 relative" 
                    ref={reactFlowWrapper}
                >
                    {/* Undo/Redo Floating Island */}
                    <div className="absolute top-3 left-3 z-10 flex items-center gap-1 p-1 rounded-lg bg-[hsl(var(--color-background)/0.9)] backdrop-blur-md border border-[hsl(var(--color-border))] shadow-md">
                        <button
                            onClick={handleUndo}
                            disabled={!canUndo}
                            className={`
                                p-1.5 rounded-md transition-colors
                                ${canUndo
                                    ? 'hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-foreground))] cursor-pointer'
                                    : 'opacity-35 text-[hsl(var(--color-muted-foreground))] cursor-not-allowed'
                                }
                            `}
                            title={`${tWorkflow('undo') || '撤销'} (Ctrl+Z)`}
                        >
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleRedo}
                            disabled={!canRedo}
                            className={`
                                p-1.5 rounded-md transition-colors
                                ${canRedo
                                    ? 'hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-foreground))] cursor-pointer'
                                    : 'opacity-35 text-[hsl(var(--color-muted-foreground))] cursor-not-allowed'
                                }
                            `}
                            title={`${tWorkflow('redo') || '重做'} (Ctrl+Shift+Z)`}
                        >
                            <Redo2 className="w-4 h-4" />
                        </button>

                        <div className="w-px h-4 bg-[hsl(var(--color-border))] mx-0.5" />

                        <button
                            onClick={handleAutoLayout}
                            disabled={nodes.length === 0}
                            className={`
                                p-1.5 rounded-md transition-colors
                                ${nodes.length > 0
                                    ? 'hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-foreground))] cursor-pointer'
                                    : 'opacity-35 text-[hsl(var(--color-muted-foreground))] cursor-not-allowed'
                                }
                            `}
                            title={tWorkflow('autoLayout') || '自动整理布局 (Auto Layout)'}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>

                        <button
                            onClick={duplicateSelectedNode}
                            disabled={!selectedNode && !nodes.some(n => n.selected)}
                            className={`
                                p-1.5 rounded-md transition-colors
                                ${(selectedNode || nodes.some(n => n.selected))
                                    ? 'hover:bg-[hsl(var(--color-muted))] text-[hsl(var(--color-foreground))] cursor-pointer'
                                    : 'opacity-35 text-[hsl(var(--color-muted-foreground))] cursor-not-allowed'
                                }
                            `}
                            title={`${tWorkflow('duplicateNode') || '复制节点 (Duplicate)'} (Ctrl+D)`}
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>

                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onInit={setReactFlowInstance}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onNodeClick={onNodeClick}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        defaultEdgeOptions={defaultEdgeOptions}
                        connectionMode={ConnectionMode.Loose}
                        deleteKeyCode={['Backspace', 'Delete']}
                        fitView
                        snapToGrid
                        snapGrid={[15, 15]}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Controls />
                        <MiniMap
                            nodeStrokeWidth={3}
                            zoomable
                            pannable
                            className="!bg-[hsl(var(--color-background)/0.8)] !border-[hsl(var(--color-border))] !rounded-lg !shadow-md backdrop-blur-sm"
                        />
                        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />

                        {/* Empty state */}
                        {nodes.length === 0 && (
                            <Panel position="top-center" className="mt-20">
                                <div className="text-center p-8 bg-[hsl(var(--color-background))] rounded-lg border border-dashed border-[hsl(var(--color-border))] shadow-sm">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[hsl(var(--color-muted))] flex items-center justify-center">
                                        <svg className="w-8 h-8 text-[hsl(var(--color-muted-foreground))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M4 14h6v6H4zM14 4h6v6h-6z" />
                                            <path d="M7 4v10M17 14v6M4 17h6M14 7h6" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))]">
                                        {tWorkflow('emptyTitle') || 'Create Your Workflow'}
                                    </h3>
                                    <p className="text-sm text-[hsl(var(--color-muted-foreground))] mt-2 max-w-sm">
                                        {tWorkflow('emptyDescription') || 'Drag tools from the sidebar to build your PDF processing pipeline. Connect nodes to define the processing order.'}
                                    </p>
                                    <p className="text-xs text-[hsl(var(--color-muted-foreground))] mt-4">
                                        {tWorkflow('clickHint') || 'Click a node to configure its settings'}
                                    </p>
                                </div>
                            </Panel>
                        )}
                    </ReactFlow>
                </div>
            </div>

            {/* Right Sidebar - Templates & Saved Workflows */}
            <WorkflowLibrary
                savedWorkflows={savedWorkflows}
                onLoadTemplate={loadTemplate}
                onLoadWorkflow={loadWorkflow}
                onDeleteWorkflow={handleDeleteWorkflow}
                onDuplicateWorkflow={handleDuplicateWorkflow}
                onExportWorkflow={handleExportWorkflow}
                onLoadFromHistory={loadFromHistory}
                isCollapsed={isRightSidebarCollapsed}
                onToggleCollapse={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
            />

            {/* Node Settings Panel */}
            {isSettingsPanelOpen && (
                <NodeSettingsPanel
                    node={selectedNode}
                    onClose={() => setIsSettingsPanelOpen(false)}
                    onUpdateSettings={handleUpdateNodeSettings}
                />
            )}

            {/* Preview */}
            <WorkflowPreview
                nodes={nodes as WorkflowNode[]}
                edges={edges as WorkflowEdge[]}
                inputFiles={effectiveInputFiles}
                isVisible={isPreviewVisible}
                onToggle={() => setIsPreviewVisible(!isPreviewVisible)}
            />
        </div>
    );
}

/**
 * Workflow Editor with ReactFlow Provider
 */
export function WorkflowEditor() {
    return (
        <ReactFlowProvider>
            <WorkflowEditorContent />
        </ReactFlowProvider>
    );
}

export default WorkflowEditor;
