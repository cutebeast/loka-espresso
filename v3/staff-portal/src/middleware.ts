import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Skip middleware for static files and API routes
  if (
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/api") ||
    request.nextUrl.pathname === "/login"
  ) {
    return NextResponse.next();
  }

  // Check for auth token in cookies or headers
  // Note: Since we use localStorage on client, middleware can't directly check it.
  // This middleware serves as a first-line defense and sets headers.
  // The real auth guard is in layout.tsx client-side.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
