'use client';
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { t } from '@/lib/i18n';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

type TFunc = typeof t;

class ErrorBoundaryInner extends React.Component<Props & { t: TFunc }, State> {
  constructor(props: Props & { t: TFunc }) {
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
      const { t } = this.props;
      return (
        <div className="eb-container">
          <div className="eb-inner">
            <div className="eb-icon"><AlertTriangle size={28} color="#C9A84C" /></div>
            <h2 className="eb-title">{t('common.error')}</h2>
            <p className="eb-message">
              {t('errorBoundary.message')}
            </p>
            <button onClick={this.handleReload} className="eb-btn">
              {t('errorBoundary.reload')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ErrorBoundary({ children }: Props) {
  const { t } = useTranslation();
  return <ErrorBoundaryInner t={t}>{children}</ErrorBoundaryInner>;
}
