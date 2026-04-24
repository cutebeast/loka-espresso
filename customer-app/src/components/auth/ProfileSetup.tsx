'use client';

import { useState } from 'react';

interface ProfileSetupProps {
  phone: string;
  onSubmit: (data: { name: string; email?: string }) => Promise<void>;
  onSkip?: () => void;
}

export function ProfileSetup({ phone, onSubmit, onSkip }: ProfileSetupProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), email: email.trim() || undefined });
    } catch {
      setError('Failed to create profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const displayPhone = phone.replace(/(\+\d{2})(\d{2})(\d{3,4})(\d{0,4})/, '$1 $2 $3 $4').trim();

  return (
    <div className="auth-page">
      <h2 className="auth-heading">Complete your profile</h2>
      <p className="auth-subheading">Add your name so your orders feel personal</p>

      {/* Avatar preview */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        borderRadius: '16px',
        border: '1px solid #E4EAEF',
        background: '#F9F7F2',
        padding: '16px',
        marginBottom: '24px',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          flexShrink: 0,
          borderRadius: '50%',
          background: '#384B16',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          fontWeight: 800,
          textTransform: 'uppercase',
        }}>
          {name ? name.trim()[0] : '👤'}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#D18E38',
          }}>Your account</p>
          <p style={{
            marginTop: '2px',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1B2023',
          }}>
            {name.trim() || 'Set up your Loka profile'}
          </p>
          <p style={{
            marginTop: '2px',
            fontSize: '12px',
            color: '#6A7A8A',
          }}>{displayPhone}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className="auth-label">Full name</div>
        <div className="phone-wrapper">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="Your name"
            autoFocus
            className="phone-input"
          />
        </div>

        <div className="auth-label" style={{ marginTop: '16px' }}>Email address (optional)</div>
        <div className="phone-wrapper">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="your@email.com"
            className="phone-input"
          />
        </div>

        {error && (
          <p style={{ color: '#C75050', fontSize: '12px', marginTop: '8px' }}>{error}</p>
        )}

        <button type="submit" disabled={isLoading || !name.trim()} className="auth-btn">
          {isLoading ? <div className="auth-btn-spinner" /> : 'Get Started'}
        </button>

        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            style={{
              marginTop: '16px',
              width: '100%',
              padding: '12px',
              textAlign: 'center',
              fontSize: '14px',
              fontWeight: 500,
              color: '#6A7A8A',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Skip for now
          </button>
        )}

        <div style={{ flex: 1 }} />
      </form>
    </div>
  );
}
