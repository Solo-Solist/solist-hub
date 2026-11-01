/**
 * Conditional Branch Types for Workflow
 * Framework for future conditional logic support
 */

export type ConditionType = 
    | 'file-count'      // Based on number of files
    | 'file-size'       // Based on file size
    | 'file-pages'      // Based on number of pages
    | 'file-format'     // Based on file format/extension
    | 'metadata'        // Based on PDF metadata
    | 'custom';         // Custom JavaScript expression

export type ComparisonOperator = 
    | 'equals'
    | 'not-equals'
    | 'greater-than'
    | 'less-than'
    | 'greater-or-equal'
    | 'less-or-equal'
    | 'contains'
    | 'not-contains'
    | 'matches';        // Regex match

export interface Condition {
    /** Type of condition */
    type: ConditionType;
    /** Field/property to check */
    field?: string;
    /** Comparison operator */
    operator: ComparisonOperator;
    /** Value to compare against */
    value: string | number | boolean;
}

export interface ConditionalBranch {
    /** Branch ID */
    id: string;
    /** Branch label */
    label: string;
    /** Conditions (all must be true for AND logic) */
    conditions: Condition[];
    /** Target node ID if conditions are met */
    targetNodeId: string;
    /** Priority (lower number = higher priority) */
    priority: number;
}

export interface ConditionalNodeData {
    /** Evaluation logic: 'any' = OR, 'all' = AND */
    logic: 'any' | 'all';
    /** List of branches to evaluate */
    branches: ConditionalBranch[];
    /** Default branch if no conditions match */
    defaultBranchId?: string;
}

function compareValues(
    actual: number | string | boolean,
    operator: ComparisonOperator,
    target: number | string | boolean
): boolean {
    if (typeof actual === 'number' && (typeof target === 'number' || (!isNaN(Number(target)) && target !== ''))) {
        const numTarget = Number(target);
        switch (operator) {
            case 'equals': return actual === numTarget;
            case 'not-equals': return actual !== numTarget;
            case 'greater-than': return actual > numTarget;
            case 'less-than': return actual < numTarget;
            case 'greater-or-equal': return actual >= numTarget;
            case 'less-or-equal': return actual <= numTarget;
            default: return false;
        }
    }

    const strActual = String(actual).toLowerCase();
    const strTarget = String(target).toLowerCase();

    switch (operator) {
        case 'equals':
            return strActual === strTarget;
        case 'not-equals':
            return strActual !== strTarget;
        case 'contains':
            return strActual.includes(strTarget);
        case 'not-contains':
            return !strActual.includes(strTarget);
        case 'matches':
            try {
                return new RegExp(String(target), 'i').test(String(actual));
            } catch {
                return false;
            }
        default:
            return false;
    }
}

/**
 * Evaluate a single condition against input files
 */
export function evaluateCondition(
    condition: Condition,
    files: File[]
): boolean {
    if (!files || files.length === 0) {
        if (condition.type === 'file-count') {
            return compareValues(0, condition.operator, condition.value);
        }
        return false;
    }

    switch (condition.type) {
        case 'file-count': {
            return compareValues(files.length, condition.operator, condition.value);
        }

        case 'file-size': {
            // Check total size across all files in bytes
            const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
            return compareValues(totalBytes, condition.operator, condition.value);
        }

        case 'file-format': {
            // Check whether file extension matches
            const targetExt = String(condition.value).toLowerCase().replace(/^\./, '');
            const fileExtensions = files.map(f => {
                const parts = f.name.toLowerCase().split('.');
                return parts.length > 1 ? parts.pop()! : '';
            });

            if (condition.operator === 'equals' || condition.operator === 'contains') {
                return fileExtensions.some(ext => ext === targetExt || ext.includes(targetExt));
            } else if (condition.operator === 'not-equals' || condition.operator === 'not-contains') {
                return fileExtensions.every(ext => ext !== targetExt && !ext.includes(targetExt));
            } else if (condition.operator === 'matches') {
                try {
                    const re = new RegExp(String(condition.value), 'i');
                    return files.some(f => re.test(f.name));
                } catch {
                    return false;
                }
            }
            return false;
        }

        case 'file-pages':
        case 'metadata':
        case 'custom': {
            // Handle custom / metadata if provided or basic comparison
            if (condition.field && typeof (files[0] as unknown as Record<string, unknown>)[condition.field] !== 'undefined') {
                const val = (files[0] as unknown as Record<string, unknown>)[condition.field];
                return compareValues(val as number | string | boolean, condition.operator, condition.value);
            }
            return false;
        }

        default:
            return false;
    }
}

/**
 * Evaluate all conditions for a branch
 */
export function evaluateBranch(
    branch: ConditionalBranch,
    files: File[],
    logic: 'any' | 'all' = 'all'
): boolean {
    if (!branch.conditions || branch.conditions.length === 0) {
        return true;
    }

    if (logic === 'any') {
        return branch.conditions.some(cond => evaluateCondition(cond, files));
    } else {
        return branch.conditions.every(cond => evaluateCondition(cond, files));
    }
}

/**
 * Select the appropriate branch based on conditions
 */
export function selectBranch(
    branches: ConditionalBranch[],
    files: File[],
    logic: 'any' | 'all' = 'all',
    defaultBranchId?: string
): string | null {
    // Sort branches by priority (lower number = higher priority)
    const sortedBranches = [...branches].sort((a, b) => a.priority - b.priority);

    // Evaluate each branch in priority order
    for (const branch of sortedBranches) {
        if (evaluateBranch(branch, files, logic)) {
            return branch.targetNodeId;
        }
    }

    // Return default branch if no conditions matched
    return defaultBranchId || null;
}
