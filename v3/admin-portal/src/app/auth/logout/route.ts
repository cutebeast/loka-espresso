import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE = "admin_token";
const REFRESH_COOKIE = "admin_refresh_token";

function getBackendUrl(): string {
  const direct = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (direct && direct.startsWith("http")) return direct;
  return "http://127.0.0.1:13800/api";
}

function cookieHeader(request: NextRequest): string {
  const cookies: string[] = [];
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (access) cookies.push(`${ACCESS_COOKIE}=${access}`);
  if (refresh) cookies.push(`${REFRESH_COOKIE}=${refresh}`);
  return cookies.join("; ");
}

export async function POST(request: NextRequest) {
  try {
    await fetch(`${getBackendUrl()}/admin/auth/logout`, {
      method: "POST",
      headers: request.cookies.size ? { Cookie: cookieHeader(request) } : {},
    });
  } catch (e) {
    console.error("Backend logout failed:", e);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set({
    name: REFRESH_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
