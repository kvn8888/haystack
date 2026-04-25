export const DEMO_KEY = "hs_demo_gemini";

export interface Author {
  name: string;
  handle: string;
  bio: string;
}

export const AUTHORS: Record<string, Author> = {
  author_ada: {
    name: "Ada Wei",
    handle: "@adaw",
    bio: "Essays on the agent-readable web. Previously editor at Coil.",
  },
  author_river: {
    name: "River Sato",
    handle: "@river",
    bio: "Notes on payment plumbing, settlement APIs, and stablecoin rails.",
  },
  author_imported: {
    name: "Imported Author",
    handle: "@imported",
    bio: "Migrated via RSS. Add a bio after claiming this account.",
  },
};

const FALLBACK_AUTHOR: Author = {
  name: "HayStack Author",
  handle: "@haystack",
  bio: "A writer on HayStack.",
};

export function authorFor(id?: string): Author {
  if (id && AUTHORS[id]) return AUTHORS[id];
  return FALLBACK_AUTHOR;
}

export const fmtUsd = (n: number) => `$${Number(n ?? 0).toFixed(3)}`;
export const fmtUsd2 = (n: number) => `$${Number(n ?? 0).toFixed(2)}`;

export const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export const fmtShortDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

export const readingTime = (text: string) => {
  const words = (text ?? "").split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 220))} min read`;
};

export const accessLabel = (p: string) => {
  switch (p) {
    case "open":
      return "Free for all";
    case "ai_metered":
      return "AI-metered";
    case "gated":
      return "Subscribers + AI";
    case "premium":
      return "Premium + AI";
    default:
      return p;
  }
};

export function stripPreviewTail(text: string) {
  return (text ?? "").replace(/\[Preview ends here\..*?\]/gs, "").trim();
}
