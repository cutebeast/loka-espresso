'use client';

import { useState, useEffect } from 'react';
import { MapPin, Navigation, ChevronDown } from 'lucide-react';
import { LOKA } from '@/lib/tokens';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

interface SavedAddress {
  id: number;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
}

interface DeliveryAddressCardProps {
  value: { address: string; lat?: number; lng?: number } | null;
  onChange: (address: { address: string; lat?: number; lng?: number } | null) => void;
}

export default function DeliveryAddressCard({ value, onChange }: DeliveryAddressCardProps) {
  const [inputValue, setInputValue] = useState(value?.address || '');
  const [error, setError] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) {
      api.get('/users/me/addresses')
        .then((res) => {
          if (Array.isArray(res.data)) setSavedAddresses(res.data);
        })
        .catch(() => {});
    }
  }, [user]);

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

  const handleUseSaved = (saved: SavedAddress) => {
    setInputValue(saved.address);
    onChange({ address: saved.address, lat: saved.lat, lng: saved.lng });
    setShowSaved(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={16} color={LOKA.copper} />
        <span className="font-bold text-text-primary dac-title">Delivery Address</span>
      </div>
      <div className="relative">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          placeholder="Enter delivery address"
          rows={2}
          className="w-full px-3.5 py-3 rounded-[14px] border border-border-subtle bg-white text-sm text-text-primary resize-none outline-none dac-textarea"
        />
        <button
          onClick={handleUseCurrentLocation}
          className="absolute right-3 top-3 w-10 h-10 rounded-lg bg-copper-soft border-none cursor-pointer flex items-center justify-center"
          aria-label="Use current location"
        >
          <Navigation size={16} color={LOKA.copper} />
        </button>
      </div>
      {savedAddresses.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary border-none bg-transparent cursor-pointer"
          >
            <ChevronDown size={12} style={{ transform: showSaved ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
            Use a saved address ({savedAddresses.length})
          </button>
          {showSaved && (
            <div className="mt-2 flex flex-col gap-1.5">
              {savedAddresses.map((saved) => (
                <button
                  key={saved.id}
                  onClick={() => handleUseSaved(saved)}
                  className="text-left py-2.5 px-3 rounded-xl border border-border-subtle bg-surface text-sm text-text-primary cursor-pointer transition-colors hover:border-copper dac-saved-btn"
                >
                  <span className="font-semibold">{saved.label}</span>
                  <span className="text-text-muted text-xs block mt-0.5">{saved.address}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
