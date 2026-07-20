import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "staff_token";

function getBackendUrl(): string {
  const direct = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (direct && direct.startsWith("http")) return direct;
  return process.env.API_PROXY_URL || "http://127.0.0.1:13800/api";
}

/**
 * Admin store switch. The backend endpoint takes the raw access token in the
 * request body, but the portal holds it in an HttpOnly cookie — so this proxy
 * reads the cookie server-side and forwards it. On success the backend returns
 * a new staff token scoped to the chosen store (refresh token is preserved),
 * which we set back onto the staff_token cookie.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${getBackendUrl()}/staff/auth/admin-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, store_id: body.store_id }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(json, { status: res.status });
    }

    const response = NextResponse.json(json);
    const newToken = json.tokens?.access_token;
    if (newToken) {
      const secure = process.env.NODE_ENV === "production";
      response.cookies.set({
        name: COOKIE_NAME,
        value: newToken,
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }

    return response;
  } catch (error) {
    console.error("Admin store-switch proxy error:", error);
    return NextResponse.json({ detail: "Store switch proxy failed" }, { status: 502 });
  }
}
