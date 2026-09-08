/**
 * Challenge and login-wall detection.
 *
 * This is the difference between "this dealer posted nothing this week" and
 * "Instagram stopped talking to us". Both previously looked identical: a run
 * that returned zero posts and reported success. That ambiguity is precisely
 * how a broken scraper stayed invisible for fifteen weeks.
 *
 * When a challenge is detected the session is benched rather than retried, and
 * the run is marked failed rather than empty.
 */

import type { Page } from "playwright";

export type ChallengeKind =
  | "login_wall"
  | "checkpoint"
  | "rate_limited"
  | "not_found"
  | "age_restricted"
  | null;

export type ChallengeResult = {
  kind: ChallengeKind;
  /** Human-readable, safe to log and to store on the source row. */
  detail: string | null;
};

/**
 * Text Instagram renders on each interstitial. Matched case-insensitively
 * against the page body, which is more durable than selectors — the markup
 * changes far more often than the copy.
 */
const SIGNATURES: Array<{ kind: Exclude<ChallengeKind, null>; patterns: RegExp[] }> = [
  {
    kind: "checkpoint",
    patterns: [
      /we[’']?ve detected (?:unusual|suspicious) activity/i,
      /help us confirm it[’']?s you/i,
      /your account has been temporarily (?:locked|restricted)/i,
      /confirm your identity/i,
      /suspicious login attempt/i,
    ],
  },
  {
    kind: "rate_limited",
    patterns: [
      /please wait a few minutes before you try again/i,
      /try again later/i,
      /you[’']?re temporarily blocked/i,
      /action blocked/i,
    ],
  },
  {
    kind: "login_wall",
    patterns: [
      /log in to (?:see|continue|view)/i,
      /sign up to see photos/i,
      /you must log in to continue/i,
    ],
  },
  {
    kind: "not_found",
    patterns: [
      /sorry, this page isn[’']?t available/i,
      /the link you followed may be broken/i,
    ],
  },
  {
    kind: "age_restricted",
    patterns: [/this account is for people 18/i, /restricted content/i],
  },
];

/**
 * Classifies whatever Instagram actually served. Checks HTTP status first —
 * a 429 is unambiguous — then falls back to on-page copy.
 */
export async function detectChallenge(
  page: Page,
  status?: number | null,
): Promise<ChallengeResult> {
  if (status === 429) {
    return { kind: "rate_limited", detail: "HTTP 429 from Instagram" };
  }
  if (status === 401 || status === 403) {
    return { kind: "login_wall", detail: `HTTP ${status} from Instagram` };
  }

  const body = await page
    .evaluate(() => document.body?.innerText?.slice(0, 4000) ?? "")
    .catch(() => "");
  if (!body) return { kind: null, detail: null };

  for (const { kind, patterns } of SIGNATURES) {
    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) {
        return { kind, detail: `matched "${match[0].slice(0, 80)}"` };
      }
    }
  }
  return { kind: null, detail: null };
}

/**
 * Whether this challenge means the *session* is the problem, as opposed to the
 * account we were looking at. `not_found` and `age_restricted` are properties of
 * the target; benching a healthy session over them would be wrong.
 */
export function impliesSessionProblem(kind: ChallengeKind): boolean {
  return kind === "checkpoint" || kind === "login_wall" || kind === "rate_limited";
}

export function isTargetProblem(kind: ChallengeKind): boolean {
  return kind === "not_found" || kind === "age_restricted";
}
