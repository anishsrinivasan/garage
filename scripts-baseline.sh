#!/usr/bin/env bash
# Captures the phase-0a acceptance baseline from the *rendered* pages, so it is
# immune to how the internals are organised. Re-run after the refactor and diff.
set -euo pipefail
BASE="${1:-http://localhost:3010}"
OUT="${2:-.baseline}"
mkdir -p "$OUT"

capture() {           # capture <name> <path>
  local name="$1" path="$2"
  curl -s "$BASE$path" > "$OUT/$name.html"
  # ordered listing ids as they appear in the grid
  # `|| true`: pages with no listing grid (e.g. /garages) legitimately match nothing
  { grep -oE '/listings/[0-9a-f-]{36}' "$OUT/$name.html" || true; } \
    | sed 's|/listings/||' | awk '!seen[$0]++' > "$OUT/$name.ids"
  echo "  $name  $(wc -l < "$OUT/$name.ids" | tr -d ' ') listings"
}

echo "capturing baseline from $BASE"
capture home            "/"
capture sort-listed     "/?sortBy=listedAt"
capture sort-price      "/?sortBy=price&sortOrder=desc"
capture sort-year       "/?sortBy=year&sortOrder=desc"
capture filter-diesel   "/?fuelType=diesel"
capture filter-suv      "/?bodyType=suv"
capture fresh-30        "/?freshness=month"
capture page2           "/?page=2"
capture garages         "/garages"

# facet labels + counts, and the headline stats, stripped of markup
python3 - "$OUT" <<'PY'
import re, sys, html, json, pathlib
out = pathlib.Path(sys.argv[1])
h = (out / "home.html").read_text()
text = re.sub(r"<[^>]+>", " ", re.sub(r"<script.*?</script>|<style.*?</style>", "", h, flags=re.S))
text = " ".join(html.unescape(text).split())
facts = {
    # React renders `car{"s"}` as two text nodes, so "cars" arrives as "car s"
    "total_line": (re.search(r"([\d,]+) cars? ?s? match your filters", text) or [None,None])[1],
    "live_listings": (re.search(r"Live listings ([\d,]+)", text) or [None,None])[1],
    "added_this_week": (re.search(r"Added this week ([\d,]+)", text) or [None,None])[1],
    "garages_stat": (re.search(r"Garages ([\d,]+)", text) or [None,None])[1],
    "fuel_pills": re.findall(r"(Petrol|Diesel|CNG|Electric|Hybrid|LPG) (\d+)", text),
    "body_pills": re.findall(r"(SUV|Sedan|Hatchback|MUV|Coupe|Convertible|Pickup|Van|Wagon) (\d+)", text),
    "transmission_pills": re.findall(r"(Automatic|Manual) (\d+)", text),
}
(out / "facets.json").write_text(json.dumps(facts, indent=2, sort_keys=True))
print("  facets:", facts["total_line"], "total ·", len(facts["fuel_pills"]), "fuel ·", len(facts["body_pills"]), "body")
PY

# one listing rendered in full
FIRST=$(head -1 "$OUT/home.ids")
curl -s "$BASE/listings/$FIRST" > "$OUT/listing.html"
echo "  listing $FIRST captured"
echo "$FIRST" > "$OUT/listing.id"
