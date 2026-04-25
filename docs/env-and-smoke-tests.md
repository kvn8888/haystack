# Environment & smoke tests

This document is the operational guide for running HayStack in "live" demo mode.
It covers every variable in `.env.example`, what each integration does when
configured, and a copy-pasteable smoke-test for each surface.

## TL;DR — minimum demo

For a real sponsor-API demo, use Gemini plus Circle W3S on Arc testnet:

```bash
cp backend/.env.example backend/.env
# then edit backend/.env to set:
GEMINI_API_KEY=your_key_from_aistudio
CIRCLE_API_KEY=your_circle_w3s_sandbox_key
CIRCLE_ENTITY_SECRET=your_circle_entity_secret
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
ARC_USDC_CONTRACT=0x3600000000000000000000000000000000000000
ARC_EXPLORER_BASE_URL=https://testnet.arcscan.app
```

Then fund the agent treasury wallet with Arc testnet USDC from
[https://faucet.circle.com/](https://faucet.circle.com/). Use `GET /api/settlement/wallets` to get the
treasury address. Do not use production USDC for the hackathon demo.

## What each provider does when live

### Gemini — `GEMINI_API_KEY`

When set, `POST /api/agent/query` switches from the local mock to a real
Gemini function-calling loop using `@google/genai`. The model is given three
tools — `search_haystack_index`, `check_wallet_balance`, `read_full_post` —
and a budget. Every `read_full_post` call really hits the local x402 endpoint,
charges the demo wallet, and emits a settlement on the SSE feed.

The response includes `mode: "gemini-live"` so you can verify which path ran:

```bash
curl -s -X POST http://localhost:8787/api/agent/query \
  -H "Content-Type: application/json" \
  -d '{"query":"How does Arc make HTTP 402 viable for AI retrieval?","budget_usdc":0.01}' \
  | jq '{mode, spent_usdc, reads: [.reads[].title], answer}'
```

Without `GEMINI_API_KEY`, the same call returns `mode: "mock"` with a fixed
synthesis line.

### Circle Nanopayments — `CIRCLE_API_KEY`

When `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, and `ARC_USDC_CONTRACT` are set,
paid reads call Circle Developer-Controlled Wallets (W3S). HayStack provisions
an `ARC-TESTNET` agent treasury wallet and an `ARC-TESTNET` author wallet, then
`chargeRead()` creates a Circle transfer from treasury to author for the post's
USDC price. The transaction row stores Circle's provider transaction id and any
returned Arc tx hash. If the treasury wallet is unfunded, the read fails with
Circle's insufficient-asset error and no fake transaction is created.

### Arc — `ARC_EXPLORER_BASE_URL`

`ARC_EXPLORER_BASE_URL` turns confirmed `arc_tx_hash` values into clickable
links. `ARC_USDC_CONTRACT` is required by the Circle transfer path because W3S
needs to know which token to send on `ARC-TESTNET`. `ARC_RPC_URL` and
`ARC_CHAIN_ID` are kept in env for future reconciliation and direct RPC checks.

## Variable reference


| Variable                            | Default                                          | What changes when set                                           |
| ----------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `PORT`                              | 8787                                             | Backend listens here                                            |
| `HAYSTACK_PUBLIC_BASE_URL`          | [http://localhost:8787](http://localhost:8787)   | Used in 402 payment endpoint headers if/when externalized       |
| `HAYSTACK_DEFAULT_AUTHOR_ID`        | author_ada                                       | Author the composer publishes as                                |
| `GEMINI_API_KEY`                    | —                                                | Switches `/api/agent/query` to a real Gemini tool-calling loop  |
| `GEMINI_FLASH_MODEL`                | gemini-flash-latest                              | Light tool calls (search, balance)                              |
| `GEMINI_PRO_MODEL`                  | gemini-pro-latest                                | Synthesis + selection                                           |
| `AGENT_DEFAULT_BUDGET_USDC`         | 0.01                                             | Default budget if request omits one                             |
| `CIRCLE_API_KEY`                    | —                                                | Enables Circle W3S sandbox calls when paired with entity secret |
| `CIRCLE_ENTITY_SECRET`              | —                                                | Required by Circle SDK for wallet creation and transfers        |
| `CIRCLE_ENV`                        | sandbox                                          | `sandbox` or `production`                                       |
| `CIRCLE_GATEWAY_BASE_URL`           | [https://api.circle.com](https://api.circle.com) | Override for staging endpoints                                  |
| `HAYSTACK_SETTLEMENT_CURRENCY`      | USDC                                             | Display currency for settlements                                |
| `CIRCLE_W3S_BLOCKCHAIN`             | ARC-TESTNET                                      | Circle W3S blockchain for treasury/author wallets               |
| `ARC_RPC_URL`                       | —                                                | RPC for future onchain reconciliation                           |
| `ARC_CHAIN_ID`                      | —                                                | EVM chain id for settlement records                             |
| `ARC_USDC_CONTRACT`                 | —                                                | Token contract for confirmation lookups                         |
| `ARC_EXPLORER_BASE_URL`             | —                                                | Enables clickable Arc explorer links on every settlement        |
| `SETTLEMENT_CONFIRMATIONS_REQUIRED` | 1                                                | Confirmations before a tx is considered final                   |
| `TAVILY_API_KEY`                    | —                                                | Only used by the Tavily MCP validation skill                    |


## Smoke tests

Run these in order against `http://localhost:8787` after `npm run dev`. Each
one exercises a different sponsor surface.

### 0. Confirm the integration banner

```bash
curl -s http://localhost:8787/api/config | jq
```

Each integration reports `live: true|false` plus a human-readable detail
string. If you set `GEMINI_API_KEY`, you should see `gemini.live: true`.

### 0.5. Confirm Circle/Arc settlement wallets

```bash
curl -s http://localhost:8787/api/settlement/wallets | jq
```

Copy `.treasury.address` into the Circle Faucet, select Arc Testnet, and request
testnet USDC. Until that address has USDC, paid reads should fail honestly with
Circle's insufficient-asset error.

### 1. Free index search (always live)

```bash
curl -s "http://localhost:8787/api/index/search?q=arc%20402" \
  | jq '.posts[] | {title, price_per_read, access_policy}'
```

### 2. x402 paywall response (always live)

```bash
POST_ID=$(curl -s "http://localhost:8787/api/index/search?q=" | jq -r '.posts[0].id')

# Unfunded read returns HTTP 402 with payment metadata
curl -s -i "http://localhost:8787/api/posts/$POST_ID" | head -n 12

# Funded read with the demo key returns 200 + body_full + a Circle settlement record
curl -s -H "Authorization: Bearer hs_demo_gemini" \
  -H "X-Agent-Name: Smoke-Test" \
  "http://localhost:8787/api/posts/$POST_ID" \
  | jq '{title, access_policy, price_per_read, tx: {provider: .tx.provider, provider_tx_id: .tx.provider_tx_id, status: .tx.settlement_status, hash: .tx.arc_tx_hash, explorer: .tx.arc_explorer_url}}'
```

### 3. Composer (always live)

```bash
curl -s -X POST http://localhost:8787/api/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Smoke test from curl",
    "body_full": "First paragraph.\n\nSecond paragraph that demonstrates the auto-preview slicing and wallet provisioning end to end.\n\nThird paragraph for breathing room.",
    "access_policy": "ai_metered",
    "price_per_read": 0.001
  }' | jq '.post | {id, title, access_policy, price_per_read, wallet_address}'
```

The new post should appear in `/api/index/search` immediately and on the
HayStack home page after a refresh.

### 4. Inline paywall edit (always live)

```bash
curl -s -X PATCH "http://localhost:8787/api/posts/$POST_ID/settings" \
  -H "Content-Type: application/json" \
  -d '{"access_policy":"premium","price_per_read":0.005}' \
  | jq '.post | {access_policy, price_per_read}'
```

### 5. Real Gemini agent loop (requires `GEMINI_API_KEY`)

```bash
curl -s -X POST http://localhost:8787/api/agent/query \
  -H "Content-Type: application/json" \
  -d '{"query":"How does Arc make HTTP 402 viable for AI retrieval?","budget_usdc":0.01}' \
  | jq '{mode, spent_usdc, sources: [.reads[].title], answer}'
```

If `mode: "gemini-live"`, you just watched the model search, budget, pay via
the same paid-read path, and synthesize. Each successful `read_full_post` call
also lands on the SSE settlement feed, which the writer dashboard tails in
real time.

### 6. Live SSE settlement feed (always live)

In one terminal:

```bash
curl -N http://localhost:8787/api/events/settlements
```

In another, trigger an agent read:

```bash
curl -s -X POST http://localhost:8787/api/agent/query \
  -H "Content-Type: application/json" \
  -d '{"query":"price for an agent","budget_usdc":0.01}' >/dev/null
```

You should see one `{"type":"settlement","tx":{...,"provider":"circle-w3s"}}`
event per paid read. If Circle returns an Arc `txHash` and
`ARC_EXPLORER_BASE_URL` is set, `arc_explorer_url` will be populated.

### 7. Writer dashboard payload (always live)

```bash
curl -s http://localhost:8787/api/dashboard \
  | jq '{month_human: .totals.month_human,
         month_ai: .totals.month_ai,
         readers: [.totals.top_readers[] | {agent: .agent_identifier, spend, reads}],
         recent: [.live[0:3] | .[] | {agent: .agent_identifier, amt: .amount_usdc, url: .arc_explorer_url}]}'
```

## What is still not production-hard

- **Native x402 `X-PAYMENT` facilitator flow.** The backend still uses the
pre-funded API-key retry path and turns that into a Circle W3S transfer.
- **Confirmation reconciliation.** Circle provider ids and returned tx hashes
are stored, but there is no background poller that marks pending rows
confirmed later.
- **RSS import.** Today the import endpoint creates three canned posts so the
staggered animation always plays. Replacing the inner array with a real
RSS-parsed payload is a self-contained change in `backend/src/server.js`.

