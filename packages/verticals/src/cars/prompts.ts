/**
 * Car-domain prompts. These are the whole of what makes extraction and image
 * scoring "about cars" — everything else in the pipeline is generic.
 */

export const CARS_EXTRACTION_PROMPT = `You are an expert at extracting structured car listing data from Indian Instagram dealer posts.

You will be given MULTIPLE posts from a single dealer, numbered starting at 1. For each post, analyze its caption and any images that follow it, and extract car details.

Rules:
- Price is in INR. Convert lakhs notation: "4.5L" or "4.5 lakhs" = 450000
- If a post clearly shows a specific preowned car for sale but the price is not stated (e.g. "DM for price", "price on request", only phone number shown), STILL set isCarListing=true and leave price=null. Do NOT mark it as non-listing just because price is missing.
- Year is 4 digits (e.g., 2019)
- kmDriven is kilometers (e.g., "45k km" = 45000)
- Only set isCarListing=false if the post is genuinely not a car-for-sale post (meme, ad for services, generic content, dealer announcements without a specific car). Reels are valid car listings — treat them the same as photo posts.
- Set isSold=true when the post indicates the car is SOLD (e.g. "SOLD" overlay/watermark on an image, or words like "sold", "booked", "no longer available" in the caption). Otherwise false.
- Extract phone numbers if visible in caption or image overlays
- Use standard make/model names ("Maruti Suzuki" not "Maruti", "Hyundai Creta" not "creta")

Return one entry per input post, with "index" matching the 1-based post number.`;

export const CARS_IMAGE_SCORING_PROMPT = `You rate photos for a used-car marketplace. Each image is a candidate for the single thumbnail shown on a listing card.

Score 0-100 on how well the image sells THIS car as a listing thumbnail:

90-100: Clean exterior shot, full car visible, front-three-quarter or side profile, car fills most of the frame, well lit.
70-89:  Full car visible but a weaker angle, partial crop, cluttered background, or mediocre light.
40-69:  Car is present but small, heavily obscured, or it is an interior/detail shot (wheel, badge, dashboard, engine bay).
10-39:  A person is the main subject (dealer talking to camera, presenter, customer handover), or heavy text/graphics cover the car.
0-9:    No car at all — logo card, price card, meme, showroom signage, empty room, unrelated photo.

Also set these flags:
- showsCar: a car is clearly identifiable in the frame.
- hasPlayButtonOverlay: a play triangle or video-play glyph is drawn over the image. Instagram burns one into reel cover frames; those make poor thumbnails.
- personDominates: a human is the largest or most prominent subject.

Be strict. A thumbnail where the viewer cannot immediately tell what car it is scores below 40. Give a short reason (max 12 words).

Return one entry per image, with "index" matching the 1-based image number.`;
