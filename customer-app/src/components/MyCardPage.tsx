'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, QrCode, Crown } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

export default function MyCardPage() {
  const { setPage } = useUIStore();
  const { points } = useWalletStore();
  const { user } = useAuthStore();

  const [memberSince, setMemberSince] = useState('');

  useEffect(() => {
    api.get('/users/me')
      .then((res) => {
        const created = res.data?.created_at;
        if (created) {
          const date = new Date(created);
          setMemberSince(date.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' }));
        }
      })
      .catch(() => {
        setMemberSince('Recently');
      });
  }, []);

  return (
    <div className="mycard-screen">
      {/* Header */}
      <div className="mycard-header">
        <button className="mycard-back-btn" onClick={() => setPage('profile')} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="mycard-title">My Card</h1>
      </div>

      {/* Card Content */}
      <div className="mycard-content">
        {/* QR Code Placeholder */}
        <div className="mycard-qr-box">
          <div className="mycard-qr-inner">
            <QrCode size={80} strokeWidth={1.5} />
            <p className="mycard-qr-label">Member QR</p>
          </div>
        </div>

        <div className="mycard-member-name">{user?.name || 'Member'}</div>
        <div className="mycard-member-since">
          {memberSince ? `Member since ${memberSince}` : 'Member'}
        </div>

        <div className="mycard-points-row">
          <Crown size={16} /> {points.toLocaleString()} pts
        </div>

        <p className="mycard-info-text">
          Show this code at the counter to earn points, redeem rewards, or top up your balance.
        </p>
      </div>
    </div>
  );
}
