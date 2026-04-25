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
  style,
  ...props
}: InputProps) {
  return (
    <div className="i-0">
      {label && (
        <label
          className="i-1"
        >
          {label}
        </label>
      )}
      <div className="i-2">
        {icon && (
          <span className="i-3"><i className={`fas ${icon}`} /></span>
        )}
        <input
          {...props}
          style={{
            width: '100%',
            padding: icon ? '10px 12px 10px 36px' : '10px 12px',
            paddingRight: rightElement ? 40 : 12,
            borderRadius: 10,
            border: `1px solid ${error ? '#dc2626' : '#e2e8f0'}`,
            background: 'white',
            fontSize: 14,
            color: '#1e293b',
            outline: 'none',
            transition: 'all 0.2s',
            ...style,
          }}
        />
        {rightElement && (
          <div
            className="i-4"
          >
            {rightElement}
          </div>
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

export function TextArea({ label, error, style, ...props }: TextAreaProps) {
  return (
    <div className="ta-6">
      {label && (
        <label
          className="ta-7"
        >
          {label}
        </label>
      )}
      <textarea
        {...props}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: `1px solid ${error ? '#dc2626' : '#e2e8f0'}`,
          background: 'white',
          fontSize: 14,
          color: '#1e293b',
          outline: 'none',
          resize: 'vertical',
          minHeight: 80,
          fontFamily: 'inherit',
          ...style,
        }}
      />
      {error && (
        <div className="ta-8">{error}</div>
      )}
    </div>
  );
}
