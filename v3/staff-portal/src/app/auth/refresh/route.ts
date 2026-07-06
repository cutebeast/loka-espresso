import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE_NAME = "staff_token";
const REFRESH_COOKIE_NAME = "staff_refresh_token";

function getBackendUrl(): string {
  const direct = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (direct && direct.startsWith("http")) return direct;
  return "http://127.0.0.1:13800/api";
}

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${getBackendUrl()}/staff/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, refresh_token: refreshToken }),
    });

    const json = await res.json().catch(() => ({}));

    const response = NextResponse.json(json, { status: res.ok ? 200 : res.status });
    const secure = process.env.NODE_ENV === "production";
    const cookieOptions = { httpOnly: true, secure, sameSite: "strict" as const, path: "/" };

    if (!res.ok) {
      response.cookies.set({
        name: ACCESS_COOKIE_NAME,
        value: "",
        ...cookieOptions,
        maxAge: 0,
      });
      response.cookies.set({
        name: REFRESH_COOKIE_NAME,
        value: "",
        ...cookieOptions,
        maxAge: 0,
      });
      return response;
    }

    const token = json.tokens?.access_token || json.data?.tokens?.access_token;
    const newRefreshToken = json.tokens?.refresh_token || json.data?.tokens?.refresh_token;

    if (token) {
      response.cookies.set({
        name: ACCESS_COOKIE_NAME,
        value: token,
        ...cookieOptions,
        maxAge: 60 * 60 * 24,
      });
    }
    if (newRefreshToken) {
      response.cookies.set({
        name: REFRESH_COOKIE_NAME,
        value: newRefreshToken,
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return response;
  } catch (error) {
    console.error("Staff refresh proxy error:", error);
    return NextResponse.json({ detail: "Refresh proxy failed" }, { status: 502 });
  }
}
