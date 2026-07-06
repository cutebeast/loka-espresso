"use client";

import { initLogger } from "@/lib/logger";

if (typeof window !== "undefined") {
  initLogger();
}

export default function LoggerInit() {
  return null;
}
