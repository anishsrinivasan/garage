import { chromium } from "playwright";
import { INSTAGRAM_CONFIG, INSTAGRAM_DEALERS_STATIC } from "./adapters/instagram-config";
import * as path from "path";
import * as fs from "fs";

const SCREENSHOTS_DIR = path.join(process.cwd(), "apps", "scraper", "screenshots");
const SESSION_DIR = path.join(process.cwd(), "apps", "scraper", ".session");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissLoginModal(page: any): Promise<void> {
  const dismissSelectors = [
    '[aria-label="Close"]',
    'div[role="dialog"] button:has(svg)',
    '[role="dialog"] button[type="button"]',
  ];
  for (const selector of dismissSelectors) {
    try {
      const closeBtn = page.locator(selector).first();
      if (await closeBtn.isVisible({ timeout: 1500 })) {
        await closeBtn.click();
        await delay(500);
        console.log(`  Dismissed modal via: ${selector}`);
        return;
      }
    } catch {}
  }
  await page.keyboard.press("Escape");
  await delay(500);
  console.log("  Pressed Escape to dismiss modal");
}

async function debugInstagram() {
  ensureDir(SCREENSHOTS_DIR);

  const handle = process.argv[2] || INSTAGRAM_DEALERS_STATIC[0].handle;
  const headless = process.argv.includes("--headless");
  const maxPosts = parseInt(process.argv.find((a) => a.startsWith("--posts="))?.split("=")[1] ?? "3");
  const profileUrl = `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`;

  console.log(`\n=== Instagram Debug ===`);
  console.log(`Handle: @${handle}`);
  console.log(`URL: ${profileUrl}`);
  console.log(`Mode: ${headless ? "headless" : "headed (visible browser)"}`);
  console.log(`Max posts to test: ${maxPosts}`);
  console.log(`Screenshots dir: ${SCREENSHOTS_DIR}\n`);

  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const statePath = path.join(SESSION_DIR, "storage-state.json");
  const hasSession = fs.existsSync(statePath);
  if (hasSession) {
    console.log(`Using saved session from: ${statePath}`);
  } else {
    console.log("No saved session — run 'bun run instagram:login' first for best results");
  }

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    locale: "en-IN",
    ...(hasSession ? { storageState: statePath } : {}),
  });

  const page = await context.newPage();

  // === Step 1: Profile page ===
  console.log("Step 1: Navigating to profile...");
  const response = await page.goto(profileUrl, {
    waitUntil: "domcontentloaded",
    timeout: INSTAGRAM_CONFIG.navigationTimeoutMs,
  });
  console.log(`  Response status: ${response?.status()}`);
  console.log(`  URL after nav: ${page.url()}`);
  await delay(5000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `01-profile-raw-${handle}.png`) });

  // === Step 2: Dismiss modal ===
  console.log("\nStep 2: Dismissing login modal...");
  await dismissLoginModal(page);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `02-profile-after-dismiss-${handle}.png`) });

  // === Step 3: Find post links ===
  console.log("\nStep 3: Finding post links...");
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2000);
    if (i === 1) await dismissLoginModal(page);
  }

  const postLinks = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (anchors: HTMLAnchorElement[]) =>
    anchors.map((a) => a.getAttribute("href")).filter(Boolean)
  );
  console.log(`  Post links found: ${postLinks.length}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `03-profile-scrolled-${handle}.png`) });

  // === Step 4: Visit individual posts ===
  const postsToTest = postLinks.slice(0, maxPosts);
  console.log(`\nStep 4: Testing ${postsToTest.length} individual posts...`);

  for (let i = 0; i < postsToTest.length; i++) {
    const link = postsToTest[i]!;
    const postUrl = link.startsWith("http") ? link : `${INSTAGRAM_CONFIG.baseUrl}${link}`;
    console.log(`\n  --- Post ${i + 1}: ${postUrl} ---`);

    await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `04-post${i + 1}-raw-${handle}.png`) });

    // Dismiss modal
    await dismissLoginModal(page);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `05-post${i + 1}-after-dismiss-${handle}.png`) });

    // Caption extraction
    let caption = "";
    const captionSelectors = [
      'h1[dir="auto"]',
      'article span[dir="auto"]',
      'div[class*="Caption"] span',
      'article ul li span',
    ];
    for (const sel of captionSelectors) {
      try {
        caption = await page.$eval(sel, (el: Element) => el.textContent?.trim() ?? "");
        if (caption.length > 10) {
          console.log(`  Caption (via ${sel}): "${caption.substring(0, 120)}..."`);
          break;
        }
      } catch {}
    }

    // og:description fallback
    if (caption.length < 10) {
      try {
        caption = await page.$eval('meta[property="og:description"]', (el: Element) => el.getAttribute("content") ?? "");
        if (caption.length > 10) console.log(`  Caption (via og:description): "${caption.substring(0, 120)}..."`);
      } catch {}
    }

    // Image extraction (broad)
    const imageData = await page.$$eval('img[src]', (imgs: HTMLImageElement[]) =>
      imgs.map((img) => ({
        src: img.getAttribute("src") ?? "",
        alt: img.getAttribute("alt") ?? "",
      })).filter(({ src }) =>
        !!src &&
        !src.includes("s150x150") &&
        !src.includes("profile_pic") &&
        (src.includes("fbcdn") || src.includes("cdninstagram") || src.includes("instagram"))
      )
    );

    const contentImages = imageData.filter(({ alt }) => !alt.includes("profile picture"));
    console.log(`  Images found: ${contentImages.length}`);

    // Alt text (Instagram's auto-generated OCR descriptions)
    for (const { alt } of contentImages) {
      if (alt.length > 30) {
        console.log(`  Alt text: "${alt.substring(0, 200)}..."`);
      }
    }

    if (caption.length < 10 && contentImages.some(({ alt }) => alt.length > 30)) {
      console.log(`  >> Caption empty but alt text has rich data — can use alt as LLM input`);
    }
  }

  console.log(`\n=== Debug Complete ===`);
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}\n`);

  await context.close();
  await browser.close();
}

debugInstagram().catch((err) => {
  console.error("Debug script failed:", err);
  process.exit(1);
});
