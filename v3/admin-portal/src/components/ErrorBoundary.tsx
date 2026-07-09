"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--color-text-muted)",
          }}
        >
          <h2 style={{ marginBottom: 8, fontSize: 18, fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 13, marginBottom: 16 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Simple error boundary for wrapping individual page sections.
 * Prevents one section's render error from taking down the entire page.
 */
export function ErrorGuard({
  children,
  fallbackText = "This section could not be loaded.",
}: {
  children: React.ReactNode;
  fallbackText?: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div style={{ padding: 16, color: "var(--color-text-muted)", fontSize: 13 }}>
          {fallbackText}
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
