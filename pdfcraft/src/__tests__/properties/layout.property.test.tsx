import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { locales, type Locale } from '@/lib/i18n/config';
import { 
  saveLanguagePreference, 
  getLanguagePreference 
} from '@/components/layout/LanguageSelector';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'brand': 'PDFCraft',
      'tagline': 'Professional PDF Tools - Free & Private',
      'navigation.home': 'Home',
      'navigation.tools': 'Tools',
      'navigation.about': 'About',
      'navigation.faq': 'FAQ',
      'navigation.privacy': 'Privacy',
      'navigation.contact': 'Contact',
      'buttons.selectLanguage': 'Select Language',
      'buttons.close': 'Close',
      'footer.copyright': '© {year} PDFCraft. All rights reserved.',
      'footer.privacyBadge': '100% Private - Files never leave your device',
    };
    return translations[key] || key;
  },
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/en/tools',
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => 
    React.createElement('a', { href, ...props }, children),
}));

// Import components after mocks
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

describe('Layout Property Tests', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  /**
   * **Feature: nextjs-pdf-toolkit, Property 2: Brand Consistency**
   * **Validates: Requirements 2.1**
   * 
   * For any rendered page in the application, the page content 
   * SHALL contain the brand name "PDFCraft" in the header or title area.
   */
  describe('Property 2: Brand Consistency', () => {
    it('Header component displays PDFCraft brand name for all locales', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...locales),
          (locale) => {
            const { unmount } = render(<Header locale={locale} />);
            
            // Find the brand name in the header
            const brandElement = screen.getByTestId('brand-name');
            expect(brandElement).toBeInTheDocument();
            expect(brandElement.textContent).toBe('PDFCraft');
            
            unmount();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Footer component displays PDFCraft brand name for all locales', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...locales),
          (locale) => {
            const { unmount } = render(<Footer locale={locale} />);
            
            // Find the brand name in the footer
            const brandElement = screen.getByTestId('footer-brand-name');
            expect(brandElement).toBeInTheDocument();
            expect(brandElement.textContent).toBe('PDFCraft');
            
            unmount();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Brand name is consistent across Header and Footer', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...locales),
          (locale) => {
            // Render Header
            const { unmount: unmountHeader } = render(<Header locale={locale} />);
            const headerBrand = screen.getByTestId('brand-name');
            const headerBrandText = headerBrand.textContent;
            unmountHeader();
            
            // Render Footer
            const { unmount: unmountFooter } = render(<Footer locale={locale} />);
            const footerBrand = screen.getByTestId('footer-brand-name');
            const footerBrandText = footerBrand.textContent;
            unmountFooter();
            
            // Brand should be consistent
            expect(headerBrandText).toBe(footerBrandText);
            expect(headerBrandText).toBe('PDFCraft');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: nextjs-pdf-toolkit, Property 4: Language Preference Persistence (Round-Trip)**
   * **Validates: Requirements 3.2**
   * 
   * For any supported locale, setting the language preference and then 
   * retrieving it SHALL return the same locale value.
   */
  describe('Property 4: Language Preference Persistence (Round-Trip)', () => {
    it('saving and retrieving language preference returns the same locale', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...locales),
          (locale) => {
            // Save the language preference
            saveLanguagePreference(locale);
            
            // Retrieve the language preference
            const retrieved = getLanguagePreference();
            
            // Should be the same
            expect(retrieved).toBe(locale);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('language preference persists across multiple saves', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...locales), { minLength: 2, maxLength: 10 }),
          (localeSequence) => {
            // Save each locale in sequence
            for (const locale of localeSequence) {
              saveLanguagePreference(locale);
            }
            
            // The last saved locale should be retrieved
            const lastLocale = localeSequence[localeSequence.length - 1];
            const retrieved = getLanguagePreference();
            
            expect(retrieved).toBe(lastLocale);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getLanguagePreference returns null when no preference is set', () => {
      // Ensure localStorage is clear
      localStorage.clear();
      
      const retrieved = getLanguagePreference();
      expect(retrieved).toBeNull();
    });

    it('getLanguagePreference returns null for invalid stored values', () => {
      fc.assert(
        fc.property(
          // Generate strings that are NOT valid locales
          fc.string({ minLength: 1, maxLength: 10 })
            .filter(s => !locales.includes(s as Locale)),
          (invalidLocale) => {
            // Manually set an invalid value in localStorage
            localStorage.setItem('pdfcraft-language-preference', invalidLocale);
            
            // Should return null for invalid values
            const retrieved = getLanguagePreference();
            expect(retrieved).toBeNull();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('round-trip preserves locale for all supported locales', () => {
      // Test each locale explicitly
      for (const locale of locales) {
        localStorage.clear();
        
        // Save
        saveLanguagePreference(locale);
        
        // Retrieve
        const retrieved = getLanguagePreference();
        
        // Verify round-trip
        expect(retrieved).toBe(locale);
      }
    });
  });
});
