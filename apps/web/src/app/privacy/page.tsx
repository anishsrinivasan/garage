import type { Metadata } from "next";
import { ProsePage, Section, Bullets } from "@/app/components/prose-page";
import { CONTACT_EMAIL } from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Classifieds stores, what stays in your browser, and what it does not collect.",
};

export default function PrivacyPage() {
  return (
    <ProsePage
      eyebrow="Privacy"
      title="What we store, and what never leaves your browser"
      standfirst="Short version: browsing here is anonymous. There are no accounts, no analytics, and no advertising or tracking scripts. Your saved and passed listings live in your own browser and are never sent to us."
      updated="2026-09-09"
    >
      <Section heading="No account, no profile">
        <p>
          The public site has no sign-up and no login. We do not ask for your name,
          email address or phone number, and there is nothing here that builds a
          profile of you across visits.
        </p>
      </Section>

      <Section heading="Saved and passed listings stay on your device">
        <p>
          Saving a listing, and swiping one away, writes an id into your browser&apos;s{" "}
          <strong>localStorage</strong>. That data never reaches our servers. It is
          why your saved list does not follow you to another browser or another
          device, and why clearing your browser data clears it.
        </p>
      </Section>

      <Section heading="No analytics or tracking">
        <p>
          There are no analytics scripts, tag managers, advertising pixels or
          third-party trackers on this site, and we set no cookies of our own.
        </p>
      </Section>

      <Section heading="What we do receive">
        <Bullets
          items={[
            <>
              <strong>Feedback you submit.</strong> The feedback form stores the
              category, the rating and the message you typed. It does not ask for
              or attach any contact details, so we cannot reply to it.
            </>,
            <>
              <strong>Listing reports.</strong> Reporting a listing stores which
              listing it was, the reason you picked, and any description you added.
            </>,
            <>
              <strong>Ordinary server logs.</strong> Our hosting provider records
              the usual request data — IP address, user agent, the URL requested —
              for delivery, security and debugging. We do not join those logs to
              anything else on this list.
            </>,
          ]}
        />
      </Section>

      <Section heading="Images and outbound links">
        <p>
          Listing photographs are served from our own storage or from the
          marketplace that hosts them, through this site&apos;s image optimiser, so
          your browser does not contact those marketplaces directly while you
          browse. Following a link out to a source listing, a dealer&apos;s
          Instagram, or a broker&apos;s page hands you over to that service and its
          own privacy practices.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          {CONTACT_EMAIL ? (
            <>
              Questions about any of this, or a request to remove data, can go to{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </>
          ) : (
            <>
              Questions about any of this can go through the feedback control in the
              bottom-right corner of any page. To have a listing removed, use the
              report control on the listing itself — see the{" "}
              <a href="/terms">terms</a> for how removals are handled.
            </>
          )}
        </p>
      </Section>
    </ProsePage>
  );
}
