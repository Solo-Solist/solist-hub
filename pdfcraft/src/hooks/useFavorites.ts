'use client';

import { useState, useEffect, useCallback } from 'react';

const FAVORITES_STORAGE_KEY = 'pdfcraft-favorite-tools';

/**
 * Custom hook to manage favorite tools
 * Uses localStorage for persistent storage
 */
export function useFavorites() {
    const [favorites, setFavorites] = useState<string[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load favorites from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    setFavorites(parsed);
                }
            }
        } catch (error) {
            console.error('Failed to load favorites from localStorage:', error);
        }
        setIsLoaded(true);
    }, []);

    // Save favorites to localStorage whenever they change
    useEffect(() => {
        if (isLoaded) {
            try {
                localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
            } catch (error) {
                console.error('Failed to save favorites to localStorage:', error);
            }
        }
    }, [favorites, isLoaded]);

    /**
     * Check if a tool is in favorites
     */
    const isFavorite = useCallback((toolId: string): boolean => {
        return favorites.includes(toolId);
    }, [favorites]);

    /**
     * Toggle a tool's favorite status
     */
    const toggleFavorite = useCallback((toolId: string): void => {
        setFavorites(prev => {
            if (prev.includes(toolId)) {
                return prev.filter(id => id !== toolId);
            } else {
                return [...prev, toolId];
            }
        });
    }, []);

    /**
     * Add a tool to favorites
     */
    const addFavorite = useCallback((toolId: string): void => {
        setFavorites(prev => {
            if (prev.includes(toolId)) {
                return prev;
            }
            return [...prev, toolId];
        });
    }, []);

    /**
     * Remove a tool from favorites
     */
    const removeFavorite = useCallback((toolId: string): void => {
        setFavorites(prev => prev.filter(id => id !== toolId));
    }, []);

    /**
     * Clear all favorites
     */
    const clearFavorites = useCallback((): void => {
        setFavorites([]);
    }, []);

    /**
     * Get the count of favorite tools
     */
    const favoritesCount = favorites.length;

    return {
        favorites,
        isLoaded,
        isFavorite,
        toggleFavorite,
        addFavorite,
        removeFavorite,
        clearFavorites,
        favoritesCount,
    };
}

export default useFavorites;
