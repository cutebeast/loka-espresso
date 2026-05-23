"use client";

import AdminError from "@/components/AdminError";

export default function EventDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminError error={error} reset={reset} />;
}
