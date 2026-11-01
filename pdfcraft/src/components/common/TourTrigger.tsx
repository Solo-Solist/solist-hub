/**
 * TourTrigger Component
 * Requirements: 10.5
 * 
 * A button to manually trigger the guided tour
 */

'use client';

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface TourTriggerProps {
  onClick: () => void;
  label: string;
  variant?: 'button' | 'icon' | 'link';
}

export const TourTrigger: React.FC<TourTriggerProps> = ({
  onClick,
  label,
  variant = 'icon',
}) => {
  if (variant === 'link') {
    return (
      <button
        onClick={onClick}
        className="text-sm text-[hsl(var(--color-primary))] hover:underline flex items-center gap-1"
        aria-label={label}
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    );
  }

  if (variant === 'button') {
    return (
      <Button variant="outline" size="sm" onClick={onClick}>
        <HelpCircle className="h-4 w-4 mr-2" aria-hidden="true" />
        {label}
      </Button>
    );
  }

  // Default: icon only
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={label}
      className="p-2"
    >
      <HelpCircle className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
};

export default TourTrigger;
