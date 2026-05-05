'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Home, Building2, HelpCircle, Trash2, Pencil, Plus, Clock } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { PageHeader } from '@/components/shared';
import { BottomSheet } from '@/components/ui/BottomSheet';
import api from '@/lib/api';
import { LOKA } from '@/lib/tokens';

interface Address {
  id: number; label: string; address: string; apartment?: string;
  building?: string; city?: string; postcode?: string; state?: string;
  delivery_instructions?: string; lat?: number; lng?: number; is_default: boolean;
}

const LABELS = ['Home', 'Office', 'Other'] as const;
const ICONS: Record<string, typeof Home> = { Home, Office: Building2, Other: HelpCircle };
const STATES = ['Johor','Kedah','Kelantan','Kuala Lumpur','Labuan','Melaka','Negeri Sembilan',
  'Pahang','Perak','Perlis','Pulau Pinang','Putrajaya','Sabah','Sarawak','Selangor','Terengganu'];

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  return R * 2 * Math.atan2(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2), Math.sqrt(1 - (Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2)));
}

export default function SavedAddressesPage() {
  const { setPage, showToast, selectedStore } = useUIStore();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLabel, setFormLabel] = useState('Home');
  const [unit, setUnit] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [state, setState] = useState('Kuala Lumpur');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const fetchAddresses = () => {
    setLoading(true);
    api.get('/users/me/addresses')
      .then((res) => {
        const list = Array.isArray(res.data) ? [...res.data] : [];
        const order = ['Home', 'Office', 'Other'];
        list.sort((a: Address, b: Address) => order.indexOf(a.label) - order.indexOf(b.label));
        setAddresses(list);
      })
      .catch(() => setAddresses([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchAddresses(); }, []);

  const usedLabels = new Set(addresses.map((a: Address) => a.label?.toLowerCase()));

  const openAdd = () => {
    setEditingId(null);
    const first = LABELS.find(l => !usedLabels.has(l.toLowerCase())) || 'Home';
    setFormLabel(first);
    setUnit(''); setLine1(''); setLine2(''); setCity(''); setPostcode(''); setState('Kuala Lumpur');
    setModalOpen(true);
  };

  const openEdit = (addr: Address) => {
    setEditingId(addr.id);
    setFormLabel(addr.label);
    setUnit(addr.apartment || '');
    setLine1(addr.address || '');
    setLine2(addr.building || '');
    setCity(addr.city || '');
    setPostcode(addr.postcode || '');
    setState(addr.state || 'Kuala Lumpur');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!unit.trim() && !line1.trim()) { showToast('Address is required', 'error'); return; }
    setSaving(true);
    const payload: any = {
      label: formLabel, address: line1.trim(), apartment: unit.trim() || undefined,
      building: line2.trim() || undefined, city: city.trim() || undefined,
      postcode: postcode.trim() || undefined, state: state,
    };
    try {
      if (editingId) {
        await api.put(`/users/me/addresses/${editingId}`, payload);
        showToast('Address updated', 'success');
      } else {
        await api.post('/users/me/addresses', payload);
        showToast('Address saved', 'success');
      }
      setModalOpen(false);
      fetchAddresses();
    } catch { showToast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/me/addresses/${id}`);
      showToast('Address deleted', 'success');
      setDeleteTarget(null);
      fetchAddresses();
    } catch { showToast('Failed to delete', 'error'); }
  };

  const getDistance = (addr: Address): string | null => {
    if (!addr.lat || !addr.lng || !selectedStore?.lat || !selectedStore?.lng) return null;
    const km = haversineDistance(addr.lat, addr.lng, selectedStore.lat, selectedStore.lng);
    const min = Math.round((km / 30) * 60);
    return `${km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km'} · ~${min} min drive`;
  };

  const fullDisplay = (addr: Address): string => {
    const lines: string[] = [];
    if (addr.apartment && addr.address) {
      lines.push(`${addr.apartment}, ${addr.address}`);
    } else if (addr.apartment) {
      lines.push(addr.apartment);
    } else if (addr.address) {
      lines.push(addr.address);
    }
    if (addr.building) lines.push(addr.building);
    const loc = [addr.postcode, addr.city].filter(Boolean).join(' ');
    if (loc) lines.push(loc);
    if (addr.state) lines.push(addr.state);
    return lines.join('\n');
  };

  return (
    <div className="sav2-page">
      <PageHeader title="Saved Addresses" onBack={() => setPage('profile')} />
      <div className="sav2-content">
        {loading ? (
          <div className="sav2-skeleton-list">
            {[1, 2].map((i: number) => <div key={i} className="skeleton sav2-skeleton-item" />)}
          </div>
        ) : addresses.length === 0 ? (
          <div className="sav2-empty">
            <div className="sav2-empty-icon"><MapPin size={28} color={LOKA.borderLight} /></div>
            <p className="sav2-empty-title">No saved addresses</p>
            <p className="sav2-empty-desc">Add an address for faster delivery checkout</p>
          </div>
        ) : (
          addresses.map((addr: Address) => {
            const dist = getDistance(addr);
            const confirm = deleteTarget === addr.id;
            const Icon = ICONS[addr.label] || MapPin;
            return (
              <motion.div key={addr.id} layout className="sav2-card">
                <div className="sav2-card-top">
                  <div className="sav2-pin-icon"><Icon size={20} /></div>
                  <div className="sav2-card-main">
                    <div className="sav2-card-name-row"><span className="sav2-card-name">{addr.label}</span></div>
                    <div className="sav2-card-address">{fullDisplay(addr)}</div>
                    {dist && <span className="sav2-distance-badge"><Clock size={12} />{dist}</span>}
                  </div>
                  <div className="sav2-card-actions">
                    <button onClick={() => openEdit(addr)} className="sav2-edit-btn"><Pencil size={14} color={LOKA.textMuted} /></button>
                    <button onClick={() => setDeleteTarget(confirm ? null : addr.id)} className={`sav2-delete-btn${confirm ? ' sav2-delete-btn-confirming' : ''}`}><Trash2 size={14} color={LOKA.danger} /></button>
                  </div>
                </div>
                {confirm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="sav2-delete-confirm">
                    <span className="sav2-delete-confirm-text">Delete this address?</span>
                    <button onClick={() => handleDelete(addr.id)} className="sav2-delete-confirm-yes">Delete</button>
                    <button onClick={() => setDeleteTarget(null)} className="sav2-delete-confirm-no">Cancel</button>
                  </motion.div>
                )}
              </motion.div>
            );
          })
        )}
        <motion.button whileTap={{ scale: 0.98 }} onClick={openAdd} className="sav2-add-btn">
          <Plus size={18} /> Add New Address
        </motion.button>
      </div>

      <BottomSheet isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Address' : 'Add New Address'}>
        <div className="sheet-body">
          <div className="sav2-label-row">
            {LABELS.map(lbl => {
              const I = ICONS[lbl];
              const exists = usedLabels.has(lbl.toLowerCase());
              const locked = !!editingId || (!editingId && exists);
              return (
                <button key={lbl} onClick={() => { if (!locked) setFormLabel(lbl); }} disabled={locked}
                  className={`sav2-label-pill${formLabel === lbl ? ' active' : ''}${locked ? ' disabled' : ''}`}>
                  <I size={16} />{lbl}{exists ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
          <div className="sav2-field">
            <label className="sav2-field-label">Unit / Apartment No.</label>
            <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. 123 or A-3-5" autoComplete="address-line1" className="sav2-input" />
          </div>
          <div className="sav2-field">
            <label className="sav2-field-label">Address Line 1</label>
            <input value={line1} onChange={e => setLine1(e.target.value)} placeholder="Jalan / Lorong / Persiaran" autoComplete="street-address" className="sav2-input" />
          </div>
          <div className="sav2-field">
            <label className="sav2-field-label">Address Line 2 (optional)</label>
            <input value={line2} onChange={e => setLine2(e.target.value)} placeholder="Building / Taman name" autoComplete="address-line2" className="sav2-input" />
          </div>
          <div className="sav2-field">
            <label className="sav2-field-label" htmlFor="sa-city">City</label>
            <input id="sa-city" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Cheras, Petaling Jaya" className="sav2-input" />
          </div>
          <div className="sav2-field-row">
            <div className="sav2-field sav2-field-half">
              <label className="sav2-field-label" htmlFor="sa-postcode">Postcode</label>
            <input id="sa-postcode" value={postcode} onChange={e => setPostcode(e.target.value.replace(/\D/g,'').slice(0,5))} inputMode="numeric" maxLength={5} placeholder="50400" className="sav2-input" />
            </div>
            <div className="sav2-field sav2-field-half">
              <label className="sav2-field-label" htmlFor="sa-state">State</label>
              <select value={state} onChange={e => setState(e.target.value)} className="sav2-input" style={{ appearance:'none', backgroundImage:'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236A7A8A\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat:'no-repeat', backgroundPosition:'right 14px center', paddingRight:44 }}>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} className="sav2-save-btn mt-1">
            {saving ? 'Saving...' : 'Save Address'}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
