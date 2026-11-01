'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { getToolById } from '@/config/tools';
import { ToolCard } from '@/components/tools/ToolCard';
import { Card } from '@/components/ui/Card';

export interface FavoriteToolsSectionProps {
    /** Current locale */
    locale: string;
    /** Optional additional CSS classes */
    className?: string;
    /** Maximum number of tools to display */
    maxItems?: number;
    /** Optional localized content for tools */
    localizedToolsContent?: Record<string, { title: string; description: string }>;
}

/**
 * FavoriteToolsSection displays the user's favorite tools in a grid
 * Only renders when user has at least one favorite tool
 */
export function FavoriteToolsSection({
    locale,
    className = '',
    maxItems = 6,
    localizedToolsContent = {},
}: FavoriteToolsSectionProps) {
    const t = useTranslations();
    const { favorites, isLoaded, favoritesCount } = useFavorites();

    // Don't render until favorites are loaded from localStorage
    if (!isLoaded) {
        return null;
    }

    // Don't render if no favorites
    if (favoritesCount === 0) {
        return null;
    }

    // Get tool data for each favorite
    const favoriteTools = favorites
        .map(id => getToolById(id))
        .filter(tool => tool !== undefined)
        .slice(0, maxItems);

    // Don't render if no valid tools found (e.g., all favorites were deleted tools)
    if (favoriteTools.length === 0) {
        return null;
    }

    return (
        <section className={`${className}`} aria-labelledby="favorite-tools-heading">
            <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    </div>
                    <div>
                        <h2
                            id="favorite-tools-heading"
                            className="text-2xl font-bold text-[hsl(var(--color-foreground))]"
                        >
                            {t('tools.favorite.title')}
                        </h2>
                        <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                            {favoritesCount} {favoritesCount === 1 ? 'tool' : 'tools'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {favoriteTools.map(tool => (
                    <ToolCard
                        key={tool.id}
                        tool={tool}
                        locale={locale}
                        localizedContent={localizedToolsContent[tool.id]}
                    />
                ))}
            </div>
        </section>
    );
}

/**
 * EmptyFavoritesCard - A card shown when no favorites are added
 * Can be used as a hint to users on how to add favorites
 */
export function EmptyFavoritesCard({ className = '' }: { className?: string }) {
    const t = useTranslations();
    const { isLoaded, favoritesCount } = useFavorites();

    // Don't show if loading or if there are favorites
    if (!isLoaded || favoritesCount > 0) {
        return null;
    }

    return (
        <Card className={`glass-card text-center py-8 px-6 ${className}`}>
            <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--color-secondary)/0.5)] flex items-center justify-center">
                    <Star className="w-8 h-8 text-[hsl(var(--color-muted-foreground))]" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-[hsl(var(--color-foreground))] mb-2">
                        {t('tools.favorite.empty')}
                    </h3>
                    <p className="text-sm text-[hsl(var(--color-muted-foreground))] max-w-md">
                        {t('tools.favorite.hint')}
                    </p>
                </div>
            </div>
        </Card>
    );
}

export default FavoriteToolsSection;
