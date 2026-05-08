'use client';

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={`
              w-full px-4 py-3.5 rounded-full border-2 transition-colors
              ${leftIcon ? 'pl-12' : ''}
              ${rightIcon ? 'pr-12' : ''}
              ${error ? 'border-danger focus:border-danger' : 'border-border-light focus:border-primary'}
              outline-none text-text-primary placeholder:text-text-muted
              ${className}
            `}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-danger">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full px-4 py-3.5 rounded-2xl border-2 transition-colors resize-none
            ${error ? 'border-danger focus:border-danger' : 'border-border-light focus:border-primary'}
            outline-none text-text-primary placeholder:text-text-muted
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-danger">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
