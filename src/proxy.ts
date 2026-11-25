import { NextResponse, type NextRequest } from "next/server";

export function isTechnicalPreviewHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const cleanHost = hostHeader.split(":")[0]?.trim().toLowerCase() ?? "";
  return cleanHost.endsWith(".vercel.app");
}

export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Prevent duplicate indexing of technical *.vercel.app preview deployments.
  if (isTechnicalPreviewHost(host)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/image|favicon.ico).*)"],
};
