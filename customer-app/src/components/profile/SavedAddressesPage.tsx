'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Plus, Home, Building2, Navigation, Edit3, Trash2, X, Check } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { PageHeader } from '@/components/shared';
import api from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

interface Address {
  id: number;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
  is_default: boolean;
}

const LABEL_ICONS: Record<string, typeof Home> = {
  home: Home,
  office: Building2,
  work: Building2,
};

export default function SavedAddressesPage() {
  const { setPage, showToast } = useUIStore();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newAddress, setNewAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAddresses = () => {
    api.get('/users/me/addresses')
      .then((res) => setAddresses(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAddresses([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAddresses(); }, []);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation not available', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewAddress(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        showToast('Location captured', 'success');
      },
      () => showToast('Could not get location', 'error')
    );
  };

  const handleAdd = async () => {
    if (!newAddress.trim()) {
      showToast('Address is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/users/me/addresses', {
        label: newLabel,
        address: newAddress.trim(),
        is_default: addresses.length === 0,
      });
      showToast('Address saved', 'success');
      setShowAdd(false);
      setNewAddress('');
      fetchAddresses();
    } catch {
      showToast('Failed to save address', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/me/addresses/${id}`);
      showToast('Address deleted', 'success');
      fetchAddresses();
    } catch {
      showToast('Failed to delete address', 'error');
    }
  };

  const labelIcon = (label: string) => {
    const Icon = LABEL_ICONS[label?.toLowerCase()] || MapPin;
    return <Icon size={20} color={LOKA.primary} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: LOKA.bg }}>
      <PageHeader title="Saved Addresses" onBack={() => setPage('profile')} />

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2].map((i) => (
              <div key={i} style={{ background: LOKA.white, borderRadius: 18, padding: 16, border: `1px solid ${LOKA.borderSubtle}`, height: 80 }} />
            ))}
          </div>
        ) : addresses.length === 0 && !showAdd ? (
          <div
            style={{
              background: LOKA.white,
              borderRadius: 20,
              padding: 32,
              textAlign: 'center',
              border: `1px solid ${LOKA.borderSubtle}`,
            }}
          >
            <MapPin size={36} color={LOKA.border} style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: LOKA.textMuted }}>No saved addresses</p>
            <p style={{ fontSize: 12, color: LOKA.textSecondary, marginTop: 4 }}>Add an address for faster delivery checkout</p>
          </div>
        ) : (
          addresses.map((addr) => (
            <motion.div
              key={addr.id}
              whileTap={{ scale: 0.98 }}
              style={{
                background: LOKA.white,
                borderRadius: 18,
                padding: 16,
                border: `1px solid ${LOKA.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: '#E8EDE0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {labelIcon(addr.label)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: LOKA.textPrimary }}>{addr.label}</p>
                  {addr.is_default && (
                    <span
                      style={{
                        background: '#E8EDE0',
                        color: LOKA.primary,
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      Default
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: LOKA.textSecondary, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {addr.address}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => handleDelete(addr.id)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Trash2 size={16} color='#C75050' />
              </motion.button>
            </motion.div>
          ))
        )}

        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: LOKA.white,
              borderRadius: 20,
              padding: 18,
              border: `1px solid ${LOKA.border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: LOKA.textPrimary }}>New Address</p>
              <button onClick={() => setShowAdd(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} color={LOKA.textMuted} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {['Home', 'Office', 'Other'].map((lbl) => (
                <button
                  key={lbl}
                  onClick={() => setNewLabel(lbl)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 12,
                    background: newLabel === lbl ? LOKA.primary : LOKA.surface,
                    color: newLabel === lbl ? LOKA.white : LOKA.textSecondary,
                    fontWeight: 600,
                    fontSize: 13,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Enter your address"
                style={{
                  width: '100%',
                  padding: '12px 44px 12px 14px',
                  borderRadius: 14,
                  border: `1px solid ${LOKA.borderSubtle}`,
                  fontSize: 14,
                  color: LOKA.textPrimary,
                  outline: 'none',
                  background: LOKA.surface,
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleGetCurrentLocation}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <Navigation size={18} color={LOKA.primary} />
              </button>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleAdd}
              disabled={saving}
              style={{
                width: '100%',
                padding: '14px 0',
                borderRadius: 999,
                background: saving ? LOKA.border : LOKA.primary,
                color: LOKA.white,
                fontWeight: 700,
                fontSize: 14,
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Check size={18} />
              {saving ? 'Saving...' : 'Save Address'}
            </motion.button>
          </motion.div>
        )}

        {!showAdd && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAdd(true)}
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 999,
              border: `2px dashed ${LOKA.border}`,
              background: 'transparent',
              color: LOKA.textSecondary,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Plus size={18} /> Add Address
          </motion.button>
        )}
      </div>
    </div>
  );
}
