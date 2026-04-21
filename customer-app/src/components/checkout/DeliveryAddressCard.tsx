'use client';

import { useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  white: '#FFFFFF',
};

interface DeliveryAddressCardProps {
  value: { address: string; lat?: number; lng?: number } | null;
  onChange: (address: { address: string; lat?: number; lng?: number } | null) => void;
}

export default function DeliveryAddressCard({ value, onChange }: DeliveryAddressCardProps) {
  const [inputValue, setInputValue] = useState(value?.address || '');
  const [error, setError] = useState('');

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Location access is not supported on this device.');
      return;
    }
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
          .then(res => res.json())
          .then(data => {
            const addr = data.display_name || `${latitude}, ${longitude}`;
            setInputValue(addr);
            onChange({ address: addr, lat: latitude, lng: longitude });
          })
          .catch(() => {
            setInputValue(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
            onChange({ address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, lat: latitude, lng: longitude });
          });
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError('Please allow location access or enter your address manually.');
          return;
        }
        setError('We could not fetch your current location. Please enter your address manually.');
      }
    );
  };

  const handleBlur = () => {
    const nextAddress = inputValue.trim();
    if (!nextAddress) {
      onChange(null);
      return;
    }
    const keepCoordinates = nextAddress === (value?.address || '').trim();
    onChange({ address: nextAddress, lat: keepCoordinates ? value?.lat : undefined, lng: keepCoordinates ? value?.lng : undefined });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <MapPin size={16} color={LOKA.copper} />
        <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary }}>Delivery Address</span>
      </div>
      <div style={{ position: 'relative' }}>
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          placeholder="Enter delivery address"
          rows={2}
          style={{
            width: '100%', padding: '12px 14px', paddingRight: 44,
            borderRadius: 14, border: `1px solid ${LOKA.borderSubtle}`,
            background: LOKA.white, fontSize: 14, color: LOKA.textPrimary,
            resize: 'none', outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleUseCurrentLocation}
          style={{
            position: 'absolute', right: 12, top: 12,
            width: 32, height: 32, borderRadius: 8,
            background: LOKA.copperSoft, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Use current location"
        >
          <Navigation size={16} color={LOKA.copper} />
        </button>
      </div>
      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#C75050' }}>{error}</p>
      )}
    </div>
  );
}
