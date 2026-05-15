"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InventoryIndex() {
  const router = useRouter();
  useEffect(() => { router.replace("/inventory/items"); }, [router]);
  return null;
}
