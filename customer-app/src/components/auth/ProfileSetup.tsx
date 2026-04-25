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
      <div className="ps-preview">
        <div className="ps-avatar">
          {name ? name.trim()[0] : '👤'}
        </div>
        <div className="ps-info">
          <p className="ps-label">Your account</p>
          <p className="ps-name">
            {name.trim() || 'Set up your Loka profile'}
          </p>
          <p className="ps-phone">{displayPhone}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="ps-form">
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

        <div className="auth-label ps-mt-16">Email address (optional)</div>
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
          <p className="ps-error">{error}</p>
        )}

        <button type="submit" disabled={isLoading || !name.trim()} className="auth-btn">
          {isLoading ? <div className="auth-btn-spinner" /> : 'Get Started'}
        </button>

        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="ps-skip-btn"
          >
            Skip for now
          </button>
        )}

        <div className="ps-spacer" />
      </form>
    </div>
  );
}
