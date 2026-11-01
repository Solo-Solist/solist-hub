'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { X, ChevronRight, ChevronDown } from 'lucide-react';
import { type Locale } from '@/lib/i18n/config';
import { type ToolCategory } from '@/types/tool';
import { Button } from '@/components/ui/Button';

export interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
}

interface CategoryItem {
  id: ToolCategory;
  labelKey: string;
  href: string;
}

// Get all focusable elements within a container
const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const focusableSelectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
};

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose, locale }) => {
  const t = useTranslations('home.categories');
  const tCommon = useTranslations('common');
  const menuRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const categories: CategoryItem[] = [
    { id: 'edit-annotate', labelKey: 'editAnnotate', href: `/${locale}/tools?category=edit-annotate` },
    { id: 'convert-to-pdf', labelKey: 'convertToPdf', href: `/${locale}/tools?category=convert-to-pdf` },
    { id: 'convert-from-pdf', labelKey: 'convertFromPdf', href: `/${locale}/tools?category=convert-from-pdf` },
    { id: 'organize-manage', labelKey: 'organizeManage', href: `/${locale}/tools?category=organize-manage` },
    { id: 'optimize-repair', labelKey: 'optimizeRepair', href: `/${locale}/tools?category=optimize-repair` },
    { id: 'secure-pdf', labelKey: 'securePdf', href: `/${locale}/tools?category=secure-pdf` },
  ];

  const mainNavItems = [
    { href: `/${locale}`, label: tCommon('navigation.home') },
    { href: `/${locale}/tools`, label: tCommon('navigation.tools'), hasSubmenu: true },
    { href: `/${locale}/about`, label: tCommon('navigation.about') },
    { href: `/${locale}/faq`, label: tCommon('navigation.faq') },
    { href: `/${locale}/privacy`, label: tCommon('navigation.privacy') },
    { href: `/${locale}/contact`, label: tCommon('navigation.contact') },
  ];

  // Focus trap and escape key handling
  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element
      previousActiveElement.current = document.activeElement as HTMLElement;
      
      // Focus the close button when menu opens
      closeButtonRef.current?.focus();
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      
      // Restore focus to the previously focused element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle keyboard navigation with focus trap
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap - Tab key handling
      if (event.key === 'Tab' && menuRef.current) {
        const focusableElements = getFocusableElements(menuRef.current);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch gesture handling for swipe to close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStart === null) return;
    
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    
    // Swipe left to close (for LTR) - threshold of 100px
    if (diff > 100) {
      onClose();
    }
    
    setTouchStart(null);
  }, [touchStart, onClose]);

  const handleCategoryToggle = useCallback((categoryId: string) => {
    setExpandedCategory((prev) => (prev === categoryId ? null : categoryId));
  }, []);

  const handleLinkClick = useCallback(() => {
    onClose();
    setExpandedCategory(null);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Menu */}
      <div
        ref={menuRef}
        className={`
          fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-[hsl(var(--color-background))] 
          shadow-xl z-50 md:hidden
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--color-border))]">
          <span className="text-lg font-bold text-[hsl(var(--color-primary))]">
            {tCommon('brand')}
          </span>
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={tCommon('buttons.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="p-4 overflow-y-auto h-[calc(100%-64px)]" aria-label="Mobile navigation">
          <ul className="flex flex-col gap-1">
            {mainNavItems.map((item) => (
              <li key={item.href}>
                {item.hasSubmenu ? (
                  <div>
                    <button
                      onClick={() => handleCategoryToggle('tools')}
                      className="flex items-center justify-between w-full px-4 py-3 text-left text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] rounded-[var(--radius-md)] transition-colors"
                      aria-expanded={expandedCategory === 'tools'}
                    >
                      <span className="font-medium">{item.label}</span>
                      {expandedCategory === 'tools' ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    
                    {/* Submenu */}
                    {expandedCategory === 'tools' && (
                      <ul className="ml-4 mt-1 border-l-2 border-[hsl(var(--color-border))]">
                        <li>
                          <Link
                            href={item.href}
                            className="block px-4 py-2 text-sm text-[hsl(var(--color-foreground))] hover:text-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-muted))] rounded-[var(--radius-md)] transition-colors"
                            onClick={handleLinkClick}
                          >
                            All Tools
                          </Link>
                        </li>
                        {categories.map((category) => (
                          <li key={category.id}>
                            <Link
                              href={category.href}
                              className="block px-4 py-2 text-sm text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-muted))] rounded-[var(--radius-md)] transition-colors"
                              onClick={handleLinkClick}
                            >
                              {t(category.labelKey)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    className="block px-4 py-3 font-medium text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] rounded-[var(--radius-md)] transition-colors"
                    onClick={handleLinkClick}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
};

export default MobileMenu;
