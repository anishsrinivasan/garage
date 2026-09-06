import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirects unauthenticated navigation to /login.
 *
 * This is an optimistic cookie *presence* check only. It exists so signed-out
 * users don't see a dashboard shell flash before the server rejects them — it
 * is NOT the authorisation boundary. Every page and every server action calls
 * `requireSession()`, which validates the session against the database.
 *
 * It reads the cookie directly rather than importing better-auth's helper:
 * middleware runs on the edge runtime, and better-auth's cookie module pulls in
 * `jose`, which uses Node-only compression APIs.
 */
const SESSION_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

export function middleware(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) =>
    Boolean(request.cookies.get(name)?.value),
  );

  if (!hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except the login page, the auth endpoints, and static assets.
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
