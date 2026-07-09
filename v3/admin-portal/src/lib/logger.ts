"use client";

if (process.env.NODE_ENV === "production") {
  const noop = () => {};
  (console as unknown as Record<string, (...args: unknown[]) => void>).error = noop;
}

export function initLogger() {
  if (process.env.NODE_ENV === "production") return;
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

export function logError(msg: string, err?: unknown) {
  if (process.env.NODE_ENV !== "production") {
    if (err !== undefined) console.error(msg, err);
    else console.error(msg);
  }
}
