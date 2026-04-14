import { chromium } from "playwright";
import { INSTAGRAM_CONFIG } from "./adapters/instagram-config";
import * as path from "path";
import * as fs from "fs";

const SCREENSHOTS_DIR = path.join(process.cwd(), "apps", "scraper", "screenshots");

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissLoginModal(page: any): Promise<void> {
  const selectors = [
    '[aria-label="Close"]',
    'div[role="dialog"] button:has(svg)',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await delay(500);
        return;
      }
    } catch {}
  }
  await page.keyboard.press("Escape");
  await delay(500);
}

async function testPostExtraction() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    locale: "en-IN",
  });

  const page = await context.newPage();

  // First get profile to find /p/ links
  const handle = "circuits99";
  console.log(`Navigating to @${handle} profile...`);
  await page.goto(`${INSTAGRAM_CONFIG.baseUrl}/${handle}/`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await delay(5000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "test-profile-before-dismiss.png") });
  console.log(`Page title: "${await page.title()}"`);
  console.log(`URL: ${page.url()}`);

  await dismissLoginModal(page);
  await delay(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "test-profile-after-dismiss.png") });

  // Wait for post grid to render
  try {
    await page.waitForSelector('article', { timeout: 10000 });
    console.log("Article element found");
  } catch {
    console.log("No article element found — trying to scroll anyway");
    // Save HTML for debugging
    const html = await page.content();
    fs.writeFileSync(path.join(SCREENSHOTS_DIR, "test-profile-debug.html"), html);
    console.log("Saved page HTML for debugging");
  }

  // Scroll to load posts
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2000);
    if (i === 1) await dismissLoginModal(page);
  }

  // Collect all content links
  const allContentLinks = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (anchors: HTMLAnchorElement[]) =>
    [...new Set(anchors.map((a) => a.getAttribute("href")).filter(Boolean))]
  );
  console.log(`All content links: ${allContentLinks.length}`);

  const postLinks = allContentLinks.filter((l) => l?.includes("/p/"));
  const reelLinks = allContentLinks.filter((l) => l?.includes("/reel/"));
  console.log(`Photo posts (/p/): ${postLinks.length}, Reels (/reel/): ${reelLinks.length}`);

  // If no /p/ posts, fall back to reels
  const linksToTest = postLinks.length > 0 ? postLinks : reelLinks;
  console.log(`Testing: ${linksToTest.length > 0 ? linksToTest[0] : "none found"}`);

  if (linksToTest.length === 0) {
    console.log("No posts found, exiting");
    await browser.close();
    return;
  }

  // Test first post
  const postUrl = `${INSTAGRAM_CONFIG.baseUrl}${linksToTest[0]}`;
  console.log(`\nTesting post: ${postUrl}`);

  await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await delay(3000);
  await dismissLoginModal(page);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `test-post-after-dismiss.png`) });

  // Caption
  let caption = "";
  for (const sel of ['h1[dir="auto"]', 'article span[dir="auto"]', 'meta[property="og:description"]']) {
    try {
      if (sel.startsWith("meta")) {
        caption = await page.$eval(sel, (el: Element) => el.getAttribute("content") ?? "");
      } else {
        caption = await page.$eval(sel, (el: Element) => el.textContent?.trim() ?? "");
      }
      if (caption.length > 10) break;
    } catch {}
  }
  console.log(`Caption (${caption.length}ch): "${caption.substring(0, 200)}"`);

  // Images scoped to article
  const imageData = await page.$$eval(
    'article:first-of-type img[src], main > div > div:first-child img[src]',
    (imgs: HTMLImageElement[]) =>
      imgs.map((img) => ({
        src: img.getAttribute("src") ?? "",
        alt: img.getAttribute("alt") ?? "",
      })).filter(({ src, alt }) =>
        !!src &&
        !src.includes("s150x150") &&
        !alt.includes("profile picture") &&
        (src.includes("fbcdn") || src.includes("cdninstagram") || src.includes("instagram"))
      )
  );

  console.log(`Images: ${imageData.length}`);
  for (const { src, alt } of imageData) {
    console.log(`  img: ${src.substring(0, 80)}...`);
    if (alt.length > 20) console.log(`  alt: "${alt.substring(0, 150)}"`);
  }

  // Alt text as caption fallback
  const altTexts = imageData.map(d => d.alt).filter(a => a.length > 30 && a.includes("Photo by"));
  if (altTexts.length > 0 && caption.length < 20) {
    console.log(`\nUsing alt text as caption fallback:`);
    console.log(altTexts[0]?.substring(0, 200));
  }

  console.log("\n=== Test Complete ===");
  await context.close();
  await browser.close();
}

testPostExtraction().catch(console.error);
