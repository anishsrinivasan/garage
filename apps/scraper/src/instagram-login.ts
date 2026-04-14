import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";

const SESSION_DIR = path.join(process.cwd(), "apps", "scraper", ".session");
const STATE_PATH = path.join(SESSION_DIR, "storage-state.json");

async function login() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  console.log(`\n=== Instagram Login Setup ===\n`);
  console.log(`This will open a visible browser window.`);
  console.log(`Log in to Instagram with your account.`);
  console.log(`Once you see your feed/home page, press Enter in this terminal to save the session.\n`);

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    locale: "en-IN",
  });

  const page = await context.newPage();
  await page.goto("https://www.instagram.com/accounts/login/", {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  console.log("Browser opened at Instagram login page.");
  console.log("Please log in now...\n");

  // Wait for user to press Enter after logging in
  await new Promise<void>((resolve) => {
    process.stdout.write("Press Enter after you have logged in and see your feed... ");
    process.stdin.once("data", () => resolve());
  });

  // Verify login succeeded by checking URL
  const currentUrl = page.url();
  if (currentUrl.includes("/accounts/login")) {
    console.log("\n⚠ Still on login page — please make sure you're fully logged in.");
    console.log("Saving session anyway in case login is in progress...\n");
  } else {
    console.log(`\nLogged in! Current URL: ${currentUrl}`);
  }

  // Save the full browser storage state (cookies + localStorage + sessionStorage)
  await context.storageState({ path: STATE_PATH });
  console.log(`Session saved to: ${STATE_PATH}`);

  // Also save cookies separately for backward compatibility
  const cookies = await context.cookies();
  fs.writeFileSync(path.join(SESSION_DIR, "cookies.json"), JSON.stringify(cookies, null, 2));
  console.log(`Cookies saved to: ${path.join(SESSION_DIR, "cookies.json")}`);

  // Quick verification — try loading a profile (non-blocking)
  console.log(`\nVerifying session by loading a profile...`);
  try {
    await page.goto("https://www.instagram.com/circuits99/", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    // Give the SPA a moment to process redirects
    await new Promise((r) => setTimeout(r, 3000));

    const redirectedToLogin = page.url().includes("/accounts/login");
    const title = await page.title();

    if (redirectedToLogin) {
      console.log("Session may need more time to propagate — but cookies are saved.");
      console.log("Try running the scraper anyway: bun run scrape:instagram");
    } else {
      console.log(`Session verified — loaded profile page: "${title}"`);
    }
  } catch {
    console.log("Verification timed out, but session was saved successfully.");
    console.log("Instagram's SPA can be slow — the session should still work.");
  }

  console.log(`\nThe scraper will now use this session automatically.`);
  console.log(`Run: bun run scrape:instagram\n`);

  await context.close();
  await browser.close();

  console.log(`=== Done ===\n`);
}

login().catch((err) => {
  console.error("Login script failed:", err);
  process.exit(1);
});
