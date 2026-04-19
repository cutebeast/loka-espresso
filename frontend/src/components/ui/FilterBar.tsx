'use client';

import { DateFilter, type DatePreset } from './DateFilter';
import { StoreSelector, StatusSelector } from './Select';

interface FilterBarProps {
  stores?: { id: string; name: string }[];
  selectedStore?: string;
  onStoreChange?: (storeId: string) => void;
  datePreset: DatePreset;
  onDateChange: (preset: DatePreset, from: string, to: string) => void;
  fromDate: string;
  toDate: string;
  statusOptions?: { value: string; label: string }[];
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
}

export function FilterBar({
  stores = [],
  selectedStore = 'all',
  onStoreChange,
  datePreset,
  onDateChange,
  fromDate,
  toDate,
  statusOptions = [],
  selectedStatus = '',
  onStatusChange,
  searchPlaceholder,
  onSearch,
}: FilterBarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
      flexWrap: 'wrap',
    }}>
      {stores.length > 0 && onStoreChange && (
        <StoreSelector
          stores={stores}
          selectedStore={selectedStore}
          onChange={onStoreChange}
        />
      )}

      <DateFilter
        preset={datePreset}
        onChange={onDateChange}
        fromDate={fromDate}
        toDate={toDate}
      />

      {statusOptions.length > 0 && onStatusChange && (
        <StatusSelector
          options={statusOptions}
          selectedStatus={selectedStatus}
          onChange={onStatusChange}
        />
      )}

      {searchPlaceholder && onSearch && (
        <div style={{
          position: 'relative',
          background: 'white',
          padding: '8px 14px',
          borderRadius: 40,
          border: '1px solid #E5E0D8',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          flex: '1',
          minWidth: 200,
          maxWidth: 320,
        }}>
          <i className="fas fa-search" style={{ color: '#6B635E', fontSize: 12, position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}></i>
          <input
            type="text"
            placeholder={searchPlaceholder}
            onChange={e => onSearch(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              color: '#2C1E16',
              outline: 'none',
              width: '100%',
              paddingLeft: 28,
            }}
          />
        </div>
      )}
    </div>
  );
}