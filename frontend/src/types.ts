export type AccessPolicy = "open" | "ai_metered" | "gated" | "premium";

export interface PostPreview {
  id: string;
  author_id?: string;
  title: string;
  body_preview: string;
  price_per_read: number;
  access_policy: AccessPolicy;
  created_at?: string;
}

export interface FullPost {
  id: string;
  author_id: string;
  title: string;
  access_policy: AccessPolicy;
  price_per_read: number;
  body_full: string;
  body_preview?: string;
  created_at?: string;
  tx?: Settlement | null;
}

export interface Settlement {
  id: string;
  post_id: string;
  agent_identifier: string;
  amount_usdc: number;
  settled_at: string;
  arc_tx_hash?: string;
  arc_explorer_url?: string | null;
  provider?: string;
  provider_tx_id?: string | null;
  settlement_status?: string;
  title?: string;
  post_title?: string;
}

export interface AgentRead {
  post_id: string;
  title: string;
  amount_usdc: number;
  citation: string;
  excerpt: string;
}

export interface AgentResponse {
  query: string;
  budget_usdc: number;
  spent_usdc: number;
  reads: AgentRead[];
  answer: string;
}

export interface DashboardResponse {
  totals: {
    month_human: number;
    month_ai: number;
    top_readers: Array<{
      agent_identifier: string;
      reads: number;
      spend: number;
    }>;
    post_settings: Array<{
      id: string;
      title: string;
      access_policy: AccessPolicy;
      price_per_read: number;
      human_price: number | null;
    }>;
  };
  live: Settlement[];
}

export type View =
  | "home"
  | "article"
  | "agent"
  | "migration"
  | "compose"
  | "dashboard";

export interface IntegrationStatus {
  live: boolean;
  detail: string;
}

export interface AppConfig {
  public_base_url: string;
  default_author_id: string;
  integrations: {
    gemini: IntegrationStatus;
    circle: IntegrationStatus;
    arc: IntegrationStatus;
  };
}

export interface ComposeInput {
  title: string;
  body_full: string;
  access_policy: AccessPolicy;
  price_per_read: number;
  human_price: number | null;
  author_id?: string;
}
