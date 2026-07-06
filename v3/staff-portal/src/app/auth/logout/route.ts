import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE_NAME = "staff_token";
const REFRESH_COOKIE_NAME = "staff_refresh_token";

function getBackendUrl(): string {
  const direct = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (direct && direct.startsWith("http")) return direct;
  return "http://127.0.0.1:13800/api";
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

  try {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    // Forward cookies so the backend can read and blacklist the refresh token.
    const cookieParts: string[] = [];
    if (token) cookieParts.push(`${ACCESS_COOKIE_NAME}=${token}`);
    if (refreshToken) cookieParts.push(`${REFRESH_COOKIE_NAME}=${refreshToken}`);
    if (cookieParts.length > 0) {
      headers["Cookie"] = cookieParts.join("; ");
    }

    await fetch(`${getBackendUrl()}/staff/auth/logout`, {
      method: "POST",
      headers,
    });
  } catch (error) {
    console.error("Staff logout proxy error:", error);
  }

  const response = NextResponse.json({ success: true });
  const secure = process.env.NODE_ENV === "production";
  const cookieOptions = { httpOnly: true, secure, sameSite: "strict" as const, path: "/", maxAge: 0 };
  response.cookies.set({ name: ACCESS_COOKIE_NAME, value: "", ...cookieOptions });
  response.cookies.set({ name: REFRESH_COOKIE_NAME, value: "", ...cookieOptions });
  return response;
}
