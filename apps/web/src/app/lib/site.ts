/**
 * Facts about this deployment that the standing pages quote.
 *
 * The contact address is read from the environment rather than hard-coded: a
 * takedown or privacy page that prints the wrong address is worse than one that
 * routes people to the in-app report control, so an unset variable falls back
 * to that instead of inventing an inbox.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://classifieds.example";

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? null;

/** The marketplaces and platforms listings are collected from. */
export const SOURCES = [
  "Instagram dealer and broker accounts",
  "OLX",
  "Cars24",
  "CarDekho",
] as const;
