"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card" style={{ padding: 32 }}>
      <h2>Something went wrong</h2>
      <p style={{ color: "var(--color-danger)" }}>{error.message}</p>
      <button onClick={reset} className="btn btn-primary">Try again</button>
    </div>
  );
}
