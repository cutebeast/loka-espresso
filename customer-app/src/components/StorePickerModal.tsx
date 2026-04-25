'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Store, MapPin, Check, X } from 'lucide-react';
import { LOKA } from '@/lib/tokens';
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
      {/* TODO: extract to CSS */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,19,23,0.55)', backdropFilter: 'blur(2px)' }} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        /* TODO: extract to CSS */
        style={{
          position: 'relative', width: '100%', maxWidth: 430, background: '#FFFFFF',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          boxShadow: '0 -20px 50px -12px rgba(15,19,23,0.25)',
          display: 'flex', flexDirection: 'column', maxHeight: '82vh', overflow: 'hidden',
        }}
      >
        {/* TODO: extract to CSS */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 44, height: 4, borderRadius: 999, background: LOKA.border }} />
        </div>
        <div style={{ padding: '12px 22px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: LOKA.copper, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              <MapPin size={11} style={{ display: 'inline', marginRight: 4 }} />
              Pickup location
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: LOKA.textPrimary, marginTop: 2, letterSpacing: '-0.01em' }}>
              Select your Loka
            </h3>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 44, height: 44, borderRadius: 999, background: LOKA.surface,
              border: 'none', display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', color: LOKA.textMuted, cursor: 'pointer',
            }}
          >
            <X size={18} />
          </motion.button>
        </div>
        <div style={{ padding: '0 22px 14px' }}>
          {/* TODO: extract to CSS */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', borderRadius: 999,
              background: LOKA.surface, border: `1px solid ${LOKA.borderSubtle}`,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: LOKA.textMuted, flexShrink: 0 }} aria-hidden>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
              placeholder="Search by name or area"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: LOKA.textPrimary }}
            />
            {storeSearch && (
              <button onClick={() => setStoreSearch('')} aria-label="Clear" style={{ background: 'transparent', border: 'none', padding: 0, color: LOKA.textMuted, cursor: 'pointer', display: 'inline-flex' }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {/* TODO: extract to CSS */}
        <div style={{ padding: '0 22px 8px', fontSize: 12, fontWeight: 700, color: LOKA.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {storeSearch ? `${visible.length} result${visible.length === 1 ? '' : 's'}` : 'Nearest to you'}
        </div>
        <div className="scroll-container" style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px' }}>
          {visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: LOKA.textMuted, fontSize: 14 }}>
              {storeSearch ? `No stores match "${storeSearch}"` : 'No stores available'}
            </div>
          ) : visible.map((store) => {
            const isSelected = selectedStore?.id === store.id;
            return (
              <motion.button
                key={store.id}
                whileTap={{ scale: 0.985 }}
                onClick={() => onSelect(store)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  padding: 14, marginBottom: 8, borderRadius: 18,
                  background: isSelected ? 'rgba(56,75,22,0.06)' : '#FFFFFF',
                  border: `1.5px solid ${isSelected ? LOKA.primary : LOKA.borderSubtle}`,
                  cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: isSelected ? LOKA.primary : LOKA.copperSoft,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Store size={18} style={{ color: isSelected ? '#FFFFFF' : LOKA.copper }} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{store.name}</div>
                  {store.address && <div style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{store.address}</div>}
                  <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 11, color: LOKA.textMuted }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#5C8A3E', fontWeight: 600 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: '#5C8A3E' }} />Open now
                    </span>
                    {store.distance && <span style={{ fontWeight: 600, color: LOKA.copper }}>· {store.distance}</span>}
                    {store.pickup_lead_minutes != null && <span>· Pickup in ~{store.pickup_lead_minutes} min</span>}
                  </div>
                </div>
                {isSelected && (
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: LOKA.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
