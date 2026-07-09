"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  fallbackText?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary — catches render-time errors in child components
 * and shows a graceful fallback instead of a blank white screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PWA-ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const msg = this.props.fallbackText || "Something went wrong";
      return (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--loka-text-muted)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <p style={{ fontSize: 14 }}>{msg}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid var(--loka-border-light)",
              background: "var(--loka-bg-card)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Thin wrapper — use this for individual sections to isolate render errors.
 */
export function ErrorGuard({
  children,
  fallbackText = "Could not load this section.",
}: {
  children: React.ReactNode;
  fallbackText?: string;
}) {
  return <ErrorBoundary fallbackText={fallbackText}>{children}</ErrorBoundary>;
}
