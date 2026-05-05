'use client';

import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Share2, QrCode, Star, Clock, Settings } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/hooks/useTranslation';
import QRCode from 'qrcode';
import api from '@/lib/api';
import { LOKA } from '@/lib/tokens';

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];

export default function MyCardPage() {
  const { t } = useTranslation();
  const { setPage, showToast } = useUIStore();
  const { points, tier } = useWalletStore();
  const { user } = useAuthStore();

  const [memberSince, setMemberSince] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/users/me')
      .then((res) => {
        const created = res.data?.created_at;
        if (created) {
          setMemberSince(new Date(created).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' }));
        }
      })
      .catch(() => setMemberSince('Recently'));
  }, []);

  /* Generate QR code for the user's ID to be scanned by staff */
  useEffect(() => {
    if (!user?.id) return;
    const qrPayload = `loka:customer:${user.id}`;
    QRCode.toDataURL(qrPayload, {
      width: 120,
      margin: 0,
      color: { dark: LOKA.textPrimary, light: LOKA.white },
    }).then(setQrDataUrl).catch(() => {});
  }, [user?.id]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'My Loka Espresso Card',
          text: `Join Loka Espresso! My referral code: ${user?.referral_code || ''}`,
          url: `https://app.loyaltysystem.uk?ref=${user?.referral_code || ''}`,
        });
      } else {
        await navigator.clipboard.writeText(user?.referral_code || '');
        showToast('Referral code copied!', 'success');
      }
    } catch { /* cancelled */ }
  };

  const initials = user?.name?.charAt(0)?.toUpperCase() || 'M';
  const memberId = user?.id ? `ID: LOKA-${String(user.id).padStart(6, '0')}` : '';

  return (
    <div className="mycard-screen">
      <div className="mycard-header">
        <button className="mycard-back-btn" onClick={() => setPage('profile')} aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="mycard-title">{t('myCard.title')}</h1>
      </div>

      <div className="mycard-content">
        {/* Physical card */}
        <div className="mycard-physical" ref={cardRef}>
          <div className="mycard-top">
            <div className="mycard-brand">{t('myCard.brand')}</div>
            <div className="mycard-tier-badge">{t('profile.tierMember', { tier })}</div>
          </div>

          <div className="mycard-middle">
            <div className="mycard-qr-area">
              <div className="mycard-qr">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Member QR" width={56} height={56} />
                ) : (
                  <QrCode size={28} color={LOKA.border} />
                )}
              </div>
              <div className="mycard-member-info">
                <div className="mycard-member-name">{user?.name || t('myCard.member')}</div>
                <div className="mycard-member-id">{memberId}</div>
              </div>
            </div>
          </div>

          <div className="mycard-bottom">
            <div className="mycard-points-display">
              <div className="mycard-pts-val">{points.toLocaleString()}</div>
              <div className="mycard-pts-label">{t('myCard.totalPoints')}</div>
            </div>
            {memberSince && <div className="mycard-since">Since {memberSince.split(' ')[0]} {memberSince.split(' ')[1]?.slice(0,3)}</div>}
          </div>
        </div>

        {/* Tier progress row */}
        <div className="mycard-tier-row">
          {TIERS.map((t) => (
            <div key={t} className={`mycard-tier-pill ${t === tier ? 'active' : ''}`}>
              {t}
            </div>
          ))}
        </div>

        {/* Share button */}
        <button className="mycard-share-btn" onClick={handleShare}>
          <Share2 size={18} />
          Share my card
        </button>

        {/* Quick actions */}
        <div className="mycard-actions">
          <button className="mycard-action-btn" onClick={() => setPage('home')}>
            <div className="mycard-action-icon">
              <QrCode size={16} color={LOKA.brown} />
            </div>
            Home
          </button>
          <button className="mycard-action-btn" onClick={() => setPage('history')}>
            <div className="mycard-action-icon">
              <Clock size={16} color={LOKA.brown} />
            </div>
            History
          </button>
          <button className="mycard-action-btn" onClick={() => setPage('settings')}>
            <div className="mycard-action-icon">
              <Settings size={16} color={LOKA.brown} />
            </div>
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
