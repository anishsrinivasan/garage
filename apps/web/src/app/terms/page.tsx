import type { Metadata } from "next";
import { ProsePage, Section, Bullets } from "@/app/components/prose-page";
import { CONTACT_EMAIL } from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "What Classifieds is, what it is not, and the terms of using the index and its API.",
};

export default function TermsPage() {
  return (
    <ProsePage
      eyebrow="Terms of use"
      title="An index, not a marketplace"
      standfirst="Classifieds collects preowned car and rental listings that Chennai dealers and brokers have already published elsewhere, and makes them searchable in one place. We do not sell, let, broker or hold anything listed here."
      updated="2026-09-09"
    >
      <Section heading="Where the listings come from">
        <p>
          Every listing is collected from a public source — dealer and broker
          accounts on Instagram, and marketplaces including OLX, Cars24 and
          CarDekho. Each card shows its source and the date the listing was posted,
          and links back to the original. The words and photographs in a listing
          belong to whoever published it; we reproduce them so the listing can be
          found, and we attribute the source on every one.
        </p>
      </Section>

      <Section heading="We are not part of any transaction">
        <Bullets
          items={[
            <>
              We are <strong>not an agent, dealer, broker or escrow</strong>. Any
              enquiry, viewing, negotiation or payment is entirely between you and
              the seller or landlord.
            </>,
            <>
              <strong>Verify before you pay.</strong> Confirm the vehicle or
              property, its papers and the person you are dealing with, in person.
              An advance paid on the strength of a listing is at your own risk.
            </>,
            <>
              We do not vet sellers, inspect vehicles, visit properties, or check
              ownership or title.
            </>,
          ]}
        />
      </Section>

      <Section heading="Accuracy and availability">
        <p>
          Listings are re-checked against their source on every scrape, and each one
          carries the date it was posted and the date we last confirmed it. Even so,
          prices change, listings are withdrawn, and a home can be taken or a car
          sold before we notice. Details are parsed automatically and can be wrong.
          The index is offered <strong>as is</strong>, with no warranty that any
          listing is current, accurate or still available.
        </p>
      </Section>

      <Section heading="If a listing is yours">
        <p>
          If you posted a listing that appears here and you want it removed, use the
          report control on that listing
          {CONTACT_EMAIL ? (
            <>
              {" "}
              or write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </>
          ) : null}
          . Say which listing it is and that it is yours; we remove it. The same
          route applies to a listing that is a duplicate, a scam, already sold, or
          otherwise wrong.
        </p>
      </Section>

      <Section heading="Using the index programmatically">
        <p>
          There is an <a href="/mcp">MCP endpoint and a JSON API</a> for agents and
          scripts, open and unauthenticated for now. Use it instead of scraping
          these pages — it is cheaper for you and for us. Please keep request rates
          reasonable; we would rather add limits because someone needed more than
          because something hammered it.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          These terms will change as the service does. The date above says when they
          last did.
        </p>
      </Section>
    </ProsePage>
  );
}
