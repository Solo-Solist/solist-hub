'use client';

import React, { forwardRef, ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-[hsl(var(--color-primary))] 
    text-[hsl(var(--color-primary-foreground))] 
    hover:bg-[hsl(var(--color-primary-hover))]
    focus-visible:ring-[hsl(var(--color-ring))]
  `,
  secondary: `
    bg-[hsl(var(--color-secondary))] 
    text-[hsl(var(--color-secondary-foreground))] 
    hover:bg-[hsl(var(--color-secondary-hover))]
    focus-visible:ring-[hsl(var(--color-ring))]
  `,
  outline: `
    border-2 
    border-[hsl(var(--color-border))] 
    bg-transparent 
    text-[hsl(var(--color-foreground))]
    hover:bg-[hsl(var(--color-muted))]
    focus-visible:ring-[hsl(var(--color-ring))]
  `,
  ghost: `
    bg-transparent 
    text-[hsl(var(--color-foreground))]
    hover:bg-[hsl(var(--color-muted))]
    focus-visible:ring-[hsl(var(--color-ring))]
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
  icon: 'h-9 w-9 p-0 flex items-center justify-center',
};

const LoadingSpinner = () => (
  <svg
    className="animate-spin h-4 w-4"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      children,
      className = '',
      type = 'button',
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const baseStyles = `
      inline-flex items-center justify-center gap-2
      font-medium rounded-[var(--radius-md)]
      transition-all duration-[var(--transition-normal)]
      focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
      whitespace-nowrap select-none shrink-0
    `;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        aria-label={ariaLabel}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`.trim()}
        {...props}
      >
        {loading && <LoadingSpinner />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
