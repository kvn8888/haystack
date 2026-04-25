import crypto from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config, integrations } from "./config.js";
import { db } from "./db.js";

const WALLET_SET_NAME = "HayStack Demo Wallet Set";
const AGENT_TREASURY_REF = "haystack-agent-treasury";

let client;

export function isCircleSettlementLive() {
  return (
    integrations.circle.live &&
    config.circle.blockchain === "ARC-TESTNET" &&
    Boolean(config.arc.usdcContract)
  );
}

function getClient() {
  if (!isCircleSettlementLive()) return null;
  if (!client) {
    client = initiateDeveloperControlledWalletsClient({
      apiKey: config.circle.apiKey,
      entitySecret: config.circle.entitySecret,
      baseUrl: config.circle.baseUrl,
      userAgent: "haystack-mvp/0.1",
    });
  }
  return client;
}

function getMeta(key) {
  return db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
}

function setMeta(key, value) {
  db.prepare(
    `INSERT INTO meta (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function walletRefForAuthor(authorId) {
  return `haystack-author-${authorId}`;
}

function displayNameForAuthor(authorId) {
  return `HayStack Author ${authorId.replace(/^author_/, "")}`;
}

function safeCircleError(err) {
  const data = err?.response?.data ?? err?.data;
  return {
    message: err?.message ?? "Circle request failed",
    status: err?.response?.status,
    code: data?.code,
    errors: data?.errors,
  };
}

function formatUsdc(amount) {
  return Number(amount).toFixed(6).replace(/\.?0+$/, "");
}

async function ensureWalletSet(circle) {
  const cachedId = getMeta("circle_wallet_set_id");
  if (cachedId) {
    try {
      const existing = await circle.getWalletSet({ id: cachedId });
      if (existing.data?.walletSet?.id) return existing.data.walletSet;
    } catch {
      setMeta("circle_wallet_set_id", "");
    }
  }

  const listed = await circle.listWalletSets({ pageSize: 50 });
  const found = (listed.data?.walletSets ?? []).find((w) => w.name === WALLET_SET_NAME);
  if (found?.id) {
    setMeta("circle_wallet_set_id", found.id);
    return found;
  }

  const created = await circle.createWalletSet({
    name: WALLET_SET_NAME,
    idempotencyKey: crypto.randomUUID(),
  });
  const walletSet = created.data?.walletSet;
  if (!walletSet?.id) throw new Error("Circle did not return a wallet set id");
  setMeta("circle_wallet_set_id", walletSet.id);
  return walletSet;
}

async function ensureWallet({ refId, name }) {
  const circle = getClient();
  if (!circle) throw new Error("Circle W3S settlement is not configured");

  const existing = await circle.listWallets({
    blockchain: config.circle.blockchain,
    refId,
    pageSize: 10,
  });
  const wallet = existing.data?.wallets?.[0];
  if (wallet?.id && wallet?.address) return wallet;

  const walletSet = await ensureWalletSet(circle);
  const created = await circle.createWallets({
    walletSetId: walletSet.id,
    blockchains: [config.circle.blockchain],
    count: 1,
    metadata: [{ name, refId }],
    idempotencyKey: crypto.randomUUID(),
  });
  const createdWallet = created.data?.wallets?.[0];
  if (!createdWallet?.id || !createdWallet?.address) {
    throw new Error("Circle did not return a wallet id/address");
  }
  return createdWallet;
}

export async function ensureAgentTreasuryWallet() {
  return ensureWallet({
    refId: AGENT_TREASURY_REF,
    name: "HayStack Agent Treasury",
  });
}

export async function ensureAuthorCircleWallet(authorId) {
  const wallet = await ensureWallet({
    refId: walletRefForAuthor(authorId),
    name: displayNameForAuthor(authorId),
  });

  db.prepare(
    `UPDATE writer_wallets
     SET circle_wallet_id = ?, arc_wallet_address = ?
     WHERE author_id = ?`
  ).run(wallet.id, wallet.address, authorId);

  return wallet;
}

export async function settleReadWithCircle({ post, amountUsdc }) {
  const circle = getClient();
  if (!circle) return null;

  try {
    const source = await ensureAgentTreasuryWallet();
    const destination = await ensureAuthorCircleWallet(post.author_id);
    const response = await circle.createTransaction({
      walletId: source.id,
      destinationAddress: destination.address,
      tokenAddress: config.arc.usdcContract,
      blockchain: config.circle.blockchain,
      amount: [formatUsdc(amountUsdc)],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      refId: `haystack-read:${post.id}:${crypto.randomUUID()}`,
      idempotencyKey: crypto.randomUUID(),
    });

    const providerTx = response.data;
    let transaction = null;
    if (providerTx?.id) {
      try {
        transaction = (await circle.getTransaction({ id: providerTx.id })).data?.transaction ?? null;
      } catch {
        transaction = null;
      }
    }

    return {
      ok: true,
      provider: "circle-w3s",
      providerTxId: providerTx?.id ?? null,
      settlementStatus: String(transaction?.state ?? providerTx?.state ?? "pending").toLowerCase(),
      arcTxHash: transaction?.txHash ?? "",
      sourceWalletId: source.id,
      destinationWalletId: destination.id,
      sourceAddress: source.address,
      destinationAddress: destination.address,
      rawProviderResponse: JSON.stringify({ create: providerTx, transaction }),
    };
  } catch (err) {
    return {
      ok: false,
      code: "CIRCLE_SETTLEMENT_FAILED",
      detail: safeCircleError(err),
    };
  }
}

export async function reconcileCircleSettlements({ limit = 25 } = {}) {
  const circle = getClient();
  if (!circle) return { live: false, checked: 0, updated: 0, transactions: [] };

  const rows = db
    .prepare(
      `SELECT *
       FROM transactions
       WHERE provider = 'circle-w3s'
         AND provider_tx_id IS NOT NULL
         AND settlement_status NOT IN ('confirmed', 'complete', 'failed')
       ORDER BY settled_at ASC
       LIMIT ?`
    )
    .all(limit);
  const results = [];
  let updated = 0;

  for (const row of rows) {
    try {
      const response = await circle.getTransaction({ id: row.provider_tx_id });
      const providerTx = response.data?.transaction;
      const patch = {
        arc_tx_hash: providerTx?.txHash || null,
        settlement_status: providerTx?.state ? String(providerTx.state).toLowerCase() : null,
        raw_provider_response: JSON.stringify(providerTx),
      };
      db.prepare(
        `UPDATE transactions
         SET arc_tx_hash = COALESCE(?, arc_tx_hash),
             settlement_status = COALESCE(?, settlement_status),
             raw_provider_response = COALESCE(?, raw_provider_response)
         WHERE id = ?`
      ).run(patch.arc_tx_hash, patch.settlement_status, patch.raw_provider_response, row.id);
      const next = db.prepare("SELECT * FROM transactions WHERE id = ?").get(row.id);
      updated += 1;
      results.push({ id: row.id, provider_tx_id: row.provider_tx_id, status: next.settlement_status, arc_tx_hash: next.arc_tx_hash });
    } catch (err) {
      results.push({
        id: row.id,
        provider_tx_id: row.provider_tx_id,
        error: safeCircleError(err),
      });
    }
  }

  return { live: true, checked: rows.length, updated, transactions: results };
}

async function balancesForWallet(walletId) {
  const circle = getClient();
  if (!circle) return { token_balances: [] };
  try {
    const balances = await Promise.race([
      circle.getWalletTokenBalance({ id: walletId, includeAll: true }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Balance lookup timed out")), 5000)
      ),
    ]);
    return { token_balances: balances.data?.tokenBalances ?? [] };
  } catch (err) {
    return { token_balances: [], error: err.message };
  }
}

export async function circleSettlementStatus(authorId) {
  if (!isCircleSettlementLive()) {
    return {
      live: false,
      blockchain: config.circle.blockchain,
      message: "Circle W3S settlement is not configured.",
    };
  }

  const treasury = await ensureAgentTreasuryWallet();
  const author = await ensureAuthorCircleWallet(authorId);
  return {
    live: true,
    blockchain: config.circle.blockchain,
    currency: config.circle.currency,
    usdc_contract: config.arc.usdcContract,
    faucet_url: "https://faucet.circle.com/",
    treasury: {
      role: "agent-treasury",
      wallet_id: treasury.id,
      address: treasury.address,
      balance: await balancesForWallet(treasury.id),
    },
    author: {
      role: "default-author",
      author_id: authorId,
      wallet_id: author.id,
      address: author.address,
      balance: await balancesForWallet(author.id),
    },
  };
}
