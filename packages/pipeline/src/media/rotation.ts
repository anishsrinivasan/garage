/**
 * Works out which way up a reel was actually filmed.
 *
 * This exists because the file cannot tell us. A sideways reel arrives as a
 * perfectly ordinary 720x1280 portrait stream with no `rotate` tag and no
 * display matrix — the dimensions are right, the metadata is right, and the
 * pixels contain a scene lying on its side. ffprobe has nothing to report
 * because nothing is malformed; the phone was simply held the wrong way and the
 * result was uploaded as-is.
 *
 * So the only thing that can judge it is something that knows what a car and a
 * person look like. One small frame, scaled down before it goes over the wire,
 * against the cheap model the rest of the pipeline already uses.
 *
 * It only ever answers with a correction to apply. Nothing here decides whether
 * a frame is *good* — that stays with the scorer — and a failure returns "none",
 * so a listing with an unreachable model keeps the behaviour it has today rather
 * than gaining a random quarter turn.
 */

import { z } from "zod";
import { generateStructured } from "../ai/core";
import type { FrameRotation } from "./frames";

const RotationSchema = z.object({
  /**
   * Asked for as the correction rather than the fault. "The picture is rotated
   * 90° clockwise" and "rotate it 90° clockwise to fix it" are opposite
   * instructions, and a model asked for the fault gets it backwards often
   * enough to matter.
   */
  rotate: z.enum(["none", "cw90", "ccw90", "180"]),
  /** Low confidence is treated as "none": a needless turn is worse than none. */
  confident: z.boolean(),
});

const SYSTEM = `You judge which way up a photograph is.

The picture is a still frame from a short video advertising a car or a home. It
may have been filmed with the phone held sideways and uploaded without being
corrected, so the scene inside can be lying on its side even though the image
itself is a normal portrait shape.

Decide what rotation would make the scene upright, and report THAT rotation:
- "none"  — already upright: people stand vertically, cars sit on their wheels,
            text reads left to right, the sky or ceiling is at the top.
- "cw90"  — turn it 90° clockwise to fix it. Use this when the scene currently
            lies with its top toward the LEFT edge.
- "ccw90" — turn it 90° anticlockwise to fix it. Use this when the scene
            currently lies with its top toward the RIGHT edge.
- "180"   — the scene is upside down.

Set confident to false whenever you are unsure — an aerial shot, a close-up of a
badge or a dashboard, an abstract detail, anything with no reliable "up". A
wrong rotation is far more damaging than a missed one, so guessing is worse than
declining.`;

/**
 * Returns the correction to apply to every frame of this clip.
 *
 * One call per video, not per frame: all frames of a clip share an orientation,
 * and paying five times for one answer would be the obvious way to make this
 * too expensive to keep.
 */
export async function detectRotation(
  probeFrame: Buffer,
  context: { postUrl: string },
): Promise<FrameRotation> {
  try {
    const result = await generateStructured({
      schema: RotationSchema,
      schemaName: "FrameRotation",
      system: SYSTEM,
      operation: "media.detect_rotation",
      metadata: { postUrl: context.postUrl },
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: probeFrame.toString("base64"),
              mediaType: "image/jpeg",
            },
          ],
        },
      ],
    });

    if (!result.confident) return "none";
    return result.rotate;
  } catch (err) {
    // Orientation is a nicety; a listing without it is merely as good as it was
    // yesterday. Never let this fail a scrape.
    console.warn(
      `[rotation] ${context.postUrl}: detection failed, leaving frames as filmed — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return "none";
  }
}
