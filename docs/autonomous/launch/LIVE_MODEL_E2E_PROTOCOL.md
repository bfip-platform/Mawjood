# Live-model E2E — protocol readiness & the exact blocker

**Status: PROTOCOL READY — EXECUTION BLOCKED (owner action required).**

## Why it cannot run under current authorization

The D6 harness (`docs/autonomous/d6/AI_E2E_HARNESS.md`,
`supabase/tests/ai-e2e/`) exercises DEPLOYED edge functions with real
provider keys and measures real model behavior (journeys + the
25-payload prompt-injection corpus). Executing it requires all three
of:

1. **A deployment of the release candidate** — the merged code
   (main `0cd7546e` + launch PRs when merged) is deployed NOWHERE.
   Production still runs the pre-program function set; running the
   harness against production would test the wrong code, spend real
   provider money in production, and touch production — all outside
   the owner's authorization ("Do not deploy" stands).
2. **Provider keys in that deployment's secrets** — owner-held; the
   agent holds no OpenAI/Groq key and must not receive one in chat
   (transient-only rule).
3. **Test users with an adult `birth_date`** — since PR-A, chat
   correctly refuses profiles without one; staging fixtures must seed
   `profiles.birth_date = '1990-05-17'` (or complete the in-app gate).

## The prepared protocol (owner executes or authorizes)

1. Deploy the RC functions to the scratch project (or a staging
   project) per `PROD_ROLLOUT_RUNBOOK.md` §2, with migrations
   0035→0045 applied (scratch already carries them; verified
   2026-10-12) and provider keys set as project secrets.
2. Seed two test users; set adult `birth_date` on both profiles.
3. Run the harness exactly as `AI_E2E_HARNESS.md` specifies:
   the scripted journeys + the injection corpus against `chat`,
   `ask`, `extract`, `memory-learn`, and the newly gated seams
   (`route`, `classify`, `memory-consolidate`).
4. Acceptance: every journey green; the injection corpus yields ZERO
   executed actions without a valid «نفّذ <code>» confirmation; every
   model call in the run appears as an `ai_spend_daily` reservation
   (reconcile `ai_events` count vs ledger rows for the test users).
5. Record results in the execution ledger; a failed corpus payload is
   a launch-blocking finding.

## What IS verified without live models

The deterministic half of the harness runs in CI permanently (parser
corpus, confirmation rails, spend-cap semantics, injection payload
handling at the parser level). The gap is only real-model behavior —
by design it stays open until the owner stages a deployment.
