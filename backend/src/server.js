import express from "express";
import cors from "cors";
import { config, integrations, explorerUrlFor, logStartupBanner } from "./config.js";
import { circleSettlementStatus, reconcileCircleSettlements } from "./circle.js";
import { createPaymentReceipt, verifyPaymentReceipt } from "./x402.js";
import {
  chargeRead,
  checkCanRead,
  createPost,
  dashboardTotals,
  deleteImportedPosts,
  getApiKey,
  getPost,
  getTransaction,
  recentTransactions,
  searchPosts,
  updatePostSettings,
} from "./store.js";
import { isGeminiLive, runGeminiAgent } from "./agent.js";
import { fetchFeedPosts } from "./rss.js";
import "./db.js";
import "./seed.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const sseClients = new Set();

function decorateTx(tx) {
  if (!tx) return tx;
  return { ...tx, arc_explorer_url: explorerUrlFor(tx.arc_tx_hash) };
}

function publishSettlement(entry) {
  const enriched = {
    ...entry,
    tx: decorateTx(entry.tx),
  };
  const payload = `data: ${JSON.stringify(enriched)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "haystack-backend" });
});

app.get("/api/config", (_req, res) => {
  res.json({
    public_base_url: config.publicBaseUrl,
    default_author_id: config.defaultAuthorId,
    integrations,
  });
});

app.get("/api/settlement/wallets", async (_req, res) => {
  try {
    return res.json(await circleSettlementStatus(config.defaultAuthorId));
  } catch (err) {
    return res.status(502).json({
      error: "Circle wallet status failed.",
      detail: err.message,
    });
  }
});

app.get("/api/events/settlements", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.add(res);

  const latest = recentTransactions(60);
  latest.reverse().forEach((tx) => {
    res.write(
      `data: ${JSON.stringify({ type: "seed", tx: decorateTx(tx) })}\n\n`
    );
  });

  req.on("close", () => {
    sseClients.delete(res);
  });
});

app.get("/api/index/search", (req, res) => {
  const query = String(req.query.q ?? "");
  const posts = searchPosts(query);
  res.json({ query, posts });
});

app.get("/api/wallet/balance", (req, res) => {
  const auth = req.header("authorization");
  const apiKey = auth?.replace("Bearer ", "");
  if (!apiKey) {
    return res.status(400).json({ error: "Missing Authorization header." });
  }

  const key = getApiKey(apiKey);
  if (!key) {
    return res.status(404).json({ error: "Unknown API key." });
  }

  return res.json({
    name: key.name,
    balance_usdc: key.balance_usdc,
  });
});

app.get("/api/posts/:postId", async (req, res) => {
  const post = getPost(req.params.postId);
  if (!post) {
    return res.status(404).json({ error: "Post not found." });
  }

  const xPayment = req.header("x-payment");
  if (xPayment) {
    const verified = verifyPaymentReceipt(xPayment, { postId: post.id });
    const tx = verified.ok ? getTransaction(verified.receipt.tx_id) : null;
    if (verified.ok && tx?.post_id === post.id && tx.settlement_status !== "failed") {
      return res.json({
        id: post.id,
        author_id: post.author_id,
        created_at: post.created_at,
        title: post.title,
        access_policy: post.access_policy,
        price_per_read: post.price_per_read,
        body_full: post.body_full,
        body_preview: post.body_preview,
        tx: decorateTx(tx),
      });
    }
    res.setHeader("X-Payment-Required", "true");
    return res.status(402).json({
      error: "Invalid or unrecognized X-Payment receipt.",
      code: verified.code ?? "PAYMENT_NOT_FOUND",
      body_preview: post.body_preview,
    });
  }

  const auth = req.header("authorization");
  const apiKey = auth?.replace("Bearer ", "");
  const agent = req.header("x-agent-name") ?? "unknown-agent";
  const readerType = req.header("x-reader-type") === "human" ? "human" : "agent";
  const access = checkCanRead({ post, apiKey, readerType });

  if (!access.ok && access.code === "NOT_FOUND") {
    return res.status(404).json({ error: "Post not found." });
  }

  if (access.requiresPayment) {
    res.setHeader("X-Payment-Required", "true");
    res.setHeader("X-Preview-Available", "true");
    res.setHeader("X-Price", `${post.price_per_read} USDC`);
    res.setHeader("X-Payment-Endpoint", `/api/pay/${post.id}`);
    res.setHeader("X-Wallet-Register", "/api/dev/register");
    return res.status(402).json({
      id: post.id,
      author_id: post.author_id,
      created_at: post.created_at,
      mode: post.access_policy,
      access_policy: post.access_policy,
      price_per_read: post.price_per_read,
      title: post.title,
      body_preview: post.body_preview,
      message: "Payment required for full post.",
    });
  }

  const payment = access.shouldCharge === false || post.access_policy === "open" ? { ok: true, tx: null } : await chargeRead({
    post,
    apiKey,
    agentIdentifier: agent,
  });

  if (!payment.ok) {
    if (payment.code === "INVALID_API_KEY") {
      return res.status(401).json({ error: "Invalid API key." });
    }
    if (payment.code === "INSUFFICIENT_FUNDS") {
      return res.status(402).json({ error: "Insufficient wallet balance." });
    }
    if (payment.code === "CIRCLE_SETTLEMENT_FAILED") {
      return res.status(502).json({
        error: "Circle settlement failed.",
        detail: payment.detail,
      });
    }
  }

  if (payment.tx) {
    publishSettlement({
      type: "settlement",
      tx: payment.tx,
      post_title: post.title,
    });
  }

  return res.json({
    id: post.id,
    author_id: post.author_id,
    created_at: post.created_at,
    title: post.title,
    access_policy: post.access_policy,
    price_per_read: post.price_per_read,
    body_full: post.body_full,
    body_preview: post.body_preview,
    tx: decorateTx(payment.tx),
  });
});

app.post("/api/pay/:postId", async (req, res) => {
  const post = getPost(req.params.postId);
  if (!post) return res.status(404).json({ error: "Post not found." });
  if (post.access_policy === "open") {
    return res.json({ paid: true, message: "Post is open; no payment required." });
  }

  const auth = req.header("authorization");
  const apiKey = auth?.replace("Bearer ", "") || req.body?.api_key;
  if (!apiKey) {
    return res.status(401).json({
      error: "Missing API key for payment.",
      detail: "Pass Authorization: Bearer <key> or api_key in JSON body.",
    });
  }

  const payment = await chargeRead({
    post,
    apiKey,
    agentIdentifier: req.header("x-agent-name") ?? "x402-client",
  });

  if (!payment.ok) {
    if (payment.code === "INVALID_API_KEY") {
      return res.status(401).json({ error: "Invalid API key." });
    }
    if (payment.code === "INSUFFICIENT_FUNDS") {
      return res.status(402).json({ error: "Insufficient wallet balance." });
    }
    if (payment.code === "CIRCLE_SETTLEMENT_FAILED") {
      return res.status(502).json({
        error: "Circle settlement failed.",
        detail: payment.detail,
      });
    }
    return res.status(500).json({ error: "Payment failed.", code: payment.code });
  }

  const xPayment = createPaymentReceipt(payment.tx);
  publishSettlement({
    type: "settlement",
    tx: payment.tx,
    post_title: post.title,
  });
  res.setHeader("X-Payment", xPayment);
  return res.json({
    paid: true,
    post_id: post.id,
    retry: `/api/posts/${post.id}`,
    x_payment: xPayment,
    tx: decorateTx(payment.tx),
  });
});

app.post("/api/posts", (req, res) => {
  const {
    title,
    body_full,
    access_policy = "ai_metered",
    price_per_read = 0.001,
    human_price = null,
    author_id,
  } = req.body ?? {};

  if (!title?.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (!body_full?.trim()) {
    return res.status(400).json({ error: "body_full is required" });
  }
  const allowed = ["open", "ai_metered", "gated", "premium"];
  if (!allowed.includes(access_policy)) {
    return res.status(400).json({
      error: `access_policy must be one of: ${allowed.join(", ")}`,
    });
  }
  const price = Number(price_per_read);
  if (!Number.isFinite(price) || price < 0 || price > 1) {
    return res.status(400).json({ error: "price_per_read must be 0–1 USDC" });
  }

  const post = createPost({
    authorId: author_id || config.defaultAuthorId,
    title: title.trim(),
    bodyFull: body_full.trim(),
    accessPolicy: access_policy,
    pricePerRead: price,
    humanPrice: human_price === null || human_price === "" ? null : Number(human_price),
  });

  return res.status(201).json({ post });
});

app.post("/api/agent/query", async (req, res) => {
  const {
    query,
    budget_usdc = config.gemini.defaultBudgetUsdc,
    api_key = "hs_demo_gemini",
  } = req.body ?? {};
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  if (isGeminiLive()) {
    try {
      const result = await runGeminiAgent({
        query: String(query),
        budgetUsdc: Number(budget_usdc),
        apiKey: String(api_key),
        publish: publishSettlement,
      });
      return res.json({ ...result, mode: "gemini-live" });
    } catch (err) {
      console.error("Gemini agent error:", err);
      return res.status(502).json({
        error: "Gemini call failed.",
        detail: err.message,
        mode: "gemini-live",
      });
    }
  }

  const candidates = searchPosts(String(query));
  const chosen = [];
  let spent = 0;
  for (const post of candidates) {
    if (spent + post.price_per_read > budget_usdc) continue;
    chosen.push(post);
    spent += post.price_per_read;
    if (chosen.length >= 2) break;
  }

  const reads = [];
  for (const post of chosen) {
    const full = getPost(post.id);
    const payment = await chargeRead({
      post: full,
      apiKey: api_key,
      agentIdentifier: "Gemini",
    });
    if (payment.ok) {
      publishSettlement({ type: "settlement", tx: payment.tx, post_title: full.title });
      reads.push({
        post_id: full.id,
        title: full.title,
        amount_usdc: full.price_per_read,
        citation: `/post/${full.id}`,
        excerpt: `${full.body_full.slice(0, 180)}...`,
        arc_tx_hash: payment.tx.arc_tx_hash,
        provider_tx_id: payment.tx.provider_tx_id,
        settlement_status: payment.tx.settlement_status,
      });
    }
  }

  const synthesis = reads.length
    ? `Based on ${reads.length} HayStack sources, the best framing is that AI retrieval should treat knowledge as metered infrastructure. Writers preserve discovery by keeping previews open while full depth remains priced via x402.`
    : "No sources were purchased within budget. Increase budget or broaden query.";

  return res.json({
    query,
    budget_usdc,
    spent_usdc: Number(reads.reduce((acc, r) => acc + r.amount_usdc, 0).toFixed(6)),
    reads,
    answer: synthesis,
    mode: "mock",
  });
});

app.get("/api/dashboard", (_req, res) => {
  const totals = dashboardTotals();
  const live = recentTransactions(100).map(decorateTx);
  res.json({ totals, live });
});

app.post("/api/settlement/reconcile", async (req, res) => {
  const limit = Number(req.body?.limit ?? 25);
  return res.json(await reconcileCircleSettlements({ limit }));
});

app.patch("/api/posts/:postId/settings", (req, res) => {
  const updated = updatePostSettings(req.params.postId, req.body ?? {});
  if (!updated) return res.status(404).json({ error: "Post not found." });
  return res.json({ post: updated });
});

app.delete("/api/migration/imports", (_req, res) => {
  const deleted_count = deleteImportedPosts();
  return res.json({ deleted_count });
});

app.post("/api/migration/import-rss", async (req, res) => {
  const { rss_url, reset_previous = true, limit = 100 } = req.body ?? {};
  if (!rss_url) {
    return res.status(400).json({ error: "rss_url is required" });
  }

  try {
    const deleted_count = reset_previous ? deleteImportedPosts() : 0;
    const feedPosts = await fetchFeedPosts(rss_url, {
      limit: Math.min(Math.max(Number(limit) || 100, 1), 100),
    });
    const imported = feedPosts.map((post, idx) =>
      createPost({
        authorId: "author_imported",
        title: post.title,
        bodyFull: post.bodyFull,
        accessPolicy: "ai_metered",
        pricePerRead: 0.001 + idx * 0.0005,
        sourceUrl: post.sourceUrl ?? rss_url,
      })
    );

    return res.status(201).json({
      deleted_count,
      imported_count: imported.length,
      longform_count: imported.filter((p) => p.body_full.length >= 2000).length,
      posts: imported,
    });
  } catch (err) {
    return res.status(502).json({
      error: "RSS import failed.",
      detail: err.message,
    });
  }
});

app.post("/api/dev/register", (_req, res) => {
  res.json({
    message: "Use seeded key hs_demo_gemini for demo.",
    docs: "In production this would provision a Circle wallet + API key.",
  });
});

app.listen(config.port, () => {
  console.log(`HayStack backend listening on http://localhost:${config.port}`);
  logStartupBanner();
});

const reconcileTimer = setInterval(() => {
  reconcileCircleSettlements({ limit: 10 }).catch((err) => {
    console.warn("Circle reconciliation failed:", err.message);
  });
}, 15_000);
reconcileTimer.unref?.();
