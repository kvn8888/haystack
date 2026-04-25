import crypto from "node:crypto";
import { db, nowIso } from "./db.js";
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

export function createWriterWallet(authorId) {
  const existing = db
    .prepare("SELECT * FROM writer_wallets WHERE author_id = ?")
    .get(authorId);
  if (existing) return existing;

  const wallet = {
    author_id: authorId,
    arc_wallet_address: walletAddress(),
    circle_wallet_id: `cw_${crypto.randomUUID().replaceAll("-", "")}`,
    balance_usdc: 0,
    total_earned_human: 0,
    total_earned_ai: 0,
  };

  db.prepare(
    `INSERT INTO writer_wallets (author_id, arc_wallet_address, circle_wallet_id, balance_usdc, total_earned_human, total_earned_ai)
     VALUES (@author_id, @arc_wallet_address, @circle_wallet_id, @balance_usdc, @total_earned_human, @total_earned_ai)`
  ).run(wallet);

  return wallet;
}

export function createPost({
  authorId,
  title,
  bodyFull,
  accessPolicy = "ai_metered",
  pricePerRead = 0.001,
  humanPrice = null,
  sourceUrl = null,
}) {
  const wallet = createWriterWallet(authorId);
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

  db.prepare(
    `INSERT INTO posts (id, author_id, title, body_full, body_preview, wallet_address, access_policy, price_per_read, human_price, created_at, source_url)
     VALUES (@id, @author_id, @title, @body_full, @body_preview, @wallet_address, @access_policy, @price_per_read, @human_price, @created_at, @source_url)`
  ).run(post);

  return post;
}

export function upsertApiKey({ id, name, apiKey, balanceUsdc }) {
  db.prepare(
    `INSERT INTO api_keys (id, name, api_key, balance_usdc)
     VALUES (@id, @name, @api_key, @balance_usdc)
     ON CONFLICT(api_key) DO UPDATE SET name = excluded.name, balance_usdc = excluded.balance_usdc`
  ).run({
    id,
    name,
    api_key: apiKey,
    balance_usdc: balanceUsdc,
  });
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

export function searchPosts(query = "") {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return db
      .prepare(
        `SELECT id, author_id, title, body_preview, price_per_read, access_policy, created_at
         FROM posts
         ORDER BY created_at DESC
         LIMIT 25`
      )
      .all();
  }

  const clauses = tokens.map(() => "(title LIKE ? OR body_preview LIKE ?)");
  const params = tokens.flatMap((t) => [`%${t}%`, `%${t}%`]);
  return db
    .prepare(
      `SELECT id, author_id, title, body_preview, price_per_read, access_policy, created_at
       FROM posts
       WHERE ${clauses.join(" OR ")}
       ORDER BY created_at DESC
       LIMIT 25`
    )
    .all(...params);
}

export function getPost(postId) {
  return db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
}

export function getApiKey(apiKey) {
  return db.prepare("SELECT * FROM api_keys WHERE api_key = ?").get(apiKey);
}

export function checkCanRead({ post, apiKey }) {
  if (!post) return { ok: false, code: "NOT_FOUND" };
  if (post.access_policy === "open") return { ok: true, requiresPayment: false };
  if (!apiKey) return { ok: true, requiresPayment: true };
  return { ok: true, requiresPayment: false };
}

export async function chargeRead({ post, apiKey, agentIdentifier }) {
  const keyRow = getApiKey(apiKey);
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

  const update = db.transaction(() => {
    db.prepare("UPDATE api_keys SET balance_usdc = balance_usdc - ? WHERE api_key = ?").run(
      post.price_per_read,
      apiKey
    );
    db.prepare(
      "UPDATE writer_wallets SET balance_usdc = balance_usdc + ?, total_earned_ai = total_earned_ai + ? WHERE author_id = ?"
    ).run(post.price_per_read, post.price_per_read, post.author_id);
    db.prepare(
      `INSERT INTO transactions (
         id, post_id, agent_identifier, amount_usdc, arc_tx_hash, settled_at,
         provider, provider_tx_id, settlement_status, source_wallet_id,
         destination_wallet_id, raw_provider_response
       )
       VALUES (
         @id, @post_id, @agent_identifier, @amount_usdc, @arc_tx_hash, @settled_at,
         @provider, @provider_tx_id, @settlement_status, @source_wallet_id,
         @destination_wallet_id, @raw_provider_response
       )`
    ).run(tx);
  });
  update();

  return { ok: true, tx };
}

export function recentTransactions(limit = 20) {
  return db
    .prepare(
      `SELECT t.*, p.title
       FROM transactions t
       JOIN posts p ON p.id = t.post_id
       ORDER BY t.settled_at DESC
       LIMIT ?`
    )
    .all(limit);
}

export function dashboardTotals() {
  const totalAi = db.prepare("SELECT COALESCE(SUM(amount_usdc), 0) AS total FROM transactions").get()
    .total;
  const topReaders = db
    .prepare(
      `SELECT agent_identifier, COUNT(*) AS reads, ROUND(SUM(amount_usdc), 6) AS spend
       FROM transactions
       GROUP BY agent_identifier
       ORDER BY spend DESC
       LIMIT 10`
    )
    .all();

  const postSettings = db
    .prepare(
      `SELECT id, title, access_policy, price_per_read, human_price
       FROM posts
       ORDER BY created_at DESC`
    )
    .all();

  return {
    month_human: 24.8,
    month_ai: Number(totalAi.toFixed(6)),
    top_readers: topReaders,
    post_settings: postSettings,
  };
}

export function updatePostSettings(postId, patch) {
  const post = getPost(postId);
  if (!post) return null;
  const accessPolicy = patch.access_policy ?? post.access_policy;
  const pricePerRead = Number(patch.price_per_read ?? post.price_per_read);
  const humanPrice = patch.human_price ?? post.human_price;

  db.prepare(
    `UPDATE posts
     SET access_policy = ?, price_per_read = ?, human_price = ?
     WHERE id = ?`
  ).run(accessPolicy, pricePerRead, humanPrice, postId);

  return getPost(postId);
}
