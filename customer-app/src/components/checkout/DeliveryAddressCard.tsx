'use client';

import { useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { LOKA } from '@/lib/tokens';

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
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={16} color={LOKA.copper} />
        <span className="font-bold text-text-primary" style={{ fontSize: 13 }}>Delivery Address</span>
      </div>
      <div className="relative">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          placeholder="Enter delivery address"
          rows={2}
          className="w-full px-3.5 py-3 rounded-[14px] border border-border-subtle bg-white text-sm text-text-primary resize-none outline-none"
          style={{
            paddingRight: 44,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleUseCurrentLocation}
          className="absolute right-3 top-3 w-8 h-8 rounded-lg bg-copper-soft border-none cursor-pointer flex items-center justify-center"
          aria-label="Use current location"
        >
          <Navigation size={16} color={LOKA.copper} />
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
