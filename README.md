# HayStack Hackathon MVP

HayStack is a dual-surface prototype:

- `frontend`: reader UI, writer composer + paywall dashboard, agent playground, migration flow
- `backend`: post index, x402-like gated reads, wallet charging, SSE settlement feed, Gemini tool-calling loop

## Quick start

```bash
npm install
cp backend/.env.example backend/.env   # optional — only needed for live integrations
npm run seed
npm run dev
```

Backend runs on `http://localhost:8787` and frontend on `http://localhost:5173`.
The header shows three pills (Gemini · Circle · Arc) — green when an
integration is live, gold when it's running on the local mock.

## Going live (real demo)

For the hackathon, the real sponsor-API demo uses Gemini plus Circle W3S on
Arc testnet:

```bash
GEMINI_API_KEY=...                              # from https://aistudio.google.com/app/apikey
CIRCLE_API_KEY=...                              # Circle W3S sandbox key
CIRCLE_ENTITY_SECRET=...                        # Circle entity secret
ARC_USDC_CONTRACT=0x3600000000000000000000000000000000000000
ARC_EXPLORER_BASE_URL=https://testnet.arcscan.app
```

This switches `/api/agent/query` to a real Gemini function-calling loop
(searching, budgeting, paying, synthesizing). Paid reads call Circle
Developer-Controlled Wallets on `ARC-TESTNET` and store Circle provider tx ids
plus returned Arc tx hashes. Fund the agent treasury wallet from
[https://faucet.circle.com/](https://faucet.circle.com/) using `GET /api/settlement/wallets`.

See `[docs/env-and-smoke-tests.md](docs/env-and-smoke-tests.md)` for the
complete variable reference and copy-pasteable curl smoke tests for every
endpoint.

## Demo API key

Three pre-funded keys are seeded so paid reads work out of the box:

```txt
Authorization: Bearer hs_demo_gemini       # $1.50 USDC
Authorization: Bearer hs_demo_perplexity   # $0.75 USDC
Authorization: Bearer hs_demo_claude       # $0.75 USDC
```

## Core endpoints

- `GET  /api/config` — integration status (live vs mock per provider)
- `GET  /api/settlement/wallets` — Circle W3S Arc testnet wallet/funding status
- `GET  /api/index/search?q=...` — keyword-tokenized search over previews (free)
- `GET  /api/wallet/balance` — check key balance
- `GET  /api/posts/:postId` — 402 + payment metadata when unfunded; 200 + full body when paid
- `POST /api/pay/:postId` — x402-style payment endpoint; returns signed `X-Payment` receipt
- `POST /api/posts` — composer endpoint (title, body, access policy, price)
- `PATCH /api/posts/:postId/settings` — inline paywall edits from the dashboard
- `POST /api/agent/query` — real Gemini tool-calling loop when `GEMINI_API_KEY` is set, mock otherwise
- `GET  /api/events/settlements` — SSE stream for the live ledger
- `GET  /api/dashboard` — writer metrics + recent transactions (with `arc_explorer_url`)
- `POST /api/settlement/reconcile` — poll Circle provider transactions and hydrate Arc hashes/status
- `DELETE /api/migration/imports` — clear imported posts for repeatable demos
- `POST /api/migration/import-rss` — real RSS/Atom import with AI-Metered defaults

## User stories the UI covers

- **Maya the writer** opens *Write*, drafts a post, picks an access policy and price, and publishes — the new post gets a wallet, an x402 endpoint, and shows up on Discover.
- **Maya** opens *Dashboard* to see human + AI revenue side-by-side and tweak any post's access policy/price inline (auto-saves via `PATCH`).
- **David the reader** lands on a Substack-shaped article, sees a paywall card, and unlocks it as an agent with one click.
- **Priya the agent developer** runs a question through *Agent* and watches a real Gemini loop search, budget, pay, and cite.
- **Sam the platform evaluator** sees the live "$X.XXX paid live" meter ticking and the integration pills indicating which sponsor surfaces are real.

## What this implements from spec

- Access policy model (`open`, `ai_metered`, `gated`, `premium`) with inline edit
- x402-shaped behavior with payment headers and preview-first responses
- Per-read writer settlement with transaction ledger and Arc-explorer URL hydration
- x402-style pay endpoint + signed `X-Payment` receipt retry path
- Real-time UI updates via SSE
- Migration UX with real RSS/Atom parsing and wallet-provisioning signal
- Composer with paywall controls, live preview, and per-100/1000-read revenue projections
- Real Gemini tool-calling loop when configured (graceful fallback to local mock otherwise)

## Sponsor skills

Project skills for sponsor integrations:

- `.cursor/skills/circle-nanopayments/SKILL.md`
- `.cursor/skills/arc-settlement/SKILL.md`
- `.cursor/skills/gemini-agent-integration/SKILL.md`

Validation notes live in `docs/sponsor-api-validation.md`.
Operational guide lives in `docs/env-and-smoke-tests.md`.