/**
 * Font Configuration
 * Requirements: 8.4 - Font optimization
 *
 * Uses next/font for automatic font optimization including:
 * - Font subsetting (only loads characters used)
 * - Self-hosting (no external requests to Google Fonts)
 * - Zero layout shift with size-adjust
 * - display: swap for better performance
 *
 * Multi-Platform Hebrew/RTL Support:
 * Google Fonts Inter doesn't support Hebrew subset, so we rely on system fonts
 * which have native Hebrew character support across platforms:
 * - Windows: Segoe UI (optimal Hebrew rendering)
 * - macOS: San Francisco/-apple-system (San Francisco Pro Display, native Hebrew)
 * - Linux/Other: Arial and system fonts (Hebrew support)
 * See HEBREW_FIX.md for details.
 */

import { Inter, JetBrains_Mono } from 'next/font/google';

/**
 * Inter font - Primary sans-serif font
 * Used for body text and UI elements
 *
 * Note: Google Fonts Inter doesn't support Hebrew subset.
 * Hebrew text will use system fallback fonts:
 * - Windows: Segoe UI (native Hebrew support)
 * - macOS: San Francisco/-apple-system (native Hebrew support)
 * - Linux: Arial, system fonts (Hebrew support)
 */
export const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  fallback: [
    'Segoe UI',           // Windows primary
    '-apple-system',      // macOS system font (SF Pro Display)
    'BlinkMacSystemFont', // macOS fallback
    'system-ui',          // Generic system-ui keyword
    'Roboto',             // Android/fallback
    'Arial',              // Universal fallback with Hebrew support
    'sans-serif'          // Generic fallback
  ],
  adjustFontFallback: true,
});

/**
 * JetBrains Mono font - Monospace font
 * Used for code snippets and technical content
 */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  preload: false, // Only preload if code is shown above the fold
  fallback: ['Fira Code', 'Consolas', 'Monaco', 'monospace'],
  adjustFontFallback: true,
});

/**
 * Combined font variables for use in className
 */
export const fontVariables = `${inter.variable} ${jetbrainsMono.variable}`;

/**
 * Font class names for direct usage
 */
export const fontClassNames = {
  sans: inter.className,
  mono: jetbrainsMono.className,
};

/**
 * CSS custom properties for fonts
 * These are set as CSS variables and can be used in Tailwind
 */
export const fontCssVariables = {
  '--font-sans': inter.style.fontFamily,
  '--font-mono': jetbrainsMono.style.fontFamily,
} as const;
