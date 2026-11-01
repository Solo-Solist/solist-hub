/**
 * HTML Sanitization utilities
 * Prevents XSS attacks when rendering user-generated HTML content
 */

// Allowed HTML tags for safe rendering
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'pre', 'code',
  'hr', 'sub', 'sup', 'mark',
]);

// Allowed attributes per tag
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['class', 'id', 'style']),
  'a': new Set(['href', 'title', 'target', 'rel']),
  'img': new Set(['src', 'alt', 'width', 'height']),
  'td': new Set(['colspan', 'rowspan']),
  'th': new Set(['colspan', 'rowspan', 'scope']),
};

// Dangerous URL protocols
const DANGEROUS_PROTOCOLS = ['javascript:', 'data:', 'vbscript:'];

/**
 * Check if a URL is safe
 */
function isSafeUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase().trim();
  return !DANGEROUS_PROTOCOLS.some(proto => lowerUrl.startsWith(proto));
}

/**
 * Sanitize HTML string to prevent XSS
 * 
 * Uses a regex-based approach that works consistently on both 
 * server and client to avoid React hydration mismatches.
 */
export function sanitizeHtml(html: string): string {
  // Process the HTML: keep allowed tags with allowed attributes, strip the rest
  let result = html;

  // Step 1: Replace disallowed tags but keep their content
  // Match any HTML tag
  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tagName) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return ''; // Strip disallowed tags
    }

    // For allowed tags, rebuild with only allowed attributes
    const isClosing = match.startsWith('</');
    const isSelfClosing = match.endsWith('/>');

    if (isClosing) {
      return `</${tag}>`;
    }

    // Extract and filter attributes
    const attrString = match.replace(/^<[a-zA-Z][a-zA-Z0-9]*\s*/, '').replace(/\/?>$/, '');
    const globalAttrs = ALLOWED_ATTRS['*'];
    const tagAttrs = ALLOWED_ATTRS[tag] || new Set<string>();

    const cleanAttrs: string[] = [];
    // Match attribute patterns: name="value", name='value', name=value, or just name
    const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

      if (globalAttrs.has(attrName) || tagAttrs.has(attrName)) {
        // Validate URLs
        if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(attrValue)) {
          continue;
        }
        cleanAttrs.push(`${attrName}="${attrValue.replace(/"/g, '&quot;')}"`);
        // Force safe link behavior
        if (attrName === 'href' && tag === 'a') {
          cleanAttrs.push('rel="noopener noreferrer"');
        }
      }
    }

    const attrs = cleanAttrs.length > 0 ? ' ' + cleanAttrs.join(' ') : '';
    return isSelfClosing ? `<${tag}${attrs} />` : `<${tag}${attrs}>`;
  });

  // Step 2: Remove dangerous script/event content that might have been in text
  result = result.replace(/on[a-zA-Z]+\s*=\s*["'][^"']*["']/gi, '');

  return result;
}

/**
 * Escape HTML entities for safe text display
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}
