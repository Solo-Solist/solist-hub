import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkflowControls } from '@/components/workflow/WorkflowControls';
import type { WorkflowExecutionState, WorkflowValidation } from '@/types/workflow';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function createExecutionState(overrides: Partial<WorkflowExecutionState> = {}): WorkflowExecutionState {
  return {
    status: 'idle',
    currentNodeId: null,
    executedNodes: [],
    pendingNodes: [],
    progress: 0,
    ...overrides,
  };
}

function createValidation(overrides: Partial<WorkflowValidation> = {}): WorkflowValidation {
  return {
    isValid: true,
    errors: [],
    warnings: [],
    ...overrides,
  };
}

describe('WorkflowControls', () => {
  it('exposes a broad file accept list for workflow inputs', () => {
    const { container } = render(
      <WorkflowControls
        nodes={[]}
        edges={[]}
        executionState={createExecutionState()}
        validation={createValidation()}
        onExecute={vi.fn()}
        onStop={vi.fn()}
        onSave={vi.fn()}
        onClear={vi.fn()}
        onImport={vi.fn()}
      />
    );

    const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('.txt');
    expect(input.accept).toContain('.json');
    expect(input.accept).toContain('.svg');
    expect(input.accept).toContain('.epub');
    expect(input.accept).toContain('.eml');
  });

  it('renders readable list markers for validation messages', () => {
    render(
      <WorkflowControls
        nodes={[]}
        edges={[]}
        executionState={createExecutionState()}
        validation={createValidation({
          isValid: false,
          errors: [{ type: 'format', message: 'Bad edge format' }],
          warnings: [{ message: 'Disconnected node' }],
        })}
        onExecute={vi.fn()}
        onStop={vi.fn()}
        onSave={vi.fn()}
        onClear={vi.fn()}
        onImport={vi.fn()}
      />
    );

    expect(screen.getByText('- Bad edge format')).toBeInTheDocument();
    expect(screen.getByText('- Disconnected node')).toBeInTheDocument();
  });
});
