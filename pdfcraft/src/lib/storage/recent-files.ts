/**
 * Recent Files Storage
 * Requirements: 10.4
 * 
 * Stores and retrieves recent file history from localStorage
 */

export interface RecentFile {
  id: string;
  name: string;
  size: number;
  processedAt: string; // ISO date string for serialization
  toolUsed: string;
  toolName?: string;
}

const STORAGE_KEY = 'pdfcraft_recent_files';
const MAX_RECENT_FILES = 10;

/**
 * Generate a unique ID for a file entry
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all recent files from localStorage
 */
export function getRecentFiles(): RecentFile[] {
  if (!isLocalStorageAvailable()) return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const files = JSON.parse(stored) as RecentFile[];
    return Array.isArray(files) ? files : [];
  } catch {
    return [];
  }
}

/**
 * Add a file to recent files history
 */
export function addRecentFile(
  name: string,
  size: number,
  toolUsed: string,
  toolName?: string
): RecentFile {
  const newFile: RecentFile = {
    id: generateId(),
    name,
    size,
    processedAt: new Date().toISOString(),
    toolUsed,
    toolName,
  };
  
  if (!isLocalStorageAvailable()) return newFile;
  
  try {
    const files = getRecentFiles();
    
    // Remove duplicate entries with same name and tool
    const filtered = files.filter(
      (f) => !(f.name === name && f.toolUsed === toolUsed)
    );
    
    // Add new file at the beginning
    const updated = [newFile, ...filtered].slice(0, MAX_RECENT_FILES);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newFile;
  } catch {
    return newFile;
  }
}

/**
 * Remove a file from recent files history
 */
export function removeRecentFile(id: string): void {
  if (!isLocalStorageAvailable()) return;
  
  try {
    const files = getRecentFiles();
    const updated = files.filter((f) => f.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail
  }
}

/**
 * Clear all recent files history
 */
export function clearRecentFiles(): void {
  if (!isLocalStorageAvailable()) return;
  
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * Format date for display
 */
export function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}
