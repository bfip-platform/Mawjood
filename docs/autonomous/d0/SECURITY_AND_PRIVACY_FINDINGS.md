# D0 — Security & Privacy Findings

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`
**Method:** Read-only. Distinguishes CONFIRMED defects / RISKS / UNTESTED assumptions.

## CRITICAL — none active beyond memory-retention (see MEMORY_RETENTION_AUDIT.md)

## HIGH

### H1 — Cross-user private-photo read escalation
**Evidence reconciliation (2026-10-12):** This finding has two separable claims with different confidence levels.

**Claim A — the code defect [CONFIRMED, HIGH confidence]:**
- **Evidence:** `supabase/functions/chat/index.ts:836-839` (only `startsWith('https://')` check on client-supplied `photo_url`); `supabase/migrations/0029_private_storage.sql:55-72` (`can_read_photo` grants SELECT when any accessible note references the path via `like '%/item-photos/' || p_name`, bypassing the owner-folder check in the OR branch)
- **Impact:** The validation gap and overly-broad policy are code-evident. The 0029 P0-6 storage hardening is bypassable via the chat `photo_url` path.
- **Recommendation:** Server-side validate storage path starts with `${userId}/`; harden `can_read_photo` to require owner/space match.

**Claim B — the end-to-end exploit chain [MEDIUM confidence, UNVERIFIED]:**
- What remains unproven: an attacker actually obtaining a working signed URL for a victim's photo in practice (storage-policy interaction, exact URL format needed, `createSignedUrl` behavior against this policy).
- **Verification required:** Scratch-project repro (victim uploads → attacker references URL from own note → signed URL succeeds). Do not describe Claim B as confirmed until the repro exists.

## MEDIUM

### M1 — Unauthenticated AI-spend oracle (`route`, `classify`) [CONFIRMED]
- **Evidence:** `supabase/functions/route/index.ts`, `classify/index.ts` — no auth; client-invoked at `packages/voice-engine/src/client.ts:355,476`; static tripwire comment claims "not invoked by client" — false.
- **Impact:** Anyone with shipped anon key burns Groq/OpenAI quota; error path leaks provider text.
- **Recommendation:** Require JWT + per-user rate limit, or route behind `chat`.
- **Verification:** Confirm deployed `verify_jwt` (no config.toml in repo).

### M2 — Non-constant-time ADMIN_TOKEN compare [CONFIRMED]
- **Evidence:** Admin fns vs `edge-auth.ts` (own constant-time).
- **Recommendation:** Use constant-time compare everywhere.

### M3 — `eval_mode` user-impersonation path [RISK]
- **Evidence:** `supabase/functions/chat/index.ts:852-856`.
- **Impact:** INTERNAL_FN_SECRET leak = full impersonation.
- **Recommendation:** Remove or gate behind separate secret + audit log.

### M4 — Approval→execute TOCTOU on `toolExecuteAction` [RISK]
- **Recommendation:** `SELECT FOR UPDATE` row lock.

### M5 — `join-family` used_count check-then-increment race [RISK]
- **Recommendation:** Atomic increment.

### M6 — Invite codes ~29.6 bits, no rate limit on join-family [RISK]
- **Recommendation:** Longer codes + rate limit.

## LOW

- Groq 429 "backoff" is single fixed 1.5s retry, not exponential [CONFIRMED]
- `report-error` stores client free-text despite "never user content" header [CONFIRMED]

## Positives (confirmed)

- RLS on all 27 public tables; zero `USING(true)`; 13 zero-policy tables = deny-by-default
- service_role confined to edge functions (zero client usage)
- Secrets clean in working tree (gitleaks in CI)
- Buckets private since 0029 (modulo H1)
- Prompt-injection residual is single-user self-injection; destructive ops have multi-approval + server re-checks
- Dependency baseline: 2 accepted advisories (braces, node-forge), review-by 2027-01-10, fail-closed gate

## UNTESTED assumptions

- RLS semantics for borrows, shopping_lists, space_tabs, profiles-peers, chat_sessions, device_tokens, trash_bin, vault tables (static audit only)
- Prod secret strength/rotation; deployed-source drift; fresh `npm audit` (sandbox-blocked)
