import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth", "/_next", "/favicon.ico", "/api", "/pos/display"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function getBackendUrl(): string {
  const direct = process.env.API_URL || process.env.API_PROXY_URL || process.env.NEXT_PUBLIC_API_URL;
  if (direct && direct.startsWith("http")) return direct;
  return "http://127.0.0.1:13800/api";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const connectHosts = ["'self'"];
  if (process.env.NODE_ENV === "development") {
    connectHosts.push("http://localhost:13800");
    connectHosts.push("http://127.0.0.1:13800");
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
    "script-src 'self' 'unsafe-inline' https://js.stripe.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' https: data: blob:; " +
    "font-src 'self'; " +
    `connect-src ${connectHosts.join(" ")}; ` +
    "frame-src https://js.stripe.com; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  if (!isPublicPath(pathname)) {
    const token = request.cookies.get("staff_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    try {
      const res = await fetch(`${getBackendUrl()}/staff/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const loginUrl = new URL("/login", request.url);
        return NextResponse.redirect(loginUrl);
      }
    } catch {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    response.headers.set("Cache-Control", "no-store, must-revalidate");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|uploads).*)"],
};
