# D0.5 Workstream 3 — Memory & AI

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec` @ `8be1f8e`
**Mission:** design-only redesign of the memory contract and AI pipeline
**Owner decisions applied:** #1 (durable memories — no auto-deletion by age/downgrade/quota), #2 (quotas designed not invented — options only, never final), #7 (no destructive consolidation), #8 (indexes/janitors design only), #9 (ai-provider-core conditional)
**Constraints:** READ-ONLY on code · WRITE-ONLY to this document · no app code changes

**D0 inputs:** `docs/autonomous/d0/MEMORY_RETENTION_AUDIT.md` (the CRITICAL findings being redesigned here), `docs/autonomous/d0/D0_TO_D05_HANDOFF.md` (the 9 approved decisions), `docs/autonomous/d0/FEATURE_STATUS_MATRIX.md`.

**Terminology:** a *saved memory* = a row in `items` with `kind = 'memory'` (`status` may be `open`, `done`, or `trashed`). A *chat transcript* = rows in `chat_sessions`/`chat_messages`. These are different data with different retention rules (see §10).

---

## 1. Durable memory product contract

**The promise (owner decision #1, approved 2026-10-12):**

> Once a memory is saved — by chat, by voice-note learning, by explicit "remember this" — it stays until the user personally deletes it. Mawjood never auto-deletes saved memories because of age, plan downgrade, or quota overflow.

**What "durable" means, in product terms:**

1. **Free and Plus are identical on durability.** Tier affects how much you can *create*, never what happens to what you already *created*. A saved memory is saved — full stop.
2. **Age is never a deletion trigger.** A memory untouched for 90 days, a year, or five years is still there. Time may change how prominently it is *surfaced* (see §3, importance re-scoring), but never whether it *exists*.
3. **Downgrade Plus → Free preserves everything.** Decision #1 explicitly requires this; the audit already confirmed no FK cascade path from billing tables to memory data. The design must not add one.
4. **Quota overflow blocks creation, never deletes.** When a user hits a creation limit (see §4), the save is refused with a clear message and an upgrade/manage path. The system never prunes old memories to make room for new ones.
5. **Deletion happens through exactly four doors, all user-initiated:**
   - the user deletes a specific memory (UI or "forget X" via chat);
   - the user confirms a merge/cleanup in a review queue (see §6);
   - the user deletes their whole account (`account-delete` → full CASCADE wipe);
   - the 30-day trash auto-purge, which only touches items the user already put in trash (decision #6).
6. **Every delete goes through trash first (except account delete).** 30-day undo window, decision #6. Deletion is never instant from the memory store.
7. **System jobs may update metadata (importance, dedupe flags, search vectors) — never delete rows.** Maintenance is non-destructive by design (decision #7).

**What can NEVER delete a saved memory (explicit prohibition list):**

| Trigger | Permitted to delete? |
|---|---|
| Memory untouched for N days | ❌ Never |
| Plan downgrade Plus → Free | ❌ Never |
| Exceeding a memory quota/cap | ❌ Never (block new saves instead) |
| Scheduled consolidation/cron job | ❌ Never (surface candidates only, see §6) |
| Low importance score | ❌ Never (score affects ranking only) |
| Duplicate detection | ❌ Never automatically — user confirms the merge |
| Chat transcript sweep (7-day) | ❌ Never touches `items kind='memory'` (verified separate tables) |
| Telemetry retention janitor | ❌ Never (`rate_limits`, `ai_events`, `ops_events` only — decision #8) |
| Account deactivation (if designed) | ❌ Must NOT — only full user-requested account *delete* cascades |
| Space-member removal | ❌ Never (churn-safe, audit-verified) |

**Migration note:** the current code violates this contract in three paths (decay in `memory-consolidate/index.ts:128-155`, `pruneFacts` in `_shared/memory.ts:221-237`, `forget_fact` over-deletion in `chat/index.ts:329-343`). §§3–5 redesign each. The contract is only claimable in product copy *after* those redesigns land and pass the tests in §11.

---

## 2. Memory management UX

Saved memories currently live in the private space and are only reachable through chat tools (`list_memories` returns the first 50 as text lines) — there is no dedicated memory screen. The design target: memories as first-class, browsable, manageable objects.

### 2.1 View & browse
- **Memories screen (📦 أشيائي / Memories):** list of the user's saved memories, most-recent-first by default, with the memory text, source badge (voice/text/manual), space, and saved date.
- **Search box:** full-text search across memory text (backed by the retrieval in §9). Arabic-normalized (uses the same `normAr` normalization the pipeline already uses).
- **Filter chips:** by source (voice / chat / manual), by category (`mcat`: preference, fact, episode, route), by space, by date range.
- **Detail view:** full text, metadata (created/updated, source, importance), related memories (same mkey family / near-duplicate candidates), and an action row (edit, delete → trash, export).

### 2.2 Edit
- Tap-to-edit the memory text in place. Edit preserves the `mkey`; editing updates `updated_at` and bumps importance by +1 (capped at 5), consistent with the existing "touch refreshes" semantic in `upsertFacts`.
- Edit history: keep the previous text in `meta.previous_versions` (array, last 5). Edit is reversible; the user can restore a prior version from detail view.

### 2.3 Export
- **Per-memory:** share/copy text.
- **Bulk:** "Export my memories" in settings → machine-readable JSON (`account-export` fn exists; extend it to include `kind='memory'` rows with their meta). Human-readable option (one memory per line / per page PDF) for parity with the order-list "Share beats Download" convention.
- Export never requires a paid tier. (Export is a data-portability right, not a premium feature.)

### 2.4 Delete (own memories)
- Delete = move to trash (30-day undo, decision #6). Trash shows a countdown per item.
- "Delete forever" available inside trash only, with explicit confirm.
- Deleting a memory never deletes the note/voice recording it came from — they are separate objects.

### 2.5 Organization: spaces, tags, search, discovery
- **Spaces:** memories live in spaces like everything else (private by default for auto-learned facts; the user can move a memory to Family/Work). Moving never duplicates.
- **Tags:** lightweight, user-defined tags on memories (`meta.tags: string[]`), editable from detail view; tag chips filter the list. Auto-suggested tags from `mcat` at save time (e.g. `preference`, `health`, `shopping`) — suggestions only, user confirms.
- **Search:** as in §9 (trigram/FTS; semantic flagged open).
- **Discovery:** 
  - "Memories you might want to review" — a periodic, dismissible card surfacing (a) near-duplicate candidates from the consolidation pass (§6), (b) very-low-importance memories untouched for a long time — presented as *review candidates*, never auto-deleted (§3).
  - "On this day" — episodic memories from the same date in prior years. Opt-in; off by default.

### 2.6 Bulk operations
- Multi-select in the list → bulk move to space, bulk tag, bulk delete (→ trash, with one undo).
- Bulk delete requires a typed confirm when >10 items ("type the number"). No bulk "delete forever" outside trash.
- **Dedupe review (from §6):** bulk "keep newest / keep oldest / keep all" per candidate pair group.

---

## 3. Redesign: 90-day decay → non-destructive replacement

**Current (must be removed):** `memory-consolidate/index.ts:128-155` — importance-1 facts with `updated_at` older than 90 days are hard-deleted, 50 per run. Contradicts decision #1. D0 notes no in-repo scheduler was found, so impact is conditional on an external cron — but the code path must still be redesigned, not left dormant.

### Replacement: importance decay → *visibility* decay + user-surfaced review queue

The insight to preserve: the original code encoded a real product need — stale, low-value facts shouldn't clutter retrieval. The fix is to decay *prominence*, never *existence*.

**3.1 Importance re-scoring (non-destructive).** Replace step (3) of the consolidation job with:
- For `kind='memory'` rows with `updated_at` older than 90 days and `importance <= 1`, apply a *retrieval penalty* rather than deletion: set `meta.retrieval_boost = 0.5` (down from 1.0). The row stays; it simply ranks lower when memory is injected into chat context.
- Any user interaction with the memory (view, edit, chat references it, new related memory saved) resets `retrieval_boost = 1.0` and bumps `updated_at`.
- Re-scoring is a metadata UPDATE — never a DELETE. It is idempotent and safe to re-run.
- Importance itself (1–5) is left untouched by time; only the retrieval multiplier decays. If the user later references the memory, the multiplier restores.

**3.2 Stale-memory review queue (user-surfaced, opt-in).** A new lightweight surface:
- The job *flags* candidates (untouched ≥180 days, importance ≤2, retrieval_boost already decayed) into a `memory_review_queue` view (not a new table — a query, or a `meta.review_candidate = true` flag set by the job).
- The user sees "You have N old memories to review" as a dismissible card — never a push notification by default.
- For each candidate the user chooses: **Keep** (clears the flag, restores boost), **Archive** (sets `status='archived'` — hidden from chat retrieval and the list by default, restorable, still exported), or **Delete** (→ trash, 30-day undo). 
- No action by the user = nothing happens. There is no "auto-delete after X days in the review queue."

**3.3 What the old `report.decayed` becomes:** the job's report now emits `rescored` (count of boost updates) and `review_flagged` (count of new review candidates). Both are logged to `ops_events` for observability, never user data.

**3.4 Scheduling:** per decision #7 there is no *scheduled destructive* job. The non-destructive maintenance pass (re-score + flag + duplicate surfacing) may run on a schedule (nightly or weekly), gated by the existing `x-cron-secret`, because it cannot delete. Design keeps the gate; the destructive step is removed.

---

## 4. Redesign: pruneFacts 200-cap → quota-overflow behavior

**Current (must be removed):** `_shared/memory.ts:221-237` (`pruneFacts`) — when a user's memory facts exceed `keep` (default 200), the weakest (lowest importance, stalest) are hard-deleted. This runs **on the write path** (`memory-consolidate` step 4 calls it; audit confirmed it is live even if the cron never fires). It contradicts decisions #1 and #2.

### Replacement: block-on-overflow with explicit user choice

**4.1 New behavior at the write path:**
- Before inserting a new memory fact, count the user's existing open memory facts.
- If count ≥ the tier cap: **the save is refused, nothing is deleted.** The caller (`upsertFacts`) returns `{ saved: 0, blocked_by_quota: true }`.
- The chat tool (`remember_fact`) and `memory-learn` surface this honestly to the user in their language, e.g.: "Your memory is full (N saved). Delete something old, or upgrade to Plus to keep saving." — with two tappable actions: **Review memories** (opens the list sorted oldest/lowest-importance first) and **See plans**.
- `upsertFacts` updates to *existing* facts (same mkey) are never blocked — refreshing a fact you already own is not "new creation."
- Episodes (`mcat='episode'`, auto-learned from conversation) and manual `remember_fact` calls count the same; no silent category is exempt.

**4.2 Explicit user-driven cleanup (the only way a cap shrinks the store):**
- From the quota-blocked message or settings, the user opens "Manage storage" → sees memories sorted by (importance asc, updated_at asc) with checkboxes → selects → delete → trash (30-day undo). The user may also archive instead of delete.
- After cleanup brings the count below cap, saving resumes. No background job ever trims to fit.

**4.3 What `pruneFacts` becomes:** renamed conceptually to `countFactsForQuota` (read-only count) plus `oldestWeakestForReview(spaceId, n)` (read-only candidate listing for the management UI). The delete loop is deleted from the design. Keep the function name change in the implementation plan so no caller can accidentally invoke deletion.

### 4.4 Numeric cap OPTIONS (proposed, NOT finalized — decision #2)

Rationale basis: a memory fact row is small (title ≤ ~40 chars derived from mkey, details ~160 chars, meta JSON). Measured row size is on the order of **~1 KB** including indexes. 10,000 facts ≈ ~10 MB per user — negligible storage cost on Supabase. The binding constraint is **AI cost**: each chat turn injects retrieved memories into the prompt; larger stores don't linearly raise cost (retrieval is top-k), but memory-learn extraction calls (GPT-5-mini) and consolidation passes scale with write volume. Quotas therefore gate *creation velocity and store size* as a proxy for AI spend, not disk.

| Option | Free cap | Plus cap | Rationale |
|---|---|---|---|
| **A — generous free** | 500 facts | 5,000 facts | Free covers ~2 years of heavy use at current observed save rates; Plus is effectively unlimited for a family. Cost exposure per free user stays bounded (~500 extraction calls lifetime). |
| **B — tight free, roomy plus** | 200 facts (current code's number, repurposed as block-not-delete) | 2,000 facts | Makes the paid tier meaningfully differentiated on the core value prop; free is enough to fall in love with the product (~6 months of active use). Lowest AI-cost exposure. |
| **C — usage-based, no hard count** | 100 new facts / month (rolling), store uncapped | 1,000 new facts / month (rolling), store uncapped | Aligns the quota with the actual cost driver (creation/extraction calls), while honoring "durable" most literally — the store itself never has a ceiling. More complex to communicate. |

- All options: existing memories grandfathered — if a user already exceeds the new cap on day one, they keep everything; only *new* saves block until they clean up or upgrade.
- Recommendation to owner: **Option A** for launch simplicity (count caps are trivially explainable; storage cost is negligible; the differentiation story for Plus should come from vault/AI features, not from threatening the core memory promise). But the decision is the owner's — these are options, not a verdict.
- Open measurement needed before finalizing: distribution of facts-per-user in the current database, and per-fact extraction cost from `ai_events` (decision #2 explicitly requires evidence-based numbers).

---

## 5. Redesign: forget_fact over-deletion → scoped matching + trash/undo

**Current (must be removed):** `chat/index.ts:329-343` (`toolForgetFact`) — splits the user's query into tokens and deletes **every** fact whose normalized text contains **any** single token. Saying "forget the milk" can wipe "milk", "my son likes milk", "the milk delivery schedule" — and a single common word matches broadly. Deletion is immediate with no trash/undo for `note_id = NULL` facts.

### Replacement: two-stage forget — match, then confirm

**5.1 Stage 1 — scoped matching (no deletion yet).**
- Compute the normalized full query `q = normAr(query)`.
- Candidate tiers, in order:
  1. **Exact match:** `normAr(title + ' ' + details) === q` (or `normAr(details) === q`).
  2. **mkey match:** query maps to a known `mkey` (e.g. user says "forget my coffee preference" and an mkey `manual:قهوتي...` exists) — match if the query's tokens are a subset of the mkey tokens, all required.
  3. **Single-candidate substring:** the current substring logic, but only proceeds automatically if it yields **exactly one** candidate.
- If zero candidates: tell the user nothing matched ("I couldn't find a memory about X") — do not guess.
- If ≥2 candidates: **do not delete.** Return the candidate list (up to 5, with their text) and ask the user to pick ("I found 3 memories mentioning X — which one? 1… 2… 3…"). This is the confirm-listing path.

**5.2 Stage 2 — delete via trash, with undo.**
- Once the target is unambiguous (exact/mkey/unique, or user picked from the list), the fact is moved to trash (`status='trashed'`), not hard-deleted.
- The chat reply confirms what was forgotten and offers undo: "Forgot 'X'. Undo?" — undo restores from trash within 30 days.
- Batch forget ("forget everything about X") is capped at 10 items per turn and always goes through the confirm-listing, even if matching is exact per item.

**5.3 Guardrails.**
- `forget_fact` stays disabled inside vault sessions (existing `unavailable_in_vault` behavior preserved).
- `mcat='route'` facts (routing rules) are excluded from forget-by-chat — they only change via explicit corrections (consistent with the consolidate job already skipping them).
- The tool result should return `{ forgotten: [...], trashed_ids: [...] }` so the client can render undo affordances.

---

## 6. Non-destructive maintenance design (decision #7)

The consolidation job is redesigned from "nightly destructive janitor" into **"memory gardener"** — it tends, it never uproots.

### 6.1 Job steps (new)

| Step | Old behavior | New behavior |
|---|---|---|
| 1. Episode rollup | unchanged (summarizes chat into episodes) | unchanged |
| 2. Near-duplicate merge | auto-deletes the older duplicate | **surfaces candidate pairs** to the user (§6.2); auto-merge only when byte-identical normalized text AND same mkey AND same space (true duplicates from retry races — see §8 idempotency) |
| 3. 90-day decay | hard-deletes importance-1 stale facts | retrieval-boost re-score + review-queue flagging (§3) |
| 4. Cap prune | hard-deletes weakest beyond 200 | **removed** — quota enforced at write path by blocking (§4) |

### 6.2 Duplicate detection → candidate surfacing
- Detection: same normalized content (existing `normAr(factLine(f))` key) but different mkeys, or fuzzy match (trigram similarity ≥ 0.85 once the §9 index exists) — grouped into candidate pairs.
- Candidates appear in the review surface (see §2.6): "These 2 memories look like the same thing." User picks keep-A / keep-B / keep-both / merge-into-one (merged text editable before confirm).
- Confirmed merge: keep the newer row, append the older text to `meta.previous_versions`, set importance = max+1 (cap 5), move the loser to trash (not hard delete). Undoable for 30 days.
- Auto-merge exception (no user action needed): byte-identical normalized text + same mkey + same space + created within 24h of each other — this is a retry/idempotency duplicate, safe to collapse. Still goes to trash rather than hard delete, for auditability.

### 6.3 Importance refresh
- The job may *raise* importance signals it can compute safely: a memory referenced by chat retrieval 3+ times in 30 days gets `meta.retrieval_boost` pinned at 1.0; memories edited by the user get +1 importance (cap 5).
- The job never *lowers* the user's own importance below what they set, and never deletes.

### 6.4 Scheduling & observability
- Runs on the existing `x-cron-secret` gate, nightly or weekly — safe to schedule because every step is non-destructive.
- Emits a per-run report (`rescored`, `review_flagged`, `duplicate_candidates`, `episodes`) to `ops_events`. An admin dashboard card shows the last run's counts.
- Dry-run mode: the job supports `?dry_run=1` returning what it *would* flag, for testing (§11).

### 6.5 Explicit non-goals
- No auto-archiving. No auto-deletion of any kind. No "smart cleanup" that acts without the user. No LLM-driven rewriting of the user's memories (re-scoring is arithmetic on metadata, not generative editing).

---

## 7. AI conversational assistant spec

### 7.1 ReAct loop (≤ 5 steps) — current shape, kept
- Chat flow (`chat/index.ts`): build system prompt → model proposes a step (`{tool, args}` or `{answer}`) → `runTool` executes → tool result appended → repeat, `for (let step = 0; step < 5; step++)`.
- **Step budget policy:** 5 is the hard ceiling per turn. If the model hasn't answered by step 5, return a graceful partial answer ("Here's what I found so far…") rather than erroring. Tool errors don't consume the user's patience silently — after 2 consecutive tool errors, abort the loop and answer from what is known.
- **Per-step cost guard:** each model call in the loop is logged to `ai_events` with the turn's `request_id`; a per-turn token ceiling (e.g. 8k tokens/turn — option for owner) aborts the loop with a clean message. (Numeric ceiling is a proposal, not final — decision #2.)

### 7.2 Tool inventory (chat tools, from `runTool`)

| Tool | Class | Notes |
|---|---|---|
| `search` | read | notes/items search |
| `get_agenda` | read | |
| `save_note` | write | quota-checked at write |
| `create_shopping_list` | write | |
| `delete_note` | destructive | → trash; governed confirm for bulk |
| `move_note` | write | |
| `update_item` | write | |
| `return_borrow` | write | |
| `remember_fact` | write (memory) | quota-block behavior per §4 |
| `forget_fact` | destructive (memory) | two-stage per §5 |
| `list_memories` | read (memory) | paginate beyond 50 |
| `list_tabs` / `read_tab` / `propose_tab` | structural | tab proposals need approval |
| `request_action` / `approve_action` / `execute_action` / `cancel_action` | governed | double approval (see §7.3) |

All memory tools are disabled inside vault sessions (`unavailable_in_vault`) — vault contents are never learned into the memory store. This boundary is preserved.

### 7.3 Governed actions — double approval
- Powers the model may use only through the approval flow (`_shared/governance.ts`): `approvals_required: 2` (clamped 1–5). Flow: `request_action` → action sits `proposed` → user approves twice (two explicit taps, not one tap counted twice) → `execute_action` runs → result reported.
- `cancel_action` available until execution. Expired proposals auto-cancel (TTL — propose 24h, owner to confirm).
- Paid-limit note: governance prompt already states extra governed actions beyond the free allowance require Plus — wired to entitlements when billing lands (workstream: commercial).
- Approval UX: the chat shows an inline approval card (what / why / irreversible? / approve ×2 / cancel). No destructive governed action executes without both approvals on record.

### 7.4 Fast path vs full chat
- **Fast paths (no model call, deterministic):** confident space classification for plain statements (existing `ruleSpaceConfident`), "return X" borrow returns, clear shopping-list intents. Keep and extend: exact-match "remember X" (no ambiguity → `remember_fact` directly), "forget X" with a unique exact match (stage 1 of §5 can run without the model).
- **Full chat (ReAct):** everything else — ambiguous requests, multi-step tasks ("find the plumber's number and remind me tomorrow"), questions needing retrieval + reasoning.
- **Routing rule:** fast path first (cheap, ~1s, zero AI cost); fall through to the model only when no fast path fires with confidence. Log which path served the turn in `ops_events` (`chat.fast_path` / `chat.react`) for cost analysis.
- Fast path must never perform a destructive action. Destructive intents always go through the full loop + confirmations.

### 7.5 Failure modes

| Failure | Behavior |
|---|---|
| Provider 429/503 | Retry once after 1.5s (existing `callModel` behavior), then user-facing "busy, try again" — never a fake answer. Logged as `rate_limited` in `ai_events`. |
| Provider 4xx (bad params) | Surfaced as a clean error, never masqueraded as rate-limit (existing honest-error rule). Alert-worthy in ops. |
| Timeout (no response) | Client timeout 30s/turn; on timeout, return "I didn't get an answer in time — your data is safe, try again." No partial tool writes are rolled back — tools are individually atomic; the reply just reports what completed. |
| Empty/unparseable model output | Existing `salvageStep` attempt; if unsalvageable, one retry with a stricter prompt, then graceful fallback ("I couldn't understand — could you rephrase?"). |
| Rate limit (user daily AI cap) | Per-user daily AI spend cap (P0 item 4, uses `ai_events` accounting): when hit, chat answers from local data only (search/list tools, no model calls) with a clear "AI limit reached for today" notice. Reads keep working; only generation pauses. |
| Tool error mid-loop | Error returned to the model as a tool result; model may retry differently once; 2 consecutive failures abort the loop gracefully. |
| Vault-scope violation | Tools return `out_of_scope`/`unavailable_in_vault`; the model must not work around it — treat as a hard boundary. |

### 7.6 Per-turn cost accounting via `ai_events`
- Every provider call logs: `user_id`, `request_id` (shared across the turn's steps), `fn='chat'`, `provider`, `model`, `latency_ms`, `status`, `prompt_tokens`, `completion_tokens`, `error` class. Content is never logged (existing hard rule in `_shared/log.ts`).
- Derived per-turn cost = sum over the turn's `request_id`. A nightly aggregation (non-destructive, into a rollup view) feeds: the per-user daily AI spend cap (P0-4), quota option calibration (§4.4 evidence), and an admin cost dashboard.
- Retention: `ai_events` is covered by the telemetry janitor (decision #8, design/test only) — raw events age out; per-user daily aggregates are kept longer for billing disputes.

---

## 8. Voice capture → transcription → extraction pipeline

**Stages:** capture (client) → upload (storage `voice-notes`) → `transcribe` fn → `extract` fn → `memory-learn` fn. Audio policy (user's standing rule): **transcribe, then delete the audio; keep photos.**

### 8.1 Transcribe (`transcribe/index.ts`)
- Input: `{ note_id }`. Downloads the note's audio from storage, sends to Groq Whisper (`ai.transcribeBase/audio/transcriptions`), writes the transcript onto the note.
- **Audio deletion (post-transcription):** on successful transcription, delete the storage object and null `audio_url` (existing lines 139–144). Best-effort but blocking-gated: only delete after the transcript is durably written. If transcription fails, audio is kept for retry (see §8.4) — never deleted untranscribed.
- Auth: a user can only transcribe (or delete the audio of) their own note (existing guard).
- Cost note: Whisper is per-minute; keep the 160-char/60s guidance in the client (existing behavior) and log duration to `ai_events`.

### 8.2 Extract (`extract/index.ts`)
- Input: note text (or transcript). GPT-5-mini extracts structured candidates: tasks, shopping items, agenda entries, borrow records, memory facts.
- De-dupe on write: skip items that already exist as open in the space (existing line 267). Memory facts go through `upsertFacts` with mkey dedupe (same as `memory-learn`).
- **Idempotency on retry:** extraction is keyed by `note_id` + content hash. If `extract` is retried for the same note (client retry, function timeout), already-extracted rows are detected via the de-dupe check and skipped — retry never creates duplicates. The true-duplicate auto-merge (§6.2) is the backstop for races, not the primary mechanism.
- Schema-version tolerance: the existing retry-without-`vault_id`/`meta` fallbacks (lines 306–311, 383) are kept — extract must not hard-fail on older databases.

### 8.3 Memory-learn (`memory-learn/index.ts`)
- Input: the `(user, assistant)` turn pair after each chat turn. GPT-5-mini decides what is worth remembering; writes via `upsertFacts` (mkey dedupe, importance merge).
- **Idempotency:** existing dedupe of identical `(user, assistant)` pairs within a window (lines 72–90) — retries return `{ learned: 0, deduped: true }`.
- **Best-effort:** learning must never fail the chat reply (existing line 129). If the model call fails, the turn is simply not learned; a nightly backfill is out of scope for D0.5 (flagged as an option).
- **Quota:** learned facts count against the §4 cap like any other save; when blocked, learning is skipped silently (no user-facing error mid-chat — the reply already went out) and counted in `ops_events` (`memory_learn.quota_blocked`) for observability.
- Vault sessions: nothing is learned (existing `unavailable_in_vault` boundary).

### 8.4 Failure handling (pipeline-wide)
| Stage | Failure | Handling |
|---|---|---|
| Upload | network drop | client retries with the same note id; server dedupes by note id |
| Transcribe | Groq 429/5xx | retry with backoff (max 3); audio retained until success |
| Transcribe | unparseable audio_url | log `ops_events`, mark note `transcription_failed`, keep audio for manual retry |
| Extract | GPT-5-mini error | note keeps its transcript; extraction marked pending; retry on next app open (client pulls `extraction_pending` notes) |
| Memory-learn | model error | skip silently; counted in ops |
| Any stage | partial success | stages are independently idempotent — re-running the pipeline for a note converges to the same state, never duplicates |

### 8.5 Privacy notes
- Audio is deleted post-transcription by user policy; transcripts and extracted facts inherit the note's space RLS.
- `ai_events` for these stages logs latency/tokens only — never transcript text (existing hard rule).

---

## 9. Memory search / retrieval / organization / discovery

**Current:** `%…%` ILIKE substring search, no index — works but unscalable (FEATURE_STATUS_MATRIX: ⚠️). D0 decision: replace with trigram/FTS; indexes approved for design and testing (decision #8).

### 9.1 Lexical search (D0.5 scope)
- **pg_trgm** (`pg_trgm` GIN index on the normalized memory text): handles Arabic well (trigram matching is script-agnostic), tolerant of typos and missing diacritics. Query path: normalize with `normAr`, then `similarity() > 0.3` ranked by similarity, replacing the ILIKE scan.
- **Full-text search (FTS)** as a complement: `tsvector` on memory text with a simple (non-English-stemmer) config for Arabic — useful for multi-word queries where all terms should match. Ranked by `ts_rank`.
- **Ranking blend for chat retrieval:** `score = 0.5·trigram_sim + 0.3·fts_rank_norm + 0.2·(importance/5)·retrieval_boost`. Top-k (k=8 — option) memories injected into the chat context. `retrieval_boost` is the §3 visibility-decay multiplier; `status='archived'` memories are excluded from chat retrieval by default.
- Indexes: `pg_trgm` GIN on `items(details)` (or a generated normalized column), GIN on the tsvector, plus the D0-approved `(space_id, kind)` composite. All approved for design/testing under decision #8 — not production execution yet.

### 9.2 Semantic search (flagged OPEN — not decided)
- Vector embeddings (e.g. multilingual embedding model) + pgvector would catch paraphrase-level matches ("my kid's doctor" vs "pediatrician appointment") that trigram/FTS miss.
- **Open questions for owner/D0.5 decision:** embedding provider + cost per 1k memories; whether embeddings are computed at write time (latency) or by the maintenance job (freshness); Arabic quality of candidate models; whether vectors are per-space isolated (yes — must respect RLS).
- Recommendation: ship lexical (trigram+FTS) first; run a semantic pilot on a sample corpus with measured recall@k before committing. Do not block the durability redesigns on this.

### 9.3 Organization & discovery (ties to §2)
- Tags (`meta.tags`), spaces, and `mcat` categories are the primary organization axes; search is the retrieval path; the review queue (§3.2) and "on this day" (§2.5) are the discovery surfaces.
- **Related memories:** "see also" on the detail view — same mkey family + trigram neighbors (similarity ≥ 0.6), capped at 5.

---

## 10. Chat transcript retention (7-day policy — preserved)

- **Unchanged:** chat sessions/messages are swept after 7 days (audit claim 6–7: ✅ confirmed — the sweep deletes only `chat_sessions`, never `items kind='memory'`). Decision #1 does not extend to transcripts: transcripts are conversation logs, not saved memories.
- **Boundary made explicit in product copy:** "Your chats disappear after 7 days. Things you ask me to remember stay until you delete them." The 7-day sweep must keep its current table scoping — any future change to the sweep query needs a test asserting zero `items` rows are touched (see §11).
- **Learn-before-sweep:** `memory-learn` runs per turn (not at sweep time), so anything worth keeping is already a saved memory before the transcript ages out. No batch "learn from old transcripts" job — that would be generative rewriting of history; out of scope.
- **User control:** "clear chat history now" in settings (deletes own sessions immediately); export chat before clearing (optional).

---

## 11. Acceptance criteria + test requirements

> D0 gap being closed: **zero automated AI E2E coverage** (chat/extract/memory-learn verified by code + manual only). Every item below needs automated tests with a **mock AI provider** — a test double implementing the chat-completions interface returning scripted tool-call/answer sequences.

### 11.1 Test harness (shared)
- **Mock provider:** HTTP stub for `${ai.base}/chat/completions` + Groq transcription endpoint. Scripted responses: (a) answer-only, (b) tool-call sequences (multi-step), (c) 429 then success, (d) 400, (e) empty content, (f) unparseable JSON. Asserts on request payloads (no content leakage into logs).
- **Seed fixtures:** users with N memory facts at known importance/updated_at/mkeys, trashed items, review candidates.

### 11.2 Per-item acceptance criteria & tests

**§1 Contract**
- AC: no code path exists that deletes an `items kind='memory'` row except user-initiated delete→trash, confirmed merge, account-delete cascade, or trash auto-purge of already-trashed rows.
- Tests: static grep test (CI) asserting `supabase/functions/**` contains no `.delete()` on `items` outside an allowlisted set of call sites; integration test attempting each old destructive path and asserting row counts unchanged.

**§3 Decay replacement**
- AC: running the maintenance job twice over stale importance-1 facts changes zero row counts; sets `meta.retrieval_boost=0.5`; flags review candidates; report shows `decayed: 0`.
- Tests: unit (re-score math, idempotency of second run), integration (job run against seeded stale facts → assert no deletes, boost set, review flag set, `ops_events` entries).

**§4 Quota block**
- AC: at cap, `upsertFacts` inserts nothing, deletes nothing, returns `blocked_by_quota`; `remember_fact` returns a quota message with manage/upgrade actions; updating an existing fact (same mkey) still works at cap.
- Tests: unit (boundary: cap-1 saves, cap blocks, update-at-cap saves), integration (chat "remember X" at cap → user-facing quota message, store unchanged), E2E (mock provider; full turn asserting the reply contains the manage path).

**§5 forget_fact**
- AC: exact query deletes exactly one fact (→ trash); ambiguous query deletes zero and returns a candidate list; common-word query ("the") never mass-deletes; undo restores from trash; `mcat='route'` facts are never forgotten via chat.
- Tests: unit (matcher tiers: exact/mkey-unique/substring-multi/zero), integration (the old over-deletion repro: query "milk" against "milk", "my son likes milk", "milk delivery" → 3 candidates, 0 deletions), E2E (mock provider; user picks candidate 2 → only it is trashed; undo → restored).

**§6 Maintenance job**
- AC: job run deletes zero `items` rows in all modes; duplicate candidates surfaced (not merged) except byte-identical retry duplicates; dry-run mode returns the would-flag set without writing.
- Tests: integration (seeded duplicates → candidates listed, rows intact; byte-identical pair → collapsed to trash, not hard-deleted), dry-run test.

**§7 Chat**
- AC: loop aborts at 5 steps with a graceful partial answer; 2 consecutive tool errors abort gracefully; 429 retried once then clean "busy" message; 400 never shown as rate-limit; daily AI cap → reads work, generation pauses with notice; every provider call logged to `ai_events` with token counts and no content.
- Tests: E2E with mock provider covering (a) 5-step tool chain, (b) step-6 abort, (c) 429→retry→success, (d) 429→429→busy message, (e) 400 honest error, (f) empty content → salvage → fallback, (g) governed action: propose → approve → approve → execute (double-approval enforced; single approval does not execute), (h) fast-path turns make zero provider calls (assert via mock call count).

**§8 Pipeline**
- AC: audio deleted only after transcript durably written; failed transcription keeps audio; extract retry creates zero duplicates; memory-learn retry returns `deduped`; learning failure never fails the chat reply; quota-blocked learning is silent to the user but counted in ops.
- Tests: integration (full pipeline on fixture audio with mocked Groq/Whisper + GPT-5-mini), retry-each-stage tests asserting idempotent convergence, failure-injection tests per §8.4 table.

**§9 Search**
- AC: trigram search finds typo/diacritic variants the old ILIKE missed; Arabic queries rank sensibly; archived memories excluded from chat retrieval; top-k bound respected.
- Tests: unit (ranking blend math), integration (seeded Arabic corpus: assert recall on typo queries ≥ baseline; assert archived exclusion), perf (EXPLAIN shows index use — design/test only per decision #8).

**§10 Transcripts**
- AC: sweep deletes only `chat_sessions`/messages older than 7 days; `items` row count unchanged; saved memories created from swept chats remain.
- Tests: integration (seed old sessions + memories → run sweep → assert sessions gone, memories intact). This test must run in CI on every change to the sweep query.

**General:** all new tests run in CI on the exact HEAD (per the governed batch lifecycle); the mock-provider E2E suite is the explicit closure of D0's AI-E2E gap.

---

## Open decisions for owner (not in this workstream's authority)

1. Numeric caps: choose among §4.4 options A/B/C (needs facts-per-user distribution + per-fact cost from `ai_events` first).
2. Per-turn token ceiling for the ReAct loop (§7.1) and chat top-k (§9.1) — proposed numbers, owner confirms.
3. Semantic search: pilot or defer (§9.2).
4. Review-queue surfacing cadence and "on this day" default (on/off).
5. Governed-action proposal TTL (proposed 24h).

## Traceability

| Owner decision | Sections |
|---|---|
| #1 durable memories | §1, §3, §4, §5 |
| #2 quotas (options only) | §4.4, §7.1, §7.6 |
| #6 trash 30-day | §1, §2.4, §5.2, §6.2 |
| #7 non-destructive maintenance | §6, §3 |
| #8 indexes/janitors (design/test) | §9.1, §7.6 |
| #9 ai-provider-core (conditional) | noted — compatibility assessment is a separate workstream; this spec assumes current `_shared/ai.ts` paths |
| D0 AI-E2E gap | §11.1, §11.2 |
