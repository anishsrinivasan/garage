/**
 * Reel frame extraction.
 *
 * Instagram's reel cover image has a play triangle rendered into the pixels and
 * is usually whatever frame IG picked — very often the dealer talking to camera
 * rather than the car. There is no way to get a clean frame from the cover, so
 * for reels we download the mp4 and pull our own candidate frames, which the
 * vision scorer then ranks.
 *
 * ffmpeg is optional. When it isn't installed we log once and fall back to the
 * cover image, so a machine without it still scrapes — just with worse heroes.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Fractions of the clip duration to sample. Skips the first and last moments,
 *  which are usually a title card or an end card. */
export const FRAME_POSITIONS = [0.12, 0.3, 0.5, 0.7, 0.88];

/**
 * Overridable because a container, a CI image and a laptop rarely agree on
 * where ffmpeg lives, and because a broken system install should be routable
 * around without editing code.
 */
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

let ffmpegAvailable: boolean | null = null;

function run(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string; spawnError: string | null }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr, spawnError: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, spawnError: null });
    });
  });
}

export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;

  const { code, stderr, spawnError } = await run(FFMPEG, ["-version"], 5000);
  ffmpegAvailable = code === 0;
  if (ffmpegAvailable) return true;

  // "Missing" and "present but broken" need different fixes, and reporting the
  // second as the first sends you off installing something you already have.
  // A real case: Homebrew upgraded jpeg-xl, ffmpeg kept linking the old
  // libjxl, and every invocation died with SIGABRT while `which ffmpeg` still
  // answered happily.
  const detail = spawnError
    ? `cannot be run (${spawnError})`
    : `exited ${code}${stderr.trim() ? ` — ${stderr.trim().split("\n")[0]}` : ""}`;

  console.warn(
    `[video-frames] ffmpeg (${FFMPEG}) ${detail}. Reel heroes fall back to Instagram's cover frame, which has a play glyph burned in and is usually whichever frame Instagram picked — often the broker talking rather than the property. Install or repair ffmpeg, or set FFMPEG_PATH.`,
  );
  return false;
}

async function probeDurationSeconds(path: string): Promise<number | null> {
  const { code, stdout } = await run(
    FFPROBE,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ],
    10_000,
  );
  if (code !== 0) return null;
  const seconds = parseFloat(stdout.trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export type ExtractedFrame = {
  buffer: Buffer;
  /** Seconds into the clip. */
  atSeconds: number;
};

/**
 * Writes the mp4 to a temp file, samples frames at `FRAME_POSITIONS`, and
 * returns them as JPEG buffers. Always cleans up its temp directory.
 */
export async function extractFrames(
  videoBuffer: Buffer,
  maxFrames = FRAME_POSITIONS.length,
): Promise<ExtractedFrame[]> {
  if (!(await isFfmpegAvailable())) return [];

  const dir = await mkdtemp(join(tmpdir(), "classifieds-reel-"));
  const videoPath = join(dir, "clip.mp4");
  try {
    await writeFile(videoPath, videoBuffer);
    const duration = await probeDurationSeconds(videoPath);
    if (duration == null) return [];

    const positions = FRAME_POSITIONS.slice(0, maxFrames).map((f) =>
      Math.min(Math.max(f * duration, 0.1), Math.max(duration - 0.1, 0.1)),
    );

    const frames: ExtractedFrame[] = [];
    for (const [i, at] of positions.entries()) {
      const out = join(dir, `frame-${i}.jpg`);
      // -ss before -i seeks by keyframe, which is fast and accurate enough here.
      const { code } = await run(
        FFMPEG,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          at.toFixed(2),
          "-i",
          videoPath,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          "-y",
          out,
        ],
        20_000,
      );
      if (code !== 0) continue;
      try {
        frames.push({ buffer: await readFile(out), atSeconds: at });
      } catch {
        // Frame didn't get written (seek past end); skip it.
      }
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    // `readdir` keeps the import honest if rm silently no-ops on some platforms.
    await readdir(dir).catch(() => []);
  }
}
