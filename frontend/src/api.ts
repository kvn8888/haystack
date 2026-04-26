import type {
  AccessPolicy,
  AgentResponse,
  AppConfig,
  ComposeInput,
  DashboardResponse,
  FullPost,
  PostPreview,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

export async function searchPosts(q: string): Promise<{ posts: PostPreview[] }> {
  const r = await fetch(apiUrl(`/api/index/search?q=${encodeURIComponent(q)}`));
  return r.json();
}

export async function fetchPostPreview(
  postId: string,
  xPayment?: string | null
): Promise<{ status: number; preview: Partial<FullPost> }> {
  const headers: Record<string, string> = { "X-Reader-Type": "human" };
  if (xPayment) headers["X-Payment"] = xPayment;
  const r = await fetch(apiUrl(`/api/posts/${postId}`), {
    headers,
  });
  const data = await r.json();
  return { status: r.status, preview: data };
}

export async function fetchPostPaid(
  postId: string,
  apiKey: string,
  agent = "Reader-Web"
): Promise<FullPost> {
  const payment = await fetch(apiUrl(`/api/pay/${postId}`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Agent-Name": agent,
    },
  });
  const paymentData = await payment.json();
  if (!payment.ok || !paymentData.x_payment) {
    throw new Error(
      paymentData?.detail?.message ||
        paymentData?.error ||
        `Payment failed (${payment.status})`
    );
  }

  const full = await fetch(apiUrl(`/api/posts/${postId}`), {
    headers: { "X-Payment": paymentData.x_payment },
  });
  const data = await full.json();
  if (!full.ok || !data.body_full) {
    throw new Error(data?.error || `Unlock failed (${full.status})`);
  }
  return { ...data, x_payment: paymentData.x_payment };
}

export async function runAgent(
  query: string,
  budget: number,
  apiKey: string
): Promise<AgentResponse> {
  const r = await fetch(apiUrl("/api/agent/query"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, budget_usdc: budget, api_key: apiKey }),
  });
  return r.json();
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  const r = await fetch(apiUrl("/api/dashboard"));
  return r.json();
}

export async function importRss(
  rss_url: string,
  reset_previous = true,
  limit = 100
): Promise<{ deleted_count: number; imported_count: number; longform_count?: number; posts: FullPost[] }> {
  const r = await fetch(apiUrl("/api/migration/import-rss"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rss_url, reset_previous, limit }),
  });
  return r.json();
}

export async function clearImportedPosts(): Promise<{ deleted_count: number }> {
  const r = await fetch(apiUrl("/api/migration/imports"), { method: "DELETE" });
  return r.json();
}

export async function createPost(
  input: ComposeInput
): Promise<{ post: FullPost }> {
  const r = await fetch(apiUrl("/api/posts"), {
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
  const r = await fetch(apiUrl(`/api/posts/${postId}/settings`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return r.json();
}

export async function fetchConfig(): Promise<AppConfig> {
  const r = await fetch(apiUrl("/api/config"));
  return r.json();
}
