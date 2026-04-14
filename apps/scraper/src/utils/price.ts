export function parseIndianPrice(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  const lakhMatch = cleaned.match(/([\d.]+)\s*(?:lakh|lac)/i);
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]!) * 100000);
  const croreMatch = cleaned.match(/([\d.]+)\s*(?:crore|cr)/i);
  if (croreMatch) return Math.round(parseFloat(croreMatch[1]!) * 10000000);
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
