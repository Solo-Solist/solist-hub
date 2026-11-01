/**
 * RTL (Right-to-Left) Support Utilities
 * Provides utilities for handling RTL languages like Arabic
 */

import { type Locale, localeConfig } from './config';

/**
 * Check if a locale uses RTL text direction
 */
export function isRTLLocale(locale: Locale): boolean {
  return localeConfig[locale]?.direction === 'rtl';
}

/**
 * Get the text direction for a locale
 */
export function getDirection(locale: Locale): 'ltr' | 'rtl' {
  return localeConfig[locale]?.direction || 'ltr';
}

/**
 * Get CSS class names for RTL-aware components
 * Returns appropriate classes based on the current locale's direction
 */
export function getRTLClasses(locale: Locale, options?: {
  baseClasses?: string;
  ltrClasses?: string;
  rtlClasses?: string;
}): string {
  const { baseClasses = '', ltrClasses = '', rtlClasses = '' } = options || {};
  const isRTL = isRTLLocale(locale);
  
  const classes = [baseClasses];
  
  if (isRTL && rtlClasses) {
    classes.push(rtlClasses);
  } else if (!isRTL && ltrClasses) {
    classes.push(ltrClasses);
  }
  
  return classes.filter(Boolean).join(' ');
}

/**
 * Flip a horizontal position for RTL
 * Converts 'left' to 'right' and vice versa for RTL locales
 */
export function flipPosition(
  position: 'left' | 'right',
  locale: Locale
): 'left' | 'right' {
  if (!isRTLLocale(locale)) {
    return position;
  }
  return position === 'left' ? 'right' : 'left';
}

/**
 * Get logical CSS property name
 * Converts physical properties (left/right) to logical ones (start/end)
 */
export function getLogicalProperty(
  property: 'margin-left' | 'margin-right' | 'padding-left' | 'padding-right' | 'left' | 'right'
): string {
  const logicalMap: Record<string, string> = {
    'margin-left': 'margin-inline-start',
    'margin-right': 'margin-inline-end',
    'padding-left': 'padding-inline-start',
    'padding-right': 'padding-inline-end',
    'left': 'inset-inline-start',
    'right': 'inset-inline-end',
  };
  
  return logicalMap[property] || property;
}

/**
 * RTL-aware icon rotation
 * Returns rotation degrees for icons that should flip in RTL
 */
export function getIconRotation(locale: Locale, shouldFlip: boolean = true): number {
  if (!shouldFlip || !isRTLLocale(locale)) {
    return 0;
  }
  return 180;
}
