/**
 * PDF Processing Module
 * Requirements: 1.4, 5.1, 5.5, 5.6
 * 
 * Main entry point for PDF processing functionality.
 */

// Configuration
export * from './config';

// Library loader
export {
  loadPdfLib,
  loadPdfjs,
  loadPdfDocument,
  createPdfDocument,
  isLibraryLoaded,
  preloadLibraries,
  getLibraryStatus,
} from './loader';

// Base processor
export { BasePDFProcessor, createPDFError } from './processor';

// Validation utilities
export {
  validateFile,
  validatePdfStructure,
  checkPdfEncryption,
  formatFileSize,
  getFileExtension,
  isPdfFile,
  isImageFile,
  type FileValidationOptions,
} from './validation';

// Error handling
export {
  ERROR_MESSAGE_KEYS,
  DEFAULT_ERROR_MESSAGES,
  ERROR_SUGGESTED_ACTIONS,
  createError,
  isRecoverable,
  getErrorSeverity,
  toPDFError,
  isPDFError,
  getAllErrorCodes,
  isValidErrorCode,
} from './errors';

// Processors
export {
  MergePDFProcessor,
  createMergeProcessor,
  mergePDFs,
  SplitPDFProcessor,
  createSplitProcessor,
  splitPDF,
  parsePageRanges,
  createSplitEveryNPages,
  createSplitEveryPage,
  createSplitByEvenOdd,
  createSplitNTimes,
  createSplitByBookmarks,
  type BookmarkInfo,
  OrganizePDFProcessor,
  createOrganizeProcessor,
  organizePDF,
  type OrganizeOptions,
  AlternateMergePDFProcessor,
  createAlternateMergeProcessor,
  alternateMergePDFs,
  type AlternateMergeOptions,
} from './processors';
