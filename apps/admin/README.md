# Torque Admin

Internal dashboard for managing the catalogue. Next.js App Router, better-auth
(email + password), same design tokens as the public site, `noindex`.

Runs on port 3001 by default.

## Accounts

There is no public sign-up — this dashboard can edit prices, delist listings and
trigger scrapes. Create accounts explicitly:

```bash
bun run --cwd apps/admin create-user you@example.com "Your Name"
```

The password is read from stdin (or `ADMIN_PASSWORD` for non-interactive setup)
so it never lands in shell history. Minimum 12 characters.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Same Postgres as the web app and cron service. |
| `BETTER_AUTH_SECRET` | yes in production | Signs sessions. `openssl rand -base64 32`. The app refuses to start in production without it. |
| `BETTER_AUTH_URL` | yes | The dashboard's own origin, e.g. `https://admin.example.com`. |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | yes | Same value; used by the browser client. |
| `CRON_SERVICE_URL` | no | Base URL of the cron service. Without it the "Run scrape" buttons explain that they're not wired up. |
| `CRON_API_TOKEN` | no | Must match the cron service's token. |
| `WEB_REVALIDATE_URL` | no | Public site's `/api/revalidate`, so edits show up immediately. |
| `REVALIDATE_SECRET` | no | Must match the web app's value. |
| `NEXT_PUBLIC_WEB_URL` | no | Adds "view live page" links. |

Next.js reads `.env` from the app directory, not the repo root, so for local
development create `apps/admin/.env` (or export the variables in your shell).

## Screens

- **Dashboard** — catalogue counts, a prominent banner when the last run of any
  source failed, recent runs, scheduler state, LLM spend, and the data-quality
  outliers still outside the canonical enum sets.
- **Listings** — every listing including delisted rows, collapsed duplicates and
  review-flagged ones, all of which the public feed hides by design. Filter,
  edit, delist and restore.
- **Listing detail** — full editor plus a **hero image picker**. The vision
  scorer usually picks the right thumbnail, but it is a model; this makes a bad
  pick a one-click fix instead of a re-scrape. Each photo shows its score and
  the model's reasoning, and reel cover frames are marked.
- **Review queue** — listings whose price looks wrong, with the figures the
  caption itself contains offered as one-click corrections.
- **Garages** — full CRUD, plus **add a garage from an Instagram handle**:
  paste a handle, we fetch the profile (name, bio, avatar, follower count),
  you correct anything wrong, and it creates the garage and its dealer source
  and optionally queues a scrape immediately.
- **Sources & runs** — enable or pause each source, and see how every run went
  including the error text of failures.
- **Inbox** — listing reports and site feedback, both of which were being
  written by the public site and read by nothing.

## Security notes

- `middleware.ts` only checks for the *presence* of a session cookie, to avoid a
  dashboard shell flashing before the server rejects the request. It is **not**
  the authorisation boundary — every page and every server action independently
  calls `requireSession()`, which validates against the database.
- Failed sign-in returns a single generic message; distinguishing "no such user"
  from "wrong password" would confirm which emails exist.
- The auth instance and the database client are both constructed lazily, so
  `next build` runs without production credentials.
