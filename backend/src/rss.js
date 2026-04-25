import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function arr(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return value["#text"] ?? value._ ?? "";
  return "";
}

function stripHtml(input) {
  return text(input)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|blockquote|li|h[1-6])>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function linkFromEntry(entry) {
  const link = entry.link;
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    const alternate = link.find((l) => l["@_rel"] === "alternate") ?? link[0];
    return alternate?.["@_href"] ?? text(alternate);
  }
  return link?.["@_href"] ?? text(link);
}

function normalizeRssItem(item) {
  const title = stripHtml(item.title);
  const body =
    stripHtml(item["content:encoded"]) ||
    stripHtml(item.content) ||
    stripHtml(item.description) ||
    stripHtml(item.summary);
  return {
    title,
    body,
    sourceUrl: linkFromEntry(item) || text(item.guid) || null,
  };
}

function normalizeAtomEntry(entry) {
  const title = stripHtml(entry.title);
  const body = stripHtml(entry.content) || stripHtml(entry.summary);
  return {
    title,
    body,
    sourceUrl: linkFromEntry(entry) || text(entry.id) || null,
  };
}

export async function fetchFeedPosts(rssUrl, { limit = 100 } = {}) {
  const url = new URL(rssUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("RSS URL must be http(s).");
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      "user-agent": "HayStack-RSS-Importer/0.1",
    },
  });
  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const rawItems = arr(parsed?.rss?.channel?.item).map(normalizeRssItem);
  const rawEntries = arr(parsed?.feed?.entry).map(normalizeAtomEntry);
  const posts = [...rawItems, ...rawEntries]
    .filter((p) => p.title && p.body)
    .slice(0, limit)
    .map((p) => ({
      title: p.title.slice(0, 180),
      bodyFull: p.body.length >= 120
        ? p.body
        : `${p.body}\n\nImported from ${rssUrl}.`,
      sourceUrl: p.sourceUrl,
    }));

  if (posts.length === 0) {
    throw new Error("No importable posts found in feed.");
  }
  return posts;
}
