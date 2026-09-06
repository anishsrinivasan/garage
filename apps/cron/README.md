# Torque scraper cron

Long-lived Hono service that runs the scrapers on a schedule and exposes their
health. Built to run on the homelab under Dokploy.

It exists because the catalogue previously went fifteen weeks without a
successful Instagram scrape: runs were manual, and a failure was invisible.

## Endpoints

| Method | Path           | Auth | Purpose |
|--------|----------------|------|---------|
| GET    | `/health`      | no   | Liveness, scheduler state, next run times. Used by the container healthcheck. |
| GET    | `/status`      | no   | Catalogue counts and the last run per source, read from the database. |
| GET    | `/jobs`        | no   | Job history for this process. |
| GET    | `/jobs/:id`    | no   | A single job. |
| POST   | `/scrape`      | yes  | Queue a scrape. Optional body `{"sources":["instagram"],"handles":["kun_elite"]}`. |
| POST   | `/maintenance` | yes  | Queue the delist + dedupe sweep. |

Auth is `Authorization: Bearer $CRON_API_TOKEN` (or `x-api-token`). Triggers
return **202** with a job id — a full scrape runs for minutes, so poll
`/jobs/:id` rather than waiting on the response.

Jobs are serialised behind a single mutex. Two concurrent Instagram runs would
fight over the same session cookies and get the account rate-limited.

## Deploying with Dokploy

1. **New Compose service** → point it at this repository.
2. Compose path: `apps/cron/docker-compose.yml`. The build context is the repo
   root, because the Bun workspace needs the sibling packages.
3. Set the environment (below) in the Dokploy UI.
4. Deploy. `/health` should return `ok: true` with the next run times.

Redeploys are safe: the Instagram session lives in a named volume, so it
survives.

### Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Same Postgres as the web app. |
| `CRON_API_TOKEN` | yes | — | Bearer token for the trigger endpoints. The service **refuses to start** in production without it, since those endpoints mutate the catalogue. |
| `GOOGLE_API_KEY` | yes | — | Extraction and image scoring. |
| `LLM_MODEL` | no | `gemini-2.5-flash` | |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | strongly recommended | — | Without R2 the scraper stores Instagram CDN URLs, which are signed and expire within days. |
| `CRON_SCRAPE_SCHEDULE` | no | `30 3 * * *` | Full scrape, 03:30 IST. |
| `CRON_MAINTENANCE_SCHEDULE` | no | `15 * * * *` | Delist + dedupe, hourly. |
| `CRON_TIMEZONE` | no | `Asia/Kolkata` | |
| `CRON_ENABLED` | no | `true` | `false` serves the HTTP API without scheduling. |
| `CRON_RUN_ON_START` | no | `false` | Leave off so a restart loop can't hammer Instagram. |
| `WEB_REVALIDATE_URL` | no | — | e.g. `https://your-site/api/revalidate`. Busts the feed cache after a run. |
| `REVALIDATE_SECRET` | no | — | Must match the web app's value. |

### The Instagram session

The Instagram adapter needs a logged-in session at
`apps/scraper/.session/storage-state.json`, mounted as the `instagram-session`
volume. Generate it locally with:

```bash
bun run apps/scraper/src/instagram-login.ts
```

then copy the file into the volume:

```bash
docker cp apps/scraper/.session/storage-state.json <container>:/app/apps/scraper/.session/
```

An expired session is the single most likely cause of a failing run — it is how
the scraper broke last time. `/status` shows the last run per source, and a
`failed` Instagram row there is the signal to regenerate it.

### ffmpeg

The image installs ffmpeg because reel frame extraction shells out to it.
Without it, scraping still works, but reel thumbnails fall back to Instagram's
cover frame — the one with a play triangle burned into the pixels, usually
showing the dealer rather than the car.

## Safety properties

- **A broken scraper cannot empty the catalogue.** The age sweep only retires a
  listing if its source has *successfully scraped since that listing was last
  confirmed*. Without that guard the first sweep against back-filled data
  retired 460 of 500 listings simply because Instagram was failing.
- **A degraded run cannot wipe a source.** The per-run sweep is skipped when a
  run covers less than half of a source's active listings.
- **Delisting is soft.** Rows keep their URL and are reactivated if a later
  scrape sees the car again.
