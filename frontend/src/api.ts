import type {
  AccessPolicy,
  AgentResponse,
  AppConfig,
  ComposeInput,
  DashboardResponse,
  FullPost,
  PostPreview,
} from "./types";

export async function searchPosts(q: string): Promise<{ posts: PostPreview[] }> {
  const r = await fetch(`/api/index/search?q=${encodeURIComponent(q)}`);
  return r.json();
}

export async function fetchPostPreview(
  postId: string
): Promise<{ status: number; preview: Partial<FullPost> }> {
  const r = await fetch(`/api/posts/${postId}`);
  const data = await r.json();
  return { status: r.status, preview: data };
}

export async function fetchPostPaid(
  postId: string,
  apiKey: string,
  agent = "Reader-Web"
): Promise<FullPost> {
  const r = await fetch(`/api/posts/${postId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Agent-Name": agent,
    },
  });
  return r.json();
}

export async function runAgent(
  query: string,
  budget: number,
  apiKey: string
): Promise<AgentResponse> {
  const r = await fetch("/api/agent/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, budget_usdc: budget, api_key: apiKey }),
  });
  return r.json();
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  const r = await fetch("/api/dashboard");
  return r.json();
}

export async function importRss(
  rss_url: string
): Promise<{ imported_count: number; posts: FullPost[] }> {
  const r = await fetch("/api/migration/import-rss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rss_url }),
  });
  return r.json();
}

export async function createPost(
  input: ComposeInput
): Promise<{ post: FullPost }> {
  const r = await fetch("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error ?? `Publish failed (${r.status})`);
  }
  return r.json();
}

export async function updatePostSettings(
  postId: string,
  patch: { access_policy?: AccessPolicy; price_per_read?: number; human_price?: number | null }
): Promise<{ post: FullPost }> {
  const r = await fetch(`/api/posts/${postId}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return r.json();
}

export async function fetchConfig(): Promise<AppConfig> {
  const r = await fetch("/api/config");
  return r.json();
}
