/**
 * The directory moved to /sources when it stopped being only about garages.
 * Kept as a permanent redirect: these URLs are in the sitemap, and the rentals
 * cards have been linking to them.
 */
import { permanentRedirect } from "next/navigation";

export default function GaragesRedirect(): never {
  permanentRedirect("/sources");
}
