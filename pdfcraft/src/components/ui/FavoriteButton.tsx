'use client';

import React from 'react';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFavorites } from '@/hooks/useFavorites';

export interface FavoriteButtonProps {
    /** The tool ID to toggle favorite status */
    toolId: string;
    /** Optional additional CSS classes */
    className?: string;
    /** Size variant: 'sm' | 'md' | 'lg' */
    size?: 'sm' | 'md' | 'lg';
    /** Whether to show the label text */
    showLabel?: boolean;
    /** Optional callback when favorite status changes */
    onToggle?: (isFavorite: boolean) => void;
}

const sizeClasses = {
    sm: {
        button: 'w-7 h-7',
        icon: 'w-3.5 h-3.5',
        label: 'text-xs',
    },
    md: {
        button: 'w-9 h-9',
        icon: 'w-4 h-4',
        label: 'text-sm',
    },
    lg: {
        button: 'w-11 h-11',
        icon: 'w-5 h-5',
        label: 'text-base',
    },
};

/**
 * FavoriteButton component for adding/removing tools from favorites
 * Uses localStorage for persistent storage via useFavorites hook
 */
export function FavoriteButton({
    toolId,
    className = '',
    size = 'md',
    showLabel = false,
    onToggle,
}: FavoriteButtonProps) {
    const t = useTranslations();
    const { isFavorite, toggleFavorite, isLoaded } = useFavorites();

    const favorite = isFavorite(toolId);
    const sizeConfig = sizeClasses[size];

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(toolId);
        onToggle?.(!favorite);
    };

    // Don't render anything until favorites are loaded to prevent hydration mismatch
    if (!isLoaded) {
        return (
            <div
                className={`inline-flex items-center gap-2 ${className}`}
                aria-hidden="true"
            >
                <div
                    className={`${sizeConfig.button} rounded-full bg-[hsl(var(--color-secondary)/0.3)] flex items-center justify-center`}
                >
                    <Star className={`${sizeConfig.icon} text-[hsl(var(--color-muted-foreground)/0.5)]`} />
                </div>
                {showLabel && (
                    <span className={`${sizeConfig.label} text-[hsl(var(--color-muted-foreground)/0.5)]`}>
                        {t('tools.favorite.add')}
                    </span>
                )}
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`
        inline-flex items-center gap-2 
        transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-ring))] focus-visible:ring-offset-2
        rounded-full
        ${className}
      `}
            aria-label={favorite ? t('tools.favorite.remove') : t('tools.favorite.add')}
            aria-pressed={favorite}
            title={favorite ? t('tools.favorite.remove') : t('tools.favorite.add')}
        >
            <div
                className={`
          ${sizeConfig.button} 
          rounded-full 
          flex items-center justify-center
          transition-all duration-200
          ${favorite
                        ? 'bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                        : 'bg-[hsl(var(--color-secondary)/0.5)] hover:bg-[hsl(var(--color-secondary))]'
                    }
        `}
            >
                <Star
                    className={`
            ${sizeConfig.icon} 
            transition-all duration-200
            ${favorite
                            ? 'text-amber-500 fill-amber-500 scale-110'
                            : 'text-[hsl(var(--color-muted-foreground))] hover:text-amber-400'
                        }
          `}
                />
            </div>
            {showLabel && (
                <span
                    className={`
            ${sizeConfig.label} 
            font-medium
            transition-colors duration-200
            ${favorite
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]'
                        }
          `}
                >
                    {favorite ? t('tools.favorite.saved') : t('tools.favorite.add')}
                </span>
            )}
        </button>
    );
}

export default FavoriteButton;
