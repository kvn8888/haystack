import crypto from "node:crypto";
import { nowIso, sqlAll, sqlGet, sqlRun } from "./db.js";
import { isCircleSettlementLive, settleReadWithCircle } from "./circle.js";

function postPreview(body) {
  const previewLength = Math.max(120, Math.floor(body.length * 0.2));
  return `${body.slice(0, previewLength).trim()}\n\n[Preview ends here. Full post requires payment.]`;
}

function walletAddress() {
  return `0x${crypto.randomBytes(20).toString("hex")}`;
}

function txHash() {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

export async function createWriterWallet(authorId) {
  const existing = await sqlGet("SELECT * FROM writer_wallets WHERE author_id = ?", [authorId]);
  if (existing) return existing;

  const wallet = {
    author_id: authorId,
    arc_wallet_address: walletAddress(),
    circle_wallet_id: `cw_${crypto.randomUUID().replaceAll("-", "")}`,
    balance_usdc: 0,
    total_earned_human: 0,
    total_earned_ai: 0,
  };

  await sqlRun(
    `INSERT INTO writer_wallets (author_id, arc_wallet_address, circle_wallet_id, balance_usdc, total_earned_human, total_earned_ai)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      wallet.author_id,
      wallet.arc_wallet_address,
      wallet.circle_wallet_id,
      wallet.balance_usdc,
      wallet.total_earned_human,
      wallet.total_earned_ai,
    ]
  );

  return wallet;
}

export async function createPost({
  authorId,
  title,
  bodyFull,
  accessPolicy = "ai_metered",
  pricePerRead = 0.001,
  humanPrice = null,
  sourceUrl = null,
}) {
  const wallet = await createWriterWallet(authorId);
  const post = {
    id: `post_${crypto.randomUUID()}`,
    author_id: authorId,
    title,
    body_full: bodyFull,
    body_preview: postPreview(bodyFull),
    wallet_address: wallet.arc_wallet_address,
    access_policy: accessPolicy,
    price_per_read: Number(pricePerRead),
    human_price: humanPrice,
    created_at: nowIso(),
    source_url: sourceUrl,
  };

  await sqlRun(
    `INSERT INTO posts (id, author_id, title, body_full, body_preview, wallet_address, access_policy, price_per_read, human_price, created_at, source_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      post.id,
      post.author_id,
      post.title,
      post.body_full,
      post.body_preview,
      post.wallet_address,
      post.access_policy,
      post.price_per_read,
      post.human_price,
      post.created_at,
      post.source_url,
    ]
  );

  return post;
}

export async function upsertApiKey({ id, name, apiKey, balanceUsdc }) {
  await sqlRun(
    `INSERT INTO api_keys (id, name, api_key, balance_usdc)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(api_key) DO UPDATE SET name = excluded.name, balance_usdc = excluded.balance_usdc`
    ,
    [id, name, apiKey, balanceUsdc]
  );
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "and", "or", "of", "to",
  "for", "in", "on", "at", "by", "with", "from", "as", "it", "its", "this",
  "that", "these", "those", "how", "why", "what", "when", "where", "do",
  "does", "did", "i", "you", "we", "they", "make", "makes", "made",
]);

function tokenize(query) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export async function searchPosts(query = "") {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return sqlAll(
      `SELECT id, author_id, title, body_preview, price_per_read, access_policy, created_at
       FROM posts
       ORDER BY created_at DESC
       LIMIT 100`
    );
  }

  const clauses = tokens.map(() => "(title LIKE ? OR body_preview LIKE ?)");
  const params = tokens.flatMap((t) => [`%${t}%`, `%${t}%`]);
  return sqlAll(
    `SELECT id, author_id, title, body_preview, price_per_read, access_policy, created_at
     FROM posts
     WHERE ${clauses.join(" OR ")}
     ORDER BY created_at DESC
     LIMIT 100`,
    params
  );
}

export async function getPost(postId) {
  return sqlGet("SELECT * FROM posts WHERE id = ?", [postId]);
}

export async function deleteImportedPosts() {
  const imported = await sqlAll(
    `SELECT p.id
     FROM posts p
     WHERE p.author_id = 'author_imported'
       AND NOT EXISTS (
         SELECT 1 FROM transactions t WHERE t.post_id = p.id
       )`
  );
  for (const post of imported) {
    await sqlRun("DELETE FROM posts WHERE id = ?", [post.id]);
  }
  return imported.length;
}

export async function getApiKey(apiKey) {
  return sqlGet("SELECT * FROM api_keys WHERE api_key = ?", [apiKey]);
}

export async function getTransaction(txId) {
  return sqlGet("SELECT * FROM transactions WHERE id = ?", [txId]);
}

export function checkCanRead({ post, apiKey, readerType }) {
  if (!post) return { ok: false, code: "NOT_FOUND" };
  if (post.access_policy === "open") return { ok: true, requiresPayment: false };
  if (readerType === "human" && post.access_policy === "ai_metered") {
    return { ok: true, requiresPayment: false, shouldCharge: false };
  }
  if (!apiKey) return { ok: true, requiresPayment: true };
  return { ok: true, requiresPayment: false, shouldCharge: true };
}

export async function chargeRead({ post, apiKey, agentIdentifier }) {
  const keyRow = await getApiKey(apiKey);
  if (!keyRow) {
    return { ok: false, code: "INVALID_API_KEY" };
  }
  if (keyRow.balance_usdc < post.price_per_read) {
    return { ok: false, code: "INSUFFICIENT_FUNDS" };
  }

  const settlement = isCircleSettlementLive()
    ? await settleReadWithCircle({
        post,
        amountUsdc: post.price_per_read,
      })
    : {
        ok: true,
        provider: "local",
        providerTxId: null,
        settlementStatus: "confirmed",
        arcTxHash: txHash(),
        sourceWalletId: null,
        destinationWalletId: null,
        rawProviderResponse: null,
      };

  if (!settlement.ok) {
    return settlement;
  }

  const tx = {
    id: `tx_${crypto.randomUUID()}`,
    post_id: post.id,
    agent_identifier: agentIdentifier || keyRow.name || "unknown-agent",
    amount_usdc: post.price_per_read,
    arc_tx_hash: settlement.arcTxHash ?? "",
    settled_at: nowIso(),
    provider: settlement.provider,
    provider_tx_id: settlement.providerTxId,
    settlement_status: settlement.settlementStatus,
    source_wallet_id: settlement.sourceWalletId,
    destination_wallet_id: settlement.destinationWalletId,
    raw_provider_response: settlement.rawProviderResponse,
  };

  await sqlRun("UPDATE api_keys SET balance_usdc = balance_usdc - ? WHERE api_key = ?", [
    post.price_per_read,
    apiKey,
  ]);
  await sqlRun(
    "UPDATE writer_wallets SET balance_usdc = balance_usdc + ?, total_earned_ai = total_earned_ai + ? WHERE author_id = ?",
    [post.price_per_read, post.price_per_read, post.author_id]
  );
  await sqlRun(
    `INSERT INTO transactions (
       id, post_id, agent_identifier, amount_usdc, arc_tx_hash, settled_at,
       provider, provider_tx_id, settlement_status, source_wallet_id,
       destination_wallet_id, raw_provider_response
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tx.id,
      tx.post_id,
      tx.agent_identifier,
      tx.amount_usdc,
      tx.arc_tx_hash,
      tx.settled_at,
      tx.provider,
      tx.provider_tx_id,
      tx.settlement_status,
      tx.source_wallet_id,
      tx.destination_wallet_id,
      tx.raw_provider_response,
    ]
  );

  return { ok: true, tx };
}

export async function recentTransactions(limit = 20) {
  return sqlAll(
    `SELECT t.*, p.title
     FROM transactions t
     JOIN posts p ON p.id = t.post_id
     ORDER BY t.settled_at DESC
     LIMIT ?`,
    [limit]
  );
}

export async function pendingCircleTransactions(limit = 20) {
  return sqlAll(
    `SELECT *
     FROM transactions
     WHERE provider = 'circle-w3s'
       AND provider_tx_id IS NOT NULL
       AND settlement_status NOT IN ('confirmed', 'complete', 'failed')
     ORDER BY settled_at ASC
     LIMIT ?`,
    [limit]
  );
}

export async function updateTransactionSettlement(txId, patch) {
  await sqlRun(
    `UPDATE transactions
     SET arc_tx_hash = COALESCE(?, arc_tx_hash),
         settlement_status = COALESCE(?, settlement_status),
         raw_provider_response = COALESCE(?, raw_provider_response)
     WHERE id = ?`
    ,
    [
      patch.arc_tx_hash ?? null,
      patch.settlement_status ?? null,
      patch.raw_provider_response ?? null,
      txId,
    ]
  );
  return getTransaction(txId);
}

export async function dashboardTotals() {
  const totalAi = (await sqlGet("SELECT COALESCE(SUM(amount_usdc), 0) AS total FROM transactions"))?.total ?? 0;
  const txCount = (await sqlGet("SELECT COUNT(*) AS c FROM transactions"))?.c ?? 0;
  const topReaders = await sqlAll(
    `SELECT agent_identifier, COUNT(*) AS reads, ROUND(SUM(amount_usdc), 6) AS spend
     FROM transactions
     GROUP BY agent_identifier
     ORDER BY spend DESC
     LIMIT 10`
  );

  const postSettings = await sqlAll(
    `SELECT id, author_id, title, body_preview, access_policy, price_per_read, human_price, created_at
     FROM posts
     ORDER BY created_at DESC`
  );

  return {
    month_human: 24.8,
    month_ai: Number(totalAi.toFixed(6)),
    transaction_count: txCount,
    top_readers: topReaders,
    post_settings: postSettings,
  };
}

export async function updatePostSettings(postId, patch) {
  const post = await getPost(postId);
  if (!post) return null;
  const accessPolicy = patch.access_policy ?? post.access_policy;
  const pricePerRead = Number(patch.price_per_read ?? post.price_per_read);
  const humanPrice = patch.human_price ?? post.human_price;

  await sqlRun(
    `UPDATE posts
     SET access_policy = ?, price_per_read = ?, human_price = ?
     WHERE id = ?`
    ,
    [accessPolicy, pricePerRead, humanPrice, postId]
  );

  return getPost(postId);
}
