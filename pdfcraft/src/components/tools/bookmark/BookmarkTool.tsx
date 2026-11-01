'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { processBookmarks, BookmarkItem, BookmarkOptions } from '@/lib/pdf/processors/bookmark';
import type { ProcessOutput } from '@/types/pdf';

// Store pdfjs module reference
let pdfjsModule: typeof import('pdfjs-dist') | null = null;

// Load pdfjs module dynamically
const loadPdfjsLib = async () => {
  if (pdfjsModule) return pdfjsModule;

  const pdfjsLib = await import('pdfjs-dist');
  const { configurePdfjsWorker } = await import('@/lib/pdf/loader');

  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    configurePdfjsWorker(pdfjsLib);
  }

  pdfjsModule = pdfjsLib;
  return pdfjsLib;
};

export interface BookmarkToolProps {
  className?: string;
}

interface BookmarkNode {
  id: string;
  title: string;
  pageNumber: number;
  children: BookmarkNode[];
  color?: string;
  style?: 'bold' | 'italic' | 'bold-italic';
  isExpanded?: boolean;
}

/**
 * BookmarkTool Component - Visual Bookmark Editor
 * Provides a visual interface for editing PDF bookmarks with PDF preview
 */
export function BookmarkTool({ className = '' }: BookmarkToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools');

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Bookmark state
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [bookmarksCleared, setBookmarksCleared] = useState(false);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<BookmarkNode | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const lastCheckedIdRef = useRef<string | null>(null);

  // Processing state
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [isExtractingBookmarks, setIsExtractingBookmarks] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelledRef = useRef(false);

  // Load PDF and extract existing bookmarks
  const loadPdf = useCallback(async (pdfFile: File) => {
    try {
      const pdfjsLib = await loadPdfjsLib();
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;

      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);

      // Extract existing bookmarks automatically on load
      setIsExtractingBookmarks(true);
      try {
        const outline = await doc.getOutline();
        if (outline && outline.length > 0) {
          const extracted = await parseOutline(outline, doc);
          setBookmarks(extracted);
        }
      } catch (err) {
        console.warn('Failed to extract bookmarks:', err);
      }
      setIsExtractingBookmarks(false);

    } catch (err) {
      setError('Failed to load PDF file.');
      console.error(err);
    }
  }, []);

  // Manually extract bookmarks from the current PDF
  const handleExtractBookmarks = useCallback(async () => {
    if (!pdfDoc) return;

    if (bookmarks.length > 0) {
      if (!confirm(tTools('bookmark.replaceConfirm') || 'This will replace current bookmarks. Continue?')) {
        return;
      }
    }

    setIsExtractingBookmarks(true);
    try {
      const outline = await pdfDoc.getOutline();
      if (outline && outline.length > 0) {
        const extracted = await parseOutline(outline, pdfDoc);
        setBookmarks(extracted);
      } else {
        alert(tTools('bookmark.noBookmarksFound') || 'No bookmarks found in this PDF.');
      }
    } catch (err) {
      console.warn('Failed to extract bookmarks:', err);
      alert(tTools('bookmark.failedExtract') || 'Failed to extract bookmarks.');
    }
    setIsExtractingBookmarks(false);
  }, [pdfDoc, bookmarks, tTools]);

  // Parse PDF outline to bookmark nodes
  const parseOutline = async (
    outline: any[], // PDF.js outline structure
    doc: any
  ): Promise<BookmarkNode[]> => {
    const result: BookmarkNode[] = [];

    for (const item of outline) {
      let pageNumber = 1;

      // Get destination page
      if (item.dest) {
        try {
          const dest = typeof item.dest === 'string'
            ? await doc.getDestination(item.dest)
            : item.dest;
          if (dest && dest[0]) {
            const pageRef = dest[0];
            const pageIndex = await doc.getPageIndex(pageRef);
            pageNumber = pageIndex + 1;
          }
        } catch (e) {
          console.warn('Failed to get destination for bookmark:', item.title);
        }
      }

      // Handle style
      let style: 'bold' | 'italic' | 'bold-italic' | undefined = undefined;
      if (item.bold && item.italic) style = 'bold-italic';
      else if (item.bold) style = 'bold';
      else if (item.italic) style = 'italic';

      // Handle color (pdfjs color is [r, g, b] 0-255)
      let color: string | undefined = undefined;
      if (item.color && item.color.length === 3) {
        const r = item.color[0].toString(16).padStart(2, '0');
        const g = item.color[1].toString(16).padStart(2, '0');
        const b = item.color[2].toString(16).padStart(2, '0');
        color = `#${r}${g}${b}`;
      }

      const node: BookmarkNode = {
        id: `bm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: item.title || 'Untitled',
        pageNumber,
        children: [],
        color,
        style,
        isExpanded: true,
      };

      // Parse children recursively
      if (item.items && item.items.length > 0) {
        node.children = await parseOutline(item.items, doc);
      }

      result.push(node);
    }

    return result;
  };

  // Render current page to canvas
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Calculate scale to fit container (max 600px width)
      const containerWidth = 600;
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(containerWidth / viewport.width, 1.5);
      const scaledViewport = page.getViewport({ scale });

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
      }).promise;

    } catch (err) {
      console.error('Failed to render page:', err);
    }
  }, [pdfDoc]);

  // Render page when current page changes
  useEffect(() => {
    if (pdfDoc && currentPage > 0) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, renderPage]);

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      setError(null);
      setResult(null);
      setBookmarks([]);
      setBookmarksCleared(false);
      loadPdf(files[0]);
    }
  }, [loadPdf]);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setPdfDoc(null);
    setBookmarks([]);
    setBookmarksCleared(false);
    setResult(null);
    setError(null);
    setStatus('idle');
    setCurrentPage(1);
    setTotalPages(0);
  }, []);

  // Navigate to page when bookmark is clicked
  const handleBookmarkClick = useCallback((bookmark: BookmarkNode) => {
    setSelectedBookmarkId(bookmark.id);
    setCurrentPage(bookmark.pageNumber);
  }, []);

  // Add new bookmark at current page
  const handleAddBookmark = useCallback(() => {
    const newBookmark: BookmarkNode = {
      id: `bm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: `New Bookmark (Page ${currentPage})`,
      pageNumber: currentPage,
      children: [],
      isExpanded: true,
    };
    setBookmarks(prev => [...prev, newBookmark]);
    setEditingBookmark(newBookmark);
    setResult(null);
  }, [currentPage]);

  // Add child bookmark
  const handleAddChild = useCallback((parentId: string) => {
    const newChild: BookmarkNode = {
      id: `bm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: `New Bookmark (Page ${currentPage})`,
      pageNumber: currentPage,
      children: [],
      isExpanded: true,
    };

    const addChildTo = (nodes: BookmarkNode[]): BookmarkNode[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return { ...node, children: [...node.children, newChild], isExpanded: true };
        }
        return { ...node, children: addChildTo(node.children) };
      });
    };

    setBookmarks(prev => addChildTo(prev));
    setEditingBookmark(newChild);
    setResult(null);
  }, [currentPage]);

  // Delete bookmark
  const handleDeleteBookmark = useCallback((id: string) => {
    const removeFrom = (nodes: BookmarkNode[]): BookmarkNode[] => {
      return nodes
        .filter(node => node.id !== id)
        .map(node => ({ ...node, children: removeFrom(node.children) }));
    };

    const remaining = removeFrom(bookmarks);
    setBookmarks(remaining);
    if (remaining.length === 0) {
      setBookmarksCleared(true);
    }
    if (selectedBookmarkId === id) {
      setSelectedBookmarkId(null);
    }
    setResult(null);
  }, [bookmarks, selectedBookmarkId]);

  const handleRemoveAllBookmarks = useCallback(() => {
    if (bookmarks.length === 0) return;
    const confirmed = confirm(
      tTools('bookmark.removeAllConfirm') ||
        'Remove all bookmarks? You can still save to download a PDF with no bookmarks.'
    );
    if (!confirmed) return;

    setBookmarks([]);
    setSelectedBookmarkId(null);
    setEditingBookmark(null);
    setCheckedIds(new Set());
    setResult(null);
    setBookmarksCleared(true);
  }, [bookmarks.length, tTools]);

  const countChecked = (nodes: BookmarkNode[]): number =>
    nodes.reduce(
      (count, node) => count + (checkedIds.has(node.id) ? 1 : 0) + countChecked(node.children),
      0
    );
  const checkedCount = countChecked(bookmarks);

  // Shift+click checks or unchecks every visible bookmark between the last clicked one and this one
  const handleToggleChecked = useCallback((id: string, extendRange: boolean) => {
    const visibleIds: string[] = [];
    const collectVisible = (nodes: BookmarkNode[]) => {
      for (const node of nodes) {
        visibleIds.push(node.id);
        if (node.isExpanded) collectVisible(node.children);
      }
    };
    collectVisible(bookmarks);

    let idsToToggle = [id];
    const anchorIndex = lastCheckedIdRef.current ? visibleIds.indexOf(lastCheckedIdRef.current) : -1;
    const targetIndex = visibleIds.indexOf(id);
    if (extendRange && anchorIndex !== -1 && targetIndex !== -1) {
      const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      idsToToggle = visibleIds.slice(start, end + 1);
    }

    const shouldCheck = !checkedIds.has(id);
    const next = new Set(checkedIds);
    idsToToggle.forEach(toggleId => (shouldCheck ? next.add(toggleId) : next.delete(toggleId)));
    setCheckedIds(next);
    lastCheckedIdRef.current = id;
  }, [bookmarks, checkedIds]);

  const handleRemoveSelectedBookmarks = useCallback(() => {
    if (checkedCount === 0) return;
    const confirmed = confirm(
      tTools('bookmark.removeSelectedConfirm', { count: checkedCount }) ||
        `Remove ${checkedCount} selected bookmark(s)? Their child bookmarks will also be removed.`
    );
    if (!confirmed) return;

    const removeChecked = (nodes: BookmarkNode[]): BookmarkNode[] =>
      nodes
        .filter(node => !checkedIds.has(node.id))
        .map(node => ({ ...node, children: removeChecked(node.children) }));

    const remaining = removeChecked(bookmarks);
    setBookmarks(remaining);
    setCheckedIds(new Set());
    setSelectedBookmarkId(null);
    setEditingBookmark(null);
    setResult(null);
    if (remaining.length === 0) {
      setBookmarksCleared(true);
    }
  }, [bookmarks, checkedIds, checkedCount, tTools]);

  // Update bookmark
  const handleUpdateBookmark = useCallback((updated: BookmarkNode) => {
    // Ensure pageNumber is a valid number
    const pageNum = typeof updated.pageNumber === 'string' ? 1 : (updated.pageNumber || 1);
    const finalUpdate = { ...updated, pageNumber: pageNum };

    const updateIn = (nodes: BookmarkNode[]): BookmarkNode[] => {
      return nodes.map(node => {
        if (node.id === finalUpdate.id) {
          return { ...finalUpdate, children: node.children };
        }
        return { ...node, children: updateIn(node.children) };
      });
    };

    setBookmarks(prev => updateIn(prev));
    setEditingBookmark(null);
    setResult(null);
  }, []);

  // Toggle bookmark expansion
  const handleToggleExpand = useCallback((id: string) => {
    const toggleIn = (nodes: BookmarkNode[]): BookmarkNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, isExpanded: !node.isExpanded };
        }
        return { ...node, children: toggleIn(node.children) };
      });
    };

    setBookmarks(prev => toggleIn(prev));
  }, []);

  // Sort bookmarks by page number recursively, with title natural sort as fallback
  const handleSortBookmarks = useCallback(() => {
    const sortNodes = (nodes: BookmarkNode[]): BookmarkNode[] => {
      const sorted = [...nodes].sort((a, b) => {
        if (a.pageNumber !== b.pageNumber) {
          return a.pageNumber - b.pageNumber;
        }
        // Fallback to natural sort by title if on the same page
        return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
      });
      return sorted.map(node => ({
        ...node,
        children: sortNodes(node.children)
      }));
    };

    setBookmarks(prev => sortNodes(prev));
    setResult(null);
  }, []);

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedNodeId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedNodeId || draggedNodeId === targetId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const height = rect.height;

    // Logic to determine drop position
    if (mouseY < height * 0.25) {
      setDropPosition('before');
    } else if (mouseY > height * 0.75) {
      setDropPosition('after');
    } else {
      setDropPosition('inside');
    }
    setDragOverNodeId(targetId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedNodeId || !dropPosition || draggedNodeId === targetId) {
      setDraggedNodeId(null);
      setDragOverNodeId(null);
      setDropPosition(null);
      return;
    }

    handleMoveNode(draggedNodeId, targetId, dropPosition);
    setDraggedNodeId(null);
    setDragOverNodeId(null);
    setDropPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedNodeId(null);
    setDragOverNodeId(null);
    setDropPosition(null);
  };

  const handleMoveNode = useCallback((sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    setBookmarks(prev => {
      let sourceNode: BookmarkNode | null = null;

      // 1. Recursive removal of source node
      const removeNode = (nodes: BookmarkNode[]): BookmarkNode[] => {
        return nodes.filter(node => {
          if (node.id === sourceId) {
            sourceNode = { ...node };
            return false;
          }
          if (node.children && node.children.length > 0) {
            node.children = removeNode(node.children);
          }
          return true;
        });
      };

      // Create a deep copy to avoid mutations
      const nodesWithoutSource = removeNode(JSON.parse(JSON.stringify(prev)));
      if (!sourceNode) return prev;

      // 2. Recursive insertion at target
      const insertNode = (nodes: BookmarkNode[]): BookmarkNode[] => {
        const targetIndex = nodes.findIndex(node => node.id === targetId);
        if (targetIndex !== -1) {
          const result = [...nodes];
          if (position === 'before') {
            result.splice(targetIndex, 0, sourceNode!);
          } else if (position === 'after') {
            result.splice(targetIndex + 1, 0, sourceNode!);
          } else if (position === 'inside') {
            result[targetIndex] = {
              ...result[targetIndex],
              children: [...result[targetIndex].children, sourceNode!],
              isExpanded: true
            };
          }
          return result;
        }

        return nodes.map(node => {
          if (node.children && node.children.length > 0) {
            return { ...node, children: insertNode(node.children) };
          }
          return node;
        });
      };

      return insertNode(nodesWithoutSource);
    });
    setResult(null);
  }, []);

  // Convert BookmarkNode[] to BookmarkItem[] for processor
  const convertToBookmarkItems = (nodes: BookmarkNode[]): BookmarkItem[] => {
    return nodes.map(node => ({
      id: node.id,
      title: node.title,
      pageNumber: node.pageNumber,
      color: node.color,
      style: node.style,
      children: node.children.length > 0 ? convertToBookmarkItems(node.children) : undefined,
    }));
  };

  // Process and save bookmarks
  const handleProcess = useCallback(async () => {
    if (!file || (bookmarks.length === 0 && !bookmarksCleared)) return;

    cancelledRef.current = false;
    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const options: BookmarkOptions = {
        action: 'add', // Use 'add' to replace all bookmarks
        bookmarks: convertToBookmarkItems(bookmarks),
      };

      const output: ProcessOutput = await processBookmarks(
        file,
        options,
        (prog) => {
          if (!cancelledRef.current) {
            setProgress(prog);
          }
        }
      );

      if (output.success && output.result) {
        setResult(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to process bookmarks.');
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setStatus('error');
    }
  }, [file, bookmarks, bookmarksCleared]);

  const isProcessing = status === 'processing';

  // Render bookmark tree item
  const renderBookmarkItem = (bookmark: BookmarkNode, depth: number = 0) => {
    const isSelected = selectedBookmarkId === bookmark.id;
    const isEditing = editingBookmark?.id === bookmark.id;

    return (
      <div key={bookmark.id} style={{ marginLeft: depth * 16 }}>
        <div
          draggable={true}
          onDragStart={(e) => handleDragStart(e, bookmark.id)}
          onDragOver={(e) => handleDragOver(e, bookmark.id)}
          onDrop={(e) => handleDrop(e, bookmark.id)}
          onDragEnd={handleDragEnd}
          className={`group flex items-center gap-2 p-2 rounded cursor-pointer transition-all border ${
            isSelected ? 'bg-blue-100 border-blue-300' : 'border-transparent hover:bg-gray-50'
          } ${
            dragOverNodeId === bookmark.id && dropPosition === 'inside' ? 'bg-blue-50 border-blue-300 border-dashed' : ''
          } ${
            dragOverNodeId === bookmark.id && dropPosition === 'before' ? 'border-t-blue-500' : ''
          } ${
            dragOverNodeId === bookmark.id && dropPosition === 'after' ? 'border-b-blue-500' : ''
          } ${
            draggedNodeId === bookmark.id ? 'opacity-30' : ''
          }`}
          onClick={() => handleBookmarkClick(bookmark)}
        >
          <input
            type="checkbox"
            checked={checkedIds.has(bookmark.id)}
            readOnly
            onClick={(e) => { e.stopPropagation(); handleToggleChecked(bookmark.id, e.shiftKey); }}
            className="flex-shrink-0 w-4 h-4 cursor-pointer accent-blue-600"
            aria-label={tTools('bookmark.selectForRemoval', { title: bookmark.title }) || `Select ${bookmark.title}`}
          />

          {/* Drag Handle */}
          <div className="flex-shrink-0 text-gray-400 cursor-grab active:cursor-grabbing">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="8" r="1.5" /><circle cx="15" cy="8" r="1.5" />
              <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="16" r="1.5" /><circle cx="15" cy="16" r="1.5" />
            </svg>
          </div>

          {/* Expand/collapse toggle */}
          {bookmark.children.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleExpand(bookmark.id); }}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700"
            >
              {bookmark.isExpanded ? '▼' : '▶'}
            </button>
          )}
          {bookmark.children.length === 0 && <span className="w-5" />}

          {/* Bookmark content */}
          {isEditing ? (
            <div className="flex-1 flex flex-col gap-2 p-2 bg-gray-50 rounded border border-blue-200" onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">{tTools('bookmark.title') || 'Title'}</label>
                  <input
                    type="text"
                    value={editingBookmark.title}
                    onChange={(e) => setEditingBookmark({ ...editingBookmark, title: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-sm"
                    placeholder={tTools('bookmark.title') || 'Title'}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">{tTools('bookmark.page') || 'Page'}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingBookmark.pageNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^\d*$/.test(val)) {
                          setEditingBookmark({ 
                            ...editingBookmark, 
                            pageNumber: val === '' ? '' : Math.min(totalPages, parseInt(val)) 
                          } as any);
                        }
                      }}
                      className="w-14 px-2 py-1 border rounded text-sm h-8"
                      placeholder="1"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingBookmark({ ...editingBookmark, pageNumber: currentPage })}
                      className="p-1 text-blue-500 hover:text-blue-700 bg-white border rounded h-8 w-8 flex items-center justify-center transition-colors"
                      title={tTools('bookmark.setToCurrentPage') || 'Set to current page'}
                    >
                      📍
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0">
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">{tTools('bookmark.color') || 'Color'}</label>
                  <input
                    type="color"
                    value={editingBookmark.color || '#000000'}
                    onChange={(e) => setEditingBookmark({ ...editingBookmark, color: e.target.value })}
                    className="w-10 h-8 p-0 border rounded cursor-pointer"
                    title={tTools('bookmark.color') || 'Color'}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">{tTools('bookmark.style') || 'Style'}</label>
                  <select
                    value={editingBookmark.style || ''}
                    onChange={(e) => setEditingBookmark({ ...editingBookmark, style: e.target.value as any || undefined })}
                    className="w-full px-2 py-1 border rounded text-sm h-8"
                  >
                    <option value="">{tTools('bookmark.normal') || 'Normal'}</option>
                    <option value="bold">{tTools('bookmark.bold') || 'Bold'}</option>
                    <option value="italic">{tTools('bookmark.italic') || 'Italic'}</option>
                    <option value="bold-italic">{tTools('bookmark.boldItalic') || 'Bold & Italic'}</option>
                  </select>
                </div>
                <div className="flex gap-1 self-end mb-0.5">
                  <Button size="sm" onClick={() => handleUpdateBookmark(editingBookmark)} title={t('buttons.save') || 'Save'}>✓</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingBookmark(null)} title={t('buttons.cancel') || 'Cancel'}>✕</Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <span 
                className={`flex-1 text-sm truncate ${
                  bookmark.style === 'bold' ? 'font-bold' : 
                  bookmark.style === 'italic' ? 'italic' : 
                  bookmark.style === 'bold-italic' ? 'font-bold italic' : ''
                }`}
                style={{ color: bookmark.color }}
              >
                {bookmark.title}
              </span>
              <span className="text-xs text-gray-500">p.{bookmark.pageNumber}</span>

              {/* Actions */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100" style={{ opacity: isSelected ? 1 : undefined }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingBookmark(bookmark); }}
                  className="p-1 text-gray-400 hover:text-blue-500"
                  title="Edit"
                >
                  ✎
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleAddChild(bookmark.id); }}
                  className="p-1 text-gray-400 hover:text-green-500"
                  title="Add child"
                >
                  +
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteBookmark(bookmark.id); }}
                  className="p-1 text-gray-400 hover:text-red-500"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </>
          )}
        </div>

        {/* Render children */}
        {bookmark.isExpanded && bookmark.children.length > 0 && (
          <div className="border-l border-gray-200 ml-2">
            {bookmark.children.map(child => renderBookmarkItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={setError}
          disabled={isProcessing}
          label={tTools('bookmark.uploadLabel') || 'Upload PDF File'}
          description={tTools('bookmark.uploadDescription') || 'Drag and drop a PDF file to edit bookmarks.'}
        />
      )}

      {error && (
        <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {file && pdfDoc && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* PDF Preview Panel */}
          <Card variant="outlined" size="lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">{tTools('bookmark.pdfPreview') || 'PDF Preview'}</h3>
              <Button variant="ghost" size="sm" onClick={handleClearFile}>
                {t('buttons.close') || 'Close'}
              </Button>
            </div>

            {/* Page navigation */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                ← {t('buttons.back') || 'Prev'}
              </Button>
              <span className="text-sm">
                Page {currentPage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                {t('buttons.next') || 'Next'} →
              </Button>
            </div>

            {/* Canvas */}
            <div className="flex justify-center bg-gray-100 rounded p-4 overflow-auto max-h-[600px]">
              <canvas ref={canvasRef} className="shadow-lg" />
            </div>
          </Card>

          {/* Bookmark Editor Panel */}
          <Card variant="outlined" size="lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">{tTools('bookmark.bookmarksTitle') || 'Bookmarks'}</h3>
              <div className="flex flex-wrap justify-end gap-1">
                {checkedCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveSelectedBookmarks}
                    disabled={isProcessing}
                    className="text-red-600 hover:text-red-700"
                  >
                    {tTools('bookmark.removeSelected', { count: checkedCount }) || `Remove selected (${checkedCount})`}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveAllBookmarks}
                  disabled={bookmarks.length === 0 || isProcessing}
                  className="text-red-600 hover:text-red-700"
                >
                  {tTools('bookmark.removeAll') || 'Remove all'}
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={handleExtractBookmarks}
                  title={tTools('bookmark.extractExisting') || 'Extract Existing Bookmarks'}
                >
                  📥 {tTools('bookmark.extractExisting') || 'Extract'}
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={handleSortBookmarks}
                  title={tTools('bookmark.sortByPage') || 'Sort by page number'}
                  disabled={bookmarks.length === 0}
                >
                  ↑↓ {tTools('bookmark.sort') || 'Sort'}
                </Button>
                <Button variant="primary" size="sm" onClick={handleAddBookmark}>
                  + {tTools('bookmark.addBookmark') || 'Add Bookmark'}
                </Button>
              </div>
            </div>

            {isExtractingBookmarks && (
              <p className="text-sm text-gray-500 mb-4">{tTools('bookmark.extracting') || 'Extracting existing bookmarks...'}</p>
            )}

            {/* Bookmark list */}
            <div className="border rounded max-h-[500px] overflow-y-auto">
              {bookmarks.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>
                    {bookmarksCleared
                      ? (tTools('bookmark.removedAllHint') || 'All bookmarks removed. Save to download a PDF with no bookmarks.')
                      : (tTools('bookmark.noBookmarks') || 'No bookmarks yet. Click "Add Bookmark" to create one.')}
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {bookmarks.map(bookmark => renderBookmarkItem(bookmark))}
                </div>
              )}
            </div>

            {/* Hint */}
            <div className="mt-2 space-y-1">
              <p className="text-xs text-gray-500">
                {tTools('bookmark.hint') || 'Click a bookmark to preview its page. Use +/✎/× to add child, edit, or delete.'}
              </p>
              <p className="text-xs text-gray-500">
                {tTools('bookmark.selectHint') || 'Tick checkboxes to remove several bookmarks at once. Shift+click selects a range.'}
              </p>
              <p className="text-xs text-blue-500 font-medium">
                {tTools('bookmark.dragHint') || 'Drag and drop to reorder bookmarks.'}
              </p>
            </div>
          </Card>
        </div>
      )}

      {isProcessing && (
        <ProcessingProgress
          progress={progress}
          status={status}
          onCancel={() => { cancelledRef.current = true; setStatus('idle'); }}
          showPercentage
        />
      )}

      {file && (bookmarks.length > 0 || bookmarksCleared) && (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="primary"
            size="lg"
            onClick={handleProcess}
            disabled={isProcessing}
            loading={isProcessing}
          >
            {isProcessing
              ? (t('status.processing') || 'Processing...')
              : (tTools('bookmark.saveButton') || 'Save Bookmarks')}
          </Button>

          {result && (
            <DownloadButton
              file={result}
              filename={file.name.replace('.pdf', '_bookmarked.pdf')}
              variant="secondary"
              size="lg"
              showFileSize
            />
          )}
        </div>
      )}

      {status === 'complete' && result && (
        <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700">
          <p className="text-sm font-medium">
            {tTools('bookmark.successMessage') || 'Bookmarks saved successfully!'}
          </p>
        </div>
      )}
    </div>
  );
}

export default BookmarkTool;
