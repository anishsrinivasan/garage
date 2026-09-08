/**
 * Marques this audience comes for. Car-domain knowledge, so it lives with the
 * cars vertical rather than in the shared ranking maths.
 */
/**
 * Premium marques get a modest boost because they're what this audience comes
 * for — but a multiplier, not a sort key, so a fresh mass-market listing can
 * still outrank a stale premium one.
 */
export const PREMIUM_MAKES = [
  "bmw",
  "mercedes-benz",
  "audi",
  "porsche",
  "lexus",
  "jaguar",
  "land rover",
  "volvo",
  "mini",
  "lamborghini",
  "ferrari",
  "bentley",
  "rolls-royce",
  "maserati",
  "aston martin",
  "mclaren",
  "lotus",
] as const;
