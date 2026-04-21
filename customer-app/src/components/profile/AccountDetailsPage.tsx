'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Camera, Save } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { PageHeader } from '@/components/shared';
import api from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperLight: '#E5A559',
  copperSoft: 'rgba(209,142,56,0.12)',
  cream: '#F3EEE5',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

export default function AccountDetailsPage() {
  const { user, setUser } = useAuthStore();
  const { setPage, showToast } = useUIStore();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/users/me').then((res) => {
      if (res.data) {
        setUser(res.data);
        setName(res.data.name || '');
        setEmail(res.data.email || '');
      }
    }).catch(() => {});
  }, [setUser]);

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put('/users/me', { name: name.trim(), email: email.trim() || undefined });
      setUser(res.data);
      showToast('Profile updated', 'success');
    } catch {
      showToast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const initials = (user?.name || 'U').charAt(0).toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: LOKA.bg }}>
      <PageHeader title="Account Details" onBack={() => setPage('profile')} />

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0 16px' }}>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: 999,
                background: `linear-gradient(135deg, ${LOKA.primary} 0%, ${LOKA.copper})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: LOKA.white,
                fontSize: 36,
                fontWeight: 800,
              }}
            >
              {initials}
            </div>
            {user?.avatar_url && (
              <img
                src={user.avatar_url.startsWith('http') ? user.avatar_url : `https://admin.loyaltysystem.uk${user.avatar_url}`}
                alt=""
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: 88,
                  height: 88,
                  borderRadius: 999,
                  objectFit: 'cover',
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 30,
                height: 30,
                borderRadius: 999,
                background: LOKA.white,
                border: `2px solid ${LOKA.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Camera size={14} color={LOKA.primary} />
            </div>
          </div>
          <p style={{ fontSize: 11, color: LOKA.textMuted }}>Tap to change photo</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: LOKA.white, borderRadius: 18, padding: 16, border: `1px solid ${LOKA.borderSubtle}` }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: LOKA.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <User size={12} /> Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                fontSize: 15,
                fontWeight: 600,
                color: LOKA.textPrimary,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                padding: 0,
              }}
              placeholder="Your name"
            />
          </div>

          <div style={{ background: LOKA.white, borderRadius: 18, padding: 16, border: `1px solid ${LOKA.borderSubtle}` }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: LOKA.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Mail size={12} /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                fontSize: 15,
                fontWeight: 600,
                color: LOKA.textPrimary,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                padding: 0,
              }}
              placeholder="your@email.com"
            />
          </div>

          <div style={{ background: LOKA.white, borderRadius: 18, padding: 16, border: `1px solid ${LOKA.borderSubtle}` }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: LOKA.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Phone size={12} /> Phone
            </label>
            <p style={{ fontSize: 15, fontWeight: 600, color: LOKA.textSecondary }}>
              {user?.phone || '—'}
            </p>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '16px 0',
            borderRadius: 999,
            background: saving ? LOKA.border : LOKA.primary,
            color: LOKA.white,
            fontWeight: 700,
            fontSize: 15,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Changes'}
        </motion.button>
      </div>
    </div>
  );
}
