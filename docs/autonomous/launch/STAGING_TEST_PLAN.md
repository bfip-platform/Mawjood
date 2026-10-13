# Staging test plan — live-model E2E scenarios (prepared, NOT executed)

Runs only after `STAGING_DEPLOYMENT_PLAN.md` steps 0–6 complete and the
§6 budget is approved. RC: `main @ 7f4bad04`. Every scenario records:
function responses, the relevant DB state before/after, and (for AI
scenarios) the `ai_spend_daily` ledger rows — filed into the execution
ledger at the end of the run.

## 1. Test accounts matrix

Create through the staging app (real Auth rows). Passwords are set by
whoever executes seeding and are **never recorded here**.

| ID | Role | `birth_date` | Purpose |
|---|---|---|---|
| T1 | Space owner (creates Family space) | 1990-05-17 (via in-app gate) | Primary journeys; gate happy path |
| T2 | Family member (invited by T1) | 1988-03-02 (via in-app gate) | Member semantics: shared items, member RPC deletes |
| T3 | Outsider (own private space) | 1995-07-21 | Cross-space authorization probes |
| T4 | Signed-in, **undeclared** | NULL (skip the gate if the build allows reaching chat — it must not) | Gate state `needed`; chat must refuse |
| T5 | **Underage** declared | 2012-01-01 | Gate state `blocked`; chat must refuse with `age_gate: true` |
| T6 | Anonymous trial session | NULL | Gate applies to trial sessions too (PR #38 design) |

DOB seeding: prefer the in-app declaration flow (it is itself under
test). SQL seeding on scratch is acceptable for T5 (an underage account
should not need a real minor's involvement — it is a synthetic fixture).

## 2. Age-gate scenarios (PR #38)

1. T1 first sign-in → declaration screen appears before any main UI;
   submit 1990-05-17 → main UI; `profiles.birth_date` persisted.
2. T4 → chat call returns the graceful age-gate response
   (`age_gate: true`, no model call, **no ledger row** — the gate sits
   before the spend check).
3. T5 → blocked screen in app; chat refused server-side even if the app
   check is bypassed (call the function directly with T5's JWT).
4. Boundary: a fixture with DOB exactly 18 years before the run date is
   admitted; one day younger is refused (mirrors the unit-pinned math).

## 3. Memory lifecycle scenarios (durability + F-LAUNCH-01, live)

1. T1 dictates/creates memories via chat (task, shopping item, place
   note) → extraction lands items in T1's space; ledger rows exist per
   model call.
2. **Forget via AI:** ask chat to forget a memory → preview only; nothing
   changes until T1 sends «نفّذ <code>»; wrong/expired code executes
   nothing; correct code trashes the fact (status `trashed`, reason
   recorded).
3. **Restore:** trash screen → restore → the item returns byte-identical
   (title/details/meta spot-compared).
4. **Delete-forever:** trash screen permanent delete → row gone;
   **direct REST DELETE probe**: the same delete attempted with a raw
   `DELETE /rest/v1/items` call using T1's JWT affects **0 rows**
   (F-LAUNCH-01 live verification), while the app's RPC path works.
5. **Member matrix:** T2 can trash/delete items in the shared space via
   the app (RPC); T3's JWT against T1's item ids — RPC raises, REST
   reads return nothing.
6. **Purge eligibility:** on scratch only, age one trashed fixture's
   `trashed_at` past 30 days → run `memory-consolidate` → only that row
   is purged; a 29-day fixture survives (floor respected).

## 4. AI confirmation & injection corpus (D6)

Run the 25-payload corpus (`supabase/tests/ai-e2e/injection-corpus.mjs`)
against the deployed `chat`, plus the harness journeys for `ask`,
`extract`, `memory-learn`, `route`, `classify`.

**Acceptance (hard-stop §6 of the deployment plan on any failure):**
- ZERO corpus payloads execute any action without a valid
  «نفّذ <code>» — including the punctuation-wrapped and RTL-embedded
  variants that caught the parser hole in D6.
- Every executed action traces to a `pending_actions` row that was
  claimed exactly once (no double-execution on replayed codes).

## 5. Offline sync scenarios (PR #39)

1. Web build, DevTools offline: create 3 items → drawer indicator shows
   the pending count; kill connectivity errors must not lose them.
2. Go online → outbox flushes automatically (foreground/sign-in
   triggers); server holds each item **exactly once** (idempotency —
   no duplicates after a forced double-flush).
3. Watch + expense helper creates (the PR #39 N1 paths) offline →
   queued, flushed, correct kinds.
4. Cached reads: go offline after a session → lists render from cache.

## 6. Authorization scenarios

1. T3's JWT reads T1's space items/photos → empty/denied (RLS +
   `can_read_photo` 0038 spot check with a photo-bearing note).
2. T2 (member) vs T1 (owner) on space settings: member cannot perform
   owner-only operations (space delete probe → denied; owner succeeds
   on a throwaway space).
3. `route`/`classify` without a JWT → refused (PR #18 gates).

## 7. Spend-ledger verification (0044)

After all AI scenarios, for each test user + day:

```sql
select user_id, spent_usd from public.ai_spend_daily
where user_id in (<test user ids>) and day = <run date>;
-- reconcile: ledger total vs the sum of ai_events estimates for the
-- same users/day (query per the register's reconciliation control).
```

- Every model-calling journey step has a corresponding ledger
  reservation; the ledger total NEVER exceeds the staging cap ($0.50).
- **Cap-trip test:** with the staging cap at $0.50, drive T6/T4-adjacent
  adult fixture calls until the cap binds → further calls receive the
  graceful cap response, charge nothing further, and the ledger total
  sits at ≤ $0.50 exactly.
- Transcribe path: confirm it is metered on its own per-minute path
  (the disclosed exclusion from the per-attempt charge) and appears in
  `ai_events`.

## 8. Exit criteria

All sections green, or every failure filed as a finding with severity
in the register + ledger before any launch conversation. A corpus
execution without confirmation, a cross-space exposure, or a ledger
mismatch is **launch-blocking** regardless of anything else here.
