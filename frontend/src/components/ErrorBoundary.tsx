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
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="eb-container">
          <div className="eb-card">
            <div className="eb-icon">⚠️</div>
            <h2 className="eb-title">Something went wrong</h2>
            <p className="eb-message">
              We apologize for the inconvenience. The error has been logged.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="eb-button"
            >
              Reload Page
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="eb-details">
                <summary className="eb-summary">Error Details (Development Only)</summary>
                <pre className="eb-pre">{this.state.error.toString()}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
