---
name: arc-settlement
description: Implements Arc-aware settlement handling for USDC-denominated transactions, including chain config, contract addresses, transaction references, and settlement observability. Use when wiring or validating Arc settlement behavior in backend payment flows.
---

# Arc Settlement Integration

Use this skill when payment events must be represented as Arc-settled transactions rather than local mock records.

## Quick Workflow

1. Define Arc environment configuration (testnet/mainnet, RPC, chain id).
2. Normalize USDC amount precision and denomination boundaries.
3. Persist a provider transaction reference and onchain hash separately.
4. Add reconciliation job for pending settlements.
5. Expose settlement status in API and dashboard surfaces.

## HayStack Integration Targets

- Settlement record schema: `backend/src/db.js` table `transactions`
- Settlement writes: `backend/src/store.js` `chargeRead`
- Dashboard reads: `backend/src/store.js` `recentTransactions`, `dashboardTotals`

## Required Environment Variables

- `ARC_RPC_URL`
- `ARC_CHAIN_ID`
- `ARC_USDC_CONTRACT`
- `ARC_EXPLORER_BASE_URL`
- `SETTLEMENT_CONFIRMATIONS_REQUIRED`

## Implementation Notes

- Store both `provider_tx_id` (offchain settlement batch reference) and `arc_tx_hash`.
- Mark transaction lifecycle states (`pending`, `confirmed`, `failed`) for eventual consistency.
- For demo UX, optimistic streaming is fine, but reconcile in background.

## Validation Checklist

- Every paid read has a unique settlement record.
- `arc_tx_hash` format is validated as `0x` + 64 hex chars.
- Dashboard totals are computed only from confirmed records.
- Explorer links are derivable from stored transaction hashes.

## Tavily-Validated References

- [Arc docs homepage](https://docs.arc.network/)
- [Arc docs: Contract addresses](https://docs.arc.network/arc/references/contract-addresses)
