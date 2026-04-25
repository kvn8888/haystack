import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.resolve(process.cwd(), "data");
const dbPath = path.join(dataDir, "haystack.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

db.exec(`
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
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    agent_identifier TEXT NOT NULL,
    amount_usdc REAL NOT NULL,
    arc_tx_hash TEXT NOT NULL,
    settled_at TEXT NOT NULL,
    FOREIGN KEY(post_id) REFERENCES posts(id)
  );

  CREATE TABLE IF NOT EXISTS writer_wallets (
    author_id TEXT PRIMARY KEY,
    arc_wallet_address TEXT NOT NULL,
    circle_wallet_id TEXT NOT NULL,
    balance_usdc REAL NOT NULL DEFAULT 0,
    total_earned_human REAL NOT NULL DEFAULT 0,
    total_earned_ai REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    balance_usdc REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

ensureColumn("transactions", "provider", "TEXT NOT NULL DEFAULT 'local'");
ensureColumn("transactions", "provider_tx_id", "TEXT");
ensureColumn("transactions", "settlement_status", "TEXT NOT NULL DEFAULT 'confirmed'");
ensureColumn("transactions", "source_wallet_id", "TEXT");
ensureColumn("transactions", "destination_wallet_id", "TEXT");
ensureColumn("transactions", "raw_provider_response", "TEXT");

export function nowIso() {
  return new Date().toISOString();
}
