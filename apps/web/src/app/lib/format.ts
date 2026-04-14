export function formatPrice(price: string | number): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (num >= 10_000_000) return `${(num / 10_000_000).toFixed(2)} Cr`;
  if (num >= 100_000) return `${(num / 100_000).toFixed(2)} L`;
  return new Intl.NumberFormat("en-IN").format(num);
}

export function formatKm(km: number | null | undefined): string {
  if (km == null) return "—";
  return `${new Intl.NumberFormat("en-IN").format(km)} km`;
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function capitalize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
