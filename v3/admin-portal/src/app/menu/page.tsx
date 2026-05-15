"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MenuIndex() {
  const router = useRouter();
  useEffect(() => { router.replace("/menu/items"); }, [router]);
  return null;
}
