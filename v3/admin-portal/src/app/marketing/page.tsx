"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MarketingIndex() {
  const router = useRouter();
  useEffect(() => { router.replace("/marketing/campaigns"); }, [router]);
  return null;
}
