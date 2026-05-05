'use client';

import { useState } from 'react';
import { AuthStepIndicator } from './AuthStepIndicator';

interface ProfileSetupProps {
  phone: string;
  onSubmit: (data: { name: string; email?: string }) => Promise<void>;
  onSkip?: () => void;
}

export function ProfileSetup({ onSubmit, onSkip }: ProfileSetupProps) {
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

  return (
    <div className="auth-page">
      <AuthStepIndicator currentStep={3} />

      <h2 className="auth-heading">Complete your profile</h2>
      <p className="auth-subheading">Tell us a bit about yourself</p>

      {/* Avatar preview */}
      <div className="ps-avatar-wrap">
        <div className={`ps-avatar ${name.trim() ? 'ps-avatar-filled' : ''}`}>
          {name.trim() ? (
            name.trim()[0].toUpperCase()
          ) : (
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="12" r="6" fill="#6A7A8A" />
              <path d="M6 28 C6 20 10 18 16 18 C22 18 26 20 26 28" fill="#6A7A8A" />
            </svg>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="ps-form">
        <div className="auth-label">Full name</div>
        <div className="phone-wrapper">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="Enter your name"
            autoFocus
            className="phone-input"
          />
        </div>

        <div className="auth-label">
          Email <span className="ps-optional">(optional)</span>
        </div>
        <div className="phone-wrapper">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="Enter your email"
            className="phone-input"
          />
        </div>

        {error && (
          <p id="profile-error" className="ps-error">{error}</p>
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
