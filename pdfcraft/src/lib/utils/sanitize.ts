/**
 * Filename sanitization utilities
 * Prevents path traversal and removes dangerous characters
 */

/**
 * Sanitize a filename to prevent path traversal and remove dangerous characters
 * @param filename - The filename to sanitize
 * @param fallback - Fallback name if filename becomes empty after sanitization
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string, fallback = 'download'): string {
  if (!filename || typeof filename !== 'string') {
    return fallback;
  }

  // Remove path traversal attempts
  let sanitized = filename
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .replace(/^\.+/, '');

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');

  // Remove characters that are problematic on various filesystems
  // Windows: < > : " | ? *
  // Unix: null byte (already removed)
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');

  // Trim whitespace and dots from start/end
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');

  // Limit length (255 is common max for most filesystems)
  if (sanitized.length > 200) {
    const ext = getExtension(sanitized);
    const name = sanitized.slice(0, 200 - ext.length - 1);
    sanitized = ext ? `${name}.${ext}` : name;
  }

  // Return fallback if empty
  return sanitized || fallback;
}

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Ensure filename has the expected extension
 * @param filename - The filename
 * @param expectedExt - Expected extension (without dot)
 * @returns Filename with correct extension
 */
export function ensureExtension(filename: string, expectedExt: string): string {
  const sanitized = sanitizeFilename(filename);
  const ext = getExtension(sanitized);
  
  if (ext === expectedExt.toLowerCase()) {
    return sanitized;
  }
  
  // Remove existing extension if different
  const baseName = ext ? sanitized.slice(0, -(ext.length + 1)) : sanitized;
  return `${baseName}.${expectedExt}`;
}
