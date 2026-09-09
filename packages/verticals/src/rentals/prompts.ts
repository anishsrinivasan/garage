/**
 * Rentals-domain prompts.
 *
 * The money rules are the longest part on purpose. Rent, deposit and
 * maintenance appear in any order and are frequently unlabelled, and a deposit
 * stored as rent puts a listing in entirely the wrong price band. The
 * deterministic reconciler in money.ts is the safety net; this is the first line.
 */

export const RENTALS_EXTRACTION_PROMPT = `You extract structured rental listings from Indian Instagram broker posts.

You will be given MULTIPLE posts from one broker, numbered from 1. For each, read the caption and any images and extract the property details.

MONEY — read carefully, this is the part most often got wrong:
- All amounts in INR. "25k" = 25000. "2L" or "2 lakhs" = 200000. "1.5L" = 150000.
- rent is the MONTHLY rent.
- deposit is the one-time lump sum. In India it is also called "advance",
  "caution deposit" or "security". It is usually 2-10 times the monthly rent.
- maintenance is a small recurring monthly charge, usually a few thousand.
- If a caption gives two unlabelled amounts, the SMALLER is almost always the
  monthly rent and the LARGER the deposit. Do not report the deposit as rent.
- Set maintenanceIncluded=true when the caption says maintenance is included.
- If an amount is genuinely absent, use null. Do not guess.

PROPERTY:
- bhk is the bedroom count as an integer. A studio or single-room unit has
  bhk=null and propertyType="studio" or "rk".
- carpetAreaSqft in square feet, integer.
- floor and totalFloors as integers where stated ("3rd floor of 5").
- furnishing: unfurnished | semi_furnished | fully_furnished
- tenantPreference: family | bachelors | bachelors_male | bachelors_female | company | any
- parking: none | bike | car | both
- availableFrom as YYYY-MM-DD when a date is given, else null. "immediate" is null.
- amenities: short lowercase tags for what is actually mentioned — lift, power
  backup, gym, pool, security, water, park, clubhouse. Do not invent any.
- gatedCommunity: true when the listing says the home is in a gated community,
  gated complex or gated enclave — "gated community", "inside a gated
  compound", "secure gated society". false only if it says the opposite, e.g.
  "independent house, not a gated community". null when it is not mentioned,
  which is the common case. A compound wall, a security guard or CCTV alone is
  not a gated community; say null for those.

LOCATION:
- locationText: copy the location EXACTLY as written, including landmarks and
  informal names — "near Adyar signal", "OMR Perungudi", "Thoraipakkam behind
  IGP". Do not normalise or correct it; a later step resolves it.

LISTING:
- Set isRentalListing=false only when the post is not a specific property for
  rent: a sale listing, a service ad, a meme, a generic announcement.
- A property for SALE is not a rental. Set isRentalListing=false for it.
- Set isRented=true when the post says taken, rented, occupied or closed.
- Extract a phone number if one is visible.

Return one entry per input post, with "index" matching the 1-based post number.`;

export const RENTALS_IMAGE_SCORING_PROMPT = `You rate photos for a rental listing marketplace. Each image is a candidate for the single thumbnail shown on a listing card.

Score 0-100 on how well the image represents THIS property as a listing thumbnail:

90-100: Bright, wide shot of a real room or the building exterior. Space reads clearly, well lit, minimal clutter.
70-89:  A real room but a tighter crop, dimmer light, or a less informative space (corridor, balcony, bathroom).
40-69:  A floor plan, a heavily cluttered or dark room, or a partial view that conveys little.
10-39:  A person is the main subject (broker to camera, family), or graphics cover so much of the frame that no space is readable.
0-9:    No property at all — logo card, price card, meme, map screenshot, unrelated photo.

TEXT OVERLAY — read this before scoring:
Indian broker reels burn marketing text ("3BHK FOR RENT", a price, a phone
number) onto EVERY frame of EVERY clip. Text is therefore not a distinguishing
signal here and must not by itself push a frame down. Score the space you can
still see around and behind the caption, exactly as you would if the text were
not there. Only treat text as a real problem when it genuinely hides the room —
a full-bleed title card with no visible space behind it. A clear bedroom with a
price banner across the bottom is still a good thumbnail.

Also set these flags:
- showsSubject: an interior or exterior of a real property is identifiable. Scoring caps hard on this one, so set it true whenever a real space is visible, even partially or behind a caption.
- hasPlayButtonOverlay: a play triangle is drawn over the image. Instagram burns one into reel cover frames; those make poor thumbnails.
- personDominates: a human is the largest or most prominent subject.
- isFloorPlan: the image is a floor plan or layout drawing rather than a photograph.

Prefer a living room or building exterior over a bathroom or a floor plan. Be strict about whether a livable space is visible — but judge that through the overlay, not because of it. A thumbnail showing no livable space scores below 40. Give a short reason (max 12 words).

Return one entry per image, with "index" matching the 1-based image number.`;
