# HayStack Project Context

## Current Product Shape

HayStack is a hackathon MVP for a publishing platform where AI readers pay writers per article read. It has two product surfaces:

- HayStack Publisher: authors write or import articles, choose access policies, and manage per-post AI read pricing.
- HayStack Agent: a Gemini-powered agent searches previews for free, chooses sources within a budget, pays for full reads, and returns cited answers.

The core promise is not "a paywall" but "a payment standard": previews remain public and indexable, while full AI reads use x402-shaped payment behavior.

## Repository Layout

- `frontend/`: React + Vite UI.
- `backend/`: Express ESM API, SQLite storage, SSE settlement stream, Gemini agent integration.
- `docs/env-and-smoke-tests.md`: operational env guide and endpoint smoke tests.
- `docs/sponsor-api-validation.md`: sponsor validation notes. Treat as a status document, not a substitute for reading code.
- `.cursor/skills/`: sponsor-specific skills previously created for Circle, Arc, and Gemini.
- `.claude/skills/haystack-project/`: this project handoff skill.

## Backend Map

- `backend/src/server.js`: Express routes, x402 response headers, SSE settlement publishing, dashboard payloads, migration stub, compose/settings endpoints.
- `backend/src/store.js`: SQLite access layer, post creation, keyword search, API key balances, writer wallet accounting, dashboard totals, and `chargeRead()`.
- `backend/src/circle.js`: Circle Developer-Controlled Wallets (W3S) integration for `ARC-TESTNET` wallet provisioning, treasury/author wallet lookup, and real transfer creation.
- `backend/src/x402.js`: signed `X-Payment` receipt creation/verification for pay-then-retry content access.
- `backend/src/rss.js`: RSS/Atom feed fetch and parsing for real migration imports.
- `backend/src/agent.js`: real Gemini tool-calling loop when `GEMINI_API_KEY` is set. Tools are `search_haystack_index`, `check_wallet_balance`, and `read_full_post`.
- `backend/src/config.js`: env parsing, integration status for `/api/config`, Arc explorer URL decoration, startup banner.
- `backend/src/db.js`: SQLite connection/schema.
- `backend/src/seed.js`: idempotent seed data using a versioned `meta` table.

Important routes:

- `GET /api/config`: integration live/mock status used by frontend header pills.
- `GET /api/settlement/wallets`: public wallet/funding status for Circle W3S Arc testnet settlement.
- `GET /api/index/search?q=...`: free preview search.
- `GET /api/wallet/balance`: API key balance.
- `GET /api/posts/:postId`: unfunded reads return `402` + preview/payment headers; funded reads return full body + `tx`.
- `POST /api/pay/:postId`: payment endpoint that creates a Circle settlement and returns a signed `X-Payment` receipt for retry.
- `POST /api/posts`: author composer endpoint.
- `PATCH /api/posts/:postId/settings`: dashboard inline paywall edit endpoint.
- `POST /api/agent/query`: Gemini live loop when configured, local mock otherwise.
- `GET /api/events/settlements`: SSE stream for live ledger.
- `GET /api/dashboard`: writer metrics, recent transactions, post settings.
- `POST /api/settlement/reconcile`: poll Circle provider ids and hydrate settlement status / Arc tx hash.
- `DELETE /api/migration/imports`: clear imported posts for repeatable demos.
- `POST /api/migration/import-rss`: parses real RSS/Atom feeds and creates AI-Metered posts. Demo default is Daring Fireball (`https://daringfireball.net/feeds/main`) with `limit: 100` and `reset_previous: true`.
- `POST /api/dev/register`: creates a demo developer API key.

## Frontend Map

- `frontend/src/App.tsx`: top-level state, view routing, config fetch, dashboard/index refresh, settlement SSE subscription.
- `frontend/src/api.ts`: frontend API wrappers.
- `frontend/src/types.ts`: shared frontend types.
- `frontend/src/index.css`: warm yellow/orange "Honey & Settlement" design system and responsive layout.
- `frontend/src/components/Header.tsx`: nav, live meter, integration pills.
- `frontend/src/components/HomeView.tsx`: discovery and recent posts.
- `frontend/src/components/ArticleView.tsx`: Substack-like article/paywall view and "Read as agent" action.
- `frontend/src/components/ComposeView.tsx`: author writing UI with title/body editor, live preview, policy radios, AI price slider, optional human price.
- `frontend/src/components/DashboardView.tsx`: writer earnings, live feed, inline paywall management with debounced autosave.
- `frontend/src/components/AgentView.tsx`: agent playground.
- `frontend/src/components/MigrationView.tsx`: RSS import flow with wallet-provisioning visual.
- `frontend/src/components/LiveLedger.tsx`: live AI read feed.
- `frontend/src/components/AccessBadge.tsx`: access policy display.

## Data Model

SQLite tables include posts, transactions, writer wallets, API keys, and meta seed state. The important application-level models are:

- Post: id, author, title, full body, preview body, wallet address, access policy, AI read price, human price, created time, optional source URL.
- Transaction: id, post id, agent identifier, amount USDC, Arc tx hash/string, settled time.
- Writer wallet: author id, Arc wallet address, Circle wallet id, balances/totals.
- API key: demo developer key with local balance.

Access policies are `open`, `ai_metered`, `gated`, and `premium`.

## Integration Truth

Gemini can be live. When `GEMINI_API_KEY` is set, `POST /api/agent/query` uses `@google/genai` and should return `mode: "gemini-live"`. Model slugs come from `GEMINI_FLASH_MODEL` and `GEMINI_PRO_MODEL`; do not overwrite user-provided slugs.

Circle can run live through Developer-Controlled Wallets (W3S). When `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, and `ARC_USDC_CONTRACT` are present, `chargeRead()` provisions/uses `ARC-TESTNET` wallets and creates a Circle transfer from the agent treasury wallet to the author's wallet. It stores `provider: circle-w3s`, `provider_tx_id`, `settlement_status`, wallet ids, and any returned Arc `txHash`. If the treasury wallet is unfunded, Circle returns an insufficient-asset error and no fake transaction is created. The x402-shaped path is `POST /api/pay/:postId` followed by `GET /api/posts/:postId` with `X-Payment`.

Arc env config uses `ARC-TESTNET`, chain id `5042002`, and USDC contract `0x3600000000000000000000000000000000000000`. The app decorates returned `txHash` values with `arc_explorer_url` when `ARC_EXPLORER_BASE_URL` is present. A periodic reconciliation loop polls Circle and updates pending rows with status/hash changes.

The user does not want fake demo payment events. In live Circle mode, preserve fail-closed behavior: no fallback fake tx if Circle transfer fails. Local mock behavior is only acceptable when Circle is not configured.

## Env And Secrets

The backend reads `backend/.env` via dotenv. Root `.env.example` and `backend/.env.example` are examples and must not contain secrets.

Never print secret values. When diagnosing env, report only present/empty, lengths, product scope, base URLs, chain IDs, or model slugs.

Key env vars:

- `X402_RECEIPT_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_FLASH_MODEL`
- `GEMINI_PRO_MODEL`
- `AGENT_DEFAULT_BUDGET_USDC`
- `CIRCLE_API_KEY`
- `CIRCLE_ENTITY_SECRET`
- `CIRCLE_ENV`
- `CIRCLE_GATEWAY_BASE_URL`
- `HAYSTACK_SETTLEMENT_CURRENCY`
- `ARC_RPC_URL`
- `ARC_CHAIN_ID`
- `ARC_USDC_CONTRACT`
- `ARC_EXPLORER_BASE_URL`
- `SETTLEMENT_CONFIRMATIONS_REQUIRED`
- `TAVILY_API_KEY`

## Smoke Tests

Prefer the detailed guide in `docs/env-and-smoke-tests.md`. Useful quick checks:

```bash
curl -s http://localhost:8787/api/config | jq
```

```bash
curl -s http://localhost:8787/api/settlement/wallets | jq
```

Use the `.treasury.address` value with https://faucet.circle.com/ on Arc Testnet before expecting paid reads to succeed.

```bash
PAYMENT=$(curl -s -X POST "http://localhost:8787/api/pay/$POST_ID" \
  -H "Authorization: Bearer hs_demo_gemini" | jq -r '.x_payment')
curl -s "http://localhost:8787/api/posts/$POST_ID" -H "X-Payment: $PAYMENT" | jq '{title, tx}'
```

```bash
curl -s -X POST http://localhost:8787/api/agent/query \
  -H "Content-Type: application/json" \
  -d '{"query":"How does Arc make HTTP 402 viable?","budget_usdc":0.01}' \
  | jq '{mode, spent_usdc, reads: [.reads[].title]}'
```

```bash
POST_ID=$(curl -s "http://localhost:8787/api/index/search?q=" | jq -r '.posts[0].id')
curl -s -i "http://localhost:8787/api/posts/$POST_ID" | head -n 12
curl -s -H "Authorization: Bearer hs_demo_gemini" \
  -H "X-Agent-Name: Smoke-Test" \
  "http://localhost:8787/api/posts/$POST_ID" \
  | jq '{title, access_policy, price_per_read, tx}'
```

## Project Guardrails

Preserve user changes in a dirty tree. This repo has had active manual env edits and live dev servers.

Do not modify `backend/.env` unless the user is explicitly asking for env/runtime fixes. If you do, avoid overwriting model slugs or secrets.

For payment work, use provider sandbox/testnet rails and store real provider response IDs. In Circle live mode, never silently fall back to generated tx hashes.

When changing integrations, update `docs/env-and-smoke-tests.md`, `docs/sponsor-api-validation.md`, and this file if the truth changes.

After frontend changes, run `npm run build --workspace frontend` when practical and use browser verification for user-facing flows.

After backend changes, run targeted curl smoke tests for the touched routes and watch the backend startup banner for integration status.
