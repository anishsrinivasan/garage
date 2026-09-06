import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * Server-side session guard. Every page under the dashboard calls this rather
 * than relying on middleware alone: middleware protects navigation, but a
 * server action or a route handler reached directly still needs its own check.
 */
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
