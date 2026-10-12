# D0.5 Workstream 04 — Security & Privacy Remediation Design

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Workstream:** Security & privacy (D0.5 workstream 4)
**Inputs:** `docs/autonomous/d0/D0_TO_D05_HANDOFF.md` (9 APPROVED decisions), `docs/autonomous/d0/SECURITY_AND_PRIVACY_FINDINGS.md`, `docs/autonomous/d0/MEMORY_RETENTION_AUDIT.md`

**Authority:** This is a **design-only** document. No application-code changes are made or authorized here. All remediations are specified with threat, design, acceptance criteria, automated verification, and rollback plan so a governed batch (implement → test → independent review → exact-head CI → Draft PR) can execute them later.

**Standing rules carried forward:** never merge (owner merges), Draft PRs only, no prod DB changes without owner approval, tokens transient-only, each batch returns mergeable at an exact SHA.

**On the photo finding — evidence posture (read before acting):**
- **Claim A [CONFIRMED, HIGH]:** the code defect is code-evident — `supabase/functions/chat/index.ts:836-839` accepts any client-supplied `photo_url` passing only `startsWith('https://')`; `supabase/migrations/0029_private_storage.sql:55-72` (`can_read_photo`) grants SELECT on `item-photos` when *any* note the caller can access references the path (`like '%/item-photos/' || p_name`), bypassing the owner-folder check in the OR branch. The 0029 P0-6 storage hardening is therefore bypassable through the chat `photo_url` path.
- **Claim B [MEDIUM, UNVERIFIED]:** an actual end-to-end exploit (attacker obtaining a working signed URL for a victim's photo in practice) is **not proven** and must **never** be described as proven until a scratch-project repro exists (victim uploads → attacker references URL from own note → signed URL succeeds). Remediation designs below do not depend on Claim B being true; they fix Claim A.

---

## 1. Photo access escalation — H1 remediation

### 1.1. Threat
An authenticated user (A) can attach a photo URL pointing at another user's (B) private photo (e.g. copied from a family-shared note's rendered image URL) in a `chat` request. Two compounding gaps: (a) the function accepts any `https://` URL as `photo_url`, so attacker-controlled URLs reach the vision path and URL-signing logic; (b) `can_read_photo`'s second OR branch lets a signed/read grant succeed when *any* accessible note references the object path — the note does not have to be the caller's own and the caller does not need to own the object. Net effect (code-evident, Claim A): read access to photos outside the caller's own folder can be obtained without being the owner, breaking the 0029 P0-6 hardening. Claim B (a working exploit chain) stays MEDIUM until a scratch repro proves it.

### 1.2. Design

**D1.1 — Server-side photo_url validation (chat, transcribe, extract, ask — any fn accepting a photo reference).**
- Define a single canonical helper in `_shared/photos.ts`: `validatePhotoUrl(raw: string | null, userId: string, supa) → { bucket, objectPath } | null`.
- Rule set:
  1. Reject anything that is not a `https://<project-ref>.supabase.co/storage/v1/object/sign/item-photos/...` signed-URL form or a bare object path. Decide ONE canonical internal representation and normalize everything to it (recommendation: **store object path only**, derive signed URLs server-side at read time).
  2. The object path's first folder segment must equal the authenticated `userId` (`foldername(name)[1] = auth.uid()`). This is the same invariant the 0029 policy enforces; mirror it in application code so a defect in one layer doesn't silently reopen the hole.
  3. Maximum length 500 chars, URL-decode once (reject double-encoded `..`, `%2f` tricks), reject `..` segments and absolute paths.
- All existing rows with non-conforming `photo_url` values are treated as `null` at read time (never rewritten in the remediation batch — see decision #1 durable-memory rule; a separate migration with owner approval handles normalization).

**D1.2 — `can_read_photo` hardening (migration 003x).**
- Change the second OR branch so a note-reference grant requires BOTH: the note is accessible to the caller **and** the note's `user_id` (owner) equals the caller's uid OR the note's `space_id` is a space the caller is a current member of **and the object path's first segment equals the note owner's id** — i.e. the path is still namespaced to the owner even when shared through a note. Remove the bare `like '%/item-photos/' || p_name` fallback that bypasses owner-prefix.
- Add a negative policy test: an attacker note referencing `/item-photos/<victim>/photo.jpg` must NOT satisfy the policy (proving the fix at the SQL layer).
- Keep `SECURITY DEFINER` but audit: `revoke all … from public, anon` stays; `grant execute … to authenticated` stays.

**D1.3 — Signed URL lifecycle.**
- Signed URLs for `item-photos` are minted **server-side only** (never from client-supplied paths) with short expiry (design parameter for owner approval; propose 15 min based on the current de-facto expiry in the mobile client, not longer than 1 h).
- Add rotation: each new signed URL request for the same object invalidates prior outstanding URLs where feasible (track mint events in `ops_events`; at minimum log `photo_sign` events for audit).
- **Revocation on family removal:** when a user is removed from a space (or leaves), any signed URLs minted for objects they could previously read must stop working. Design: (a) stop minting new URLs immediately (membership check at mint time); (b) for in-flight URLs, shorten expiry so the maximum exposure window is the expiry duration; (c) add a `space_members` revocation trigger that writes a `photo_access_revoked` event and (where the storage API supports it) deletes outstanding signed tokens. Document residual risk: URLs already issued remain valid until expiry — this is the accepted trade-off, disclosed in the Privacy Policy.

### 1.3. Acceptance criteria
- AC-1.1: `chat` with `photo_url` pointing outside `<userId>/` returns 403/validation error; never reaches the vision model or URL signing.
- AC-1.2: `photo_url` with `..`, double-encoding, or non-HTTPS scheme rejected.
- AC-1.3: Direct SQL test — `can_read_photo('item-photos', '<other>/x.jpg')` returns false for a caller whose only link is a note reference to that path.
- AC-1.4: Family member removed from a space can no longer mint signed URLs for that space's shared photos within one request cycle; audit event written.
- AC-1.5: Scratch-project repro documented: either confirms Claim B (→ escalate to CRITICAL) or shows it blocked at the policy layer (→ downgrade Claim B to LOW). **The repro verdict is recorded in the findings file; the remediation above ships regardless.**

### 1.4. Automated verification
- Unit tests for `_shared/photos.ts`: owner-prefix accept, cross-user reject, traversal reject, scheme reject, length cap (add to `deno test` suite in CI).
- New SQL migration test (runs in CI against a scratch Postgres): policy negative tests per §1.2.
- Edge-function integration test: attacker chat request with victim photo URL → 403, plus `ops_events` audit row present.
- Claim B scratch repro: manual one-time procedure documented in the findings file (not CI — requires a scratch Supabase project).

### 1.5. Rollback plan
- Application code (D1.1): revert the edge-function deploy; prior deploy is retained by the Supabase dashboard (keep last-known-good version id in the release notes).
- Migration 003x (D1.2): provide a down-migration restoring the 0029 policy text byte-identical (stored in the migration file header); verify with the same negative tests inverted (they must fail-open only in the rolled-back state, documented as known-vulnerable).
- Signed-URL expiry parameter: config/env change only — revert the env var.

---

## 2. Public route/classify gating — M1 remediation

### 2.1. Threat
`supabase/functions/route/index.ts` and `supabase/functions/classify/index.ts` run with **no auth check** — confirmed in D0 (no `authUserId`/JWT verification in either entrypoint) — while being client-invoked (`packages/voice-engine/src/client.ts:355,476`), contradicting the static "not invoked by client" tripwire comment. Impact: anyone holding the shipped anon key can burn Groq/OpenAI quota at will (cost attack), and the error path returns raw provider text to unauthenticated callers (information leak: provider error strings can disclose model/version details).

### 2.2. Design
- **D2.1 — JWT requirement.** Add `authUserId(req)` (from `_shared/edge-auth.ts`) at the top of both functions; return `json401()` when null. Remove the false tripwire comment and replace with an accurate one ("client-invoked; JWT required; rate-limited").
- **D2.2 — Per-user rate limiting.** Wire `checkRateLimit(supa, userId, 'route' | 'classify', …)` from `_shared/rate-limit.ts` with tight rules (propose `route: { perMinute: 30, perHour: 300 }`, `classify: { perMinute: 30, perHour: 300 }` — these are cheap deterministic-first paths; the deterministic Layer-1 rules resolve most calls before the model). Fail-open semantics stay (telemetry outage must not take chat offline) but log `rate_limit_store_error` to `ops_events` so fail-open episodes are visible.
- **D2.3 — Alternative (if owner prefers fewer edge functions): route behind `chat`.** Expose route/classify as internal-only (`isInternal(req)` gate) and have `chat` call them service-to-service with `internalHeaders()`. This removes two public surfaces entirely. Trade-off: adds latency hop; client code changes needed. Default recommendation: D2.1 + D2.2 (smaller blast radius), with D2.3 as the documented follow-up.
- **D2.4 — Error-path provider-text leak fix.** Catch provider errors and return a generic localized message; log the raw provider text server-side only (`ops_events`, never the response body). Apply the same pattern to `ask`, `extract`, `transcribe` error paths in the same batch (shared helper `_shared/safeError.ts`).

### 2.3. Acceptance criteria
- AC-2.1: Unauthenticated request to `route`/`classify` → 401, zero provider calls (assert via mocked/no-network test or spend accounting: no new `ai_events` row).
- AC-2.2: Authenticated user exceeding the per-minute rule → 429 with localized message; counters recover next window.
- AC-2.3: Provider-error simulation → response body contains no provider-identifying text; raw text present in server logs only.

### 2.4. Automated verification
- Edge-function unit tests with stubbed JWT validation: 401 path, 429 path, success path.
- `ai_events` accounting test: unauthenticated call inserts zero rows.
- Static check: `grep` in CI fails if `route/index.ts` or `classify/index.ts` lacks the `authUserId` call (regression guard against re-introduction of the open endpoint).

### 2.5. Rollback plan
- Revert the two function deploys to the prior version (last-known-good recorded). Client impact of rollback: endpoints become open again — documented as known-vulnerable; re-deploy the fix forward rather than lingering rolled back.

---

## 3. Auth/RLS/family isolation — revoked-access semantics + RLS gap closure

### 3.1. Threat
Family spaces are the trust core ("family pillar"). Two gaps: (a) **revoked-access semantics are unspecified** — when a member is removed, it is unclear which cached/signed grants stop working and when; (b) D0's RLS audit was static only for `borrows`, `shopping_lists`, `space_tabs`, `profiles`-peers, `chat_sessions`, `device_tokens`, `trash_bin`, and `vault` tables — behavioral semantics (including ex-member access) are UNTESTED.

### 3.2. Design

**D3.1 — Revoked-access semantics (spec, then tests).** On `space_members` DELETE (removal) or member-initiated leave:
1. **Immediate:** RLS denies all new reads/writes (already true by policy design — verify per table in tests). No new signed photo URLs may be minted (membership check at mint).
2. **Within signed-URL expiry window:** in-flight photo URLs remain valid until expiry (documented residual risk, §1.2-D1.3).
3. **Cache invalidation:** the mobile client's offline read cache (§P1-9 in handoff) must drop the departed space's cached rows on the next sync; server sends a `membership_revoked` push/sync signal via `notify`. Client cache rows are keyed by `space_id` so a single delete-by-key works.
4. **What breaks (accepted):** the ex-member's local unsynced drafts for that space are discarded with a one-time notice; their *own* private-space data is untouched; audit rows (`ops_events`) are retained (security-relevant, non-user-deletable).
5. Write the revocation flow as a documented sequence in the migration + a server function `revoke_space_access(space_id, user_id)` called from `family-members` remove path, emitting `space_access_revoked` to `ops_events`.

**D3.2 — RLS behavioral tests per table** (`borrows`, `shopping_lists`, `space_tabs`, `profiles` peer reads, `chat_sessions`, `device_tokens`, `trash_bin`, `vault`):
- For each table, a test matrix run as three roles (owner, current member, ex-member/outsider) asserting SELECT/INSERT/UPDATE/DELETE outcomes against the *deployed* policy set. Tests live in the repo and run in CI against a scratch database seeded by the migrations.
- Specific assertions: ex-member gets zero rows from `borrows`/`shopping_lists`/`chat_sessions`; `device_tokens` rows are owner-only (no cross-user token reads — push-targeting stays server-side); `trash_bin` rows visible only to the deleting user (or space admins where the design says so — decide and document); `vault` tables enforce vault-membership + `vault_id` scoping.
- Any table that fails gets a policy-fix migration in the same batch.

### 3.3. Acceptance criteria
- AC-3.1: Ex-member role receives zero rows / 403 on all 8 table families in the test matrix.
- AC-3.2: `revoke_space_access` emits an audit event and subsequent mint attempts fail.
- AC-3.3: Client cache-invalidation signal design documented (payload shape, keying); implementation deferred to the offline-cache batch with this spec as its contract.

### 3.4. Automated verification
- CI job `rls-matrix`: spins scratch Postgres, applies migrations, runs the role matrix; fails on any unexpected grant.
- Negative test for `device_tokens`: user A cannot read user B's token row.

### 3.5. Rollback plan
- Policy-fix migrations ship with down-migrations restoring prior policy text (stored byte-identical in the file). `revoke_space_access` is additive (new function + call site) — rollback = revert the call site; the function remaining is inert.

---

## 4. AI cost quotas + abuse prevention — per-user daily AI token budget

### 4.1. Threat
AI spend is unbounded per user: rate limits are per-minute/per-hour and fail-open, with no daily budget. A compromised token or abusive user can accumulate large Groq/OpenAI bills; there is no admin-settable cap, no spend alerting, and no per-tier differentiation hooks for the future Free/Plus model (workstream 5 quotas).

### 4.2. Design
- **D4.1 — Accounting already exists:** `ai_events` rows are written per AI call (verify columns: user_id, function, tokens, cost). The budget design consumes this table — no new write path.
- **D4.2 — Daily budget check:** new `_shared/ai-budget.ts` with `checkAiBudget(supa, userId, tier) → { allowed, remainingTokens, resetsAt }`. Sums today's tokens from `ai_events`; compares against a cap resolved from an `ai_budgets` config table (columns: `tier`, `daily_token_cap`, `updated_at`, `updated_by`). Enforced in `chat`, `ask`, `extract`, `transcribe`, `memory-learn` before the provider call.
- **D4.3 — Fail-closed vs fail-open:** budget store unreadable → **fail-closed for new AI calls** (return 503 + localized "try later") EXCEPT the deterministic/fast paths (`route` Layer-1, cached answers) which stay up. Rationale: a broken budget must not become an unlimited-spend hole; but the app must not hard-crash. This differs deliberately from rate-limit fail-open (rate limits are abuse-throttles; budgets are money).
- **D4.4 — Admin-settable caps:** `admin-set-limits` function extended (constant-time admin token, §8) with `set_daily_cap(tier, tokens)`; every change writes an `ops_events` audit row with old/new values and admin identity. Numeric caps are **not invented here** — D0.5 proposes evidence-based options from `ai_events` cost data for owner approval (per decision #2).
- **D4.5 — Spend alerts:** when a user crosses 80% and 100% of daily budget, write `ops_events` rows; a lightweight alerting hook (Sentry/uptime per §8, or admin-broadcast) notifies the owner when aggregate daily spend crosses an owner-set threshold. Per-user 100% response: localized "daily AI budget reached, resets at midnight" message + fast-path-only mode until reset.
- **D4.6 — Tier hooks:** `tier` resolves from the billing/entitlement service when Stripe ships (decision #3); until then, single tier `free` with the owner-approved cap. The interface is tier-keyed from day one so workstream 5's quota design plugs in without refactoring.

### 4.3. Acceptance criteria
- AC-4.1: User at cap → new AI call blocked with localized message; deterministic fast paths still respond.
- AC-4.2: Admin cap change takes effect on the next request; audit row exists.
- AC-4.3: 80%/100% crossings emit alert events exactly once per day per user.
- AC-4.4: Budget-store outage → 503 on AI calls, fast paths unaffected (tested with store stubbed to throw).

### 4.4. Automated verification
- Unit tests for `checkAiBudget` (pure window math + stubbed sums).
- Integration tests: seeded `ai_events` at 99% → allowed; at 100% → blocked; admin-set cap change reflected.
- CI static check: every AI-calling edge function imports the budget check (regression guard).

### 4.5. Rollback plan
- Budget check is a wrapper: rollback = revert the edge-function deploys; `ai_budgets` table and `ai_events` accounting remain (harmless, additive).

---

## 5. Sensitive data storage & encryption

### 5.1. Threat
The vault is the highest-sensitivity surface (secret photos/files, "ask your vault" AI). Crypto posture is currently undesigned: no documented at-rest story beyond Supabase defaults, no key-management design, and PII/audio/photo retention rules are implicit. Building vault crypto wrong is worse than not building it — hence a test-first gate.

### 5.2. Design
- **D5.1 — Vault crypto posture (test-first gate before any vault-crypto ADAPT):** no vault-crypto implementation until (a) a written threat model (attacker capabilities: stolen device, stolen DB dump, malicious admin, compelled disclosure), (b) a key-management design (per-user data-encryption keys wrapped by a KEK; KEK storage decision — Supabase Vault vs external KMS — with owner approval), (c) test vectors for encrypt/decrypt/rotate published and passing. The gate artifact is a short `VAULT_CRYPTO_GATE.md`; the D0.5 batch produces the gate, not the crypto.
- **D5.2 — PII handling rules:** enumerate PII fields (names, emails, phone numbers in profiles/invites, device tokens, auth metadata). Rules: PII never in logs/`ops_events` payloads (ids only); PII never in error responses; export includes PII (it's the user's own data); support/admin views show masked PII by default.
- **D5.3 — Audio retention:** keep the standing policy — voice audio deleted after transcription, `audio_url` nulled (best-effort), photos kept. Add: transcription failures must still delete the audio (delete in `finally`); a CI test asserts no `audio_url` survives a completed transcribe call.
- **D5.4 — Photo retention:** item-photos retained while the owning note exists; note deletion moves the photo reference to trash with the note (30-day recovery, §6); purge of expired trash deletes the storage object too (server-side, service_role, audited).

### 5.3. Acceptance criteria
- AC-5.1: `VAULT_CRYPTO_GATE.md` exists with threat model + KEK decision + passing test vectors; no vault-crypto code merged before it.
- AC-5.2: Log-scanning CI check finds no PII patterns (emails, phone regex) in `ops_events` write paths.
- AC-5.3: Transcribe failure-path test proves audio deletion still occurs.

### 5.4. Automated verification
- Crypto test vectors (once implemented post-gate).
- PII log-scan in CI (regex over edge-function source for `console.log` of PII-carrying variables — heuristic, documented as such).
- Transcribe `finally`-delete test.

### 5.5. Rollback plan
- Retention-rule changes are code-level: revert deploys. The crypto gate is docs-only: supersede by amendment, never silently.

---

## 6. Safe deletion / trash / export / account recovery

### 6.1. Threat
Deletion is where durable-memory promises die: silent hard deletes (decision #1: `pruneFacts`, `memory-consolidate` decay, `forget_fact` over-deletion), premature purges, incomplete exports, and account-delete cascades that either under-delete (data remnant) or over-delete (takes another user's shared data).

### 6.2. Design
- **D6.1 — 30-day trash (decision #6):** `trash_bin` rows carry `deleted_at`, `expires_at = deleted_at + 30 days` (`trash_retention_days` stays 30; the 30→0 launch flip is rejected). Restore restores the row **and** its storage objects; restore is idempotent.
- **D6.2 — Purge only expired trashed rows:** the purge job (janitor, decision #8 — design/test only in D0.5) deletes rows where `expires_at < now()` AND re-verifies no live references exist (note restored concurrently → skip). Purge is audited per-row in `ops_events`. **Never** purges non-trashed rows; a CI invariant test asserts the purge query's WHERE clause includes the trash+expiry predicates.
- **D6.3 — `forget_fact` redesign (decision #1c):** exact normalized-text or `mkey`-scoped match; multi-match → return a confirm-listing to the user ("I found 3 memories matching X — which one?") instead of deleting; confirmed deletions route through trash/undo.
- **D6.4 — Export format:** `account-export` produces a single versioned JSON (`export_version: 1`) containing notes, items, facts, shopping lists, borrows, chat history (metadata), and photo object paths (not signed URLs — re-minted on import); includes a manifest with row counts + sha256 per section so the user can verify completeness. Rate-limited (already in `OP_LIMITS`), user-scoped.
- **D6.5 — Account-delete cascade verification:** `account-delete` runs a pre-flight report (counts per table) → user confirms → delete runs in a transaction → post-flight verification query asserts zero remaining user rows across all 27+ tables and zero storage objects under `<userId>/`. Shared-space rows owned by others are untouched (space membership removed, not the space). The verification query is a checked-in test, not just a runbook step.
- **D6.6 — Recovery flows:** trashed-item restore (30 d); export-then-delete ("download my data" before account delete, offered in the confirmation screen); no recovery after purge expiry or completed account delete — stated plainly in UI copy and the Privacy Policy.

### 6.3. Acceptance criteria
- AC-6.1: Delete → row in `trash_bin` with 30-day expiry; restore within window recovers row + photo.
- AC-6.2: Purge job dry-run on fixtures deletes only expired trashed rows; invariant test passes.
- AC-6.3: `forget_fact` with ambiguous query deletes nothing and returns a listing.
- AC-6.4: Export manifest counts match DB counts; import of the export into a scratch account round-trips.
- AC-6.5: Account-delete post-flight verification passes on a fixture account with shared-space data (other members' rows intact).

### 6.4. Automated verification
- Trash lifecycle tests (delete → restore → expiry → purge) in CI.
- Purge WHERE-clause invariant test.
- Account-delete fixture test with the post-flight zero-row assertion.

### 6.5. Rollback plan
- Trash/expiry changes are migration + code: down-migration restores prior columns; code revert restores prior behavior. **Data-safety note:** rollback never resurrects already-purged rows — purges are irreversible by design; the rollback plan covers behavior, not data recovery.

---

## 7. Approval/invitation race conditions — M4, M5, M6

### 7.1. Threat
- **M4:** `toolExecuteAction` approval→execute is check-then-act: a destructive action approved once could be executed twice (double-spend of a real-world action) under concurrent requests (TOCTOU).
- **M5:** `join-family` reads `used_count`, compares to `max_uses`, then increments in a separate statement (`join-family/index.ts:55,95`) — concurrent joins can overshoot `max_uses`.
- **M6:** invite codes carry ~29.6 bits of entropy with no rate limit on `join-family` — enumerable/brute-forceable.

### 7.2. Design
- **D7.1 — M4 `SELECT FOR UPDATE`:** wrap approval→execute in a transaction: `SELECT … FOR UPDATE` the `pending_actions` row, verify `status = 'approved'` and a single-use `executed_at IS NULL`, perform the action, then `UPDATE … SET status='executed', executed_at=now()`. Second concurrent executor blocks on the row lock, then sees `executed` and returns idempotent "already executed". Add a unique partial index (`pending_actions`, `WHERE status='executed'`) as defense-in-depth where the schema allows.
- **D7.2 — M5 atomic increment:** replace read-compare-update with a single atomic statement: `UPDATE space_invites SET used_count = used_count + 1 WHERE id = $1 AND used_count < max_uses RETURNING …` — zero rows returned means exhausted (covers both expiry and max-uses races). Alternatively `SELECT … FOR UPDATE` in a transaction; prefer the single-statement form (no lock-holding across network).
- **D7.3 — M6 entropy + rate limit:** new invite codes use ≥128 bits from a CSPRNG, encoded base62/url-safe (propose 22 chars ≈ 131 bits); keep old-code verification path during a transition window, then reject short codes. Add `join-family` to `OP_LIMITS`-style rate limiting (propose per-IP + per-code: 10 attempts/min per code, 30/min per IP) with fail-open + alerting on sustained 429s (enumeration signal).

### 7.3. Acceptance criteria
- AC-7.1: 50 concurrent execute calls for one approved action → exactly one execution, 49 idempotent "already executed".
- AC-7.2: `max_uses = 1` invite + 20 concurrent joins → exactly one success.
- AC-7.3: New codes are 22+ chars from CSPRNG; `join-family` 429s after the per-code threshold.

### 7.4. Automated verification
- Concurrency tests (Deno test with `Promise.all` fan-out) for M4 and M5 against a scratch DB — these are the highest-value tests in this section; run them in CI.
- Entropy test: 10k generated codes, uniqueness + charset assertions; static check that `Math.random` is not used in invite generation.

### 7.5. Rollback plan
- All three are function/migration-level: revert deploys; the atomic-increment SQL is backward-compatible with the old two-statement client logic (keep the `RETURNING` shape stable). Invite-code length change is forward-only for new codes; old codes keep verifying during the transition window.

---

## 8. Secret handling, monitoring, incident response — M2 + ops

### 8.1. Threat
- **M2 (CONFIRMED):** admin functions compare `x-admin-token` with `===` (non-constant-time) while `_shared/edge-auth.ts` already has a constant-time `isInternal` — inconsistent, leaks prefix information via timing.
- Secrets have no rotation policy; no documented blast radius if `INTERNAL_FN_SECRET` or `ADMIN_TOKEN` leaks.
- Monitoring is ad-hoc: no Sentry, no uptime checks, no alert ownership — incidents would be detected by the user reporting them.

### 8.2. Design
- **D8.1 — Constant-time admin token compare (M2):** add `isAdmin(req)` to `_shared/edge-auth.ts` using the same constant-time loop as `isInternal`; replace all `===` comparisons in `admin-*` functions (confirmed sites: `admin-ai-governance:88`, `admin-broadcast:42`, `admin-catalog:38`, `admin-set-limits:38` — sweep for others). CI lint: fail on `ADMIN_TOKEN` compared with `===`/`!==` outside `edge-auth.ts`.
- **D8.2 — Secret rotation policy:** `ADMIN_TOKEN` and `INTERNAL_FN_SECRET` rotate on (a) personnel change, (b) any suspected leak, (c) scheduled every 180 days. Rotation procedure: generate new secret → set in Supabase dashboard + deploy → overlap window 24 h where both old and new are accepted (dual-secret env `*_PREVIOUS` for internal secret; admin token: brief maintenance notice) → revoke old → audit event. Document who can rotate (owner only) and where secrets live (Supabase dashboard; never in repo — gitleaks in CI stays).
- **D8.3 — Monitoring wiring:** Sentry (or owner-approved equivalent) in edge functions with PII scrubbing (reuse §5.2 rules); uptime checks on `public-config` (cheap, unauthenticated) + one authenticated synthetic (`chat` health probe with a canary user); alert routing to the owner (channel TBD — owner decision). `ops_events` is the internal audit log; define **monitoring ownership**: the owner (or a named on-call) triages alerts; the agent surfaces anomalies in the Feed but never pages anyone.
- **D8.4 — Incident runbook** (checked in as `docs/INCIDENT_RUNBOOK.md`):
  1. **Detection:** alert sources (Sentry, uptime, spend anomaly, user report) → severity assignment (SEV-1: active data breach / SEV-2: degraded / SEV-3: minor).
  2. **Containment:** rotate exposed secrets (D8.2), revoke signed URLs / sessions, disable affected edge function via deploy revert, freeze invite creation if enumeration suspected.
  3. **Comms:** user notification within 72 h for personal-data breaches (Privacy Policy commitment); status note for degradations; Arabic + English.
  4. **Postmortem:** blameless, filed within 7 days, with regression tests linked to each action item.
- **D8.5 — `ops_events` monitoring ownership:** `ops_events` gets a documented schema and retention rule (telemetry janitor, decision #8 — design/test only); a scheduled review (weekly, owner or agent-assisted) scans for anomaly patterns (fail-open episodes, 429 storms, budget crossings, revocation events).

### 8.3. Acceptance criteria
- AC-8.1: No `===` admin-token compare outside `edge-auth.ts` (CI lint passes); timing test shows no early-exit correlation (documented heuristic test).
- AC-8.2: Rotation runbook executed once as a drill on a scratch project; dual-secret overlap verified.
- AC-8.3: Sentry DSN present in staging; test error appears scrubbed of PII.
- AC-8.4: `INCIDENT_RUNBOOK.md` exists with named severity levels and comms templates.

### 8.4. Automated verification
- CI lint for constant-time compare (grep-based).
- Secret-strength test: rotation script generates ≥256-bit secrets (documented, not stored).
- Sentry scrubbing test: synthetic error with email/phone in payload → scrubbed in the captured event.

### 8.5. Rollback plan
- `isAdmin` refactor: revert deploys. Monitoring: disable DSN env var (no code change needed). Runbook: docs-only, amend don't delete.

---

## 9. Verification & rollback matrix

Each remediation lists **how CI proves it** and **how to roll back**. Summary:

| # | Remediation | CI proof | Rollback |
|---|---|---|---|
| 1.1 | photo_url server validation | unit tests (traversal/scheme/owner-prefix) + 403 integration test | revert edge-fn deploy |
| 1.2 | `can_read_photo` hardening | scratch-DB negative policy tests | down-migration (0029 text byte-identical, known-vulnerable) |
| 1.3 | signed URL lifecycle | mint/revoke integration test + audit-row assertion | env-var revert |
| 1.B | Claim B scratch repro | manual procedure, verdict recorded | n/a (evidence only) |
| 2.1–2.2 | route/classify JWT + rate limit | 401/429 tests + zero-`ai_events` assertion + grep regression guard | revert deploys (known-vulnerable) |
| 2.4 | error-path leak fix | provider-text absence test | revert deploys |
| 3.1 | revoked-access semantics | role-matrix tests; mint-after-revoke fails | revert call site (function inert) |
| 3.2 | RLS matrix (8 table families) | `rls-matrix` CI job on scratch DB | down-migrations per policy fix |
| 4.2–4.5 | AI daily budget + alerts | budget unit/integration tests; admin-cap audit test | revert deploys (tables additive) |
| 5.1 | vault crypto gate | gate doc exists; test vectors pass | docs: amend, never delete |
| 5.3 | audio delete-on-failure | transcribe failure-path test | revert deploy |
| 6.1–6.2 | 30-day trash + purge-only-expired | lifecycle tests; purge WHERE-clause invariant | down-migration + revert (purges irreversible) |
| 6.3 | forget_fact confirm-listing | ambiguous-query deletes-nothing test | revert deploy |
| 6.4–6.5 | export + account-delete verification | manifest round-trip; post-flight zero-row test | revert deploys |
| 7.1 | approval SELECT FOR UPDATE | 50-way concurrency test → exactly-once | revert deploy |
| 7.2 | join-family atomic increment | 20-way race test → one success | revert deploy (SQL backward-compat) |
| 7.3 | invite entropy + rate limit | CSPRNG/charset tests; 429 test | forward-only new codes; transition window |
| 8.1 | constant-time admin compare | grep lint; timing heuristic | revert deploys |
| 8.2–8.5 | rotation, Sentry, runbook | drill on scratch; scrubbing test | disable DSN env; docs amend |

**Cross-cutting rules:** every batch follows implement → test → independent review → exact-head CI → Draft PR; no merges by the agent; Claim B is never presented as proven until the scratch repro verdict exists; numeric budget/quota values are proposed from `ai_events` evidence for owner approval, never invented (decision #2).

---

## Open questions for owner (D0.5 planning, not blocking design)

1. Signed-URL expiry duration (proposed: 15 min; bound: ≤1 h) — §1.3.
2. `route`/`classify`: JWT+rate-limit (recommended) vs route-behind-chat (D2.3) — §2.2.
3. `trash_bin` visibility for space admins vs deleting-user-only — §3.2.
4. Daily AI token cap numbers — evidence-based proposal from `ai_events` in the quotas workstream (workstream 5), decision #2.
5. Alert channel + on-call ownership for Sentry/uptime — §8.2–8.3.
6. KEK storage decision for vault crypto (Supabase Vault vs external KMS) — §5.2.
