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
    const res = await fetch(`${getBackendUrl()}/admin/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.cookies.size ? { Cookie: cookieHeader(request) } : {}),
      },
      credentials: "include",
    });

    const json = await res.json().catch(() => ({}));

    const response = NextResponse.json(json, { status: res.status });

    if (!res.ok) {
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

    const token = json.tokens?.access_token || json.data?.tokens?.access_token;
    const refresh = json.tokens?.refresh_token || json.data?.tokens?.refresh_token;

    if (token) {
      response.cookies.set({
        name: ACCESS_COOKIE,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 15,
      });
    }
    if (refresh) {
      response.cookies.set({
        name: REFRESH_COOKIE,
        value: refresh,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return response;
  } catch (error) {
    console.error("Admin refresh proxy error:", error);
    return NextResponse.json({ detail: "Refresh proxy failed" }, { status: 502 });
  }
}
