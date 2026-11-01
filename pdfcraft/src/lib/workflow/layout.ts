/**
 * Workflow Auto-Layout Algorithm
 * Computes neat, hierarchical layout coordinates (Left-to-Right) for DAG nodes
 */

import { WorkflowNode, WorkflowEdge } from '@/types/workflow';

export interface LayoutOptions {
    /** Layout direction: 'LR' (Left-to-Right) or 'TB' (Top-to-Bottom). Defaults to 'LR'. */
    direction?: 'LR' | 'TB';
    /** Horizontal distance between successive levels. Defaults to 280. */
    horizontalSpacing?: number;
    /** Vertical distance between nodes within the same level. Defaults to 140. */
    verticalSpacing?: number;
    /** Left / Top starting padding. Defaults to 80. */
    padding?: number;
}

/**
 * Compute auto-layout positions for workflow nodes based on topological levels.
 * Handles disconnected nodes and ensures stable, readable Left-to-Right DAG alignment.
 */
export function getAutoLayoutedNodes<T extends WorkflowNode>(
    nodes: T[],
    edges: WorkflowEdge[],
    options: LayoutOptions = {}
): T[] {
    if (!nodes || nodes.length === 0) return [];

    const {
        direction = 'LR',
        horizontalSpacing = 280,
        verticalSpacing = 140,
        padding = 80,
    } = options;

    const nodeMap = new Map<string, T>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    // Build incoming and outgoing adjacency
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();

    nodes.forEach(node => {
        outgoing.set(node.id, []);
        incoming.set(node.id, []);
    });

    edges.forEach(edge => {
        if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
            outgoing.get(edge.source)!.push(edge.target);
            incoming.get(edge.target)!.push(edge.source);
        }
    });

    // Compute rank/level using longest path in DAG
    const levels = new Map<string, number>();

    // Nodes with 0 in-degree start at level 0
    const inDegree = new Map<string, number>();
    nodes.forEach(node => {
        inDegree.set(node.id, incoming.get(node.id)!.length);
        if (incoming.get(node.id)!.length === 0) {
            levels.set(node.id, 0);
        }
    });

    // Topological traversal to find longest path to each node
    const queue: string[] = [];
    inDegree.forEach((deg, id) => {
        if (deg === 0) queue.push(id);
    });

    const visitedCount = { count: 0 };
    while (queue.length > 0) {
        const currentId = queue.shift()!;
        visitedCount.count++;
        const currentLevel = levels.get(currentId) || 0;

        const neighbors = outgoing.get(currentId) || [];
        for (const targetId of neighbors) {
            const existingTargetLevel = levels.get(targetId) || 0;
            levels.set(targetId, Math.max(existingTargetLevel, currentLevel + 1));

            const remainingInDeg = (inDegree.get(targetId) || 1) - 1;
            inDegree.set(targetId, remainingInDeg);
            if (remainingInDeg === 0) {
                queue.push(targetId);
            }
        }
    }

    // Fallback for cycle or unvisited nodes: assign fallback level 0
    nodes.forEach(node => {
        if (!levels.has(node.id)) {
            levels.set(node.id, 0);
        }
    });

    // Group nodes by level
    const levelGroups = new Map<number, T[]>();
    nodes.forEach(node => {
        const lvl = levels.get(node.id)!;
        if (!levelGroups.has(lvl)) {
            levelGroups.set(lvl, []);
        }
        levelGroups.get(lvl)!.push(node);
    });

    // Sort levels
    const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

    // Calculate maximum height among all levels to vertically center columns
    let maxLevelCount = 1;
    sortedLevels.forEach(lvl => {
        const count = levelGroups.get(lvl)!.length;
        if (count > maxLevelCount) maxLevelCount = count;
    });
    const maxTotalHeight = (maxLevelCount - 1) * verticalSpacing;

    const result: T[] = [];

    sortedLevels.forEach(lvl => {
        const group = levelGroups.get(lvl)!;
        const groupHeight = (group.length - 1) * verticalSpacing;
        // Vertically center this column relative to the maximum column height
        const startY = padding + (maxTotalHeight - groupHeight) / 2;

        group.forEach((node, idx) => {
            let x: number;
            let y: number;

            if (direction === 'LR') {
                x = padding + lvl * horizontalSpacing;
                y = startY + idx * verticalSpacing;
            } else {
                x = startY + idx * verticalSpacing;
                y = padding + lvl * horizontalSpacing;
            }

            result.push({
                ...node,
                position: { x, y },
            });
        });
    });

    return result;
}
