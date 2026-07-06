import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_API_PREFIXES = [
  '/api/stores',
  '/api/menu',
  '/api/public',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/send-otp',
  '/api/auth/resend-otp',
  '/api/config',
  '/api/version',
];

function isPublicApi(path: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => path.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');

  // Validate cookie for /api/* calls that are not explicitly public.
  // If a cookie is present but invalid, clear it and return 401 so the PWA
  // can show the login modal. Missing cookies are left to the backend.
  if (pathname.startsWith('/api/') && !isPublicApi(pathname)) {
    const token = request.cookies.get('access_token')?.value;
    if (token) {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:13800/api';
        const res = await fetch(`${apiUrl}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const clear = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          clear.cookies.delete('access_token');
          clear.cookies.delete('refresh_token');
          return clear;
        }
      } catch {
        // backend unreachable — let the request through so the PWA can surface the error
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/'],
};
