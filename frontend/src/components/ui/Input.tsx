'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: string;
  rightElement?: ReactNode;
}

export function Input({
  label,
  error,
  icon,
  rightElement,
  className,
  ...props
}: InputProps) {
  const inputClasses = [
    'input-field',
    icon ? 'has-icon' : '',
    rightElement ? 'has-right-element' : '',
    error ? 'input-error' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className="i-0">
      {label && (
        <label className="i-1">{label}</label>
      )}
      <div className="i-2">
        {icon && (
          <span className="i-3"><i className={`fas ${icon}`} /></span>
        )}
        <input {...props} className={inputClasses} />
        {rightElement && (
          <div className="i-4">{rightElement}</div>
        )}
      </div>
      {error && (
        <div className="i-5">{error}</div>
      )}
    </div>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function TextArea({ label, error, className, ...props }: TextAreaProps) {
  const textareaClasses = [
    'textarea-field',
    error ? 'textarea-error' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className="ta-6">
      {label && (
        <label className="ta-7">{label}</label>
      )}
      <textarea {...props} className={textareaClasses} />
      {error && (
        <div className="ta-8">{error}</div>
      )}
    </div>
  );
}
