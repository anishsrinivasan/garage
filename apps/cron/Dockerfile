# Classifieds scraper cron service.
#
# Built from the repository root so the Bun workspace can resolve
# @classifieds/{db,shared,scraper}. In Dokploy set the build context to the
# repo root and the Dockerfile path to apps/cron/Dockerfile.
#
# Playwright and ffmpeg are both required: the Instagram adapter drives a
# headless Chromium, and reel frame extraction shells out to ffmpeg. Without
# ffmpeg the scrape still runs, but reel thumbnails fall back to Instagram's
# cover frame — the one with a play triangle burned into it.

FROM oven/bun:1.2.22-debian

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      fonts-liberation \
      tzdata \
      wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first so a source-only change doesn't re-resolve the dependency
# graph on every build.
#
# Every workspace manifest that anything here depends on must be present before
# `bun install`, or the `workspace:*` links cannot resolve. apps/scraper and
# apps/cron both depend on @classifieds/pipeline and @classifieds/verticals,
# which were split out of the scraper later — leaving their manifests out failed
# the install outright, and pipeline is where the AI SDK, the S3 client and
# Playwright are declared.
COPY package.json bun.lock* ./
COPY apps/cron/package.json          ./apps/cron/package.json
COPY apps/scraper/package.json       ./apps/scraper/package.json
COPY packages/db/package.json        ./packages/db/package.json
COPY packages/shared/package.json    ./packages/shared/package.json
COPY packages/pipeline/package.json  ./packages/pipeline/package.json
COPY packages/verticals/package.json ./packages/verticals/package.json

RUN bun install --frozen-lockfile || bun install

# Chromium plus its system libraries. `--with-deps` is what pulls in the long
# tail of shared objects a headless browser needs on a slim Debian image.
RUN bunx playwright install --with-deps chromium

COPY apps/cron     ./apps/cron
COPY apps/scraper  ./apps/scraper
COPY packages      ./packages
COPY tsconfig.json ./tsconfig.json

ENV PORT=3333
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3333/health || exit 1

CMD ["bun", "run", "apps/cron/src/index.ts"]
