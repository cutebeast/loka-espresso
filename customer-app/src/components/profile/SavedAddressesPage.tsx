'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Plus, Home, Building2, Navigation, Trash2, X, Check } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { PageHeader } from '@/components/shared';
import api from '@/lib/api';

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
    } catch { console.error('Failed to load addresses');
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
    } catch { console.error('Failed to load addresses');
      showToast('Failed to delete address', 'error');
    }
  };

  const labelIcon = (label: string) => {
    const Icon = LABEL_ICONS[label?.toLowerCase()] || MapPin;
    return <Icon size={20} color="#384B16" />;
  };

  return (
    <div className="sa-page">
      <PageHeader title="Saved Addresses" onBack={() => setPage('profile')} />

      <div className="sa-content">
        {loading ? (
          <div className="sa-skeleton-list">
            {[1, 2].map((i) => (
              <div key={i} className="skeleton sa-skeleton-item" />
            ))}
          </div>
        ) : addresses.length === 0 && !showAdd ? (
          <div className="sa-empty">
            <div className="sa-empty-icon">
              <MapPin size={36} color="#D4DCE5" />
            </div>
            <p className="sa-empty-title">No saved addresses</p>
            <p className="sa-empty-desc">Add an address for faster delivery checkout</p>
          </div>
        ) : (
          addresses.map((addr) => (
            <motion.div
              key={addr.id}
              whileTap={{ scale: 0.98 }}
              className="sa-item"
            >
              <div className="sa-icon-wrap">
                {labelIcon(addr.label)}
              </div>
              <div className="sa-info">
                <div className="sa-header">
                  <p className="sa-label">{addr.label}</p>
                  {addr.is_default && (
                    <span className="sa-badge">
                      Default
                    </span>
                  )}
                </div>
                <p className="sa-address">
                  {addr.address}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => handleDelete(addr.id)}
                className="sa-delete-btn"
              >
                <Trash2 size={16} color="#C75050" />
              </motion.button>
            </motion.div>
          ))
        )}

        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="sa-form"
          >
            <div className="sa-form-header">
              <p className="sa-form-title">New Address</p>
              <button onClick={() => setShowAdd(false)} className="sa-close-btn">
                <X size={18} color="#6A7A8A" />
              </button>
            </div>

            <div className="sa-labels">
              {['Home', 'Office', 'Other'].map((lbl) => (
                <button
                  key={lbl}
                  onClick={() => setNewLabel(lbl)}
                  className={`sa-label-btn ${newLabel === lbl ? 'sa-label-btn-active' : 'sa-label-btn-inactive'}`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="sa-input-wrap">
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Enter your address"
                className="sa-input"
              />
              <button
                onClick={handleGetCurrentLocation}
                className="sa-loc-btn"
              >
                <Navigation size={18} color="#384B16" />
              </button>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleAdd}
              disabled={saving}
              className={`sa-save-btn ${saving ? 'sa-save-btn-disabled' : 'sa-save-btn-enabled'}`}
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
            className="sa-add-btn"
          >
            <Plus size={18} /> Add Address
          </motion.button>
        )}
      </div>
    </div>
  );
}
