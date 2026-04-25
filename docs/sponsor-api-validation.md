# Sponsor API Integration Validation

This validation was performed with Tavily MCP live lookups and local endpoint smoke tests against the current HayStack codebase.

## Scope and Evidence

The sponsor-facing surfaces validated were Circle Nanopayments + x402 flow design, Arc settlement representation, and Gemini function-calling orchestration model. Tavily MCP was used to confirm current public references and implementation expectations from Circle, Arc, and Google Gemini documentation.

The main references used were:

- [https://www.circle.com/blog/autonomous-payments-using-circle-wallets-usdc-and-x402](https://www.circle.com/blog/autonomous-payments-using-circle-wallets-usdc-and-x402)
- [https://docs.arc.network/arc/references/contract-addresses](https://docs.arc.network/arc/references/contract-addresses)
- [https://ai.google.dev/gemini-api/docs/function-calling](https://ai.google.dev/gemini-api/docs/function-calling)

## Circle + x402 Validation

Your backend implements the correct request/response shape for the first phase of x402 handling. Unfunded reads return HTTP 402 with payment metadata and a preview payload. Funded reads use the pre-funded API-key retry path.

When `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, and Arc USDC config are present, the funded read path now calls Circle Developer-Controlled Wallets (W3S): it provisions `ARC-TESTNET` wallets, creates a Circle transfer from the agent treasury wallet to the author's wallet, and stores Circle's provider transaction id plus any returned Arc tx hash. If the treasury wallet has no testnet USDC, reads fail with Circle's real insufficient-asset error and no fabricated transaction is recorded.

What remains incomplete for production is native signed `X-PAYMENT` ingestion/facilitator verification. The current demo path is "pre-funded API key triggers real Circle W3S transfer", not a full x402 facilitator implementation.

## Arc Settlement Validation

Your data model carries Arc settlement semantics through `arc_tx_hash`, `provider_tx_id`, `settlement_status`, and a transaction ledger. The dashboard reflects paid reads from this ledger.

The Circle W3S transfer path is configured for `ARC-TESTNET` and uses Arc testnet USDC (`ARC_USDC_CONTRACT`). Explorer links are generated when Circle returns an Arc tx hash. What is still missing is a background reconciliation job that polls Circle or Arc RPC until pending provider transactions are confirmed.

## Gemini Integration Validation

Your app has a budgeted agent endpoint (`POST /api/agent/query`) that uses `@google/genai` with function declarations when `GEMINI_API_KEY` is configured. Local smoke tests confirmed `mode: "gemini-live"` with real tool calls.

## Local Runtime Test Results

The following checks passed in local validation:

- Backend health endpoint returns success.
- Search endpoint returns previews and prices.
- Unfunded post read returns HTTP 402 and payment headers.
- Funded post read attempts a Circle W3S transfer when configured.
- Unfunded Circle treasury returns Circle's real insufficient-asset error instead of creating a fake transaction.
- Wallet balance decreases after a funded read.
- Gemini live route respects budget and returns citations when matches are found.

## Readiness Summary

The platform now has real Gemini tool calling and real Circle W3S transfer wiring for Arc testnet. The remaining gap is funding the Circle agent treasury wallet with Arc testnet USDC and adding confirmation reconciliation for pending provider transactions.