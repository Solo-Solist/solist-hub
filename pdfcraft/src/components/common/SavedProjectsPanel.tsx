/**
 * SavedProjectsPanel Component
 * Requirements: 10.2
 * 
 * Displays saved projects and allows resuming interrupted operations
 */

'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { FolderOpen, Trash2, Play, Pause, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useProjectStorage } from '@/lib/hooks/useProjectStorage';
import { formatDate } from '@/lib/storage/recent-files';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { type Locale } from '@/lib/i18n/config';

export interface SavedProjectsPanelProps {
  locale: Locale;
  toolId?: string;
  translations: {
    title: string;
    empty: string;
    clearAll: string;
    resume: string;
    delete: string;
    inProgress: string;
    paused: string;
    completed: string;
    progress: string;
    files: string;
  };
  onResumeProject?: (projectId: string) => void;
}

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'in_progress':
      return <Clock className="h-4 w-4 text-blue-500" aria-hidden="true" />;
    case 'paused':
      return <Pause className="h-4 w-4 text-yellow-500" aria-hidden="true" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-500" aria-hidden="true" />;
  }
};

export const SavedProjectsPanel: React.FC<SavedProjectsPanelProps> = ({
  locale,
  toolId,
  translations,
  onResumeProject,
}) => {
  const { projects, isLoading, isAvailable, removeProject, clearProjects } = useProjectStorage();
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Focus item when focusedIndex changes
  useEffect(() => {
    if (focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      const firstFocusable = itemRefs.current[focusedIndex]?.querySelector<HTMLElement>(
        'a[href], button:not([disabled])'
      );
      firstFocusable?.focus();
    }
  }, [focusedIndex]);

  const handleItemKeyDown = useCallback((event: React.KeyboardEvent, index: number, totalItems: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        break;
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedIndex(totalItems - 1);
        break;
    }
  }, []);

  if (!isAvailable) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-[hsl(var(--color-muted))] rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-[hsl(var(--color-muted))] rounded"></div>
              <div className="h-4 bg-[hsl(var(--color-muted))] rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Filter projects by tool if toolId is provided
  const filteredProjects = toolId
    ? projects.filter((p) => p.toolId === toolId)
    : projects;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in_progress':
        return translations.inProgress;
      case 'paused':
        return translations.paused;
      case 'completed':
        return translations.completed;
      default:
        return status;
    }
  };

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-[hsl(var(--color-primary))]" aria-hidden="true" />
          <h3 className="font-medium text-[hsl(var(--color-foreground))]">
            {translations.title}
          </h3>
        </div>
        {filteredProjects.length > 0 && (
          <button
            onClick={() => clearProjects()}
            className="text-xs text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-destructive))] transition-colors flex items-center gap-1"
            aria-label={translations.clearAll}
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            {translations.clearAll}
          </button>
        )}
      </div>

      {/* Content */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-6 text-sm text-[hsl(var(--color-muted-foreground))]">
          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
          {translations.empty}
        </div>
      ) : (
        <ul className="space-y-3" role="list" aria-label={translations.title}>
          {filteredProjects.map((project, index) => (
            <li
              key={project.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              className="group p-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-primary))] focus-within:border-[hsl(var(--color-primary))] transition-colors"
              onKeyDown={(e) => handleItemKeyDown(e, index, filteredProjects.length)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={project.status} />
                    <span className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate">
                      {project.name}
                    </span>
                  </div>
                  
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--color-muted-foreground))]">
                    <span>{getStatusLabel(project.status)}</span>
                    <span>•</span>
                    <span>{formatDate(project.updatedAt)}</span>
                    {project.fileMetadata.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{project.fileMetadata.length} {translations.files}</span>
                      </>
                    )}
                  </div>

                  {project.progress > 0 && project.progress < 100 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-[hsl(var(--color-muted-foreground))] mb-1">
                        <span>{translations.progress}</span>
                        <span>{project.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-[hsl(var(--color-muted))] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[hsl(var(--color-primary))] transition-all"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {project.status !== 'completed' && (
                    <Link href={`/${locale}/tools/${project.toolId}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onResumeProject?.(project.id)}
                        aria-label={translations.resume}
                      >
                        <Play className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeProject(project.id)}
                    aria-label={translations.delete}
                    className="text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-destructive))]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default SavedProjectsPanel;
