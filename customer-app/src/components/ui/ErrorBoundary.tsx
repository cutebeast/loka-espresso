'use client';
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: 24,
          background: '#FAFAF5', color: '#2D3B2D',
        }}>
          <div style={{
            maxWidth: 340, textAlign: 'center', padding: '40px 24px',
            background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 24 }}>
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '10px 32px', borderRadius: 12, border: 'none',
                background: '#2D3B2D', color: '#D4A574', cursor: 'pointer',
                fontSize: 14, fontWeight: 600,
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
