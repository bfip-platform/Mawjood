# D0.5 — Security, Privacy & Retention Specification

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** `docs/autonomous/d05/workstream-04-security.md`
**Mission scope:** design-only. No application code changes. All remediations specified with threat, design, acceptance criteria, automated verification, and rollback plan so a governed batch (implement → test → independent review → exact-head CI → Draft PR) can execute them later.

**Owner decisions enforced:** #1 (durable memories), #2 (no invented numbers), #6 (trash 30-day), #7 (no destructive consolidation), #8 (indexes/janitors design/test only — never delete saved memories via cleanup).

**Evidence posture — the photo finding (read before acting):**
- **Claim A [CONFIRMED, HIGH]:** the code defect is code-evident — `supabase/functions/chat/index.ts:836-839` accepts any client-supplied `photo_url` passing only `startsWith('https://')`; `supabase/migrations/0029_private_storage.sql:55-72` (`can_read_photo`) grants SELECT on `item-photos` when *any* note the caller can access references the path (`like '%/item-photos/' || p_name`), bypassing the owner-folder check in the OR branch. The 0029 P0-6 storage hardening is bypassable through the chat `photo_url` path.
- **Claim B [MEDIUM, UNVERIFIED]:** an actual end-to-end exploit (attacker obtaining a working signed URL for a victim's photo in practice) is **not proven** and must **never** be described as proven until a scratch-project repro exists. Remediation designs below fix Claim A and do not depend on Claim B being true.

---

## 1. Photo access escalation — remediation

### 1.1 Threat
An authenticated user (A) can attach a photo URL pointing at another user's (B) private photo in a `chat` request. Two compounding gaps: (a) the function accepts any `https://` URL as `photo_url`, so attacker-controlled URLs reach the vision path and URL-signing logic; (b) `can_read_photo`'s second OR branch lets a read grant succeed when *any* accessible note references the object path — the note need not be the caller's own. Net effect (Claim A, code-evident): read access to photos outside the caller's own folder without being the owner. Claim B stays MEDIUM until a scratch repro proves it.

### 1.2 Design

**D1.1 — Server-side photo_url validation** (chat, transcribe, extract, ask — any fn accepting a photo reference).
- Single canonical helper `_shared/photos.ts`: `validatePhotoUrl(raw, userId, supa) → { bucket, objectPath } | null`.
- Rules: (1) reject anything not a `https://<project-ref>.supabase.co/storage/v1/object/sign/item-photos/...` signed-URL form or a bare object path — normalize to ONE canonical internal representation (recommendation: **store object path only**, derive signed URLs server-side at read time); (2) object path's first folder segment must equal the authenticated `userId`; (3) max 500 chars, URL-decode once (reject double-encoded `..`, `%2f` tricks), reject `..` segments and absolute paths.
- Existing non-conforming `photo_url` rows are treated as `null` at read time — never rewritten in the remediation batch (decision #1; a separate migration with owner approval handles normalization).

**D1.2 — `can_read_photo` hardening** (migration 003x).
- The note-reference grant requires BOTH: the note is accessible to the caller **and** the note's owner equals the caller's uid, OR the note's space is a space the caller is a current member of **and the object path's first segment equals the note owner's id** — the path stays namespaced to the owner even when shared. Remove the bare `like '%/item-photos/' || p_name` fallback.
- Negative policy test: an attacker note referencing `/item-photos/<victim>/photo.jpg` must NOT satisfy the policy.
- Keep `SECURITY DEFINER`; `revoke all … from public, anon` stays; `grant execute … to authenticated` stays.

**D1.3 — Signed URL lifecycle.**
- Signed URLs for `item-photos` are minted **server-side only** (never from client-supplied paths).
- **Expiry duration: OPEN owner question.** Proposed: 15 minutes (based on the current de-facto expiry in the mobile client), hard bound ≤ 1 hour. The owner sets the final value; the design parameterizes it as config, not code.
- **Rotation:** each new signed-URL mint for the same object invalidates prior outstanding URLs where feasible (mint events tracked in `ops_events`; at minimum log `photo_sign` events for audit).
- **Revocation on family removal:** when a user is removed from a space (or leaves): (a) stop minting new URLs immediately (membership check at mint time); (b) in-flight URLs remain valid only until expiry — maximum exposure window = the expiry duration (this is why a short expiry matters); (c) `space_members` revocation trigger writes a `photo_access_revoked` event and deletes outstanding signed tokens where the storage API supports it. **Residual risk disclosed:** URLs already issued remain valid until expiry — accepted trade-off, stated in the Privacy Policy.

### 1.3 Acceptance criteria
- AC-1.1: `chat` with `photo_url` outside `<userId>/` → 403/validation error; never reaches the vision model or URL signing.
- AC-1.2: `..`, double-encoding, non-HTTPS scheme rejected.
- AC-1.3: Direct SQL test — `can_read_photo('item-photos', '<other>/x.jpg')` returns false for a caller whose only link is a note reference.
- AC-1.4: Removed family member cannot mint new signed URLs for that space's photos within one request cycle; audit event written.
- AC-1.5: Scratch-project repro documented: confirms Claim B (→ escalate to CRITICAL) or shows it blocked at the policy layer (→ downgrade Claim B to LOW). **Verdict recorded in the findings file; the remediation ships regardless.**

### 1.4 Automated verification
- Unit tests for `_shared/photos.ts` (owner-prefix accept, cross-user reject, traversal reject, scheme reject, length cap).
- SQL migration test in CI against scratch Postgres: policy negative tests per §1.2.
- Edge-function integration test: attacker chat request with victim photo URL → 403 + `ops_events` audit row.
- Claim B scratch repro: manual one-time procedure (not CI — requires a scratch Supabase project).

### 1.5 Rollback plan
- Application code (D1.1): revert the edge-function deploy; retain last-known-good version id in release notes.
- Migration 003x (D1.2): down-migration restoring the 0029 policy text byte-identical (stored in the migration header); negative tests inverted (fail-open only in rolled-back state, documented as known-vulnerable).
- Signed-URL expiry: config/env change only — revert the env var.

---

## 2. Public route/classify gating — remediation

### 2.1 Threat
`route/index.ts` and `classify/index.ts` run with **no auth check** while being client-invoked (`packages/voice-engine/src/client.ts:355,476`), contradicting the static "not invoked by client" tripwire comment. Impact: anyone with the shipped anon key can burn Groq/OpenAI quota (cost attack); the error path returns raw provider text to unauthenticated callers (information leak: model/version disclosure).

### 2.2 Design
- **D2.1 — JWT requirement (default).** Add `authUserId(req)` (from `_shared/edge-auth.ts`) at the top of both functions; return `json401()` when null. Replace the false tripwire comment with an accurate one.
- **D2.2 — Per-user rate limiting.** Wire `checkRateLimit(supa, userId, 'route' | 'classify', …)` — PROPOSED `route: { perMinute: 30, perHour: 300 }`, `classify: { perMinute: 30, perHour: 300 }` (cheap deterministic-first paths). Fail-open stays (telemetry outage must not take chat offline) but `rate_limit_store_error` logged to `ops_events` so fail-open episodes are visible.
- **D2.3 — Alternative: route behind `chat`.** Expose route/classify as internal-only (`isInternal(req)` gate); `chat` calls them service-to-service with `internalHeaders()`. Removes two public surfaces entirely. Trade-off: latency hop + client changes. **Default: D2.1 + D2.2** (smaller blast radius); D2.3 documented as the follow-up.
- **D2.4 — Error-path leak fix.** Catch provider errors → generic localized message; raw provider text server-side only (`ops_events`). Shared helper `_shared/safeError.ts`; apply to `ask`, `extract`, `transcribe` error paths in the same batch.

### 2.3 Acceptance criteria
- AC-2.1: Unauthenticated request → 401, zero provider calls (no new `ai_events` row).
- AC-2.2: Over per-minute rule → 429 with localized message; counters recover next window.
- AC-2.3: Provider-error simulation → response body contains no provider-identifying text; raw text in server logs only.

### 2.4 Automated verification
- Edge-function unit tests with stubbed JWT: 401 / 429 / success paths.
- `ai_events` accounting test: unauthenticated call inserts zero rows.
- CI static check: fail if `route/index.ts` or `classify/index.ts` lacks the `authUserId` call (regression guard).

### 2.5 Rollback plan
Revert the two function deploys (last-known-good recorded). Rolled-back state is known-vulnerable (endpoints open) — re-deploy forward rather than lingering.

---

## 3. Auth / RLS / family isolation — revoked-access semantics + RLS gap closure

### 3.1 Threat
Family spaces are the trust core. Two gaps: (a) **revoked-access semantics unspecified** — unclear which cached/signed grants stop working when a member is removed, and when; (b) D0's RLS audit was static-only for `borrows`, `shopping_lists`, `space_tabs`, `profiles`-peers, `chat_sessions`, `device_tokens`, `trash_bin`, `vault` — behavioral semantics including ex-member access are UNTESTED.

### 3.2 Design

**D3.1 — Revoked-access semantics.** On `space_members` DELETE (removal) or member-initiated leave:
1. **Immediate:** RLS denies all new reads/writes (verify per table in tests). No new signed photo URLs minted (membership check at mint).
2. **Within signed-URL expiry window:** in-flight photo URLs remain valid until expiry (documented residual risk, §1.2).
3. **Cache invalidation:** the mobile offline read cache drops the departed space's cached rows on next sync (rows keyed by `space_id`); server sends a `membership_revoked` signal via `notify`.
4. **Accepted breakage:** ex-member's local unsynced drafts for that space are discarded with a one-time notice; their private-space data untouched; audit rows (`ops_events`) retained (security-relevant, non-user-deletable).
5. Documented sequence + server function `revoke_space_access(space_id, user_id)` called from the `family-members` remove path, emitting `space_access_revoked` to `ops_events`.

**D3.2 — RLS behavioral tests per table** (`borrows`, `shopping_lists`, `space_tabs`, `profiles` peer reads, `chat_sessions`, `device_tokens`, `trash_bin`, `vault`):
- Test matrix as three roles (owner, current member, ex-member/outsider) asserting SELECT/INSERT/UPDATE/DELETE against the *deployed* policy set, in CI against a scratch database seeded by migrations.
- Specific assertions: ex-member gets zero rows from `borrows`/`shopping_lists`/`chat_sessions`; `device_tokens` owner-only (push-targeting stays server-side); `trash_bin` visibility decided and documented (deleting-user-only vs space admins); `vault` tables enforce vault-membership + `vault_id` scoping.
- Any failing table gets a policy-fix migration in the same batch.

### 3.3 Acceptance criteria
- AC-3.1: Ex-member role receives zero rows / 403 on all 8 table families.
- AC-3.2: `revoke_space_access` emits audit event; subsequent mint attempts fail.
- AC-3.3: Client cache-invalidation signal documented (payload shape, keying); implementation deferred to the offline-cache batch with this spec as contract.

### 3.4 Automated verification
- CI job `rls-matrix`: scratch Postgres + migrations + role matrix; fails on any unexpected grant.
- Negative test: user A cannot read user B's `device_tokens` row.

### 3.5 Rollback plan
Policy-fix migrations ship with down-migrations restoring prior policy text byte-identical. `revoke_space_access` is additive — rollback = revert the call site; the function remaining is inert.

---

## 4. AI cost quotas — per-user daily token budget (fail-closed)

### 4.1 Threat
AI spend is unbounded per user: rate limits are per-minute/per-hour and fail-open, with no daily budget. A compromised token or abusive user can accumulate large provider bills; no admin-settable cap, no spend alerting, no per-tier differentiation hooks.

### 4.2 Design
- **D4.1 — Accounting exists:** `ai_events` rows per AI call (verify columns: user_id, function, tokens, cost). The budget design consumes this table — no new write path.
- **D4.2 — Daily budget check:** `_shared/ai-budget.ts` — `checkAiBudget(supa, userId, tier) → { allowed, remainingTokens, resetsAt }`. Sums today's tokens from `ai_events`; compares against `ai_budgets` config table (`tier`, `daily_token_cap`, `updated_at`, `updated_by`). Enforced in `chat`, `ask`, `extract`, `transcribe`, `memory-learn` before the provider call.
- **D4.3 — Fail-closed for money, fail-open for availability:** budget store unreadable → **fail-closed for new AI calls** (503 + localized "try later") EXCEPT deterministic/fast paths (`route` Layer-1, cached answers) which stay up. Rationale: a broken budget must not become an unlimited-spend hole; the app must not hard-crash. (Rate limits stay fail-open — they are abuse-throttles; budgets are money.)
- **D4.4 — Admin-settable caps:** `admin-set-limits` extended (constant-time admin token, §8) with `set_daily_cap(tier, tokens)`; every change writes an `ops_events` audit row (old/new, admin identity). **Numeric caps are NOT invented here** — D0.5 proposes evidence-based options from `ai_events` cost data for owner approval (decision #2).
- **D4.5 — Spend alerts:** 80% and 100% crossings write `ops_events`; owner notified when aggregate daily spend crosses an owner-set threshold. At 100%: localized "daily AI budget reached, resets at midnight" + fast-path-only mode until reset.
- **D4.6 — Tier hooks:** `tier` resolves from the billing/entitlement service when Stripe ships (decision #3); until then single tier `free`. Tier-keyed from day one so commercial quotas plug in without refactoring.

### 4.3 Acceptance criteria
- AC-4.1: User at cap → new AI call blocked with localized message; deterministic fast paths still respond.
- AC-4.2: Admin cap change effective on next request; audit row exists.
- AC-4.3: 80%/100% crossings emit alert events exactly once per user per day.
- AC-4.4: Budget-store outage → 503 on AI calls, fast paths unaffected (store stubbed to throw).

### 4.4 Automated verification
- Unit tests for `checkAiBudget` (window math + stubbed sums).
- Integration: seeded `ai_events` at 99% → allowed; at 100% → blocked; admin-set cap change reflected.
- CI static check: every AI-calling edge function imports the budget check.

### 4.5 Rollback plan
Budget check is a wrapper: rollback = revert edge-function deploys; `ai_budgets` table and `ai_events` accounting remain (harmless, additive).

---

## 5. Sensitive data storage & encryption

### 5.1 Threat
The vault is the highest-sensitivity surface. Crypto posture is undesigned: no at-rest story beyond Supabase defaults, no key-management design, PII/audio/photo retention rules implicit. Building vault crypto wrong is worse than not building it — hence a test-first gate.

### 5.2 Design
- **D5.1 — Vault crypto posture (test-first gate before any vault-crypto ADAPT):** no vault-crypto implementation until (a) a written threat model (stolen device, stolen DB dump, malicious admin, compelled disclosure), (b) a key-management design (per-user DEKs wrapped by a KEK; KEK storage — Supabase Vault vs external KMS — with owner approval), (c) published passing test vectors for encrypt/decrypt/rotate. Gate artifact: `VAULT_CRYPTO_GATE.md`; the D0.5 batch produces the gate, not the crypto.
- **D5.2 — PII handling rules:** enumerate PII fields (names, emails, phone numbers, device tokens, auth metadata). Rules: PII never in logs/`ops_events` payloads (ids only); never in error responses; included in export (user's own data); masked by default in admin/support views.
- **D5.3 — Audio retention:** keep the standing policy — voice audio deleted after transcription, `audio_url` nulled. Transcription failures must still delete audio in `finally`; CI test asserts no `audio_url` survives a completed transcribe call.
- **D5.4 — Photo retention:** item-photos retained while the owning note exists; note deletion moves the photo reference to trash with the note (30-day recovery, §6); purge of expired trash deletes the storage object too (server-side, service_role, audited).

### 5.3 Acceptance criteria
- AC-5.1: `VAULT_CRYPTO_GATE.md` exists with threat model + KEK decision + passing test vectors; no vault-crypto code merged before it.
- AC-5.2: Log-scanning CI check finds no PII patterns in `ops_events` write paths.
- AC-5.3: Transcribe failure-path test proves audio deletion still occurs.

### 5.4 Automated verification
- Crypto test vectors (post-gate). PII log-scan in CI (heuristic regex over edge-function source — documented as such). Transcribe `finally`-delete test.

### 5.5 Rollback plan
Retention-rule changes: revert deploys. Crypto gate: docs-only — supersede by amendment, never silently.

---

## 6. Safe deletion / trash / export / account recovery

### 6.1 Threat
Deletion is where durable-memory promises die: silent hard deletes (decision #1's three paths), premature purges, incomplete exports, account-delete cascades that under-delete (remnant) or over-delete (another user's shared data).

### 6.2 Design
- **D6.1 — 30-day trash (decision #6):** `trash_bin` rows carry `deleted_at`, `expires_at = deleted_at + 30 days` (`trash_retention_days` stays 30; the 30→0 flip is rejected). Restore recovers the row **and** its storage objects; idempotent.
- **D6.2 — Purge only expired trashed rows:** the purge job (decision #8 — design/test only) deletes where `expires_at < now()` AND re-verifies no live references (concurrent restore → skip). Audited per-row in `ops_events`. **Never** purges non-trashed rows; CI invariant test asserts the purge query's WHERE clause includes the trash+expiry predicates.
- **D6.3 — `forget_fact` redesign (decision #1):** exact normalized-text or `mkey`-scoped match; multi-match → confirm-listing instead of deleting; confirmed deletions route through trash/undo. (Full spec in `MEMORY_AND_AI_PRODUCT_SPEC.md` §5.)
- **D6.4 — Export format:** `account-export` produces versioned JSON (`export_version: 1`) — notes, items, facts, shopping lists, borrows, chat history (metadata), photo object paths (not signed URLs — re-minted on import); manifest with row counts + sha256 per section for completeness verification. Rate-limited, user-scoped.
- **D6.5 — Account-delete cascade verification:** pre-flight report (counts per table) → user confirms → transactional delete → post-flight verification asserts zero remaining user rows across all tables and zero storage objects under `<userId>/`. Shared-space rows owned by others untouched (membership removed, not the space). The verification query is a checked-in test.
- **D6.6 — Recovery flows:** trashed-item restore (30d); export-then-delete offered before account delete; no recovery after purge expiry or completed account delete — stated plainly in UI copy and the Privacy Policy.

### 6.3 Acceptance criteria
- AC-6.1: Delete → `trash_bin` row with 30-day expiry; restore within window recovers row + photo.
- AC-6.2: Purge dry-run on fixtures deletes only expired trashed rows; invariant test passes.
- AC-6.3: `forget_fact` ambiguous query deletes nothing, returns listing.
- AC-6.4: Export manifest counts match DB counts; scratch-account import round-trips.
- AC-6.5: Account-delete post-flight verification passes on a fixture account with shared-space data (other members' rows intact).

### 6.4 Automated verification
Trash lifecycle tests (delete → restore → expiry → purge) in CI. Purge WHERE-clause invariant test. Account-delete fixture test with post-flight zero-row assertion.

### 6.5 Rollback plan
Trash/expiry changes: down-migration + code revert. **Data-safety note:** rollback never resurrects already-purged rows — purges are irreversible by design; rollback covers behavior, not data recovery.

---

## 7. Approval / invitation race conditions

### 7.1 Threat
- **M4:** `toolExecuteAction` approval→execute is check-then-act — a destructive action could execute twice under concurrency (TOCTOU).
- **M5:** `join-family` reads `used_count`, compares to `max_uses`, then increments separately — concurrent joins can overshoot `max_uses`.
- **M6:** invite codes ~29.6 bits entropy, no rate limit on `join-family` — enumerable.

### 7.2 Design
- **D7.1 — M4 `SELECT FOR UPDATE`:** transaction: `SELECT … FOR UPDATE` the `pending_actions` row, verify `status='approved'` and `executed_at IS NULL`, perform the action, `UPDATE … SET status='executed', executed_at=now()`. Second executor blocks on the lock, then sees `executed` → idempotent "already executed". Unique partial index (`pending_actions WHERE status='executed'`) as defense-in-depth.
- **D7.2 — M5 atomic increment:** single statement — `UPDATE space_invites SET used_count = used_count + 1 WHERE id = $1 AND used_count < max_uses RETURNING …`; zero rows = exhausted (covers expiry and max-uses races).
- **D7.3 — M6 entropy + rate limit:** new codes ≥128 bits from CSPRNG, base62/url-safe (PROPOSED 22 chars ≈ 131 bits); old-code verification during a transition window, then reject short codes. `join-family` rate-limited (PROPOSED per-code 10/min, per-IP 30/min) with fail-open + alerting on sustained 429s (enumeration signal).

### 7.3 Acceptance criteria
- AC-7.1: 50 concurrent executes for one approved action → exactly one execution, 49 idempotent "already executed".
- AC-7.2: `max_uses = 1` invite + 20 concurrent joins → exactly one success.
- AC-7.3: New codes 22+ chars from CSPRNG; `join-family` 429s after per-code threshold.

### 7.4 Automated verification
Concurrency tests (Deno, `Promise.all` fan-out) for M4 and M5 against scratch DB — highest-value tests in this section, run in CI. Entropy test: 10k codes, uniqueness + charset; static check that `Math.random` is not used in invite generation.

### 7.5 Rollback plan
Function/migration-level: revert deploys; atomic-increment SQL backward-compatible (keep `RETURNING` shape stable). Code-length change forward-only for new codes; old codes verify during the transition window.

---

## 8. Secret handling, monitoring, incident response

### 8.1 Threat
- **M2 (CONFIRMED):** admin functions compare `x-admin-token` with `===` (non-constant-time) while `_shared/edge-auth.ts` has constant-time `isInternal` — leaks prefix information via timing.
- No secret rotation policy; undocumented blast radius for `INTERNAL_FN_SECRET` / `ADMIN_TOKEN` leaks.
- Monitoring ad-hoc: no Sentry, no uptime checks, no alert ownership — incidents detected by user reports.

### 8.2 Design
- **D8.1 — Constant-time admin compare (M2):** add `isAdmin(req)` to `_shared/edge-auth.ts` using the constant-time loop; replace all `===` comparisons in `admin-*` functions. CI lint: fail on `ADMIN_TOKEN` compared with `===`/`!==` outside `edge-auth.ts`.
- **D8.2 — Secret rotation policy:** rotate on (a) personnel change, (b) suspected leak, (c) every 180 days (scheduled). Procedure: new secret → dashboard + deploy → 24h dual-secret overlap (`*_PREVIOUS`) → revoke old → audit event. Owner-only rotation; secrets in Supabase dashboard, never in repo (gitleaks in CI stays).
- **D8.3 — Monitoring wiring:** Sentry (or owner-approved equivalent) in edge functions with PII scrubbing (§5.2); uptime checks on `public-config` + an authenticated synthetic `chat` health probe with a canary user; alert routing to the owner (channel: OPEN owner decision). `ops_events` is the internal audit log with documented monitoring ownership (owner or named on-call triages; the agent surfaces anomalies, never pages).
- **D8.4 — Incident runbook** (`docs/INCIDENT_RUNBOOK.md`): (1) Detection → severity (SEV-1 active breach / SEV-2 degraded / SEV-3 minor); (2) Containment — rotate secrets, revoke signed URLs/sessions, revert affected edge function, freeze invite creation if enumeration suspected; (3) Comms — user notification within 72h for personal-data breaches (Privacy Policy commitment), status note for degradations, Arabic + English; (4) Postmortem — blameless, within 7 days, regression tests linked to each action item.
- **D8.5 — `ops_events` ownership:** documented schema + retention rule (telemetry janitor, decision #8 — design/test only); scheduled weekly review scanning for anomaly patterns (fail-open episodes, 429 storms, budget crossings, revocation events).

### 8.3 Acceptance criteria
- AC-8.1: No `===` admin-token compare outside `edge-auth.ts` (CI lint); timing heuristic shows no early-exit correlation.
- AC-8.2: Rotation runbook drilled once on a scratch project; dual-secret overlap verified.
- AC-8.3: Sentry DSN in staging; test error scrubbed of PII.
- AC-8.4: `INCIDENT_RUNBOOK.md` exists with severity levels and comms templates.

### 8.4 Automated verification
CI lint for constant-time compare (grep-based). Rotation script generates ≥256-bit secrets (documented, not stored). Sentry scrubbing test: synthetic error with email/phone → scrubbed in captured event.

### 8.5 Rollback plan
`isAdmin` refactor: revert deploys. Monitoring: disable DSN env var (no code change). Runbook: docs-only — amend, never delete.

---

## 9. Verification & rollback matrix

| # | Remediation | CI proof | Rollback |
|---|---|---|---|
| 1.1 | photo_url server validation | unit tests + 403 integration test | revert edge-fn deploy |
| 1.2 | `can_read_photo` hardening | scratch-DB negative policy tests | down-migration (0029 text byte-identical, known-vulnerable) |
| 1.3 | signed URL lifecycle | mint/revoke integration test + audit-row assertion | env-var revert |
| 1.B | Claim B scratch repro | manual procedure, verdict recorded | n/a (evidence only) |
| 2.1–2.2 | route/classify JWT + rate limit | 401/429 tests + zero-`ai_events` assertion + grep guard | revert deploys (known-vulnerable) |
| 2.4 | error-path leak fix | provider-text absence test | revert deploys |
| 3.1 | revoked-access semantics | role-matrix tests; mint-after-revoke fails | revert call site (function inert) |
| 3.2 | RLS matrix (8 table families) | `rls-matrix` CI job on scratch DB | down-migrations per policy fix |
| 4.2–4.5 | AI daily budget + alerts | budget unit/integration tests; admin-cap audit test | revert deploys (tables additive) |
| 5.1 | vault crypto gate | gate doc + test vectors | docs: amend, never delete |
| 5.3 | audio delete-on-failure | transcribe failure-path test | revert deploy |
| 6.1–6.2 | 30-day trash + purge-only-expired | lifecycle tests; purge WHERE invariant | down-migration + revert (purges irreversible) |
| 6.3 | forget_fact confirm-listing | ambiguous-query deletes-nothing test | revert deploy |
| 6.4–6.5 | export + account-delete verification | manifest round-trip; post-flight zero-row test | revert deploys |
| 7.1 | approval SELECT FOR UPDATE | 50-way concurrency test → exactly-once | revert deploy |
| 7.2 | join-family atomic increment | 20-way race test → one success | revert deploy (SQL backward-compat) |
| 7.3 | invite entropy + rate limit | CSPRNG/charset tests; 429 test | forward-only new codes; transition window |
| 8.1 | constant-time admin compare | grep lint; timing heuristic | revert deploys |
| 8.2–8.5 | rotation, Sentry, runbook | drill on scratch; scrubbing test | disable DSN env; docs amend |

**Cross-cutting rules:** every batch follows implement → test → independent review → exact-head CI → Draft PR; no merges by the agent; Claim B is never presented as proven until the scratch repro verdict exists; numeric budget/quota values are proposed from `ai_events` evidence for owner approval, never invented (decision #2).

---

## Open questions for owner

1. **Signed-URL expiry duration** (PROPOSED 15 min; bound ≤1 h) — §1.3.
2. `route`/`classify`: JWT+rate-limit (recommended) vs route-behind-chat (§2.2).
3. `trash_bin` visibility: deleting-user-only vs space admins (§3.2).
4. Daily AI token cap numbers — evidence-based proposal from `ai_events` (decision #2).
5. Alert channel + on-call ownership for Sentry/uptime (§8.2–8.3).
6. KEK storage for vault crypto: Supabase Vault vs external KMS (§5.2).
