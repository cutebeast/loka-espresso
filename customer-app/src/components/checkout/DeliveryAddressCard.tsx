'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Home, Building2, HelpCircle } from 'lucide-react';
import { LOKA } from '@/lib/tokens';
import { useAuthStore } from '@/stores/authStore';
import { BottomSheet } from '@/components/ui/BottomSheet';
import api from '@/lib/api';

interface SavedAddress {
  id: number; label: string; address: string; apartment?: string;
  building?: string; city?: string; postcode?: string; state?: string;
  delivery_instructions?: string; lat?: number; lng?: number;
}

interface Props {
  value: { address: string; lat?: number; lng?: number } | null;
  onChange: (a: { address: string; lat?: number; lng?: number } | null) => void;
}

const LABELS = ['Home', 'Office', 'Other'] as const;
const ICONS: Record<string, typeof Home> = { Home, Office: Building2, Other: HelpCircle };
const STATES = ['Johor','Kedah','Kelantan','Kuala Lumpur','Labuan','Melaka','Negeri Sembilan',
  'Pahang','Perak','Perlis','Pulau Pinang','Putrajaya','Sabah','Sarawak','Selangor','Terengganu'];

export default function DeliveryAddressCard({ value, onChange }: Props) {
  /* Sheet state */
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('Home');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [unit, setUnit] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [state, setState] = useState('Kuala Lumpur');
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const dismissed = useRef(false);
  const prevLabel = useRef(label);
  const user = useAuthStore((s) => s.user);

  /* Fetch */
  const fetchSaved = async () => {
    if (!user) return;
    const r: any = await api.get('/users/me/addresses').catch(() => ({ data: [] }));
    if (Array.isArray(r.data)) setSaved(r.data);
  };
  useEffect(() => { fetchSaved(); }, [user]);

  /* Auto-open when no address */
  useEffect(() => {
    if (!value?.address && !dismissed.current) {
      const t = setTimeout(() => {
        setName(user?.name || '');
        setPhone(user?.phone || '');
        setOpen(true);
      }, 100);
      return () => clearTimeout(t);
    }
  }, [value?.address, user]);

  /* Find saved address for current label */
  const savedForLabel = useMemo(
    () => saved.find(s => s.label?.toLowerCase() === label.toLowerCase()) || null,
    [saved, label],
  );

  /* When label changes → pull from address book */
  useEffect(() => {
    if (!open) return;
    const labelChanged = prevLabel.current !== label;
    prevLabel.current = label;
    // Allow fill on label change; only guard against stale saved updates
    if (!labelChanged && (unit || line1 || line2 || city || postcode)) return;
    const m = savedForLabel;
    if (m) {
      setUnit(m.apartment || '');
      setLine1(m.address || '');
      setLine2(m.building || '');
      setCity(m.city || '');
      setPostcode(m.postcode || '');
      setState(m.state || 'Kuala Lumpur');
      setLat(m.lat);
      setLng(m.lng);
    } else {
      setUnit('');
      setLine1('');
      setLine2('');
      setCity('');
      setPostcode('');
      setState('Kuala Lumpur');
      setLat(undefined);
      setLng(undefined);
    }
  }, [label, open, saved]);

  /* Open sheet */
  const openSheet = () => {
    dismissed.current = false;
    // Find saved address matching current value by checking if value contains the saved address
    const match = saved.find(s => {
      const sFull = s.apartment ? `${s.apartment}, ${s.address}` : s.address;
      return value?.address?.includes(s.address) || value?.address?.includes(sFull);
    });
    setLabel(match?.label || 'Home');
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setErr('');
    setOpen(true);
  };
  const closeSheet = () => { dismissed.current = true; setOpen(false); };

  /* Save */
  const save = async () => {
    if (!unit.trim() && !line1.trim()) { setErr('Address is required'); return; }
    setSaving(true); setErr('');
    const p: string[] = [];
    if (unit.trim()) p.push(unit.trim());
    if (line1.trim()) p.push(line1.trim());
    if (line2.trim()) p.push(line2.trim());
    const cs: string[] = [];
    if (postcode.trim()) cs.push(postcode.trim());
    if (city.trim()) cs.push(city.trim());
    if (cs.length) p.push(cs.join(' '));
    p.push(state);
    const full = p.join(', ');

    try {
      const payload: any = {
        label,
        address: line1.trim(),
        apartment: unit.trim() || undefined,
        building: line2.trim() || undefined,
        city: city.trim() || undefined,
        postcode: postcode.trim() || undefined,
        state,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
      };
      if (savedForLabel) {
        await api.put(`/users/me/addresses/${savedForLabel.id}`, payload);
      } else {
        await api.post('/users/me/addresses', { ...payload });
      }
      await fetchSaved();
    } catch (e) {
      console.error('Failed to save address to book:', e);
    }
    onChange({ address: full, lat, lng });
    setSaving(false);
    setOpen(false);
  };

  /* Display label + formatted multi-line address */
  const displayInfo = (): { label: string | null; formatted: string } => {
    if (!value?.address) return { label: null, formatted: '' };
    const m = saved.find(s => {
      const sFull = s.apartment ? `${s.apartment}, ${s.address}` : s.address;
      return value.address.includes(s.address) || value.address.includes(sFull);
    });
    if (m) {
      const lines: string[] = [];
      if (m.apartment && m.address) lines.push(`${m.apartment}, ${m.address}`);
      else if (m.apartment) lines.push(m.apartment);
      else if (m.address) lines.push(m.address);
      if (m.building) lines.push(m.building);
      const loc = [m.postcode, m.city].filter(Boolean).join(' ');
      if (loc) lines.push(loc);
      if (m.state) lines.push(m.state);
      return { label: m.label, formatted: lines.join('\n') };
    }
    return { label: null, formatted: value.address };
  };

  const info = displayInfo();
  const has = !!value?.address;

  return (
    <div>
      {has ? (
        <div className="dac-display-card">
          <div className="dac-display-icon"><MapPin size={18} color="#fff" /></div>
          <div className="dac-display-info">
            {info.label && <div className="dac-display-label">{info.label}</div>}
            <div className="dac-display-address">{info.formatted}</div>
            <button onClick={openSheet} className="dac-change-btn">Change address</button>
          </div>
        </div>
      ) : (
        <div className="dac-empty-card">
          <div className="dac-empty-icon"><MapPin size={20} color={LOKA.copper} /></div>
          <span className="dac-empty-text">Add delivery address</span>
          <button onClick={openSheet} className="dac-empty-btn">Enter Address</button>
        </div>
      )}

      <BottomSheet isOpen={open} onClose={closeSheet} title={has ? 'Change Address' : 'Delivery Address'}>
        <div className="sheet-body">

        {/* Label pills — auto-fill from DB for selected label */}
        <div className="dac-label-row">
          {LABELS.map(lbl => {
            const I = ICONS[lbl];
            return (
              <button key={lbl} onClick={() => setLabel(lbl)} className={`dac-label-pill${label === lbl ? ' active' : ''}`}>
                <I size={15} />{lbl}
              </button>
            );
          })}
        </div>

        {/* Unit / Apartment No */}
        <div className="dac-sheet-field">
          <label className="dac-sheet-label">Unit / Apartment No.</label>
          <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. 123 or A-3-5" className="dac-input" />
        </div>

        {/* Address Line 1 */}
        <div className="dac-sheet-field">
          <label className="dac-sheet-label">Address Line 1</label>
          <input value={line1} onChange={e => setLine1(e.target.value)} placeholder="Jalan / Lorong / Persiaran" className="dac-input" />
        </div>

        {/* Address Line 2 */}
        <div className="dac-sheet-field">
          <label className="dac-sheet-label">Address Line 2 (optional)</label>
          <input value={line2} onChange={e => setLine2(e.target.value)} placeholder="Building / Taman name" className="dac-input" />
        </div>

        {/* City */}
        <div className="dac-sheet-field">
          <label className="dac-sheet-label">City</label>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Cheras, Petaling Jaya" className="dac-input" />
        </div>

        {/* Postcode | State */}
        <div className="dac-sheet-row">
          <div className="dac-sheet-field dac-sheet-field-half">
            <label className="dac-sheet-label">Postcode</label>
            <input value={postcode} onChange={e => setPostcode(e.target.value.replace(/\D/g,'').slice(0,5))} inputMode="numeric" maxLength={5} placeholder="50400" className="dac-input" />
          </div>
          <div className="dac-sheet-field dac-sheet-field-half">
            <label className="dac-sheet-label">State</label>
            <select value={state} onChange={e => setState(e.target.value)} className="dac-select">
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Delivery Instructions (not saved to DB) */}
        <div className="dac-sheet-field" style={{ display: 'none' }}></div>

        {err && <p className="dac-error">{err}</p>}
        <button onClick={save} className="dac-save-btn" disabled={saving}>{saving ? 'Saving...' : 'Save Address'}</button>
        </div>
      </BottomSheet>
    </div>
  );
}
