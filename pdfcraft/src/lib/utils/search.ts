/**
 * Tool search functionality with fuzzy matching
 * Implements Requirements 6.2: instant search results with fuzzy matching
 */

import { Tool } from '@/types/tool';
import { tools } from '@/config/tools';

/**
 * Search result with relevance score
 */
export interface SearchResult {
  tool: Tool;
  score: number;
  matchedField: 'name' | 'description' | 'features';
}

/**
 * Calculate fuzzy match score between query and text
 * Returns a score between 0 and 1, where 1 is a perfect match
 */
export function fuzzyMatch(query: string, text: string): number {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedText = text.toLowerCase();

  // Empty query matches nothing
  if (!normalizedQuery) {
    return 0;
  }

  // Exact match gets highest score
  if (normalizedText === normalizedQuery) {
    return 1;
  }

  // Contains exact query as substring
  if (normalizedText.includes(normalizedQuery)) {
    // Score based on position and length ratio
    const position = normalizedText.indexOf(normalizedQuery);
    const lengthRatio = normalizedQuery.length / normalizedText.length;
    // Earlier position and higher length ratio = better score
    const positionScore = 1 - position / normalizedText.length;
    return 0.7 + 0.2 * lengthRatio + 0.1 * positionScore;
  }

  // Word-based matching
  const queryWords = normalizedQuery.split(/\s+/);
  const textWords = normalizedText.split(/\s+/);

  let matchedWords = 0;
  for (const queryWord of queryWords) {
    for (const textWord of textWords) {
      if (textWord.includes(queryWord) || queryWord.includes(textWord)) {
        matchedWords++;
        break;
      }
    }
  }

  if (matchedWords > 0) {
    return 0.4 + 0.3 * (matchedWords / queryWords.length);
  }

  // Character-based fuzzy matching (for typos)
  let matchedChars = 0;
  let queryIndex = 0;

  for (let i = 0; i < normalizedText.length && queryIndex < normalizedQuery.length; i++) {
    if (normalizedText[i] === normalizedQuery[queryIndex]) {
      matchedChars++;
      queryIndex++;
    }
  }

  if (matchedChars === normalizedQuery.length) {
    // All characters found in order
    return 0.3 + 0.2 * (matchedChars / normalizedText.length);
  }

  // Partial character match
  if (matchedChars > normalizedQuery.length * 0.5) {
    return 0.1 + 0.2 * (matchedChars / normalizedQuery.length);
  }

  return 0;
}

/**
 * Search tools by query string
 * Returns tools sorted by relevance score
 */
export function searchTools(
  query: string,
  localizedContent?: Record<string, { title: string; description: string }>
): SearchResult[] {
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const tool of tools) {
    // Get localized title and description if available
    const localized = localizedContent?.[tool.id];
    const toolName = localized?.title || tool.id.replace(/-/g, ' ');
    const description = localized?.description || '';

    // Search in tool name
    const nameScore = fuzzyMatch(normalizedQuery, toolName);

    // Search in slug
    const slugScore = fuzzyMatch(normalizedQuery, tool.slug.replace(/-/g, ' '));

    // Search in description
    const descriptionScore = description ? fuzzyMatch(normalizedQuery, description) : 0;

    // Search in features (original English features as fallback/addition)
    let featuresScore = 0;
    for (const feature of tool.features) {
      const featureScore = fuzzyMatch(normalizedQuery, feature.replace(/-/g, ' '));
      featuresScore = Math.max(featuresScore, featureScore);
    }

    // Get the best score and determine which field matched
    let bestScore = nameScore;
    let matchedField: 'name' | 'description' | 'features' = 'name';

    if (slugScore > bestScore) {
      bestScore = slugScore;
      matchedField = 'description';
    }

    if (descriptionScore > bestScore) {
      bestScore = descriptionScore;
      matchedField = 'description';
    }

    if (featuresScore > bestScore) {
      bestScore = featuresScore;
      matchedField = 'features';
    }

    // Only include results with a minimum score threshold
    if (bestScore >= 0.1) {
      results.push({
        tool,
        score: bestScore,
        matchedField,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Get search suggestions based on partial query
 */
export function getSearchSuggestions(query: string, limit: number = 5): string[] {
  const results = searchTools(query);
  return results
    .slice(0, limit)
    .map((result) => result.tool.id.replace(/-/g, ' '));
}

/**
 * Check if a tool matches a search query
 * Used for filtering tools in UI
 * Supports localized content for searching in current language
 */
export function toolMatchesQuery(
  tool: Tool,
  query: string,
  localizedContent?: { title: string; description: string }
): boolean {
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) {
    return true; // Empty query matches all
  }

  const toolName = tool.id.replace(/-/g, ' ').toLowerCase();
  const slug = tool.slug.replace(/-/g, ' ').toLowerCase();
  const features = tool.features.map((f) => f.replace(/-/g, ' ').toLowerCase());

  // Check localized title and description first (for current language search)
  if (localizedContent) {
    const localizedTitle = localizedContent.title.toLowerCase();
    const localizedDescription = localizedContent.description.toLowerCase();

    if (localizedTitle.includes(normalizedQuery) || localizedDescription.includes(normalizedQuery)) {
      return true;
    }

    // Fuzzy match on localized title
    if (fuzzyMatch(normalizedQuery, localizedTitle) >= 0.3) {
      return true;
    }
  }

  // Check if query matches name, slug, or any feature (English fallback)
  if (toolName.includes(normalizedQuery) || slug.includes(normalizedQuery)) {
    return true;
  }

  for (const feature of features) {
    if (feature.includes(normalizedQuery)) {
      return true;
    }
  }

  // Check fuzzy match on English name
  return fuzzyMatch(normalizedQuery, toolName) >= 0.3;
}
