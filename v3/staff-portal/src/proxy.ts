import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default function proxy(_request: NextRequest) {
  // Auth is handled client-side by AuthProvider.
  // This proxy is kept for future server-side auth (e.g. cookies).
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*))"],
};
