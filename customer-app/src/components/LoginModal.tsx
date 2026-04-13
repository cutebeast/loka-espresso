'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '../lib/api';
import { useApp } from '../lib/app-context';

export default function LoginModal() {
  const { showLogin, setShowLogin, setToken } = useApp();
  const [loginStep, setLoginStep] = useState(1);
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');

  if (!showLogin) return null;

  async function handleSendOTP(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch('/auth/send-otp', undefined, { method: 'POST', body: JSON.stringify({ phone: phoneInput }) });
      if (res.ok) setLoginStep(2);
    } catch {}
  }

  async function handleVerifyOTP(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch('/auth/verify-otp', undefined, { method: 'POST', body: JSON.stringify({ phone: phoneInput, code: otpInput }) });
      if (res.ok) { const d = await res.json(); setToken(d.access_token); setShowLogin(false); }
    } catch {}
  }

  return (
    <div className="modal-overlay" style={{ alignItems: 'center' }}>
      <div className="modal-sheet" style={{ borderRadius: 28 }}>
        {loginStep === 1 && (
          <>
            <h3 style={{ marginBottom: 8 }}>Log in / Sign up</h3>
            <p style={{ color: '#64748B', marginBottom: 16 }}>Enter your phone number to get started</p>
            <form onSubmit={handleSendOTP}>
              <input type="tel" placeholder="Phone number (e.g. +6012345678)" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} required style={{ marginBottom: 12 }} />
              <button type="submit" className="btn-primary">Send SMS OTP</button>
            </form>
          </>
        )}
        {loginStep === 2 && (
          <>
            <h3 style={{ marginBottom: 8 }}>Enter OTP</h3>
            <p style={{ color: '#64748B', marginBottom: 16 }}>We sent a code to {phoneInput}</p>
            <form onSubmit={handleVerifyOTP}>
              <input type="text" placeholder="6-digit OTP" value={otpInput} onChange={e => setOtpInput(e.target.value)} maxLength={6} required style={{ marginBottom: 12, textAlign: 'center', fontSize: 24, letterSpacing: 8 }} />
              <button type="submit" className="btn-primary">Verify</button>
            </form>
            <p style={{ marginTop: 12, fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>Demo: check backend logs for OTP code</p>
          </>
        )}
      </div>
    </div>
  );
}
