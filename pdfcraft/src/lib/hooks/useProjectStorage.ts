/**
 * useProjectStorage Hook
 * Requirements: 10.2
 * 
 * React hook for managing project save/load with IndexedDB
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  type ProjectState,
  type ProjectFileMetadata,
  saveProject,
  updateProject,
  getProject,
  getAllProjects,
  getProjectsByTool,
  getInProgressProjects,
  deleteProject,
  clearAllProjects,
  isIndexedDBAvailable,
} from '@/lib/storage/project-db';
import { logger } from '@/lib/utils/logger';

export interface UseProjectStorageReturn {
  projects: ProjectState[];
  currentProject: ProjectState | null;
  isLoading: boolean;
  isAvailable: boolean;
  error: string | null;
  
  // Actions
  createProject: (
    name: string,
    toolId: string,
    toolName?: string,
    options?: Record<string, unknown>,
    fileMetadata?: ProjectFileMetadata[]
  ) => Promise<ProjectState | null>;
  loadProject: (id: string) => Promise<ProjectState | null>;
  saveCurrentProject: (updates: Partial<Omit<ProjectState, 'id' | 'createdAt'>>) => Promise<void>;
  pauseProject: () => Promise<void>;
  completeProject: () => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  clearProjects: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  getToolProjects: (toolId: string) => Promise<ProjectState[]>;
  getIncompleteProjects: () => Promise<ProjectState[]>;
}

export function useProjectStorage(): UseProjectStorageReturn {
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check availability and load projects on mount
  useEffect(() => {
    const init = async () => {
      const available = isIndexedDBAvailable();
      setIsAvailable(available);
      
      if (available) {
        try {
          const allProjects = await getAllProjects();
          setProjects(allProjects);
        } catch (err) {
          setError('Failed to load projects');
          logger.error('Failed to load projects:', err);
        }
      }
      
      setIsLoading(false);
    };

    init();
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!isAvailable) return;
    
    try {
      const allProjects = await getAllProjects();
      setProjects(allProjects);
      setError(null);
    } catch (err) {
      setError('Failed to refresh projects');
      logger.error('Failed to refresh projects:', err);
    }
  }, [isAvailable]);

  const createProject = useCallback(async (
    name: string,
    toolId: string,
    toolName?: string,
    options: Record<string, unknown> = {},
    fileMetadata: ProjectFileMetadata[] = []
  ): Promise<ProjectState | null> => {
    if (!isAvailable) return null;
    
    try {
      const project = await saveProject({
        name,
        toolId,
        toolName,
        status: 'in_progress',
        options,
        fileMetadata,
        progress: 0,
      });
      
      setCurrentProject(project);
      await refreshProjects();
      setError(null);
      return project;
    } catch (err) {
      setError('Failed to create project');
      logger.error('Failed to create project:', err);
      return null;
    }
  }, [isAvailable, refreshProjects]);

  const loadProject = useCallback(async (id: string): Promise<ProjectState | null> => {
    if (!isAvailable) return null;
    
    try {
      const project = await getProject(id);
      if (project) {
        setCurrentProject(project);
        setError(null);
      }
      return project;
    } catch (err) {
      setError('Failed to load project');
      logger.error('Failed to load project:', err);
      return null;
    }
  }, [isAvailable]);

  const saveCurrentProject = useCallback(async (
    updates: Partial<Omit<ProjectState, 'id' | 'createdAt'>>
  ): Promise<void> => {
    if (!isAvailable || !currentProject) return;
    
    try {
      const updated = await updateProject(currentProject.id, updates);
      if (updated) {
        setCurrentProject(updated);
        await refreshProjects();
      }
      setError(null);
    } catch (err) {
      setError('Failed to save project');
      logger.error('Failed to save project:', err);
    }
  }, [isAvailable, currentProject, refreshProjects]);

  const pauseProject = useCallback(async (): Promise<void> => {
    if (!currentProject) return;
    await saveCurrentProject({ status: 'paused' });
  }, [currentProject, saveCurrentProject]);

  const completeProject = useCallback(async (): Promise<void> => {
    if (!currentProject) return;
    await saveCurrentProject({ status: 'completed', progress: 100 });
    setCurrentProject(null);
  }, [currentProject, saveCurrentProject]);

  const removeProject = useCallback(async (id: string): Promise<void> => {
    if (!isAvailable) return;
    
    try {
      await deleteProject(id);
      if (currentProject?.id === id) {
        setCurrentProject(null);
      }
      await refreshProjects();
      setError(null);
    } catch (err) {
      setError('Failed to delete project');
      logger.error('Failed to delete project:', err);
    }
  }, [isAvailable, currentProject, refreshProjects]);

  const clearProjects = useCallback(async (): Promise<void> => {
    if (!isAvailable) return;
    
    try {
      await clearAllProjects();
      setProjects([]);
      setCurrentProject(null);
      setError(null);
    } catch (err) {
      setError('Failed to clear projects');
      logger.error('Failed to clear projects:', err);
    }
  }, [isAvailable]);

  const getToolProjects = useCallback(async (toolId: string): Promise<ProjectState[]> => {
    if (!isAvailable) return [];
    
    try {
      return await getProjectsByTool(toolId);
    } catch (err) {
      logger.error('Failed to get tool projects:', err);
      return [];
    }
  }, [isAvailable]);

  const getIncompleteProjects = useCallback(async (): Promise<ProjectState[]> => {
    if (!isAvailable) return [];
    
    try {
      return await getInProgressProjects();
    } catch (err) {
      logger.error('Failed to get incomplete projects:', err);
      return [];
    }
  }, [isAvailable]);

  return {
    projects,
    currentProject,
    isLoading,
    isAvailable,
    error,
    createProject,
    loadProject,
    saveCurrentProject,
    pauseProject,
    completeProject,
    removeProject,
    clearProjects,
    refreshProjects,
    getToolProjects,
    getIncompleteProjects,
  };
}
