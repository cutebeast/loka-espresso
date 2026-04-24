'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

interface PhoneNumberFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  helperText?: string;
}

export const PhoneNumberField = forwardRef<HTMLInputElement, PhoneNumberFieldProps>(
  function PhoneNumberField({ error, helperText, className = '', ...props }, ref) {
    const supportText = error || helperText;

    return (
      <div className="w-full">
        <label
          htmlFor={props.id ?? 'phone-input'}
          className="flex items-center gap-1.5 text-xs font-semibold text-text-primary tracking-wide mb-2.5"
        >
          <span>📞</span>
          Phone number
        </label>

        <div
          className={[
            'flex items-center border rounded-2xl px-4 py-3.5 transition-all duration-150',
            'bg-white',
            error
              ? 'border-danger'
              : 'border-border-light focus-within:border-copper focus-within:ring-2 focus-within:ring-copper/10',
          ].join(' ')}
        >
          <div className="flex items-center gap-1.5 pr-3 mr-3 border-r border-border-light">
            <span className="text-lg">🇲🇾</span>
            <span className="font-semibold text-text-primary text-sm">+60</span>
          </div>

          <input
            ref={ref}
            id={props.id ?? 'phone-input'}
            className={[
              'w-full text-base font-medium text-text-primary placeholder:text-text-muted/40 outline-none bg-transparent',
              className,
            ].join(' ')}
            {...props}
          />
        </div>

        {supportText ? (
          <p
            className={[
              'mt-2 text-xs',
              error ? 'font-medium text-danger' : 'text-text-muted',
            ].join(' ')}
          >
            {supportText}
          </p>
        ) : null}
      </div>
    );
  },
);
