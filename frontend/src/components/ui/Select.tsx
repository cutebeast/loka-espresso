'use client';

import { useState, useRef, useEffect } from 'react';
import { SelectHTMLAttributes } from 'react';

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
  value,
  ...props
}: SelectProps) {
  return (
    <div className="s-0">
      {label && (
        <label className="s-1">
          {label}
        </label>
      )}
      <div className="s-2">
        {icon && (
          <span className="s-3"><i className={`fas ${icon}`} /></span>
        )}
        <select
          {...props}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className={`s-select ${icon ? 's-select-pad-icon' : 's-select-pad-noicon'} ${error ? 's-select-error' : 's-select-normal'}`}
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
        <div className="s-4">{error}</div>
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
    <div ref={containerRef} className="fs-5">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`fs-trigger ${value ? 'fs-trigger-active' : 'fs-trigger-normal'} ${label ? 'fs-trigger-w-label' : 'fs-trigger-w-nolabel'}`}
      >
        {icon && <span className="fs-6"><i className={`fas ${icon}`}></i></span>}
        <span className={`fs-label ${value ? 'fs-label-active' : 'fs-label-normal'}`}>
          {label ? `${label}: ${selectedLabel}` : selectedLabel}
        </span>
        <span className="fs-7"><i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`}></i></span>
      </div>

      {isOpen && (
        <div className="fs-8">
          {placeholder && (
            <div
              onClick={() => { onChange(''); setIsOpen(false); }}
              className={`fs-option fs-option-border ${value === '' ? 'fs-option-selected' : 'fs-option-normal'}`}
            >
              {placeholder}
            </div>
          )}
          {options.map((opt, idx) => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`fs-option ${idx < options.length - 1 ? 'fs-option-border' : 'fs-option-noborder'} ${value === opt.value ? 'fs-option-selected' : 'fs-option-normal'}`}
            >
              {value === opt.value && <span className="fs-9"><i className="fas fa-check"></i></span>}
              <span className={value === opt.value ? 'fs-option-ml-0' : 'fs-option-ml-20'}>{opt.label}</span>
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
    <div className="ps-10">
      {options.map(opt => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`ps-btn ${isActive ? 'ps-btn-active' : 'ps-btn-inactive'}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
