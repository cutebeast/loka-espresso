"use client";

export function initLogger() {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args[0] ? String(args[0]) : "";
    if (
      message.includes("ResizeObserver loop") ||
      message.includes("Could not open network stream") ||
      message.includes("AbortError")
    ) {
      return;
    }
    originalError.apply(console, args);
  };
}
