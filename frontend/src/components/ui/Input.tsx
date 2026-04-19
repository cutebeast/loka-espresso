'use client';

import { InputHTMLAttributes, ReactNode } from 'react';

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
    <div style={{ width: '100%' }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {icon && (
          <i
            className={`fas ${icon}`}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748b',
              fontSize: 14,
              pointerEvents: 'none',
            }}
          />
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
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}

interface TextAreaProps extends InputHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function TextArea({ label, error, style, ...props }: TextAreaProps) {
  return (
    <div style={{ width: '100%' }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
            marginBottom: 6,
          }}
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
        <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
