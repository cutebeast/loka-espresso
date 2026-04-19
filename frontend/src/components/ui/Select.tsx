'use client';

import { useState, useRef, useEffect } from 'react';
import { SelectHTMLAttributes } from 'react';
import { THEME } from '@/lib/theme';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[];
  label?: string;
  error?: string;
  icon?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function Select({
  options,
  label,
  error,
  icon,
  onChange,
  placeholder,
  style,
  value,
  ...props
}: SelectProps) {
  return (
    <div style={{ width: '100%' }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: THEME.textSecondary,
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
              color: THEME.textMuted,
              fontSize: 14,
              pointerEvents: 'none',
            }}
          />
        )}
        <select
          {...props}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          style={{
            width: '100%',
            padding: icon ? '10px 32px 10px 36px' : '10px 32px 10px 12px',
            borderRadius: THEME.radius.md,
            border: `1px solid ${error ? THEME.error : THEME.border}`,
            background: THEME.bgCard,
            fontSize: 14,
            color: THEME.textPrimary,
            cursor: 'pointer',
            outline: 'none',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%233d4a1e' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            ...style,
          }}
        >
          {placeholder && !value && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div style={{ fontSize: 12, color: THEME.error, marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  icon?: string;
  label?: string;
}

export function FilterSelect({ value, onChange, options, placeholder = 'Select...', icon, label }: FilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(o => o.value === value)?.label || placeholder;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: THEME.bgCard,
          padding: '8px 14px',
          borderRadius: THEME.radius.xl,
          boxShadow: THEME.shadow.sm,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: `1px solid ${value ? THEME.primary : THEME.border}`,
          cursor: 'pointer',
          transition: 'all 0.2s',
          minWidth: label ? 160 : 140,
        }}
      >
        {icon && <i className={`fas ${icon}`} style={{ color: THEME.textMuted, fontSize: 14 }}></i>}
        <span style={{
          fontSize: 14,
          fontWeight: 500,
          color: value ? THEME.textPrimary : THEME.textMuted,
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {label ? `${label}: ${selectedLabel}` : selectedLabel}
        </span>
        <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: 12, color: THEME.textMuted }}></i>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          minWidth: '100%',
          background: THEME.bgCard,
          borderRadius: THEME.radius.lg,
          border: `1px solid ${THEME.border}`,
          boxShadow: THEME.shadow.lg,
          zIndex: 1000,
          maxHeight: 320,
          overflow: 'auto',
        }}>
          {placeholder && (
            <div
              onClick={() => { onChange(''); setIsOpen(false); }}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                color: THEME.textMuted,
                cursor: 'pointer',
                borderBottom: `1px solid ${THEME.borderLight}`,
                fontWeight: value === '' ? 600 : 400,
                background: value === '' ? THEME.bgMuted : 'transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = THEME.bgMuted; }}
              onMouseLeave={(e) => { if (value !== '') e.currentTarget.style.background = 'transparent'; }}
            >
              {placeholder}
            </div>
          )}
          {options.map((opt, idx) => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                color: THEME.textPrimary,
                cursor: 'pointer',
                borderBottom: idx < options.length - 1 ? `1px solid ${THEME.borderLight}` : 'none',
                fontWeight: value === opt.value ? 600 : 400,
                background: value === opt.value ? THEME.bgMuted : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = THEME.bgMuted; }}
              onMouseLeave={(e) => { if (value !== opt.value) e.currentTarget.style.background = 'transparent'; }}
            >
              {value === opt.value && <i className="fas fa-check" style={{ fontSize: 12, color: THEME.primary }}></i>}
              <span style={{ marginLeft: value === opt.value ? 0 : 20 }}>{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface StoreSelectorProps {
  stores: { id: string | number; name: string }[];
  selectedStore: string;
  onChange: (storeId: string) => void;
  showAllOption?: boolean;
  allLabel?: string;
  placeholder?: string;
}

export function StoreSelector({
  stores,
  selectedStore,
  onChange,
  showAllOption = true,
  allLabel = 'All Stores (HQ)',
  placeholder = 'Select a store...'
}: StoreSelectorProps) {
  const options = [
    ...(showAllOption ? [{ value: 'all', label: allLabel }] : []),
    ...stores.map(s => ({ value: String(s.id), label: s.name }))
  ];

  return (
    <FilterSelect
      value={selectedStore}
      onChange={onChange}
      options={options}
      icon="fa-store"
      placeholder={placeholder}
    />
  );
}

interface StatusSelectorProps {
  options: { value: string; label: string }[];
  selectedStatus: string;
  onChange: (status: string) => void;
  placeholder?: string;
}

export function StatusSelector({ options, selectedStatus, onChange, placeholder = 'All Status' }: StatusSelectorProps) {
  return (
    <FilterSelect
      value={selectedStatus}
      onChange={onChange}
      options={options}
      icon="fa-filter"
      placeholder={placeholder}
    />
  );
}

interface PillSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}

export function PillSelect({ value, onChange, options }: PillSelectProps) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(opt => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '8px 16px',
              borderRadius: THEME.radius.xl,
              border: isActive ? `2px solid ${THEME.primary}` : `1px solid ${THEME.border}`,
              background: isActive ? THEME.primary : THEME.bgCard,
              color: isActive ? THEME.textLight : THEME.textMuted,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: isActive ? THEME.shadow.md : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
