import { describe, it, expect } from 'vitest';
import {
    evaluateCondition,
    evaluateBranch,
    selectBranch,
    Condition,
    ConditionalBranch,
} from '@/types/workflow-conditional';

describe('Workflow Conditional Branching', () => {
    const fileA = new File([new Blob(['hello'])], 'report.pdf', { type: 'application/pdf' });
    const fileB = new File([new Blob(['1234567890'])], 'summary.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    describe('evaluateCondition', () => {
        it('evaluates file-count conditions correctly', () => {
            const countEq2: Condition = {
                type: 'file-count',
                operator: 'equals',
                value: 2,
            };
            const countGt5: Condition = {
                type: 'file-count',
                operator: 'greater-than',
                value: 5,
            };
            const countLte2: Condition = {
                type: 'file-count',
                operator: 'less-or-equal',
                value: 2,
            };

            expect(evaluateCondition(countEq2, [fileA, fileB])).toBe(true);
            expect(evaluateCondition(countGt5, [fileA, fileB])).toBe(false);
            expect(evaluateCondition(countLte2, [fileA, fileB])).toBe(true);
        });

        it('evaluates file-size conditions correctly', () => {
            // fileA is 5 bytes, fileB is 10 bytes -> total 15 bytes
            const sizeGt10: Condition = {
                type: 'file-size',
                operator: 'greater-than',
                value: 10,
            };
            const sizeGt50: Condition = {
                type: 'file-size',
                operator: 'greater-than',
                value: 50,
            };

            expect(evaluateCondition(sizeGt10, [fileA, fileB])).toBe(true);
            expect(evaluateCondition(sizeGt50, [fileA, fileB])).toBe(false);
        });

        it('evaluates file-format conditions correctly', () => {
            const isPdf: Condition = {
                type: 'file-format',
                operator: 'equals',
                value: 'pdf',
            };
            const isExcel: Condition = {
                type: 'file-format',
                operator: 'equals',
                value: 'xlsx',
            };

            expect(evaluateCondition(isPdf, [fileA])).toBe(true);
            expect(evaluateCondition(isExcel, [fileA])).toBe(false);
            expect(evaluateCondition(isPdf, [fileA, fileB])).toBe(true);
        });

        it('evaluates regex matches operator correctly', () => {
            const regexReport: Condition = {
                type: 'file-format',
                operator: 'matches',
                value: '^report\\..*$',
            };
            expect(evaluateCondition(regexReport, [fileA])).toBe(true);
            expect(evaluateCondition(regexReport, [fileB])).toBe(false);
        });
    });

    describe('evaluateBranch', () => {
        const branch: ConditionalBranch = {
            id: 'b1',
            label: 'PDF Branch',
            priority: 1,
            targetNodeId: 'pdf-node',
            conditions: [
                { type: 'file-count', operator: 'greater-than', value: 0 },
                { type: 'file-format', operator: 'equals', value: 'pdf' },
            ],
        };

        it('returns true when all conditions match with logic="all"', () => {
            expect(evaluateBranch(branch, [fileA], 'all')).toBe(true);
        });

        it('returns false when one condition fails with logic="all"', () => {
            expect(evaluateBranch(branch, [fileB], 'all')).toBe(false);
        });

        it('returns true when any condition matches with logic="any"', () => {
            expect(evaluateBranch(branch, [fileB], 'any')).toBe(true);
        });
    });

    describe('selectBranch', () => {
        const branchHighPriority: ConditionalBranch = {
            id: 'b1',
            label: 'Small Files',
            priority: 1,
            targetNodeId: 'fast-compress',
            conditions: [{ type: 'file-count', operator: 'less-than', value: 3 }],
        };

        const branchLowPriority: ConditionalBranch = {
            id: 'b2',
            label: 'Large Files',
            priority: 2,
            targetNodeId: 'deep-compress',
            conditions: [{ type: 'file-count', operator: 'greater-than', value: 0 }],
        };

        it('selects the matching branch with the highest priority (lowest priority number)', () => {
            const target = selectBranch([branchLowPriority, branchHighPriority], [fileA]);
            expect(target).toBe('fast-compress');
        });

        it('falls back to defaultBranchId when no branch matches', () => {
            const noMatchBranch: ConditionalBranch = {
                id: 'b3',
                label: 'Many files',
                priority: 1,
                targetNodeId: 'batch-node',
                conditions: [{ type: 'file-count', operator: 'greater-than', value: 10 }],
            };

            const target = selectBranch([noMatchBranch], [fileA], 'all', 'fallback-node');
            expect(target).toBe('fallback-node');
        });
    });
});
