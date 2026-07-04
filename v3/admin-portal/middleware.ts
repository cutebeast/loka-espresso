import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "admin_auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = request.cookies.get(AUTH_COOKIE)?.value === "1";

  // Allow the login page and public assets through without auth.
  const isPublic = pathname === "/login" || pathname.startsWith("/_next/") || pathname.startsWith("/favicon.ico");

  if (!isAuthenticated && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const connectHosts = ["'self'"];
  if (process.env.NODE_ENV === "development") {
    connectHosts.push("http://localhost:13800");
  }
  if (apiUrl.startsWith("http://") || apiUrl.startsWith("https://")) {
    try {
      const apiHost = new URL(apiUrl).host;
      if (apiHost) connectHosts.push(`${new URL(apiUrl).protocol}//${apiHost}`);
    } catch {
      // ignore malformed URL
    }
  }

  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' https: data: blob:; " +
    "font-src 'self'; " +
    `connect-src ${connectHosts.join(" ")}; ` +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
