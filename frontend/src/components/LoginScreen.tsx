'use client';

import { useState, FormEvent } from 'react';
import { API } from '@/lib/merchant-api';
import { APP_NAME } from '@/lib/config';

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API}/auth/login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        onLogin();
      } else {
        setLoginError(data.detail || 'Login failed');
      }
    } catch {
      setLoginError('Network error');
    }
  }

  return (
    <div className="ls-0">
      <div className="card ls-1" >
        <div className="ls-2">
          <span className="ls-3"><i className="fas fa-mug-saucer"></i></span>
          <h1 className="ls-4">{APP_NAME}</h1>
          <p className="ls-5">Sign in to your dashboard</p>
        </div>
        <form onSubmit={handleLogin}>
          <div className="ls-6">
            <label className="ls-7">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" required />
          </div>
          <div className="ls-8">
            <label className="ls-9">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
          </div>
          {loginError && <p className="ls-10">{loginError}</p>}
          <button type="submit" className="btn btn-primary ls-11" >Sign In</button>
        </form>
      </div>
    </div>
  );
}
