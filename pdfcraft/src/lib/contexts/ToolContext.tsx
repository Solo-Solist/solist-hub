/**
 * Tool Context
 * Provides current tool information to child components
 */

'use client';

import React, { createContext, useContext, ReactNode } from 'react';

export interface ToolContextValue {
  toolSlug: string;
  toolName: string;
}

const ToolContext = createContext<ToolContextValue | null>(null);

export interface ToolProviderProps {
  toolSlug: string;
  toolName: string;
  children: ReactNode;
}

export function ToolProvider({ toolSlug, toolName, children }: ToolProviderProps) {
  return (
    <ToolContext.Provider value={{ toolSlug, toolName }}>
      {children}
    </ToolContext.Provider>
  );
}

export function useToolContext(): ToolContextValue | null {
  return useContext(ToolContext);
}
