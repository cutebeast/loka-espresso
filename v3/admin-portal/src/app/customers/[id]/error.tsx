"use client";

import AdminError from "@/components/AdminError";

export default function CustomerDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminError error={error} reset={reset} />;
}
