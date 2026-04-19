'use client';

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 * 
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * 
 * Or with custom fallback:
 * <ErrorBoundary fallback={<CustomErrorScreen />}>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Call optional error handler
    this.props.onError?.(error, errorInfo);
    
    // In production, you might want to send to an error tracking service
    // Example: Sentry.captureException(error, { extra: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.icon}>⚠️</div>
            <h2 style={styles.title}>Something went wrong</h2>
            <p style={styles.message}>
              We apologize for the inconvenience. The error has been logged.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={styles.button}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#2d3d12';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#384B16';
              }}
            >
              Reload Page
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details (Development Only)</summary>
                <pre style={styles.pre}>{this.state.error.toString()}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FA',
    padding: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '40px',
    textAlign: 'center',
    maxWidth: '500px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1B2023',
    marginBottom: '12px',
  },
  message: {
    fontSize: '14px',
    color: '#6A7A8A',
    marginBottom: '24px',
    lineHeight: 1.5,
  },
  button: {
    backgroundColor: '#384B16',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  details: {
    marginTop: '20px',
    textAlign: 'left',
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    padding: '12px',
  },
  summary: {
    fontSize: '12px',
    color: '#64748B',
    cursor: 'pointer',
    fontWeight: 500,
  },
  pre: {
    fontSize: '11px',
    color: '#991B1B',
    backgroundColor: '#FEF2F2',
    padding: '12px',
    borderRadius: '6px',
    overflow: 'auto',
    marginTop: '8px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};

/**
 * Higher-Order Component for wrapping pages with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Async Error Handler Hook
 * Wraps async functions to handle errors gracefully
 */
export function useAsyncErrorHandler() {
  const handleAsync = async <T,>(
    promise: Promise<T>,
    options?: {
      onError?: (error: Error) => void;
      fallbackValue?: T;
      showToast?: boolean;
    }
  ): Promise<T | undefined> => {
    try {
      return await promise;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      console.error('Async operation failed:', err);
      
      if (options?.onError) {
        options.onError(err);
      }
      
      if (options?.showToast) {
        // In a real app, you'd show a toast notification here
        alert(`Error: ${err.message}`);
      }
      
      if (options?.fallbackValue !== undefined) {
        return options.fallbackValue;
      }
      
      throw err;
    }
  };

  return { handleAsync };
}
