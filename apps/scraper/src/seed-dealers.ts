import { db, dealerSources } from "@preowned-cars/db";

const INSTAGRAM_DEALERS = [
  { handle: "chennai_preowned_cars", displayName: "Chennai Preowned Cars", city: "Chennai" },
  { handle: "chennai_used_cars_hub", displayName: "Chennai Used Cars Hub", city: "Chennai" },
  { handle: "chennaiusedcardealers", displayName: "Chennai Used Car Dealers", city: "Chennai" },
  { handle: "premiumcars_chennai", displayName: "Premium Cars Chennai", city: "Chennai" },
  { handle: "motormartchennai", displayName: "Motor Mart Chennai", city: "Chennai" },
];

async function main() {
  console.log(`Seeding ${INSTAGRAM_DEALERS.length} Instagram dealer handles...`);

  let newCount = 0;
  for (const dealer of INSTAGRAM_DEALERS) {
    const result = await db
      .insert(dealerSources)
      .values({
        platform: "instagram",
        handle: dealer.handle,
        displayName: dealer.displayName,
        city: dealer.city,
        isActive: true,
      })
      .onConflictDoNothing({ target: [dealerSources.platform, dealerSources.handle] })
      .returning({ id: dealerSources.id });

    if (result.length > 0) newCount++;
  }

  console.log(`Done: ${newCount} new dealers added (${INSTAGRAM_DEALERS.length - newCount} already existed)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
