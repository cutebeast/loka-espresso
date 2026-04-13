import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// No middleware needed — SPA handles all routing client-side.
// This file exists as a no-op to prevent stale builds.

export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/_next/static/:path*"],
};
