/**
 * Rent, deposit and maintenance — three numbers in one caption.
 *
 * Cars had one price, and getting it wrong by a factor of ten put a ₹4.5 crore
 * listing at the top of the feed. Rentals have three, they appear in any order,
 * and they are routinely unlabelled: "25k, 2L advance, 3k maintenance". A
 * deposit parsed as rent is the same failure with a bigger blast radius, because
 * it lands the listing in entirely the wrong price band.
 *
 * The model extracts them; this re-reads the caption deterministically and
 * corrects it. Two signals do most of the work:
 *
 *   1. **Labels.** Indian rental captions are verbose. "advance", "deposit",
 *      "caution deposit" and "security" all mean deposit; "maintenance",
 *      "maint" and "CAM" mean maintenance.
 *   2. **Ratio.** Deposit is conventionally 2–10 months of rent, and
 *      maintenance is a small fraction of it. When the labels are missing, the
 *      relative sizes still identify which is which.
 */

import { LAKH } from "@classifieds/shared";

export type RentalMoney = {
  rent: number | null;
  deposit: number | null;
  maintenance: number | null;
  maintenanceIncluded: boolean | null;
};

/** Plausible monthly rent in an Indian metro. Outside this, it isn't rent. */
export const MIN_RENT = 2_000;
export const MAX_RENT = 20_00_000;

/** Deposit is conventionally this many months of rent. */
const MIN_DEPOSIT_MONTHS = 0.5;
const MAX_DEPOSIT_MONTHS = 24;

const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;

/** Multipliers as they are actually written in rental captions. */
const UNITS: Array<{ re: string; mult: number }> = [
  { re: String.raw`(?:lakhs?|lacs?|l)\b`, mult: LAKH },
  { re: String.raw`(?:thousand|k)\b`, mult: 1_000 },
];

type Labelled = { value: number; label: "rent" | "deposit" | "maintenance" | null; index: number };

const LABELS: Array<{ kind: "rent" | "deposit" | "maintenance"; words: string[] }> = [
  { kind: "deposit", words: ["advance", "deposit", "caution", "security", "adv"] },
  { kind: "maintenance", words: ["maintenance", "maintainance", "maint", "cam", "common area"] },
  { kind: "rent", words: ["rent", "rental", "per month", "pm", "monthly", "p/m"] },
];

function toNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

/**
 * Extracts every money-looking figure with whatever label sits near it.
 *
 * Works segment by segment rather than over the whole caption. Rental captions
 * are written one fact per line — "Rent 25000 / Advance 2 Lakhs / Maintenance
 * 3000" — so a label on the *next* line belongs to the next figure, not this
 * one. Searching a flat character window reads "Maintenance" back onto the
 * deposit above it and mislabels both.
 *
 * Within a segment a preceding label wins over a trailing one, because
 * "Advance 2 lakhs" is the dominant form and "25k rent" the exception.
 */
export function extractLabelledAmounts(caption: string): Labelled[] {
  if (!caption) return [];

  const found: Labelled[] = [];
  let offset = 0;

  // Split on line breaks, bullets and separators — anywhere a caption starts a
  // new fact.
  for (const segment of caption.split(/[\n\r•·|]+|(?:,\s)/)) {
    for (const amount of amountsInSegment(segment)) {
      found.push({ ...amount, index: offset + amount.index });
    }
    offset += segment.length + 1;
  }

  // The same figure found twice: keep whichever carries a label.
  const byValue = new Map<number, Labelled>();
  for (const f of found) {
    const existing = byValue.get(f.value);
    if (!existing || (existing.label === null && f.label !== null)) byValue.set(f.value, f);
  }
  return [...byValue.values()].sort((a, b) => a.index - b.index);
}

function amountsInSegment(segment: string): Labelled[] {
  const text = segment.replace(/₹/g, " ₹ ").replace(/\brs\.?\b/gi, " ₹ ");
  const label = labelOf(text);
  const out: Labelled[] = [];
  const seen = new Set<number>();

  const push = (value: number, index: number) => {
    const rounded = Math.round(value);
    if (rounded < MIN_RENT / 2 || seen.has(rounded)) return;
    seen.add(rounded);
    out.push({ value: rounded, label, index });
  };

  for (const { re, mult } of UNITS) {
    const pattern = new RegExp(`${NUM}\\s*${re}`, "gi");
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) push(toNumber(m[1]!) * mult, m.index);
  }

  // Bare figures. Accepted when a currency marker precedes them, or when the
  // segment carries a money label — "monthly 45000" and "rent 30000" are
  // unambiguous, and refusing them was losing the rent in half the captions.
  const bare = new RegExp(`(?:₹\\s*)?${NUM}(?!\\s*(?:l\\b|k\\b|lakh|lac|thousand|sq|bhk|bed))`, "gi");
  let m: RegExpExecArray | null;
  while ((m = bare.exec(text)) !== null) {
    const raw = m[0];
    const value = toNumber(m[1]!);
    const hasCurrency = raw.includes("₹");
    if (!hasCurrency && label === null) continue;
    // A bare 1-3 digit number in a labelled segment is a floor or a count, not
    // an amount.
    if (!hasCurrency && value < MIN_RENT) continue;
    push(value, m.index);
  }

  return out;
}

/** The money label this segment is about, if any. Nearest match wins. */
function labelOf(segment: string): Labelled["label"] {
  const lower = segment.toLowerCase();
  let best: { kind: Labelled["label"]; at: number } = { kind: null, at: Infinity };
  for (const { kind, words } of LABELS) {
    for (const word of words) {
      const at = lower.indexOf(word);
      if (at !== -1 && at < best.at) best = { kind, at };
    }
  }
  return best.kind;
}

/**
 * Reconciles the model's answer against the caption.
 *
 * Labelled figures win outright. Where labels are absent, the conventional
 * deposit-to-rent ratio disambiguates: given two unlabelled amounts, the smaller
 * is rent and the larger is the deposit — but only when their ratio is
 * plausible, otherwise we leave the model's answer alone rather than guessing.
 */
export function reconcileRentalMoney(
  extracted: RentalMoney,
  caption: string | null | undefined,
): { money: RentalMoney; corrected: boolean; reason: string | null } {
  if (!caption) return { money: extracted, corrected: false, reason: null };

  const amounts = extractLabelledAmounts(caption);
  if (amounts.length === 0) return { money: extracted, corrected: false, reason: null };

  const labelled = {
    rent: amounts.find((a) => a.label === "rent")?.value ?? null,
    deposit: amounts.find((a) => a.label === "deposit")?.value ?? null,
    maintenance: amounts.find((a) => a.label === "maintenance")?.value ?? null,
  };

  const reasons: string[] = [];
  const money: RentalMoney = { ...extracted };

  for (const key of ["rent", "deposit", "maintenance"] as const) {
    const fromCaption = labelled[key];
    if (fromCaption != null && fromCaption !== money[key]) {
      reasons.push(`${key} ${money[key] ?? "null"} -> ${fromCaption} (labelled in caption)`);
      money[key] = fromCaption;
    }
  }

  // The model picked one of two unlabelled figures, and picked the larger. That
  // is the deposit — the caption "₹28,000 / ₹1,50,000" names rent first and
  // deposit second, and a model reading for "price" reliably takes the bigger
  // number. Only correct when the ratio between them is a plausible number of
  // months' deposit; otherwise leave it alone rather than guess.
  if (money.rent != null && labelled.rent == null) {
    const unlabelled = amounts.filter((a) => a.label === null).map((a) => a.value);
    if (unlabelled.includes(money.rent)) {
      const smaller = unlabelled.filter((v) => v < money.rent!).sort((a, b) => b - a)[0];
      if (smaller != null && isPlausibleRent(smaller)) {
        const months = money.rent / smaller;
        if (months >= MIN_DEPOSIT_MONTHS && months <= MAX_DEPOSIT_MONTHS) {
          reasons.push(
            `rent ${money.rent} -> ${smaller}; the larger figure is a ${months.toFixed(1)}-month deposit`,
          );
          if (money.deposit == null) money.deposit = money.rent;
          money.rent = smaller;
        }
      }
    }
  }

  // Nothing was labelled rent, and the model didn't find one either: use the
  // ratio between two unlabelled figures.
  if (money.rent == null) {
    const unlabelled = amounts.filter((a) => a.label === null).map((a) => a.value);
    if (unlabelled.length >= 2) {
      const [small, large] = [Math.min(...unlabelled), Math.max(...unlabelled)];
      const months = large / small;
      if (months >= MIN_DEPOSIT_MONTHS && months <= MAX_DEPOSIT_MONTHS && isPlausibleRent(small)) {
        money.rent = small;
        if (money.deposit == null) money.deposit = large;
        reasons.push(`rent/deposit inferred from ratio (${months.toFixed(1)} months)`);
      }
    } else if (unlabelled.length === 1 && isPlausibleRent(unlabelled[0]!)) {
      money.rent = unlabelled[0]!;
      reasons.push("rent taken from the caption's only amount");
    }
  }

  // A rent above the plausible band next to a deposit-sized figure is almost
  // always the deposit mislabelled as rent — the exact failure this exists for.
  if (money.rent != null && money.deposit != null && money.rent > money.deposit) {
    const months = money.rent / money.deposit;
    if (months >= MIN_DEPOSIT_MONTHS && months <= MAX_DEPOSIT_MONTHS) {
      reasons.push(`rent and deposit swapped (${money.rent} > ${money.deposit})`);
      [money.rent, money.deposit] = [money.deposit, money.rent];
    }
  }

  if (/maintenance\s*(?:is\s*)?(?:included|inclusive|free)|incl\.?\s*maintenance/i.test(caption)) {
    money.maintenanceIncluded = true;
  }

  return {
    money,
    corrected: reasons.length > 0,
    reason: reasons.length > 0 ? reasons.join("; ") : null,
  };
}

export function isPlausibleRent(value: number | null | undefined): boolean {
  return value != null && value >= MIN_RENT && value <= MAX_RENT;
}

export function assessRentalMoney(money: RentalMoney): {
  plausible: boolean;
  reason: string | null;
} {
  if (money.rent == null) return { plausible: true, reason: null };
  if (!isPlausibleRent(money.rent)) {
    return { plausible: false, reason: `rent ${money.rent} outside ₹${MIN_RENT}–₹${MAX_RENT}` };
  }
  if (money.deposit != null) {
    const months = money.deposit / money.rent;
    if (months > MAX_DEPOSIT_MONTHS) {
      return {
        plausible: false,
        reason: `deposit is ${months.toFixed(1)}x rent — one of the two is likely misread`,
      };
    }
  }
  if (money.maintenance != null && money.maintenance > money.rent) {
    return {
      plausible: false,
      reason: `maintenance ${money.maintenance} exceeds rent ${money.rent}`,
    };
  }
  return { plausible: true, reason: null };
}
