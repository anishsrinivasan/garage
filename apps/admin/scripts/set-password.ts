/**
 * Resets an existing admin's password.
 *
 *   ADMIN_PASSWORD=... bun run apps/admin/scripts/set-password.ts you@example.com
 *
 * Uses better-auth's own hasher via `auth.$context` rather than writing a hash
 * of our own, so the stored credential stays in whatever format the running
 * version of better-auth expects to verify.
 *
 * Existing sessions are left alone; pass --revoke-sessions to sign the account
 * out everywhere, which is what you want if the old password leaked.
 */

import { auth } from "../src/lib/auth";

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes("--revoke-sessions");
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "Usage: ADMIN_PASSWORD=... bun run apps/admin/scripts/set-password.ts <email> [--revoke-sessions]",
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const ctx = await auth.$context;

  const user = await ctx.internalAdapter.findUserByEmail(email);
  if (!user) {
    console.error(`No admin account for ${email}.`);
    process.exit(1);
  }

  const hash = await ctx.password.hash(password);
  await ctx.internalAdapter.updatePassword(user.user.id, hash);
  console.log(`Password updated for ${email}.`);

  if (revoke) {
    // deleteSessions() takes session tokens; deleteUserSessions() takes the user.
    await ctx.internalAdapter.deleteUserSessions(user.user.id);
    console.log("All existing sessions revoked.");
  }
  process.exit(0);
}

void main();
