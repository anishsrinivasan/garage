/**
 * Alert delivery.
 *
 * Two transports, chosen for what actually reaches people in India:
 *
 *   - **Email** via Resend. Universal, cheap, and the only channel that works
 *     without the recipient installing anything.
 *   - **Telegram**. Free, instant, no template approval, and widely used here.
 *     WhatsApp reaches more people but its Business API carries per-message cost
 *     and template review, which is not worth it before there is demand.
 *
 * Delivery is a *digest*: one message per subscriber per run, listing every new
 * match. Twenty matching flats must not become twenty notifications — that is
 * how an alert product gets muted and then deleted.
 *
 * Both transports are best-effort and never throw. A failed send marks that
 * delivery row failed and leaves the rest alone; nothing here should be able to
 * take down a scrape that already succeeded.
 */

import { eq, inArray } from "drizzle-orm";
import { db, listings, savedSearches } from "@classifieds/db";
import {
  getPendingDeliveries,
  markDelivered,
  type PendingDelivery,
} from "./evaluate";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export type DeliveryResult = {
  sent: number;
  failed: number;
  skipped: number;
};

type Grouped = {
  savedSearchId: string;
  channel: string;
  label: string;
  email: string | null;
  telegramChatId: string | null;
  unsubscribeToken: string;
  deliveryIds: string[];
  listingIds: string[];
};

/** One message per (subscriber, channel), however many listings matched. */
function group(pending: PendingDelivery[]): Grouped[] {
  const byKey = new Map<string, Grouped>();
  for (const d of pending) {
    const key = `${d.savedSearchId}|${d.channel}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.deliveryIds.push(d.id);
      existing.listingIds.push(d.listingId);
    } else {
      byKey.set(key, {
        savedSearchId: d.savedSearchId,
        channel: d.channel,
        label: d.label,
        email: d.email,
        telegramChatId: d.telegramChatId,
        unsubscribeToken: d.unsubscribeToken,
        deliveryIds: [d.id],
        listingIds: [d.listingId],
      });
    }
  }
  return [...byKey.values()];
}

type Summary = { id: string; vertical: string; title: string; price: string | null; where: string };

async function summarise(listingIds: string[]): Promise<Summary[]> {
  const rows = await db
    .select({
      id: listings.id,
      vertical: listings.vertical,
      make: listings.make,
      model: listings.model,
      year: listings.year,
      price: listings.price,
      city: listings.city,
      location: listings.location,
    })
    .from(listings)
    .where(inArray(listings.id, listingIds));

  return rows.map((r) => ({
    id: r.id,
    vertical: r.vertical,
    // For rentals `make` already holds the human label the vertical produced
    // ("2 BHK in Adyar"); for cars it is the marque.
    title:
      r.vertical === "rentals"
        ? r.make
        : `${r.year} ${r.make} ${r.model}`,
    price: r.price,
    where: r.location ?? r.city,
  }));
}

function money(value: string | null): string {
  if (!value) return "on request";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "on request";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2).replace(/\.?0+$/, "")} L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n}`;
}

function pathFor(vertical: string): string {
  return vertical === "rentals" ? "rent" : "listings";
}

async function sendEmail(group: Grouped, items: Summary[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and ALERT_FROM_EMAIL must be set to send email alerts");
  }
  if (!group.email) throw new Error("saved search has no email address");

  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">
           <a href="${SITE_URL}/${pathFor(i.vertical)}/${i.id}" style="color:#111;text-decoration:none;font-weight:600">${escape(i.title)}</a>
           <div style="color:#666;font-size:13px;margin-top:2px">${money(i.price)}${i.vertical === "rentals" ? "/month" : ""} · ${escape(i.where)}</div>
         </td></tr>`,
    )
    .join("");

  const unsubscribe = `${SITE_URL}/alerts/unsubscribe?token=${group.unsubscribeToken}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
    <p style="font-size:15px">${items.length} new match${items.length === 1 ? "" : "es"} for <strong>${escape(group.label)}</strong>.</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="color:#888;font-size:12px;margin-top:24px">
      Every listing shows when it was posted and when we last confirmed it.<br>
      <a href="${unsubscribe}" style="color:#888">Stop these alerts</a>
    </p>
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: group.email,
      subject: `${items.length} new match${items.length === 1 ? "" : "es"}: ${group.label}`,
      html,
      // One-click unsubscribe. Without it, the only way out of an alert is the
      // spam button, which costs the sending domain far more than the recipient.
      headers: {
        "List-Unsubscribe": `<${unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function sendTelegram(group: Grouped, items: Summary[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN must be set to send Telegram alerts");
  if (!group.telegramChatId) throw new Error("saved search has no Telegram chat id");

  const lines = items.map(
    (i) =>
      `• <b>${escape(i.title)}</b> — ${money(i.price)}${i.vertical === "rentals" ? "/mo" : ""}\n  ${SITE_URL}/${pathFor(i.vertical)}/${i.id}`,
  );
  const text = `${items.length} new match${items.length === 1 ? "" : "es"} for <b>${escape(group.label)}</b>\n\n${lines.join("\n")}`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: group.telegramChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Telegram returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sends everything pending. Safe to call on a schedule and safe to call twice —
 * `markDelivered` moves rows out of `pending`, and the unique index means a
 * listing can only ever be queued once per search and channel.
 */
export async function deliverPendingAlerts(limit = 200): Promise<DeliveryResult> {
  const pending = await getPendingDeliveries(limit);
  if (pending.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const groups = group(pending);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const g of groups) {
    const items = await summarise(g.listingIds);
    if (items.length === 0) {
      // The listings were deleted between queueing and sending.
      await markDelivered(g.deliveryIds, "failed", "listings no longer exist");
      skipped += g.deliveryIds.length;
      continue;
    }

    try {
      if (g.channel === "email") await sendEmail(g, items);
      else if (g.channel === "telegram") await sendTelegram(g, items);
      else throw new Error(`unknown channel "${g.channel}"`);

      await markDelivered(g.deliveryIds, "sent");
      await db
        .update(savedSearches)
        .set({ lastNotifiedAt: new Date() })
        .where(eq(savedSearches.id, g.savedSearchId));
      sent += g.deliveryIds.length;
      console.log(
        `[alerts] sent ${items.length} match(es) to ${g.channel} for "${g.label}"`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markDelivered(g.deliveryIds, "failed", message);
      failed += g.deliveryIds.length;
      console.warn(`[alerts] ${g.channel} delivery failed for "${g.label}": ${message}`);
    }
  }

  return { sent, failed, skipped };
}
