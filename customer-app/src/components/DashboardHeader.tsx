'use client';

import { motion } from 'framer-motion';
import { QrCode, Bell, Store as StoreIcon, User, Crown, MapPin, ChevronDown } from 'lucide-react';
import { LOKA } from '@/lib/tokens';
import { useWalletStore } from '@/stores/walletStore';
import type { Store } from '@/lib/api';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

interface DashboardHeaderProps {
  userName?: string;
  selectedStore: Store | null;
  selectedStoreDistance: string;
  onShowStoreModal: () => void;
  onShowQRScanner: () => void;
  onShowNotifications: () => void;
  onShowProfile: () => void;
}

export default function DashboardHeader({
  userName,
  selectedStore,
  selectedStoreDistance,
  onShowStoreModal,
  onShowQRScanner,
  onShowNotifications,
  onShowProfile,
}: DashboardHeaderProps) {
  const tier = useWalletStore((s) => s.tier);

  return (
    <div
      style={{
        background: '#FFFFFF',
        padding: '16px 16px 14px',
        borderBottom: `1px solid ${LOKA.border}`,
      }}
    >
      <div className="flex items-start justify-between" style={{ gap: 12 }}>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13, fontWeight: 500, color: LOKA.textMuted, marginBottom: 4 }}>
            {getGreeting()}
          </div>
          <div
            style={{
              fontSize: 22, fontWeight: 800, color: LOKA.copper, letterSpacing: '-0.01em',
              lineHeight: 1.15, textTransform: 'uppercase', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {userName || 'Guest'}
          </div>
          <div className="flex items-center" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 999,
                background: LOKA.copperSoft, color: LOKA.copper,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                textTransform: 'uppercase', border: '1px solid rgba(209,142,56,0.25)',
              }}
            >
              <Crown size={11} strokeWidth={2.5} />
              {(tier || 'Bronze').toUpperCase()}
            </span>
            <button
              onClick={onShowStoreModal}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: LOKA.textMuted,
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              }}
            >
              <MapPin size={11} style={{ color: LOKA.copper }} />
              <span style={{ maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedStore?.name || 'Select store'}
                {selectedStoreDistance && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>· {selectedStoreDistance}</span>
                )}
              </span>
              <ChevronDown size={10} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 40px)',
            gridTemplateRows: 'repeat(2, 40px)', gap: 8, flexShrink: 0,
          }}
        >
          {[
            { icon: QrCode, label: 'Scan table QR', primary: true, onClick: onShowQRScanner },
            { icon: Bell, label: 'Notifications', onClick: onShowNotifications },
            { icon: StoreIcon, label: 'Switch store', onClick: onShowStoreModal },
            { icon: User, label: 'Profile', onClick: onShowProfile },
          ].map(({ icon: Icon, label, primary, onClick }) => (
            <motion.button
              key={label}
              whileTap={{ scale: 0.92 }}
              onClick={onClick}
              aria-label={label}
              title={label}
              style={{
                width: 40, height: 40, borderRadius: 12,
                background: primary ? LOKA.copperSoft : LOKA.surface,
                border: primary ? '1px solid rgba(209,142,56,0.30)' : 'none',
                color: primary ? LOKA.copper : LOKA.textPrimary,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon size={17} strokeWidth={primary ? 2.2 : 1.8} />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
