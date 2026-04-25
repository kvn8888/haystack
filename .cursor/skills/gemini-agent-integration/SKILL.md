---
name: gemini-agent-integration
description: Implements Gemini tool-calling loops for search, wallet checks, and paid content retrieval with cost-aware selection. Use when building or validating Gemini Flash/Pro orchestration for HayStack agent workflows.
---

# Gemini Agent Integration

Use this skill when implementing the two-model agent pattern:
- Flash for fast tool calls (search, wallet check)
- Pro for budgeted selection and synthesis

## Quick Workflow

1. Define function/tool declarations in Gemini-compatible schema.
2. Send user query + tools to Gemini Flash for lightweight calls.
3. Pass previews, prices, and wallet state to Gemini Pro.
4. Execute selected paid reads and return citations in final synthesis.
5. Log reasoning and spending for replay/debug.

## HayStack Integration Targets

- Orchestration endpoint: `backend/src/server.js` route `POST /api/agent/query`
- Search tool source: `GET /api/index/search`
- Wallet tool source: `GET /api/wallet/balance`
- Paid read tool source: `GET /api/posts/:postId`

## Required Environment Variables

- `GEMINI_API_KEY`
- `GEMINI_FLASH_MODEL` (for example: `gemini-2.5-flash`)
- `GEMINI_PRO_MODEL` (for example: `gemini-2.5-pro`)
- `AGENT_DEFAULT_BUDGET_USDC`

## Implementation Notes

- Keep tool response JSON compact and deterministic.
- Include max budget and remaining balance in model context every turn.
- Require citations from paid reads in final answer payload.
- Separate LLM response text from settlement ledger events.

## Validation Checklist

- Tool declarations include typed parameters.
- Flash never performs final synthesis directly.
- Pro selection respects budget and skips over-priced sources.
- Final response includes citations to purchased posts.
- Agent failures do not charge wallet.

## Tavily-Validated References

- [Gemini API docs: Function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Google guide: Gemini API in JS/TS](https://developers.google.com/learn/pathways/solution-ai-gemini-getting-started-web)
