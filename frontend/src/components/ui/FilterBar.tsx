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
    <div className="fb-0">
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
        <div className="fb-1">
          <span className="fb-2"><i className="fas fa-search"></i></span>
          <input
            type="text"
            placeholder={searchPlaceholder}
            onChange={e => onSearch(e.target.value)}
            className="fb-3"
          />
        </div>
      )}
    </div>
  );
}