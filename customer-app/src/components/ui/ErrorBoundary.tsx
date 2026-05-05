'use client';
import React from 'react';
import { AlertTriangle } from 'lucide-react';

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

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="eb-container">
          <div className="eb-inner">
            <div className="eb-icon"><AlertTriangle size={28} color="#C9A84C" /></div>
            <h2 className="eb-title">Something went wrong</h2>
            <p className="eb-message">
              An unexpected error occurred. Please try again.
            </p>
            <button onClick={this.handleReload} className="eb-btn">
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
