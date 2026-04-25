import "dotenv/config";

function bool(v) {
  return Boolean(v && String(v).trim().length > 0);
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  publicBaseUrl: process.env.HAYSTACK_PUBLIC_BASE_URL ?? "http://localhost:8787",
  defaultAuthorId: process.env.HAYSTACK_DEFAULT_AUTHOR_ID ?? "author_ada",

  x402: {
    receiptSecret:
      process.env.X402_RECEIPT_SECRET ??
      process.env.CIRCLE_ENTITY_SECRET ??
      process.env.GEMINI_API_KEY ??
      "haystack-local-dev-receipts",
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    flashModel: process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash",
    proModel: process.env.GEMINI_PRO_MODEL ?? "gemini-2.5-pro",
    defaultBudgetUsdc: Number(process.env.AGENT_DEFAULT_BUDGET_USDC ?? 0.01),
  },

  circle: {
    apiKey: process.env.CIRCLE_API_KEY ?? "",
    entitySecret: process.env.CIRCLE_ENTITY_SECRET ?? "",
    env: process.env.CIRCLE_ENV ?? "sandbox",
    baseUrl: process.env.CIRCLE_GATEWAY_BASE_URL ?? "https://api.circle.com",
    currency: process.env.HAYSTACK_SETTLEMENT_CURRENCY ?? "USDC",
    blockchain: process.env.CIRCLE_W3S_BLOCKCHAIN ?? "ARC-TESTNET",
  },

  arc: {
    rpcUrl: process.env.ARC_RPC_URL ?? "",
    chainId: process.env.ARC_CHAIN_ID ?? "",
    usdcContract: process.env.ARC_USDC_CONTRACT ?? "",
    explorerBaseUrl: process.env.ARC_EXPLORER_BASE_URL ?? "",
    confirmationsRequired: Number(process.env.SETTLEMENT_CONFIRMATIONS_REQUIRED ?? 1),
  },

  tavily: {
    apiKey: process.env.TAVILY_API_KEY ?? "",
  },
};

export const integrations = {
  gemini: {
    live: bool(config.gemini.apiKey),
    detail: bool(config.gemini.apiKey)
      ? `${config.gemini.flashModel} + ${config.gemini.proModel}`
      : "Local mock (set GEMINI_API_KEY to go live)",
  },
  circle: {
    live: bool(config.circle.apiKey) && bool(config.circle.entitySecret),
    detail: bool(config.circle.apiKey) && bool(config.circle.entitySecret)
      ? `${config.circle.env} · ${config.circle.blockchain} · ${config.circle.baseUrl}`
      : "In-memory ledger (set CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET to go live)",
  },
  arc: {
    live: bool(config.arc.explorerBaseUrl) || bool(config.arc.rpcUrl),
    detail: bool(config.arc.explorerBaseUrl)
      ? `Explorer: ${config.arc.explorerBaseUrl}`
      : "Mocked tx hashes (set ARC_EXPLORER_BASE_URL for clickable receipts)",
  },
};

export function explorerUrlFor(txHash) {
  if (!config.arc.explorerBaseUrl || !txHash) return null;
  const base = config.arc.explorerBaseUrl.replace(/\/$/, "");
  return `${base}/tx/${txHash}`;
}

export function logStartupBanner() {
  const flag = (live) => (live ? "live  " : "mock  ");
  console.log("──────────────────────────────────────────────");
  console.log("HayStack backend integrations");
  console.log(`  ${flag(integrations.gemini.live)}Gemini  ${integrations.gemini.detail}`);
  console.log(`  ${flag(integrations.circle.live)}Circle  ${integrations.circle.detail}`);
  console.log(`  ${flag(integrations.arc.live)}Arc     ${integrations.arc.detail}`);
  console.log("──────────────────────────────────────────────");
}
