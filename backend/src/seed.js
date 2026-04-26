import { sqlGet, sqlRun } from "./db.js";
import { createPost, upsertApiKey } from "./store.js";

// Bump SEED_VERSION whenever the seed content changes meaningfully.
// The seeded content for any given version is loaded at most once per database.
const SEED_VERSION = "2";

const seedPosts = [
  {
    authorId: "author_ada",
    title: "What HayStack Is For",
    bodyFull: [
      "There are now two kinds of readers on the open web. The familiar one is human, attached to a body and an inbox and a Sunday morning. The other is computational, with infinite patience and no notion of subscription. For thirty years, only one of them paid for what they read.",
      "That asymmetry has been quietly poisoning the writer's craft. Free distribution invented the modern essay. Free retrieval is hollowing it out. When agents can read the entirety of your thinking and pay nothing, the only economics left for writers are attention and outrage.",
      "HayStack is the smallest possible correction. Each post becomes an addressable resource with a price for machines and a preview for humans. The writer keeps SEO and discovery. The agent gets fresh, cited, paid-for knowledge. The human reader is none the worse off.",
      "The protocol underneath is HTTP 402. The rail underneath is Arc. The unit of value is a fraction of a cent. We are not putting the web behind a paywall. We are putting a price tag on the things that always cost something to produce.",
    ].join("\n\n"),
    accessPolicy: "ai_metered",
    pricePerRead: 0.001,
  },
  {
    authorId: "author_ada",
    title: "The Tyranny of Flat Summaries",
    bodyFull: [
      "AI systems are extraordinarily good at flattening rich argument into smooth certainty. The cost is not only nuance. It is provenance. When a paragraph loses its source, it loses its social contract.",
      "Writers are left with exposure without economics, and readers are left with confidence without accountability. The model speaks with the calm of a textbook because it has been trained on every textbook, and on you, and on me, and on a thousand discarded drafts.",
      "A workable web of machine readers requires payments that are as composable as links and as cheap as cache hits. That means micropayments are not a feature for publishing. They are infrastructure. Treat them like timestamps and MIME types: small things the system has to carry forward whether or not anyone notices.",
      "The good summary cites. The honest summary pays. HayStack is for the ones that do both.",
    ].join("\n\n"),
    accessPolicy: "ai_metered",
    pricePerRead: 0.001,
  },
  {
    authorId: "author_ada",
    title: "Why RSS Failed to Capture Value",
    bodyFull: [
      "RSS solved distribution and then stopped one layer too early. It carried content. It did not carry settlement. Human subscriptions patched the gap for newsletters, but machine readers scaled faster than subscription UX.",
      "An agent does not want ten subscriptions. It wants ten milliseconds of access. HayStack treats each post like an API endpoint where cost and retrieval are first-class metadata, so agents can reason economically while staying current.",
      "The most important thing RSS got right was that the writer is the unit of distribution. We just need to make the writer the unit of revenue too. The feed is fine. The receipt was missing.",
    ].join("\n\n"),
    accessPolicy: "premium",
    pricePerRead: 0.0025,
    humanPrice: 12,
  },
  {
    authorId: "author_river",
    title: "Arc Makes 402 Real Again",
    bodyFull: [
      "HTTP 402 existed before streaming video, before app stores, and before on-chain stablecoin rails. It failed because the internet lacked settlement that was cheap enough and fast enough for machine-scale reads.",
      "Arc changes the math. With sub-cent settlement and deterministic finality, the gas cost of a payment is no longer a multiple of the payment itself. Circle Nanopayments then lets API economics happen where they belong: in the request loop.",
      "The right way to think about this is not 'crypto for publishing.' It is 'finally, a payment primitive that fits inside an HTTP round trip.' Once that primitive exists, everything you used to do with auth headers you can also do with a settlement header.",
      "The status code was always there, waiting. The settlement layer is what showed up late.",
    ].join("\n\n"),
    accessPolicy: "gated",
    pricePerRead: 0.001,
    humanPrice: 10,
  },
  {
    authorId: "author_river",
    title: "Notes on Pricing a Post for an Agent",
    bodyFull: [
      "Pricing for humans is psychological. Pricing for agents is mechanical. An agent has a budget, a query, and a finite tolerance for cost-per-token. Your post enters its consideration set the moment it shows up in a paid index.",
      "The naive default is one-tenth of a cent. That is enough to be respectable and small enough not to discourage retrieval. Premium long-form work can justify a few cents. Analysis with proprietary data can justify dimes. The tail is not infinite, but it is wider than the human market.",
      "The mistake is to price for the most generous agent. The right move is to price so a budget-constrained agent can still afford you. Then watch what happens at scale: many cheap reads outrun a few expensive ones, almost every time.",
    ].join("\n\n"),
    accessPolicy: "ai_metered",
    pricePerRead: 0.0015,
  },
  {
    authorId: "author_river",
    title: "The Smallest Useful Receipt",
    bodyFull: [
      "Receipts have always been the unsung scaffold of trust on the internet. Stripe receipts. App Store receipts. Transaction emails. They make commerce legible after the fact.",
      "For agentic commerce, the receipt has to be smaller, faster, and machine-readable in flight. An on-chain settlement reference plus a verifiable amount and a destination address is enough. No human has to read it. The writer just has to know it exists.",
      "The smallest useful receipt is the difference between getting paid and being scraped. HayStack makes that receipt the default, not the exception, on every read.",
    ].join("\n\n"),
    accessPolicy: "ai_metered",
    pricePerRead: 0.001,
  },
];

const currentSeedVersion = (await sqlGet("SELECT value FROM meta WHERE key = 'seed_version'"))?.value;

if (currentSeedVersion !== SEED_VERSION) {
  await sqlRun("DELETE FROM transactions");
  await sqlRun("DELETE FROM posts");
  for (const post of seedPosts) {
    await createPost(post);
  }
  await sqlRun(
    "INSERT INTO meta (key, value) VALUES ('seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [SEED_VERSION]
  );
  console.log(`Seeded ${seedPosts.length} posts (version ${SEED_VERSION}).`);
}

await upsertApiKey({
  id: "key_demo_gemini",
  name: "Gemini",
  apiKey: "hs_demo_gemini",
  balanceUsdc: 1.5,
});
await upsertApiKey({
  id: "key_demo_perplexity",
  name: "Perplexity",
  apiKey: "hs_demo_perplexity",
  balanceUsdc: 0.75,
});
await upsertApiKey({
  id: "key_demo_claude",
  name: "Claude-Web",
  apiKey: "hs_demo_claude",
  balanceUsdc: 0.75,
});

console.log("Seed complete.");
