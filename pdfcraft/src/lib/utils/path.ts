/**
 * Utility to handle basePath for subpath deployments.
 * Next.js handles basePath for Link and Image, but manual fetch calls need this.
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * Prepends the basePath to a given path if it's not already absolute.
 */
export function withBasePath(path: string): string {
  if (!basePath) return path;
  if (path.startsWith('http') || path.startsWith('//')) return path;
  
  // Ensure path starts with a slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Prevent double slashes
  const cleanBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  
  return `${cleanBasePath}${normalizedPath}`;
}

export function getBasePath(): string {
  return basePath;
}
