---
name: haystack-project
description: Project context and implementation guide for the HayStack hackathon MVP. Use when working inside the HayStack repo, onboarding a fresh coding agent, changing frontend/backend behavior, touching x402 payments, Circle, Arc, Gemini, env files, smoke tests, docs, or demo readiness. This skill captures the current architecture, integration truth, key files, and project-specific guardrails so agents do not rely on stale chat history.
---

# HayStack Project

## Overview

HayStack is an AI-driven publishing platform where authors publish articles, configure human/AI access policies, and receive per-read revenue when AI agents pay for full content. The repo is a hackathon MVP with a React/Vite frontend and Express/SQLite backend.

Before changing behavior, read `references/project-context.md`. For smoke tests and environment details, also read `docs/env-and-smoke-tests.md`. For sponsor-integration status, check `docs/sponsor-api-validation.md`, but verify it against code because this project moves quickly.

## First Principles

Treat this skill as a live project handoff. If implementation changes in a meaningful way, update `references/project-context.md` in the same PR/change so future agents inherit the new truth.

Do not claim a sponsor integration is "real" just because env vars are present. Check the actual code path. As of this skill, Gemini can run live via `@google/genai`, but `chargeRead()` in `backend/src/store.js` still performs local SQLite debits and writes settlement rows unless a future change wires Circle/Arc transfer APIs there.

Never print, commit, or copy secrets from `backend/.env`. `backend/.env` is local runtime state; `.env.example` files must remain examples only. When checking env state, report only whether values are present and their non-sensitive mode/host details.

The user explicitly wants "real" demo behavior, not fabricated payment events. If working on payments or settlement, prioritize replacing fake transaction hashes and local-only balance changes with sandbox/testnet provider artifacts. Avoid adding more demo-only data paths unless clearly labeled and isolated.

## Common Workflows

For frontend tasks, start with `frontend/src/App.tsx`, `frontend/src/api.ts`, `frontend/src/types.ts`, and the relevant component in `frontend/src/components/`. The design language is warm yellow/orange "Honey & Settlement": literary publishing plus visible money movement.

For backend/API tasks, start with `backend/src/server.js`, `backend/src/store.js`, `backend/src/agent.js`, `backend/src/config.js`, and `backend/src/db.js`. `server.js` owns routes/SSE, `store.js` owns data mutations and payment-seam behavior, `agent.js` owns Gemini tool calling, and `config.js` owns env/live status.

For integration work, check actual runtime with `GET /api/config`, then run the relevant smoke test from `docs/env-and-smoke-tests.md`. Keep docs honest when behavior changes.

## Resources

- `references/project-context.md` — current architecture, routes, data model, integration status, env policy, and smoke-test commands.
