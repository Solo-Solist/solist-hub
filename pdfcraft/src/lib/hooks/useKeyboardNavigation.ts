/**
 * Keyboard Navigation Hook
 * Requirements: 9.2
 * 
 * Provides utilities for keyboard navigation in interactive components
 */

import { useCallback, useEffect, useRef } from 'react';

export interface UseKeyboardNavigationOptions {
  /** Enable arrow key navigation */
  enableArrowKeys?: boolean;
  /** Enable Home/End key navigation */
  enableHomeEnd?: boolean;
  /** Enable Escape key to close/cancel */
  enableEscape?: boolean;
  /** Orientation for arrow key navigation */
  orientation?: 'horizontal' | 'vertical' | 'both';
  /** Callback when Escape is pressed */
  onEscape?: () => void;
  /** Callback when Enter is pressed */
  onEnter?: () => void;
  /** Wrap around when reaching the end */
  wrap?: boolean;
}

export interface UseKeyboardNavigationReturn {
  /** Current focused index */
  focusedIndex: number;
  /** Set focused index */
  setFocusedIndex: (index: number) => void;
  /** Handle key down event */
  handleKeyDown: (event: React.KeyboardEvent, itemCount: number) => void;
  /** Get props for a navigable item */
  getItemProps: (index: number) => {
    tabIndex: number;
    'aria-selected': boolean;
    onFocus: () => void;
  };
}

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
}

/**
 * Focus trap hook for modals and dialogs
 */
export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    // Store the currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !containerRef.current) return;

      const focusableElements = getFocusableElements(containerRef.current);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the first focusable element
    if (containerRef.current) {
      const focusableElements = getFocusableElements(containerRef.current);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the previously focused element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isActive]);

  return containerRef;
}

/**
 * Skip link hook for accessibility
 */
export function useSkipLink(targetId: string) {
  const handleClick = useCallback(() => {
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }, [targetId]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  return { handleClick, handleKeyDown };
}

/**
 * Roving tabindex hook for list navigation
 */
export function useRovingTabIndex(itemCount: number, options: UseKeyboardNavigationOptions = {}) {
  const {
    enableArrowKeys = true,
    enableHomeEnd = true,
    enableEscape = false,
    orientation = 'vertical',
    onEscape,
    onEnter,
    wrap = true,
  } = options;

  const focusedIndexRef = useRef(0);
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

  const setFocusedIndex = useCallback((index: number) => {
    focusedIndexRef.current = index;
    const element = itemRefs.current.get(index);
    if (element) {
      element.focus();
    }
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const currentIndex = focusedIndexRef.current;
    let nextIndex: number | null = null;

    // Determine which keys to use based on orientation
    const prevKeys = orientation === 'horizontal' ? ['ArrowLeft'] : 
                     orientation === 'vertical' ? ['ArrowUp'] : 
                     ['ArrowLeft', 'ArrowUp'];
    const nextKeys = orientation === 'horizontal' ? ['ArrowRight'] : 
                     orientation === 'vertical' ? ['ArrowDown'] : 
                     ['ArrowRight', 'ArrowDown'];

    if (enableArrowKeys && prevKeys.includes(event.key)) {
      event.preventDefault();
      if (currentIndex > 0) {
        nextIndex = currentIndex - 1;
      } else if (wrap) {
        nextIndex = itemCount - 1;
      }
    } else if (enableArrowKeys && nextKeys.includes(event.key)) {
      event.preventDefault();
      if (currentIndex < itemCount - 1) {
        nextIndex = currentIndex + 1;
      } else if (wrap) {
        nextIndex = 0;
      }
    } else if (enableHomeEnd && event.key === 'Home') {
      event.preventDefault();
      nextIndex = 0;
    } else if (enableHomeEnd && event.key === 'End') {
      event.preventDefault();
      nextIndex = itemCount - 1;
    } else if (enableEscape && event.key === 'Escape') {
      event.preventDefault();
      onEscape?.();
      return;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onEnter?.();
      return;
    }

    if (nextIndex !== null) {
      setFocusedIndex(nextIndex);
    }
  }, [itemCount, enableArrowKeys, enableHomeEnd, enableEscape, orientation, wrap, onEscape, onEnter, setFocusedIndex]);

  const getItemProps = useCallback((index: number) => ({
    ref: (el: HTMLElement | null) => {
      if (el) {
        itemRefs.current.set(index, el);
      } else {
        itemRefs.current.delete(index);
      }
    },
    tabIndex: focusedIndexRef.current === index ? 0 : -1,
    onKeyDown: handleKeyDown,
    onFocus: () => {
      focusedIndexRef.current = index;
    },
  }), [handleKeyDown]);

  return {
    focusedIndex: focusedIndexRef.current,
    setFocusedIndex,
    handleKeyDown,
    getItemProps,
  };
}

export default useRovingTabIndex;
