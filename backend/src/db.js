import { createClient } from "@libsql/client";

const tursoUrl = process.env.TURSO_DATABASE_URL ?? "";
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN ?? "";

if (!tursoUrl) {
  throw new Error("TURSO_DATABASE_URL is required. Backend now runs on Turso.");
}

export const db = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken || undefined,
});

export async function sqlRun(sql, args = []) {
  return db.execute({ sql, args });
}

export async function sqlGet(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows?.[0] ?? null;
}

export async function sqlAll(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows ?? [];
}

async function ensureColumn(table, column, definition) {
  const columns = await sqlAll(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await sqlRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

await sqlRun(`
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body_full TEXT NOT NULL,
  body_preview TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  access_policy TEXT NOT NULL CHECK(access_policy IN ('open', 'ai_metered', 'gated', 'premium')),
  price_per_read REAL NOT NULL DEFAULT 0.001,
  human_price REAL,
  created_at TEXT NOT NULL,
  source_url TEXT
)`);

await sqlRun(`
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  agent_identifier TEXT NOT NULL,
  amount_usdc REAL NOT NULL,
  arc_tx_hash TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  FOREIGN KEY(post_id) REFERENCES posts(id)
)`);

await sqlRun(`
CREATE TABLE IF NOT EXISTS writer_wallets (
  author_id TEXT PRIMARY KEY,
  arc_wallet_address TEXT NOT NULL,
  circle_wallet_id TEXT NOT NULL,
  balance_usdc REAL NOT NULL DEFAULT 0,
  total_earned_human REAL NOT NULL DEFAULT 0,
  total_earned_ai REAL NOT NULL DEFAULT 0
)`);

await sqlRun(`
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  balance_usdc REAL NOT NULL DEFAULT 0
)`);

await sqlRun(`
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);

await ensureColumn("transactions", "provider", "TEXT NOT NULL DEFAULT 'local'");
await ensureColumn("transactions", "provider_tx_id", "TEXT");
await ensureColumn("transactions", "settlement_status", "TEXT NOT NULL DEFAULT 'confirmed'");
await ensureColumn("transactions", "source_wallet_id", "TEXT");
await ensureColumn("transactions", "destination_wallet_id", "TEXT");
await ensureColumn("transactions", "raw_provider_response", "TEXT");

export function nowIso() {
  return new Date().toISOString();
}
