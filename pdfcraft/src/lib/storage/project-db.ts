/**
 * Project Database Storage using IndexedDB
 * Requirements: 10.2
 * 
 * Saves and loads project state for resuming interrupted operations
 */

export interface ProjectState {
  id: string;
  name: string;
  toolId: string;
  toolName?: string;
  createdAt: string;
  updatedAt: string;
  status: 'in_progress' | 'paused' | 'completed';
  options: Record<string, unknown>;
  fileMetadata: ProjectFileMetadata[];
  progress: number;
}

export interface ProjectFileMetadata {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

const DB_NAME = 'pdfcraft_projects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

/**
 * Open the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('toolId', 'toolId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

/**
 * Generate a unique project ID using crypto API
 */
function generateProjectId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `project_${crypto.randomUUID()}`;
  }
  // Fallback for older browsers
  return `project_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Save a project to IndexedDB
 */
export async function saveProject(project: Omit<ProjectState, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectState> {
  const db = await openDatabase();
  
  const now = new Date().toISOString();
  const fullProject: ProjectState = {
    ...project,
    id: generateProjectId(),
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(fullProject);

    request.onsuccess = () => {
      resolve(fullProject);
    };

    request.onerror = () => {
      reject(new Error('Failed to save project'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Update an existing project
 */
export async function updateProject(id: string, updates: Partial<Omit<ProjectState, 'id' | 'createdAt'>>): Promise<ProjectState | null> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as ProjectState | undefined;
      if (!existing) {
        resolve(null);
        return;
      }

      const updated: ProjectState = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const putRequest = store.put(updated);
      putRequest.onsuccess = () => {
        resolve(updated);
      };
      putRequest.onerror = () => {
        reject(new Error('Failed to update project'));
      };
    };

    getRequest.onerror = () => {
      reject(new Error('Failed to get project'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Get a project by ID
 */
export async function getProject(id: string): Promise<ProjectState | null> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error('Failed to get project'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Get all projects
 */
export async function getAllProjects(): Promise<ProjectState[]> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const projects = request.result as ProjectState[];
      // Sort by updatedAt descending
      projects.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      resolve(projects);
    };

    request.onerror = () => {
      reject(new Error('Failed to get projects'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Get projects by tool ID
 */
export async function getProjectsByTool(toolId: string): Promise<ProjectState[]> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('toolId');
    const request = index.getAll(toolId);

    request.onsuccess = () => {
      const projects = request.result as ProjectState[];
      projects.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      resolve(projects);
    };

    request.onerror = () => {
      reject(new Error('Failed to get projects'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Get in-progress projects
 */
export async function getInProgressProjects(): Promise<ProjectState[]> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('in_progress');

    request.onsuccess = () => {
      const projects = request.result as ProjectState[];
      projects.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      resolve(projects);
    };

    request.onerror = () => {
      reject(new Error('Failed to get projects'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Delete a project
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('Failed to delete project'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Clear all projects
 */
export async function clearAllProjects(): Promise<void> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('Failed to clear projects'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.indexedDB;
}
