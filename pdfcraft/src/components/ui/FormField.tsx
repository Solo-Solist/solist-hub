/**
 * FormField Component
 * Requirements: 9.5
 * 
 * Accessible form field with properly associated label and error descriptions
 */

'use client';

import React, { forwardRef, useId } from 'react';

export interface FormFieldProps {
  /** Label text */
  label: string;
  /** Field name/id */
  name?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Error message */
  error?: string;
  /** Help text */
  helpText?: string;
  /** Children (the input element) */
  children: React.ReactElement;
  /** Custom class name */
  className?: string;
  /** Hide the label visually (still accessible to screen readers) */
  hideLabel?: boolean;
}

/**
 * FormField wraps form inputs with proper label association and error handling
 */
export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      label,
      name,
      required = false,
      error,
      helpText,
      children,
      className = '',
      hideLabel = false,
    },
    ref
  ) => {
    // Generate unique IDs for accessibility
    const generatedId = useId();
    const fieldId = name || generatedId;
    const errorId = `${fieldId}-error`;
    const helpId = `${fieldId}-help`;

    // Clone the child element to add accessibility attributes
    const enhancedChild = React.cloneElement(children, {
      id: fieldId,
      name: name || (children.props as Record<string, unknown>).name,
      'aria-invalid': error ? 'true' : undefined,
      'aria-describedby': [
        error ? errorId : null,
        helpText ? helpId : null,
      ]
        .filter(Boolean)
        .join(' ') || undefined,
      'aria-required': required ? 'true' : undefined,
    } as React.HTMLAttributes<HTMLElement>);

    return (
      <div ref={ref} className={`space-y-1.5 ${className}`.trim()}>
        {/* Label */}
        <label
          htmlFor={fieldId}
          className={`
            block text-sm font-medium text-[hsl(var(--color-foreground))]
            ${hideLabel ? 'sr-only' : ''}
          `.trim()}
        >
          {label}
          {required && (
            <span className="text-[hsl(var(--color-destructive))] ml-1" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </label>

        {/* Input */}
        {enhancedChild}

        {/* Help text */}
        {helpText && !error && (
          <p
            id={helpId}
            className="text-xs text-[hsl(var(--color-muted-foreground))]"
          >
            {helpText}
          </p>
        )}

        {/* Error message */}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-xs text-[hsl(var(--color-destructive))] flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {error}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

/**
 * Input component with consistent styling
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Whether the input has an error */
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ hasError, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`
          w-full px-3 py-2
          rounded-[var(--radius-md)]
          border border-[hsl(var(--color-border))]
          bg-[hsl(var(--color-background))]
          text-[hsl(var(--color-foreground))]
          placeholder:text-[hsl(var(--color-muted-foreground))]
          focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-ring))] focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${hasError ? 'border-[hsl(var(--color-destructive))] focus:ring-[hsl(var(--color-destructive))]' : ''}
          ${className}
        `.trim()}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

/**
 * Textarea component with consistent styling
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Whether the textarea has an error */
  hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ hasError, className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`
          w-full px-3 py-2
          rounded-[var(--radius-md)]
          border border-[hsl(var(--color-border))]
          bg-[hsl(var(--color-background))]
          text-[hsl(var(--color-foreground))]
          placeholder:text-[hsl(var(--color-muted-foreground))]
          focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-ring))] focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          resize-y min-h-[80px]
          ${hasError ? 'border-[hsl(var(--color-destructive))] focus:ring-[hsl(var(--color-destructive))]' : ''}
          ${className}
        `.trim()}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

/**
 * Select component with consistent styling
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Whether the select has an error */
  hasError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ hasError, className = '', children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`
          w-full px-3 py-2
          rounded-[var(--radius-md)]
          border border-[hsl(var(--color-border))]
          bg-[hsl(var(--color-background))]
          text-[hsl(var(--color-foreground))]
          focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-ring))] focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${hasError ? 'border-[hsl(var(--color-destructive))] focus:ring-[hsl(var(--color-destructive))]' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';

/**
 * Checkbox component with label
 */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text */
  label: string;
  /** Description text */
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;
    const descriptionId = `${checkboxId}-description`;

    return (
      <div className={`flex items-start gap-3 ${className}`.trim()}>
        <input
          ref={ref}
          type="checkbox"
          id={checkboxId}
          aria-describedby={description ? descriptionId : undefined}
          className="
            mt-1 w-4 h-4
            rounded border-[hsl(var(--color-border))]
            text-[hsl(var(--color-primary))]
            focus:ring-[hsl(var(--color-ring))]
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          {...props}
        />
        <div>
          <label
            htmlFor={checkboxId}
            className="text-sm font-medium text-[hsl(var(--color-foreground))] cursor-pointer"
          >
            {label}
          </label>
          {description && (
            <p
              id={descriptionId}
              className="text-xs text-[hsl(var(--color-muted-foreground))] mt-0.5"
            >
              {description}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export default FormField;
