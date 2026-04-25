---
name: circle-nanopayments
description: Integrates Circle Nanopayments with x402-style paid API routes, including 402 responses, signed payment header forwarding, settlement verification, and wallet funding checks. Use when implementing or debugging pay-per-read API monetization with Circle.
---

# Circle Nanopayments Integration

Use this skill when a route should charge per request and settle in USDC through Circle Nanopayments/Gateway.

## Quick Workflow

1. Ensure protected endpoint returns `402 Payment Required` with machine-readable payment metadata.
2. On retry, read signed payment authorization header from the client.
3. Forward authorization to Circle settlement API (facilitator flow).
4. Persist settlement result and return requested resource.
5. Stream settlement event to clients over SSE.

## HayStack Integration Targets

- Request gate: `backend/src/server.js` route `GET /api/posts/:postId`
- Settlement write: `backend/src/store.js` function `chargeRead`
- Live feed: `GET /api/events/settlements`

## Required Environment Variables

- `CIRCLE_API_KEY`
- `CIRCLE_ENTITY_SECRET` (if required by your chosen Circle SDK flow)
- `CIRCLE_ENV` (`sandbox` or `production`)
- `CIRCLE_GATEWAY_BASE_URL`
- `HAYSTACK_SETTLEMENT_CURRENCY` (default `USDC`)

## Implementation Notes

- Keep price precision explicit in USDC units (`0.001` etc.) and store decimal-safe values.
- Treat payment verification as authoritative. Do not settle from client-declared amount alone.
- Return deterministic error classes: invalid signature, expired authorization, insufficient balance, settlement timeout.

## Validation Checklist

- 402 responses include price + payment endpoint metadata.
- Requests without payment header never return full content.
- Successful paid retries create a transaction with provider settlement reference.
- Failed settlement never creates a successful content access record.
- SSE feed emits one settlement event per successful charge.

## Tavily-Validated References

- [Circle blog: Autonomous payments with x402](https://www.circle.com/blog/autonomous-payments-using-circle-wallets-usdc-and-x402)
- [Arc community event: Build with Circle Nanopayments](https://community.arc.network/public/events/build-with-circle-nanopayments-agentic-payments-usage-based-billing-and-streaming-value-n88znh6avx)
