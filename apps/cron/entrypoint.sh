#!/bin/sh
# Start the display, then hand the container over to the scheduler.
#
# The CMD used to be `xvfb-run … bun run …`, which tied the whole service to the
# wrapper: the HTTP server only existed for as long as xvfb-run did, and when
# the task was killed its buffered stdout went with it — the container exited
# 137 having logged nothing at all, which is close to undiagnosable.
#
# Xvfb now runs in the background and `exec` replaces this shell with Bun, so
# the scheduler is PID 1: it receives SIGTERM directly, its output is not
# buffered behind a parent, and a display that dies takes OLX down rather than
# the entire cron. Everything except OLX works without a display.
set -e

DISPLAY_NUM="${DISPLAY_NUM:-99}"
Xvfb ":${DISPLAY_NUM}" -screen 0 1440x900x24 -nolisten tcp &

# Wait for the socket rather than sleeping a fixed guess: Chromium fails
# outright against a display that is not accepting connections yet.
for _ in $(seq 1 50); do
  [ -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ] && break
  sleep 0.1
done

if [ -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
  export DISPLAY=":${DISPLAY_NUM}"
  echo "[entrypoint] Xvfb ready on :${DISPLAY_NUM}"
else
  echo "[entrypoint] WARNING: Xvfb did not come up; OLX scrapes will fail, the rest will not"
fi

exec "$@"
