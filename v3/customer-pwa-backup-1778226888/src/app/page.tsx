"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/stores");
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-400 text-sm">Redirecting...</div>
    </div>
  );
}
