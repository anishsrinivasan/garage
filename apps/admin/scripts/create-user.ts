/**
 * Creates an admin account.
 *
 * The dashboard has no public sign-up — it can edit prices, delist listings and
 * trigger scrapes — so accounts are seeded here instead.
 *
 *   bun run apps/admin/scripts/create-user.ts you@example.com "Your Name"
 *
 * The password is read from stdin so it never lands in shell history, or from
 * ADMIN_PASSWORD for non-interactive setup.
 */

import { auth } from "../src/lib/auth";

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;

  process.stdout.write("Password (min 12 chars): ");
  for await (const line of console) {
    return line.trim();
  }
  return "";
}

async function main() {
  const [email, name] = process.argv.slice(2);
  if (!email) {
    console.error(
      'Usage: bun run apps/admin/scripts/create-user.ts <email> ["Full Name"]',
    );
    process.exit(1);
  }

  const password = await readPassword();
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name: name ?? email.split("@")[0]! },
    });
    console.log(`Created admin account for ${result.user.email}`);
  } catch (err) {
    console.error(
      `Could not create the account: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
  process.exit(0);
}

void main();
