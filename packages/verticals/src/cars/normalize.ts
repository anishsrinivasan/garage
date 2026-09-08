/**
 * Canonicalisation for everything that gets written to `car_listings`.
 *
 * Before this existed, adapters wrote whatever the LLM or the marketplace HTML
 * happened to say, so the same value landed in the table under several spellings
 * — `diesel`/`Diesel`, `suv`/`SUV`, `Maruti`/`Maruti Suzuki`. The filter UI then
 * rendered one pill per spelling and clicking one silently excluded the other's
 * rows. Every write path now goes through `normalizeListingFields`, and
 * migration 0011 backfills the rows that predate it.
 *
 * Rule: enums are stored lowercase, makes/models are stored in their canonical
 * display casing. The UI capitalises enums for display; it must never
 * capitalise makes.
 */

export const FUEL_TYPES = [
  "petrol",
  "diesel",
  "cng",
  "electric",
  "hybrid",
  "lpg",
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSIONS = ["manual", "automatic"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const BODY_TYPES = [
  "hatchback",
  "sedan",
  "suv",
  "muv",
  "coupe",
  "convertible",
  "pickup",
  "van",
  "wagon",
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

const FUEL_ALIASES: Record<string, FuelType> = {
  petrol: "petrol",
  gasoline: "petrol",
  gas: "petrol",
  mpi: "petrol",
  tsi: "petrol",
  diesel: "diesel",
  dsl: "diesel",
  tdi: "diesel",
  crdi: "diesel",
  cng: "cng",
  "petrol+cng": "cng",
  "cng+petrol": "cng",
  lpg: "lpg",
  electric: "electric",
  ev: "electric",
  bev: "electric",
  hybrid: "hybrid",
  "mild hybrid": "hybrid",
  "strong hybrid": "hybrid",
  phev: "hybrid",
  "plug-in hybrid": "hybrid",
};

const TRANSMISSION_ALIASES: Record<string, Transmission> = {
  manual: "manual",
  mt: "manual",
  "5mt": "manual",
  "6mt": "manual",
  stick: "manual",
  automatic: "automatic",
  auto: "automatic",
  at: "automatic",
  amt: "automatic",
  cvt: "automatic",
  dct: "automatic",
  dsg: "automatic",
  tiptronic: "automatic",
  "torque converter": "automatic",
};

const BODY_ALIASES: Record<string, BodyType> = {
  hatchback: "hatchback",
  hatch: "hatchback",
  sedan: "sedan",
  saloon: "sedan",
  suv: "suv",
  crossover: "suv",
  muv: "muv",
  mpv: "muv",
  minivan: "van",
  van: "van",
  coupe: "coupe",
  convertible: "convertible",
  cabriolet: "convertible",
  roadster: "convertible",
  pickup: "pickup",
  truck: "pickup",
  wagon: "wagon",
  estate: "wagon",
};

/**
 * Canonical display spelling per make. Keys are the lowercased, punctuation-
 * stripped form so `MERCEDES BENZ`, `mercedes-benz` and `Mercedes Benz` all
 * collapse onto one entry.
 */
const MAKE_CANONICAL: Record<string, string> = {
  maruti: "Maruti Suzuki",
  marutisuzuki: "Maruti Suzuki",
  suzuki: "Maruti Suzuki",
  hyundai: "Hyundai",
  tata: "Tata",
  mahindra: "Mahindra",
  toyota: "Toyota",
  honda: "Honda",
  kia: "Kia",
  mg: "MG",
  mgmotor: "MG",
  renault: "Renault",
  nissan: "Nissan",
  datsun: "Datsun",
  ford: "Ford",
  chevrolet: "Chevrolet",
  skoda: "Skoda",
  volkswagen: "Volkswagen",
  vw: "Volkswagen",
  citroen: "Citroen",
  jeep: "Jeep",
  force: "Force",
  isuzu: "Isuzu",
  bmw: "BMW",
  bmwmotorrad: "BMW",
  mercedesbenz: "Mercedes-Benz",
  mercedes: "Mercedes-Benz",
  merc: "Mercedes-Benz",
  audi: "Audi",
  mini: "Mini",
  volvo: "Volvo",
  jaguar: "Jaguar",
  landrover: "Land Rover",
  rangerover: "Land Rover",
  porsche: "Porsche",
  lexus: "Lexus",
  maserati: "Maserati",
  bentley: "Bentley",
  rollsroyce: "Rolls-Royce",
  lamborghini: "Lamborghini",
  ferrari: "Ferrari",
  astonmartin: "Aston Martin",
  mclaren: "McLaren",
  byd: "BYD",
  lotus: "Lotus",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanup(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeFuelType(value: string | null | undefined): FuelType | null {
  const clean = cleanup(value);
  if (!clean) return null;
  const key = clean.toLowerCase();
  return FUEL_ALIASES[key] ?? FUEL_ALIASES[key.replace(/[^a-z+]/g, "")] ?? null;
}

export function normalizeTransmission(
  value: string | null | undefined,
): Transmission | null {
  const clean = cleanup(value);
  if (!clean) return null;
  const key = clean.toLowerCase();
  return (
    TRANSMISSION_ALIASES[key] ??
    TRANSMISSION_ALIASES[key.replace(/[^a-z]/g, "")] ??
    null
  );
}

export function normalizeBodyType(value: string | null | undefined): BodyType | null {
  const clean = cleanup(value);
  if (!clean) return null;
  const key = clean.toLowerCase();
  return BODY_ALIASES[key] ?? BODY_ALIASES[key.replace(/[^a-z]/g, "")] ?? null;
}

/** Title-cases an unknown make while preserving intentional ALL-CAPS acronyms. */
function titleCaseMake(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word.length <= 3 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function normalizeMake(value: string | null | undefined): string | null {
  const clean = cleanup(value);
  if (!clean) return null;
  return MAKE_CANONICAL[slug(clean)] ?? titleCaseMake(clean);
}

/**
 * Models are messier than makes — every dealer invents a spelling. We only fix
 * the mechanical problems (whitespace, a make prefix repeated inside the model,
 * ALL-CAPS trim-code casing like `M340I`) rather than maintaining an
 * unmaintainable per-model alias table.
 */
export function normalizeModel(
  value: string | null | undefined,
  make?: string | null,
): string | null {
  let clean = cleanup(value);
  if (!clean) return null;

  const canonicalMake = normalizeMake(make);
  if (canonicalMake) {
    // "BMW M340i" stored under make=BMW should just be "M340i".
    const prefix = new RegExp(`^${escapeRegex(canonicalMake)}\\s+`, "i");
    clean = clean.replace(prefix, "").trim() || clean;
  }

  // `M340I` / `GLC300D` — a letter-digit trim code shouted in caps. Lowercase
  // only the trailing letters so `M340I` → `M340i` but `GLC` stays `GLC`.
  clean = clean.replace(/\b([A-Z]*\d+[A-Z]{1,3})\b/g, (match) =>
    match.replace(/([A-Z]+)$/, (tail) => tail.toLowerCase()),
  );

  return clean
    .split(" ")
    .map((word) =>
      /^[A-Z]{2,}$/.test(word) || /\d/.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCity(value: string | null | undefined): string | null {
  const clean = cleanup(value);
  if (!clean) return null;
  return clean
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeColor(value: string | null | undefined): string | null {
  const clean = cleanup(value);
  if (!clean) return null;
  return clean.toLowerCase();
}

/** Digits-only Indian mobile number, or null if it isn't plausibly one. */
export function normalizePhone(value: string | null | undefined): string | null {
  const clean = cleanup(value);
  if (!clean) return null;
  const digits = clean.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length === 12
    ? digits.slice(2)
    : digits.startsWith("0") && digits.length === 11
      ? digits.slice(1)
      : digits;
  if (local.length !== 10 || !/^[6-9]/.test(local)) return null;
  return local;
}

export type NormalizableListing = {
  make: string;
  model: string;
  variant?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  bodyType?: string | null;
  color?: string | null;
  city?: string | null;
  sellerPhone?: string | null;
};

/**
 * Applies every canonicalisation above in one pass. Returns a partial that the
 * caller spreads over the listing — fields that normalise to null are returned
 * as null so they overwrite a previously-bad value rather than being skipped.
 */
export function normalizeListingFields<T extends NormalizableListing>(
  listing: T,
): {
  make: string;
  model: string;
  variant: string | null;
  fuelType: string | null;
  transmission: string | null;
  bodyType: string | null;
  color: string | null;
  city: string | null;
  sellerPhone: string | null;
} {
  const make = normalizeMake(listing.make) ?? listing.make;
  return {
    make,
    model: normalizeModel(listing.model, make) ?? listing.model,
    variant: cleanup(listing.variant),
    fuelType: normalizeFuelType(listing.fuelType),
    transmission: normalizeTransmission(listing.transmission),
    bodyType: normalizeBodyType(listing.bodyType),
    color: normalizeColor(listing.color),
    city: normalizeCity(listing.city),
    sellerPhone: normalizePhone(listing.sellerPhone),
  };
}
