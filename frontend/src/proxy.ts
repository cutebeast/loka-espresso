import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The dashboard remains client-driven. Keep a no-op proxy file only to avoid
// deprecated middleware warnings on current Next.js.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/_next/static/:path*"],
};
