import type { Vertical, VerticalId } from "./types";
import { carsVertical } from "./cars";

/**
 * The only place that knows which verticals exist. Adding resale means adding
 * one line here plus its directory.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<string, Vertical<any>> = {
  cars: carsVertical,
};

export function getVertical(id: VerticalId | string): Vertical<unknown> {
  const vertical = REGISTRY[id];
  if (!vertical) {
    throw new Error(
      `Unknown vertical "${id}". Registered: ${Object.keys(REGISTRY).join(", ")}`,
    );
  }
  return vertical as Vertical<unknown>;
}

export function listVerticals(): Vertical<unknown>[] {
  return Object.values(REGISTRY) as Vertical<unknown>[];
}
