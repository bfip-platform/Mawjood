# D0.5 — Memory & AI Product Specification

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** `docs/autonomous/d05/workstream-03-memory-ai.md`
**Mission scope:** design-only. No application code changes.

**Owner decisions enforced:** #1 (durable saved memories — no auto-deletion by age, downgrade, or quota overflow), #2 (quotas designed not invented — numeric options are PROPOSED only), #6 (trash 30-day recovery), #7 (no destructive consolidation — non-destructive maintenance only), #8 (indexes/janitors design and testing only), #9 (ai-provider-core conditional — this spec assumes current `_shared/ai.ts` paths).

**D0 inputs:** `docs/autonomous/d0/MEMORY_RETENTION_AUDIT.md` (the CRITICAL findings redesigned here), `docs/autonomous/d0/D0_TO_D05_HANDOFF.md`, `docs/autonomous/d0/FEATURE_STATUS_MATRIX.md`.

**Terminology:** a *saved memory* = a row in `items` with `kind = 'memory'`. A *chat transcript* = rows in `chat_sessions`/`chat_messages`. Different data, different retention rules (§10).

---

## 1. Durable memory product contract

**The promise (owner decision #1):**

> Once a memory is saved — by chat, by voice-note learning, by explicit "remember this" — it stays until the user personally deletes it. Mawjood never auto-deletes saved memories because of age, plan downgrade, or quota overflow.

**What "durable" means:**

1. **Free and Plus are identical on durability.** Tier affects how much you can *create*, never what happens to what you already *created*.
2. **Age is never a deletion trigger.** A memory untouched for 90 days or five years is still there. Time may change how prominently it is *surfaced* (§3), never whether it *exists*.
3. **Downgrade Plus → Free preserves everything.** The audit confirmed no FK cascade path from billing tables to memory data; the design must not add one.
4. **Quota overflow blocks creation, never deletes.** When a creation limit is hit (§4), the save is refused with a clear message and an upgrade/manage path. The system never prunes old memories to make room.
5. **Deletion happens through exactly four user-initiated doors:**
   - the user deletes a specific memory (UI or "forget X" via chat);
   - the user confirms a merge/cleanup in a review queue (§6);
   - the user deletes their whole account (`account-delete` → full CASCADE wipe);
   - the 30-day trash auto-purge, which only touches items the user already put in trash (decision #6).
6. **Every delete goes through trash first** (except account delete) — 30-day undo window.
7. **System jobs may update metadata (importance, dedupe flags, search vectors) — never delete rows.**

**Explicit prohibition list:**

| Trigger | Permitted to delete? |
|---|---|
| Memory untouched for N days | ❌ Never |
| Plan downgrade Plus → Free | ❌ Never |
| Exceeding a memory quota/cap | ❌ Never (block new saves instead) |
| Scheduled consolidation/cron job | ❌ Never (surface candidates only, §6) |
| Low importance score | ❌ Never (score affects ranking only) |
| Duplicate detection | ❌ Never automatically — user confirms the merge |
| Chat transcript sweep (7-day) | ❌ Never touches `items kind='memory'` |
| Telemetry retention janitor | ❌ Never (`rate_limits`, `ai_events`, `ops_events` only) |
| Account deactivation (if designed) | ❌ Must NOT — only full user-requested account *delete* cascades |
| Space-member removal | ❌ Never (churn-safe, audit-verified) |

**Migration note:** current code violates this contract in three paths — 90-day decay (`memory-consolidate/index.ts:128-155`), `pruneFacts` (`_shared/memory.ts:221-237`), `forget_fact` over-deletion (`chat/index.ts:329-343`). §§3–5 redesign each. The durability promise is only claimable in product copy *after* those redesigns land and pass §11 tests.

---

## 2. Memory management UX

Saved memories are currently reachable only through chat tools — there is no dedicated memory screen. Design target: memories as first-class, browsable, manageable objects.

### 2.1 View & browse
- **Memories screen:** list of saved memories, most-recent-first, with memory text, source badge (voice/text/manual), space, and saved date.
- **Search box:** full-text search across memory text (§9), Arabic-normalized (`normAr`).
- **Filter chips:** by source, by category (`mcat`: preference, fact, episode, route), by space, by date range.
- **Detail view:** full text, metadata (created/updated, source, importance), related memories, action row (edit, delete → trash, export).

### 2.2 Edit
- Tap-to-edit in place. Edit preserves the `mkey`; updates `updated_at`; bumps importance +1 (cap 5), consistent with existing `upsertFacts` semantics.
- **Edit history:** previous text kept in `meta.previous_versions` (last 5). Restorable from detail view.

### 2.3 Export
- Per-memory: share/copy text. Bulk: "Export my memories" → machine-readable JSON (`account-export` fn extended to include `kind='memory'` rows). Human-readable option per the "Share beats Download" convention.
- Export never requires a paid tier — data portability is a right, not a premium feature.

### 2.4 Delete
- Delete = move to trash (30-day undo, decision #6), with per-item countdown. "Delete forever" only inside trash, with explicit confirm.
- Deleting a memory never deletes the note/voice recording it came from.

### 2.5 Organization & discovery
- **Spaces:** memories live in spaces (private default for auto-learned facts; user-movable). Moving never duplicates.
- **Tags:** user-defined (`meta.tags`), auto-suggested from `mcat` at save time (suggestions only, user confirms).
- **Discovery:** "Memories you might want to review" (dismissible card: near-duplicate candidates from §6, very-low-importance untouched memories — review candidates, never auto-deleted); "On this day" (opt-in, off by default).

### 2.6 Bulk operations
- Multi-select → bulk move, bulk tag, bulk delete (→ trash, one undo). Bulk delete >10 items requires typed confirm. "Keep newest / keep oldest / keep all" per dedupe group.

---

## 3. Redesign: 90-day decay → visibility decay + review queue

**Current (must be removed):** `memory-consolidate/index.ts:128-155` — hard-deletes importance-1 facts untouched 90 days, 50/run. Contradicts decision #1.

### 3.1 Importance re-scoring (non-destructive)
- For `kind='memory'` rows with `updated_at` older than 90 days and `importance <= 1`: apply a *retrieval penalty* — set `meta.retrieval_boost = 0.5` (down from 1.0). The row stays; it ranks lower in chat context injection.
- Any user interaction (view, edit, chat reference, new related memory) resets `retrieval_boost = 1.0` and bumps `updated_at`.
- Metadata UPDATE only — never DELETE. Idempotent, safe to re-run. Importance (1–5) itself is untouched by time.

### 3.2 Stale-memory review queue (user-surfaced, opt-in)
- The job *flags* candidates (untouched ≥180 days, importance ≤2, boost already decayed) via `meta.review_candidate = true`.
- Dismissible card: "You have N old memories to review" — never a push notification by default.
- Per candidate: **Keep** (clears flag, restores boost), **Archive** (`status='archived'` — hidden from chat retrieval and list by default, restorable, still exported), or **Delete** (→ trash, 30-day undo).
- No user action = nothing happens. No auto-delete after X days in the queue.

### 3.3 Job report
`rescored` (boost updates) + `review_flagged` (new candidates), logged to `ops_events`. Old `report.decayed` is retired.

### 3.4 Scheduling
Per decision #7, no *scheduled destructive* job. The non-destructive maintenance pass (re-score + flag + duplicate surfacing) may run nightly/weekly on the existing `x-cron-secret` gate — safe because it cannot delete.

---

## 4. Redesign: pruneFacts 200-cap → block-on-overflow

**Current (must be removed):** `_shared/memory.ts:221-237` (`pruneFacts`) — hard-deletes weakest facts beyond `keep` (default 200). Runs **on the write path** — live even if the cron never fires. Contradicts decisions #1 and #2.

### 4.1 New write-path behavior
- Before inserting a new memory fact, count the user's existing open memory facts.
- If count ≥ tier cap: **the save is refused, nothing is deleted.** `upsertFacts` returns `{ saved: 0, blocked_by_quota: true }`.
- `remember_fact` and `memory-learn` surface this honestly: "Your memory is full (N saved). Delete something old, or upgrade to Plus to keep saving." — with **Review memories** (list sorted oldest/lowest-importance first) and **See plans** actions.
- `upsertFacts` updates to *existing* facts (same mkey) are never blocked — refreshing an owned fact is not "new creation."

### 4.2 Explicit user-driven cleanup (the only way a cap shrinks the store)
- "Manage storage" → memories sorted by (importance asc, updated_at asc), checkboxes → delete → trash (30-day undo), or archive instead.
- After cleanup brings the count below cap, saving resumes. No background job ever trims to fit.

### 4.3 Function redesign
`pruneFacts` becomes `countFactsForQuota` (read-only count) + `oldestWeakestForReview(spaceId, n)` (read-only candidate listing). The delete loop is removed from the design; rename so no caller can accidentally invoke deletion.

### 4.4 Numeric cap OPTIONS (PROPOSED — decision #2; NOT finalized)

Rationale basis: a memory fact row is ~1 KB including indexes; 10,000 facts ≈ ~10 MB/user — negligible storage. The binding constraint is **AI cost** (extraction calls + consolidation passes scale with write volume). Quotas gate *creation velocity and store size* as a proxy for AI spend, not disk.

*These options are merged with the full quota table in `BILLING_ENTITLEMENTS_AND_QUOTAS.md` (merge task M1). The fact-count axis:*

| Option | Free cap | Plus cap | Rationale |
|---|---|---|---|
| **A — generous free** | 500 facts | 5,000 facts | ~2 years of heavy use; Plus effectively unlimited for a family |
| **B — tight free, roomy plus** | 200 facts | 2,000 facts | Meaningful paid differentiation; free ≈ 6 months of active use |
| **C — usage-based** | 100 new facts/month (rolling), store uncapped | 1,000 new facts/month (rolling), store uncapped | Quota tracks the actual cost driver (creation calls); store never has a ceiling |

- Grandfathering: users already over cap on day one keep everything; only *new* saves block.
- Open measurement needed: facts-per-user distribution in the current DB + per-fact extraction cost from `ai_events` (decision #2 requires evidence-based numbers).

---

## 5. Redesign: forget_fact over-deletion → scoped matching + trash

**Current (must be removed):** `chat/index.ts:329-343` (`toolForgetFact`) — deletes **every** fact whose normalized text contains **any** single query token. "Forget the milk" can wipe unrelated memories. Immediate, no trash/undo.

### 5.1 Stage 1 — scoped matching (no deletion yet)
1. **Exact match:** `normAr(title + ' ' + details) === q`.
2. **mkey match:** query tokens are a subset of a known mkey's tokens (all required).
3. **Single-candidate substring:** current substring logic, but proceeds automatically only if **exactly one** candidate.
- Zero candidates → "I couldn't find a memory about X" — do not guess.
- ≥2 candidates → **do not delete.** Return the candidate list (up to 5) and ask the user to pick.

### 5.2 Stage 2 — delete via trash, with undo
- Unambiguous target (exact/mkey/unique, or user-picked) → moved to trash (`status='trashed'`), not hard-deleted.
- Chat confirms + offers undo: "Forgot 'X'. Undo?" — restorable within 30 days.
- Batch forget capped at 10 items/turn, always through confirm-listing.

### 5.3 Guardrails
- `forget_fact` stays disabled in vault sessions (`unavailable_in_vault`).
- `mcat='route'` facts excluded from forget-by-chat (explicit corrections only).
- Tool returns `{ forgotten: [...], trashed_ids: [...] }` for client undo affordances.

---

## 6. Non-destructive maintenance — "memory gardener" (decision #7)

The consolidation job becomes a gardener: it tends, it never uproots.

| Step | Old behavior | New behavior |
|---|---|---|
| 1. Episode rollup | unchanged | unchanged |
| 2. Near-duplicate merge | auto-deletes older duplicate | **surfaces candidate pairs** (§6.2); auto-merge only for byte-identical retry duplicates |
| 3. 90-day decay | hard-deletes stale facts | retrieval-boost re-score + review-queue flagging (§3) |
| 4. Cap prune | hard-deletes weakest beyond 200 | **removed** — quota enforced at write path by blocking (§4) |

### 6.1 Duplicate detection → candidate surfacing
- Detection: same normalized content with different mkeys, or fuzzy match (trigram similarity ≥ 0.85 once §9 index exists).
- Review surface: "These 2 memories look like the same thing." User picks keep-A / keep-B / keep-both / merge-into-one (merged text editable before confirm).
- Confirmed merge: keep newer row, append older text to `meta.previous_versions`, importance = max+1 (cap 5), loser → trash (not hard delete). Undoable 30 days.
- Auto-merge exception (no user action): byte-identical normalized text + same mkey + same space + created within 24h — a retry/idempotency duplicate. Still goes to trash for auditability.

### 6.2 Importance refresh
- Job may *raise* computable signals: memory retrieved by chat 3+ times in 30 days → `retrieval_boost` pinned at 1.0; user-edited → +1 importance (cap 5).
- Never lowers the user's own importance, never deletes.

### 6.3 Scheduling & observability
- Runs on `x-cron-secret` gate, nightly or weekly — safe because non-destructive.
- Report (`rescored`, `review_flagged`, `duplicate_candidates`, `episodes`) → `ops_events`. Admin dashboard card shows last run counts.
- Dry-run mode: `?dry_run=1` returns the would-flag set without writing.

### 6.4 Explicit non-goals
No auto-archiving. No auto-deletion of any kind. No "smart cleanup" without the user. No LLM-driven rewriting of the user's memories (re-scoring is arithmetic on metadata, not generative editing).

---

## 7. AI conversational assistant spec

### 7.1 ReAct loop (≤ 5 steps) — kept
- Flow: system prompt → model proposes `{tool, args}` or `{answer}` → `runTool` executes → result appended → repeat (max 5).
- **Step budget:** hard ceiling 5/turn. No answer by step 5 → graceful partial answer ("Here's what I found so far…").
- After 2 consecutive tool errors → abort loop, answer from what is known.
- **Per-turn token ceiling** (PROPOSED, e.g. 8k — owner confirms per decision #2): aborts the loop with a clean message.

### 7.2 Tool inventory

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
| `remember_fact` | write (memory) | quota-block per §4 |
| `forget_fact` | destructive (memory) | two-stage per §5 |
| `list_memories` | read (memory) | paginate beyond 50 |
| `list_tabs` / `read_tab` / `propose_tab` | structural | tab proposals need approval |
| `request_action` / `approve_action` / `execute_action` / `cancel_action` | governed | double approval (§7.3) |

All memory tools disabled inside vault sessions (`unavailable_in_vault`) — vault contents never learned into the memory store.

### 7.3 Governed actions — double approval
- `approvals_required: 2` (clamped 1–5). Flow: `request_action` → `proposed` → two explicit user approvals (two taps, not one counted twice) → `execute_action`.
- `cancel_action` until execution. Proposals auto-cancel on TTL (PROPOSED 24h — owner confirms).
- Approval UX: inline card (what / why / irreversible? / approve ×2 / cancel). No destructive governed action executes without both approvals on record.

### 7.4 Fast path vs full chat
- **Fast paths (no model call, deterministic):** confident space classification for plain statements, "return X" borrow returns, clear shopping-list intents, exact-match "remember X", unique-exact-match "forget X" (§5 stage 1).
- **Full chat (ReAct):** ambiguous requests, multi-step tasks, questions needing retrieval + reasoning.
- **Routing rule:** fast path first (cheap, ~1s, zero AI cost); model only when no fast path fires with confidence. Log serving path in `ops_events` (`chat.fast_path` / `chat.react`) for cost analysis.
- Fast path never performs destructive actions.

### 7.5 Failure modes

| Failure | Behavior |
|---|---|
| Provider 429/503 | Retry once after 1.5s, then "busy, try again" — never a fake answer. Logged `rate_limited`. |
| Provider 4xx | Clean error, never masqueraded as rate-limit. Alert-worthy. |
| Timeout | Client 30s/turn; "I didn't get an answer in time — your data is safe, try again." Tools are individually atomic. |
| Empty/unparseable output | `salvageStep` attempt → one retry with stricter prompt → graceful fallback. |
| Daily AI cap hit | Chat answers from local data only (search/list tools, no model calls) + "AI limit reached for today" notice. Reads keep working; generation pauses. |
| Tool error mid-loop | Error as tool result; model may retry once; 2 consecutive failures abort gracefully. |
| Vault-scope violation | `out_of_scope`/`unavailable_in_vault` — hard boundary, never worked around. |

### 7.6 Cost accounting via `ai_events`
- Every provider call logs: `user_id`, `request_id` (shared per turn), `fn`, `provider`, `model`, `latency_ms`, `status`, `prompt_tokens`, `completion_tokens`, error class. **Content never logged** (existing hard rule).
- Nightly aggregation (non-destructive rollup view) feeds: per-user daily AI spend cap, quota option calibration (§4.4 evidence), admin cost dashboard.
- Retention: raw events age out via telemetry janitor (decision #8, design/test only); per-user daily aggregates kept longer for billing disputes.

---

## 8. Voice capture → transcription → extraction pipeline

**Stages:** capture (client) → upload (storage `voice-notes`) → `transcribe` → `extract` → `memory-learn`. Audio policy (standing): **transcribe, then delete the audio; keep photos.**

### 8.1 Transcribe
- Downloads note audio → Groq Whisper → transcript written onto the note.
- **Audio deletion:** only after the transcript is durably written. Failed transcription → audio kept for retry, never deleted untranscribed. Transcription failures must still delete audio in `finally` once a terminal state is reached.
- Auth: users transcribe only their own notes. Duration logged to `ai_events`.

### 8.2 Extract
- GPT-5-mini extracts tasks, shopping items, agenda entries, borrow records, memory facts.
- **Idempotency:** keyed by `note_id` + content hash; retries skip already-extracted rows via the existing de-dupe check — retry never duplicates. True-duplicate auto-merge (§6.1) is the backstop.
- Schema-version tolerance kept (existing fallbacks for older DBs).

### 8.3 Memory-learn
- Per `(user, assistant)` turn pair; GPT-5-mini decides what's worth remembering; writes via `upsertFacts` (mkey dedupe).
- **Idempotency:** existing dedupe of identical pairs within a window → `{ learned: 0, deduped: true }`.
- **Best-effort:** learning never fails the chat reply. Failures skip silently, counted in `ops_events`.
- **Quota:** learned facts count against §4 cap; when blocked, learning skips silently (reply already went out) + `memory_learn.quota_blocked` counted in ops.
- Vault sessions: nothing learned (`unavailable_in_vault`).

### 8.4 Pipeline failure handling
| Stage | Failure | Handling |
|---|---|---|
| Upload | network drop | client retries with same note id; server dedupes |
| Transcribe | Groq 429/5xx | retry with backoff (max 3); audio retained until success |
| Transcribe | unparseable audio | `transcription_failed` mark; audio kept for manual retry; logged |
| Extract | model error | transcript kept; extraction pending; retried on next app open |
| Memory-learn | model error | skip silently; counted in ops |
| Any stage | partial success | stages independently idempotent — re-running converges, never duplicates |

### 8.5 Privacy
- Audio deleted post-transcription; transcripts/facts inherit the note's space RLS.
- `ai_events` logs latency/tokens only — never transcript text.

---

## 9. Memory search / retrieval / organization / discovery

**Current:** `%…%` ILIKE substring search, no index (D0: ⚠️). Replace with trigram/FTS; indexes approved for design and testing (decision #8).

### 9.1 Lexical search (D0.5 scope)
- **pg_trgm** GIN index on normalized memory text: script-agnostic, tolerant of typos and missing diacritics — handles Arabic well. `similarity() > 0.3`, ranked.
- **FTS complement:** `tsvector` for multi-word queries (all terms match), ranked by `ts_rank`.
- **Chat retrieval ranking:** `score = 0.5·trigram_sim + 0.3·fts_rank_norm + 0.2·(importance/5)·retrieval_boost`. Top-k (PROPOSED k=8 — owner confirms) injected into chat context. `retrieval_boost` is the §3 visibility-decay multiplier; `status='archived'` excluded from chat retrieval by default.
- Indexes: `pg_trgm` GIN on `items(details)` (or generated normalized column), GIN on tsvector, D0-approved `(space_id, kind)` composite. Design/testing only per decision #8.

### 9.2 Semantic search (OPEN — not decided)
Vector embeddings + pgvector would catch paraphrase-level matches trigram/FTS miss. Open questions: embedding provider + cost per 1k memories; write-time vs job-time computation; Arabic quality; per-space RLS isolation (mandatory). Recommendation: ship lexical first; run a semantic pilot with measured recall@k before committing. Do not block the durability redesigns on this.

### 9.3 Related memories
Detail view "see also": same mkey family + trigram neighbors (similarity ≥ 0.6), capped at 5.

---

## 10. Chat transcript retention (7-day policy — preserved)

- **Unchanged:** sessions/messages swept after 7 days (audit-verified: sweep touches only `chat_sessions`, never `items kind='memory'`). Decision #1 does not extend to transcripts.
- **Product copy:** "Your chats disappear after 7 days. Things you ask me to remember stay until you delete them."
- The sweep query needs a CI test asserting zero `items` rows touched on every change (§11).
- **Learn-before-sweep:** `memory-learn` runs per turn, so keep-worthy content is already a saved memory before the transcript ages out.
- **User control:** "clear chat history now" in settings; optional export before clearing.

---

## 11. Acceptance criteria + test requirements

> D0 gap being closed: **zero automated AI E2E coverage.** Every item needs automated tests with a **mock AI provider** — a test double for the chat-completions interface returning scripted tool-call/answer sequences.

### 11.1 Shared test harness
- **Mock provider:** HTTP stub for chat-completions + Groq transcription. Scripted: (a) answer-only, (b) multi-step tool calls, (c) 429 then success, (d) 400, (e) empty content, (f) unparseable JSON. Asserts on request payloads (no content leakage into logs).
- **Seed fixtures:** users with N memory facts at known importance/updated_at/mkeys, trashed items, review candidates.

### 11.2 Per-item acceptance criteria

**§1 Contract** — AC: no code path deletes an `items kind='memory'` row except user-initiated delete→trash, confirmed merge, account-delete cascade, or trash auto-purge of already-trashed rows. Tests: CI grep test asserting no `.delete()` on `items` outside an allowlisted set; integration test attempting each old destructive path → row counts unchanged.

**§3 Decay replacement** — AC: two maintenance runs over stale importance-1 facts change zero row counts; set `meta.retrieval_boost=0.5`; flag review candidates; report shows `decayed: 0`. Tests: unit (re-score math, second-run idempotency), integration (seeded stale facts → no deletes, boost set, flag set, `ops_events` entries).

**§4 Quota block** — AC: at cap, `upsertFacts` inserts nothing, deletes nothing, returns `blocked_by_quota`; `remember_fact` returns quota message with manage/upgrade actions; same-mkey updates still work at cap. Tests: unit (boundary: cap-1 saves, cap blocks, update-at-cap saves), integration (chat "remember X" at cap → quota message, store unchanged), E2E (mock provider; reply contains manage path).

**§5 forget_fact** — AC: exact query deletes exactly one fact (→ trash); ambiguous query deletes zero and returns candidate list; common-word query never mass-deletes; undo restores; `mcat='route'` never forgotten via chat. Tests: unit (matcher tiers), integration (old over-deletion repro: "milk" against 3 memories → 3 candidates, 0 deletions), E2E (user picks candidate 2 → only it trashed; undo → restored).

**§6 Maintenance job** — AC: zero `items` deletes in all modes; duplicates surfaced not merged (except byte-identical retry duplicates); dry-run returns would-flag set without writing. Tests: integration (seeded duplicates → candidates listed, rows intact), dry-run test.

**§7 Chat** — AC: loop aborts at 5 steps with graceful partial answer; 2 consecutive tool errors abort gracefully; 429 retried once then clean "busy"; 400 never shown as rate-limit; daily AI cap → reads work, generation pauses with notice; every provider call logged with tokens and no content. Tests: E2E with mock provider — (a) 5-step chain, (b) step-6 abort, (c) 429→retry→success, (d) 429→429→busy, (e) 400 honest error, (f) empty content → salvage → fallback, (g) governed action: propose → approve → approve → execute (single approval does NOT execute), (h) fast-path turns make zero provider calls (mock call count).

**§8 Pipeline** — AC: audio deleted only after transcript durably written; failed transcription keeps audio; extract retry creates zero duplicates; memory-learn retry returns `deduped`; learning failure never fails the chat reply; quota-blocked learning silent to user but counted in ops. Tests: integration (full pipeline on fixture audio with mocked providers), retry-each-stage idempotency tests, failure-injection per §8.4.

**§9 Search** — AC: trigram finds typo/diacritic variants ILIKE missed; Arabic queries rank sensibly; archived excluded from chat retrieval; top-k bound respected. Tests: unit (ranking blend), integration (seeded Arabic corpus: recall on typo queries ≥ baseline; archived exclusion), perf (EXPLAIN shows index use — design/test only).

**§10 Transcripts** — AC: sweep deletes only `chat_sessions`/messages older than 7 days; `items` row count unchanged. Tests: integration (old sessions + memories → sweep → sessions gone, memories intact). Runs in CI on every sweep-query change.

**General:** all new tests run in CI on the exact HEAD per the governed batch lifecycle; the mock-provider E2E suite is the explicit closure of D0's AI-E2E gap.

---

## Open decisions for owner

1. Numeric caps: choose among §4.4 options A/B/C (needs facts-per-user distribution + per-fact cost from `ai_events` first).
2. Per-turn token ceiling (§7.1) and chat top-k (§9.1) — proposed numbers, owner confirms.
3. Semantic search: pilot or defer (§9.2).
4. Review-queue surfacing cadence; "on this day" default (on/off).
5. Governed-action proposal TTL (proposed 24h).

## Traceability

| Owner decision | Sections |
|---|---|
| #1 durable memories | §1, §3, §4, §5 |
| #2 quotas (options only) | §4.4, §7.1, §7.6 |
| #6 trash 30-day | §1, §2.4, §5.2, §6.1 |
| #7 non-destructive maintenance | §6, §3 |
| #8 indexes/janitors (design/test) | §9.1, §7.6 |
| #9 ai-provider-core (conditional) | compatibility assessment is a separate workstream; this spec assumes current `_shared/ai.ts` paths |
| D0 AI-E2E gap | §11.1, §11.2 |
