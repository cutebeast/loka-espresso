'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Store, MapPin, Check, X } from 'lucide-react';
import { getStoresWithDistance } from '@/lib/geolocation';
import type { Store as StoreType } from '@/lib/api';

interface StorePickerModalProps {
  stores: StoreType[];
  selectedStore: StoreType | null;
  onSelect: (store: StoreType) => void;
  onClose: () => void;
}

export default function StorePickerModal({ stores, selectedStore, onSelect, onClose }: StorePickerModalProps) {
  const [storeSearch, setStoreSearch] = useState('');
  const [storesWithDist, setStoresWithDist] = useState<Array<StoreType & { distance?: string; distanceKm?: number }>>([]);

  useEffect(() => {
    const calc = async () => {
      const sorted = await getStoresWithDistance(stores);
      setStoresWithDist(sorted);
    };
    calc();
  }, [stores]);

  const visible = storesWithDist
    .filter((s) => s.id !== 0)
    .filter((s) => {
      if (!storeSearch.trim()) return true;
      const q = storeSearch.trim().toLowerCase();
      return s.name.toLowerCase().includes(q) || (s.address || '').toLowerCase().includes(q);
    });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="store-picker-overlay" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="store-picker-sheet"
      >
        <div className="store-picker-handle-bar">
          <div className="store-picker-handle" />
        </div>
        <div className="store-picker-header">
          <div>
            <div className="store-picker-label">
              <MapPin size={11} className="store-picker-label-icon" />
              Pickup location
            </div>
            <h3 className="store-picker-title">Select your Loka</h3>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            aria-label="Close"
            className="store-picker-close"
          >
            <X size={18} />
          </motion.button>
        </div>
        <div className="store-picker-search-wrap">
          <div className="store-picker-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="store-picker-search-icon" aria-hidden>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
              placeholder="Search by name or area"
              className="store-picker-search-input"
            />
            {storeSearch && (
              <button onClick={() => setStoreSearch('')} aria-label="Clear" className="store-picker-search-clear">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="store-picker-section-label">
          {storeSearch ? `${visible.length} result${visible.length === 1 ? '' : 's'}` : 'Nearest to you'}
        </div>
        <div className="scroll-container store-picker-scroll">
          {visible.length === 0 ? (
            <div className="store-picker-empty">
              {storeSearch ? `No stores match "${storeSearch}"` : 'No stores available'}
            </div>
          ) : visible.map((store) => {
            const isSelected = selectedStore?.id === store.id;
            return (
              <motion.button
                key={store.id}
                whileTap={{ scale: 0.985 }}
                onClick={() => onSelect(store)}
                className={`store-picker-item ${isSelected ? 'selected' : ''}`}
              >
                <div className="store-picker-item-icon-wrap">
                  <Store size={18} className="store-picker-item-icon" strokeWidth={2} />
                </div>
                <div className="store-picker-item-info">
                  <div className="store-picker-item-name">{store.name}</div>
                  {store.address && <div className="store-picker-item-address">{store.address}</div>}
                  <div className="store-picker-item-meta">
                    <span className="store-picker-item-status">
                      <span className="store-picker-item-status-dot" />Open now
                    </span>
                    {store.distance && <span className="store-picker-item-distance">· {store.distance}</span>}
                    {store.pickup_lead_minutes != null && <span>· Pickup in ~{store.pickup_lead_minutes} min</span>}
                  </div>
                </div>
                {isSelected && (
                  <div className="store-picker-check">
                    <Check size={15} color="#FFFFFF" strokeWidth={3} />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
