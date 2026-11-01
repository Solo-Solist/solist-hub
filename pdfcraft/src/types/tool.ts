/**
 * Tool category types - 6 defined categories
 */
export type ToolCategory =
  | 'edit-annotate'
  | 'convert-to-pdf'
  | 'convert-from-pdf'
  | 'organize-manage'
  | 'optimize-repair'
  | 'secure-pdf';

/**
 * All valid tool categories as an array for validation
 */
export const TOOL_CATEGORIES: ToolCategory[] = [
  'edit-annotate',
  'convert-to-pdf',
  'convert-from-pdf',
  'organize-manage',
  'optimize-repair',
  'secure-pdf',
];

/**
 * Category display information
 */
export interface CategoryInfo {
  id: ToolCategory;
  name: string;
  description: string;
  icon: string;
}

/**
 * Category metadata for display
 */
export const CATEGORY_INFO: Record<ToolCategory, CategoryInfo> = {
  'edit-annotate': {
    id: 'edit-annotate',
    name: 'Edit & Annotate',
    description: 'Edit, annotate, and modify PDF content',
    icon: 'edit',
  },
  'convert-to-pdf': {
    id: 'convert-to-pdf',
    name: 'Convert to PDF',
    description: 'Convert various formats to PDF',
    icon: 'file-plus',
  },
  'convert-from-pdf': {
    id: 'convert-from-pdf',
    name: 'Convert from PDF',
    description: 'Convert PDF to other formats',
    icon: 'file-output',
  },
  'organize-manage': {
    id: 'organize-manage',
    name: 'Organize & Manage',
    description: 'Organize, merge, split, and manage PDF pages',
    icon: 'folder',
  },
  'optimize-repair': {
    id: 'optimize-repair',
    name: 'Optimize & Repair',
    description: 'Compress, optimize, and repair PDF files',
    icon: 'wrench',
  },
  'secure-pdf': {
    id: 'secure-pdf',
    name: 'Secure PDF',
    description: 'Encrypt, decrypt, and secure PDF files',
    icon: 'shield',
  },
};

/**
 * Tool definition interface
 */
export interface Tool {
  /** Unique identifier, e.g., 'merge-pdf' */
  id: string;
  /** URL path slug, e.g., 'merge-pdf' */
  slug: string;
  /** Lucide icon name */
  icon: string;
  /** Primary tool category */
  category: ToolCategory;
  /** Accepted input file formats */
  acceptedFormats: string[];
  /** Output file format */
  outputFormat: string;
  /** Maximum file size in bytes */
  maxFileSize: number;
  /** Maximum number of files allowed */
  maxFiles: number;
  /** Feature list for the tool */
  features: string[];
  /** Related tool IDs (minimum 2 required per Requirements 6.5) */
  relatedTools: string[];
  /** Whether the tool is disabled (hidden from UI) */
  disabled?: boolean;
}

/**
 * How-to step for tool usage guide
 */
export interface HowToStep {
  step: number;
  title: string;
  description: string;
  image?: string;
}

/**
 * Use case scenario
 */
export interface UseCase {
  title: string;
  description: string;
  icon: string;
}

/**
 * FAQ item
 */
export interface FAQ {
  question: string;
  answer: string;
}

/**
 * Tool content for SEO and documentation
 */
export interface ToolContent {
  title: string;
  metaDescription: string;
  keywords: string[];
  description: string;
  howToUse: HowToStep[];
  useCases: UseCase[];
  faq: FAQ[];
}

/**
 * Processing status
 */
export type ProcessingStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

/**
 * Processing state
 */
export interface ProcessingState {
  status: ProcessingStatus;
  progress: number;
  currentStep: string;
  error: string | null;
}
