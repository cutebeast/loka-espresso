'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Store, MapPin, Check, X, Clock, Navigation, Search } from 'lucide-react';
import { getStoresWithDistance } from '@/lib/geolocation';
import { resolveAssetUrl, LOKA } from '@/lib/tokens';
import type { Store as StoreType } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

interface StorePickerModalProps {
  stores: StoreType[];
  selectedStore: StoreType | null;
  userLocation: { lat: number; lng: number } | null;
  onSelect: (store: StoreType) => void;
  onClose: () => void;
}

export default function StorePickerModal({ stores, selectedStore, userLocation, onSelect, onClose }: StorePickerModalProps) {
  const { t } = useTranslation();
  const [storeSearch, setStoreSearch] = useState('');
  const [storesWithDist, setStoresWithDist] = useState<Array<StoreType & { distance?: string; distanceKm?: number }>>([]);

  useEffect(() => {
    getStoresWithDistance(stores, userLocation).then(setStoresWithDist);
  }, [stores, userLocation]);

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
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={0.15}
        onDragEnd={(_e, info) => { if (info.offset.y > 100) onClose(); }}
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
              {t('storePicker.pickupLocation')}
            </div>
            <h3 className="store-picker-title">{t('storePicker.title')}</h3>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            aria-label={t('common.close')}
            className="store-picker-close"
          >
            <X size={18} />
          </motion.button>
        </div>
        {/* Store image hero */}
        <div className="store-picker-hero">
          {selectedStore?.image_url ? (
            <img src={resolveAssetUrl(selectedStore.image_url) || undefined} alt={selectedStore.name} className="store-picker-hero-img" />
          ) : (
            <Store size={48} strokeWidth={1} className="store-picker-hero-fallback" />
          )}
        </div>

        <div className="store-picker-search-wrap">
          <div className="store-picker-search-box">
            <Search color="#8A8078" size={16} className="store-picker-search-icon" strokeWidth={2} />
            <input
              type="text"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
              placeholder={t('storePicker.searchPlaceholder')}
              className="store-picker-search-input"
            />
            {storeSearch && (
              <button onClick={() => setStoreSearch('')} aria-label={t('common.clear')} className="store-picker-search-clear">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="store-picker-section-label">
          {storeSearch ? t('storePicker.results', { count: visible.length }) : t('storePicker.nearestToYou')}
        </div>
        <div className="scroll-container store-picker-scroll">
          {visible.length === 0 ? (
            <div className="store-picker-empty">
              {storeSearch ? t('storePicker.noMatch', { search: storeSearch }) : t('storePicker.noStores')}
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
                  <span className="store-picker-item-status">{t('storePicker.openNow')}</span>
                  {store.pickup_lead_minutes != null && (
                    <div className="store-picker-pickup-badge">
                      <Clock size={12} />
                      <span>{t('storePicker.readyIn', { minutes: store.pickup_lead_minutes })}</span>
                    </div>
                  )}
                  {store.distance && (
                    <div className="store-picker-distance">
                      <Navigation size={12} />
                      {store.distance} away
                    </div>
                  )}
                </div>
                {isSelected && (
                  <div className="store-picker-check">
                    <Check size={15} color={LOKA.white} strokeWidth={3} />
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
