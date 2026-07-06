import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "staff_token";
const REFRESH_COOKIE_NAME = "staff_refresh_token";

function getBackendUrl(): string {
  const direct = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (direct && direct.startsWith("http")) return direct;
  return "http://127.0.0.1:13800/api";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${getBackendUrl()}/staff/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(json, { status: res.status });
    }

    const token = json.tokens?.access_token;
    const refreshToken = json.tokens?.refresh_token;
    if (!token) {
      return NextResponse.json({ detail: "No access token returned" }, { status: 500 });
    }

    const response = NextResponse.json(json);
    const secure = process.env.NODE_ENV === "production";
    const cookieOptions = { httpOnly: true, secure, sameSite: "strict" as const, path: "/" };
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      ...cookieOptions,
      maxAge: 60 * 60 * 24, // 24 hours
    });
    if (refreshToken) {
      response.cookies.set({
        name: REFRESH_COOKIE_NAME,
        value: refreshToken,
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    return response;
  } catch (error) {
    console.error("Staff login proxy error:", error);
    return NextResponse.json({ detail: "Login proxy failed" }, { status: 502 });
  }
}
