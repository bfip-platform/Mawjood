# Historical SQL Migrations Assessment — Mawjood D-1.1

**Date:** 2026-10-11 · **Mission:** MAWJOOD D-1.1 Workstream (historical migrations)
**Method:** Read-only static review. Snapshot = `d1/governance-foundation` @ `240ea83f`.
All 34 files in `supabase/migrations/` read in full; cross-checked against
`supabase/tests/migrate-check.mjs`, `migrate-lib.mjs`, `rls-audit.mjs`, `authz-behavioral.mjs`.
**Status:** ASSESSMENT ONLY — no files modified, no migrations executed, no DB touched.

Prior context: D-1 hardened 8 migrations for idempotency (0001/0002/0004/0006/0007/0008/0012/0028,
per IMPLEMENTATION_LEDGER). CI's `migrate-check.mjs` applies every migration twice on an empty
scratch DB; that run was green in D-1. This assessment goes beyond the empty-DB harness:
semantic re-runnability on a populated DB, ordering hazards, destructive ops, RLS windows,
and harness blind spots.

## 1. Per-migration table

| # | File | Idempotent re-run? | Destructive ops | RLS status | Notes |
|---|------|-------------------|-----------------|------------|-------|
| 0001 | init.sql | Y (D-1 hardened) | `DROP POLICY IF EXISTS` + recreate only | RLS on spaces/space_members/notes; 11 policies incl. storage.objects | Inserts voice-notes bucket `ON CONFLICT DO NOTHING` |
| 0002 | items.sql | Y (D-1 hardened) | drop/create policy | RLS on items + 2 policies | — |
| 0003 | item_kinds.sql | Y on empty DB; **N on populated DB** (see F-1) | `DROP CONSTRAINT` (unguarded, line 2) + narrower re-add | n/a (constraint only) | Re-add omits kinds added by 0021/22/23 |
| 0004 | family.sql | Y (D-1 hardened) | — | RLS on device_tokens + 1 policy | `ALTER PUBLICATION … ADD TABLE` in DO with duplicate_object catch |
| 0005 | things.sql | Y on empty DB; **N on populated DB** (see F-1) | `DROP CONSTRAINT` (unguarded, line 6) + narrower re-add | n/a | Same pattern as 0003 |
| 0006 | invites.sql | Y (D-1 hardened) | drop/create policies | RLS on space_invites + 3 policies | — |
| 0007 | family_manager.sql | Y (D-1 hardened) | drop/create policies | replaces 0006 policies | — |
| 0008 | item_photos.sql | Y (D-1 hardened) | drop/create storage policies | 4 storage.objects policies | — |
| 0009 | note_photos.sql | Y | — | n/a (column) | `ADD COLUMN IF NOT EXISTS` |
| 0010 | profiles.sql | Y | `DROP TRIGGER IF EXISTS` + recreate | RLS on profiles + 3 policies | Backfill `INSERT … ON CONFLICT DO NOTHING`; trigger on auth.users |
| 0011 | profiles_peers_fix.sql | Y | `DROP POLICY IF EXISTS` + recreate | replaces 1 policy | — |
| 0012 | borrows.sql | Y (D-1 hardened) | drop/create policies | RLS on borrows + 2 policies | — |
| 0013 | chat_history.sql | Y | — | RLS on chat_sessions + 1 policy | `ADD COLUMN IF NOT EXISTS` on profiles |
| 0014 | directed_shopping.sql | Y | — | RLS on shopping_lists + 1 policy | 2× `ADD COLUMN IF NOT EXISTS` on items |
| 0015 | shopping_archive.sql | Y (re-run no-op) | **DELETE user rows** (line 20) | n/a | One-time sweep; unrecoverable (see F-2) |
| 0016 | custom_tabs.sql | Y | — | RLS on space_tabs + 2 policies | `ADD COLUMN IF NOT EXISTS` ×2 |
| 0017 | trash_and_secret.sql | Y | — | RLS on secret_vault + 1 policy | Unqualified `secret_vault` refs (see F-6) |
| 0018 | secret_multi_vault.sql | Y | Reshape: drop pkey/column (inside guarded DO) | RLS inherited | One-time reshape; skips on re-run via column-existence guard |
| 0019 | universal_trash.sql | Y (re-run skips via guards) | **Data migration + DELETEs** (lines 76–115) then `DROP COLUMN` ×2 (120–121) | RLS on trash_bin + 1 policy | Moves soft-deleted rows → trash_bin, deletes originals (see F-3) |
| 0020 | reminders.sql | Y | `DROP TRIGGER IF EXISTS` + recreate | n/a | pg_cron/pg_net extensions; unschedule-then-schedule (181–194, idempotent) |
| 0021 | expenses.sql | Y | `DROP CONSTRAINT` inside guarded DO (lines 12–29) | n/a | DO-guard pattern: only drops if def lacks 'expense' |
| 0022 | watch.sql | Y | `DROP CONSTRAINT` inside guarded DO (lines 7–23) | n/a | Same DO-guard pattern ('watch') |
| 0023 | memory_feedback.sql | Y | `DROP CONSTRAINT` inside guarded DO (lines 16–33) | n/a | Same DO-guard pattern ('memory') |
| 0024 | family_slots.sql | Y | — | n/a | `ADD COLUMN IF NOT EXISTS` + COMMENT |
| 0025 | subscription_grants.sql | Y | — | RLS on, **zero policies** (intentional, service_role only; allowlisted in rls-audit) | — |
| 0026 | vault_master.sql | Y | — | RLS on vault_master + 1 select-only policy | `ADD COLUMN IF NOT EXISTS` ×2 on secret_vault |
| 0027 | vault_master_decoy.sql | Y | — | n/a | Single `ADD COLUMN IF NOT EXISTS` |
| 0028 | vault_code_hash.sql | Y (D-1 hardened) | **UPDATE backfill + DROP COLUMN** (lines 22, 35) | n/a | Plaintext→bcrypt, irreversible by design (P0) |
| 0029 | private_storage.sql | Y | `UPDATE storage.buckets` (line 16); `DROP POLICY IF EXISTS` ×4 | Replaces public-read storage policies with owner-scoped ones | P0-6 fix; `DROP FUNCTION IF EXISTS` with old composite signature then recreate |
| 0030 | ops.sql | Y | — | RLS on rate_limits/ai_events/ops_events, **zero policies** (intentional; allowlisted) | `REVOKE ALL … GRANT … TO service_role` on bump_rate_limit |
| 0031 | timezone.sql | Y | — | n/a | `ADD COLUMN IF NOT EXISTS` + COMMENT |
| 0032 | admin_billing.sql | Y | — | RLS on 5 tables; 4 with zero policies (intentional; allowlisted), promotions likewise | Seeds guarded by `WHERE NOT EXISTS` (table-empty) |
| 0033 | tab_proposals.sql | Y | drop/create policies | RLS + 2 policies (read + own-update; **no INSERT policy** — service_role only, by design) | — |
| 0034 | ai_governance.sql | Y | `DROP CONSTRAINT IF EXISTS` + re-add (spaces_type_check, lines 129–131) | RLS on 4 tables, zero policies (intentional; allowlisted) | Seeds guarded; vault_id FKs to secret_vault |

All 30 `CREATE TABLE` statements use `IF NOT EXISTS` (verified by grep). All 52 `CREATE POLICY`
statements are preceded by `DROP POLICY IF EXISTS` in the same file. All `CREATE INDEX` use
`IF NOT EXISTS`. Every created table gets `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (verified:
29 enable statements cover all 30 tables — storage.objects is enabled conditionally in 0029).

## 2. Findings (with file:line evidence)

### F-1 — 0003/0005 narrow the `items_kind_check` on re-run (populated-DB hazard)
- `0003_item_kinds.sql:2`: `alter table public.items drop constraint items_kind_check;` (no `IF EXISTS`),
  then re-adds a check listing only kinds up to `'checklist'`.
- `0005_things.sql:6`: same pattern, re-adds up to `'thing'`.
- On the empty scratch DB the harness passes (pass 2 runs 0003 → 0005 → … → 0021/22/23 re-widen the
  constraint via their DO guards). But re-running 0003 or 0005 **standalone against a populated DB**
  that already holds rows with kind `'expense'`/`'watch'`/`'memory'`/`'feedback'` fails loudly:
  the narrowed `ADD CONSTRAINT` validates existing rows and raises a check-violation error.
- Failure mode is loud (error, not silent corruption), and the supported flow (ordered full replay)
  self-heals via 0021/22/23. Still, it violates the D-1 idempotency mandate semantically.
- Remediation (nice-to-have / should-fix): convert 0003/0005 to the 0021-style DO guard, or make
  their re-added check list the full current kind set.

### F-2 — 0015 deletes user data by design (one-time sweep, unrecoverable)
- `0015_shopping_archive.sql:20-21`: `delete from public.items where kind = 'shopping' and list_id is null;`
- Unguarded, deliberate ("One-time sweep … remove every loose shopping item"), documented in the header.
  Re-run is a no-op. But on first application to a production DB holding legacy loose shopping items,
  those rows are destroyed with no archive (unlike 0019, which snapshots into trash_bin).
- Remediation: none if already applied to prod (likely). For any future data-sweep migration, archive
  first (trash_bin) rather than bare DELETE. Flagged, by design — not a must-fix.

### F-3 — 0019 is a destructive data migration (re-run safe, expiry advisory)
- `0019_universal_trash.sql:76-115`: DO block inserts trashed tabs/notes into `trash_bin`, then
  `delete from public.notes` (84), `delete from public.space_tabs` (85), `delete from public.items`
  (114), `delete from public.notes` (115); `120-121` drop the `deleted_at` columns.
- Re-run safe: both loops are guarded on the `deleted_at` columns existing (`information_schema`
  checks, lines 52-58 and 93-99); column drops use `IF EXISTS`.
- Data is preserved in `trash_bin.payload`, BUT `expires_at` is stamped `deleted_at + 30 days`
  (lines 74, 102) and **no purge mechanism exists** in migrations or edge functions
  (grep: only `account-export`/`account-delete` reference trash_bin). The expiry is currently
  advisory metadata — rows are never actually purged. Either implement the purger or document that
  expiry is unenforced. Nice-to-have.
- Ordering note: line 108 reads `r.vault_id` (notes.vault_id), which is created by 0018:36 —
  0019's header correctly requires running AFTER 0018. No forward reference in filename order.

### F-4 — No forward references; ordering is clean
- Verified every cross-migration dependency resolves backward in filename order:
  - 0018 reshape → 0017 `secret_vault`; 0019 → 0018 (`notes.vault_id`); 0020 trigger → items;
    0022 index → 0020 `reminder_sent_at`; 0026 → 0017/0018 `secret_vault`;
    0034 `vault_id` FKs → 0017/0018 `secret_vault`; 0020/0022 functions → 0004 `device_tokens`,
    0010 `profiles`, 0001 `spaces`/`space_members`.
  - 0018:22 defensively drops `notes_vault_id_fkey` IF EXISTS before it could exist (harmless no-op on
    fresh DBs; guards dev DBs where the FK was added early).
  - 0004's `ALTER PUBLICATION … ADD TABLE` is wrapped in `DO … EXCEPTION WHEN duplicate_object`
    (lines 24-28) — re-run safe.
- No migration reads an object created by a later-numbered migration. No out-of-order assumptions
  beyond filename order.

### F-5 — RLS coverage: no windows, all tables covered
- Every user-data table enables RLS **in the same migration that creates it** — no window where a
  table exists without RLS.
- Zero-policy tables are exactly the 13 service_role-only system tables, all present in the
  `SYSTEM_TABLES` allowlist in `rls-audit.mjs` (lines 58-63): ai_evals, ai_events, ai_governance,
  ai_governance_audit, pending_actions, broadcasts, feature_flags, promotions, subscription_plans,
  subscription_grants, user_subscriptions, ops_events, rate_limits. **The audit misses nothing.**
- `vault_master` (0026) has exactly one policy (owner SELECT; no write policies) — passes audit
  check (c) and matches its documented design (writes via vault-master edge fn, service_role).
- `tab_proposals` (0033) has read + own-update policies but **no INSERT policy** — clients cannot
  insert; edge fns use service_role. Documented in the file header ("edge functions use
  service_role"); by design, not a gap.
- No policy anywhere uses a trivially-true `USING (true)` / `WITH CHECK (true)` qualifier.
- Historical note: 0001's `voice_notes_read` / 0008's `item_photos_read` were public-read
  (`USING (bucket_id = …)` with no role restriction) — the P0-6 issue 0029 fixed by dropping both
  (0029:36-37) and replacing with owner-scoped authenticated policies (0029:41, 0029:80).
  Final state is correct.

### F-6 — Harness cross-check: `authz-behavioral.mjs` step-5 allowlist misses `can_read_photo`
- `authz-behavioral.mjs` step 5 flags any policy whose qual lacks
  `/auth\.uid\(\)|is_space_owner|is_space_member|can_access_space/`.
- `0029_private_storage.sql:80` creates `item_photos_owner_read … USING (public.can_read_photo(bucket_id, name))`.
  The qual text contains none of the four alternatives, so the harness would report
  `storage.objects.item_photos_owner_read` as "not gated on auth.uid()" — a **false positive**:
  `can_read_photo` (0029:52-73) is `SECURITY DEFINER`, gates on `auth.uid()` and
  `public.can_access_space(n.space_id)` in its body, and execute is revoked from public/anon
  (0029:75-76). The migration is correct; the test allowlist is incomplete.
- This is plausibly a contributor to the currently-failing rls-audit CI job
  ("Behavioral authorization tests", run 38115164580). Remediation is in the **test file**, not a
  migration: add `can_read_photo` to the step-5 regex (or otherwise recognize SECURITY DEFINER
  helpers whose bodies gate on auth.uid()). **Static prediction only — I did not execute the
  harness** (no DB work per task constraints); the D-1.1 coordinator should confirm by running it.

### F-7 — Supabase-managed dependencies and stub coverage
| Dependency | Used by | Stub in `migrate-lib.mjs` | Covered? |
|---|---|---|---|
| `auth.users` (table + FKs) | 0001, 0002, 0004, 0006, 0010, 0012, 0013, 0014, 0019, 0025, 0026, 0032, 0033, 0034 | `auth.users(id uuid PK)` stub | Y |
| Trigger on `auth.users` | 0010:60-63 | Stub table accepts triggers; harness runs as superuser | Y |
| `auth.uid()` | policies + helpers (0001, 0002, …) | Returns `null::uuid`; authz-behavioral swaps in JWT-claims version | Y |
| `storage.objects` + `storage.foldername()` | 0001, 0008, 0029 | Stub table (bucket_id/name/owner subset) + foldername fn | Y |
| `storage.buckets` | 0001, 0008, 0029 | Pre-seeded with both buckets | Y |
| `supabase_realtime` publication | 0004 | Stub publication | Y |
| `pg_cron` (`cron.schedule/unschedule`) | 0020, 0022 | `create extension` lines neutralized to comments; `cron._jobs` + upsert-on-conflict stub fns | Y |
| `pg_net` (`net.http_post`) | 0020, 0022 (function bodies only) | Neutralized; bodies never executed at migrate time | Y |
| `pgcrypto` (`gen_random_uuid`, `crypt`, `gen_salt`) | all (uuid defaults), 0028 | Harness installs real pgcrypto, else `PGCRYPTO_FALLBACK` (gen_salt/crypt only) | Y* |
| `gen_random_uuid()` on vanilla PG | everywhere | *Assumes PG ≥ 13 (core) or real pgcrypto; the fallback does NOT define gen_random_uuid | Assumption — fine on Supabase |

No migration depends on a Supabase-managed object that the harness does not stub or neutralize.

### F-8 — Minor nits (no safety impact)
- Unqualified `secret_vault` references: `0017:20,26-29`, `0018:24-29,36`, `0028:9,22,31,34-35`
  rely on `search_path` resolving to `public` (true in Supabase SQL editor / migrate harness).
  0026 uses `public.secret_vault`. Inconsistent but harmless; consider qualifying for robustness.
- `0020`'s `reset_reminder_on_due_change()` and `0030`'s `bump_rate_limit()` lack
  `set search_path = public`, unlike the other SECURITY DEFINER helpers. Both are safe in practice
  (former touches only NEW/OLD; latter uses schema-qualified names) — consistency nit only.
- `0032`/`0034` seed guards are table-empty / any-active-row: admin edits to seed rows survive
  re-runs (good — no clobbering), but a fully-emptied `subscription_plans` table would be re-seeded
  on re-run. Edge case, acceptable.
- `0029:50` drops `can_read_photo(storage.objects)` (composite signature) before creating the
  `(text, text)` version — on re-run the first drop is a no-op and the second drop removes the
  real function; recreate follows. Correct, just convoluted.

## 3. Overall verdict

**The 34 migrations are safe to apply fresh (in filename order) and safe to re-run in full,
matching what `migrate-check.mjs` proves on an empty scratch DB.** Static review found no
forward references, no RLS windows, no unguarded structural statements that break the
documented replay flow, and the rls-audit allowlist covers every intentional zero-policy table.

Caveats that the empty-DB harness does NOT prove (all listed above):
1. **0003/0005 are not semantically re-runnable on a populated DB** — they narrow
   `items_kind_check`, dropping kinds added by later migrations; the ADD then fails loudly on
   existing rows. Should-fix if single-migration re-runs are ever a supported operation (F-1).
2. **0015 permanently deletes legacy loose shopping items on first apply** — deliberate and
   documented, but unrecoverable; confirm it already ran on prod (F-2).
3. **0019's trash_bin `expires_at` is unenforced** — no purger exists in migrations or edge fns (F-3).
4. **The authz-behavioral step-5 allowlist likely false-positives on
   `storage.objects.item_photos_owner_read`** because it doesn't recognize the `can_read_photo`
   helper — test-file fix, likely related to the current CI failure (F-6, static prediction).

### Remediation items

**Should fix (migration or test code):**
- `supabase/tests/authz-behavioral.mjs` (step 5 regex, ~line 155): add `can_read_photo` to the
  trusted-helper alternatives — the 0029 helper gates on `auth.uid()`/`can_access_space` in its
  body. (Test file, not a migration; flag to the D-1.1 coordinator.)
- `supabase/migrations/0003_item_kinds.sql:2-5` and `0005_things.sql:6-9`: adopt the 0021-style
  DO-guard pattern (drop only if the def lacks the new kind) so re-runs never narrow the check
  on a populated DB.

**Nice to have:**
- `0019`: implement or formally document the trash_bin purger (`expires_at` currently advisory).
- Qualify bare `secret_vault` references with `public.` (0017/0018/0028) for search_path robustness.
- Add `set search_path = public` to `reset_reminder_on_due_change()` (0020) and
  `bump_rate_limit()` (0030) for consistency with the other SECURITY DEFINER helpers.
- Future data-sweep migrations: archive into `trash_bin` instead of bare DELETE (lesson from 0015).

**Could not verify statically:** actual execution behavior of `migrate-check`/`rls-audit`/
`authz-behavioral` (no DB access per task constraints) — F-6 is a high-confidence static
prediction, not an observed failure; pg's exact rendering of the policy qualifier and any
additional behavioral failures need a harness run to confirm. Behavioral correctness of policy
predicates (who can actually see what) is, as `rls-audit.mjs` itself states, beyond static audit.

## 4. Execution verification addendum (2026-10-11, D-1.1 coordinator)

F-6 was subsequently **confirmed by live execution** against PostgreSQL 18.4 (not merely
predicted): after fixing the `pg.Client`→`pg.Pool` harness bug, the behavioral suite failed
step 5 with exactly `storage.objects.item_photos_owner_read` flagged — the false positive
predicted above. Verified live that `can_read_photo` is `SECURITY DEFINER` with
`search_path=public`, body gates on `auth.uid()` + `can_access_space`, and `EXECUTE` is
granted only to `authenticated` (revoked from public/anon). Remediation applied in the test
file (`supabase/tests/authz-behavioral.mjs` step-5 regex), after which the full behavioral
suite passes (37 policies, all scenarios green). The migration itself was and remains correct.

Two further harness-fidelity issues were found and fixed during the same live runs (see
IMPLEMENTATION_LEDGER D-1.1 entry): missing Supabase default GRANTs in the scratch DB
("permission denied" before RLS evaluation), and the `auth.uid()` stub's empty-claim
fragility (Postgres leaves a rolled-back `SET LOCAL` custom GUC as `''`, and `''::json`
raises — guarded with `nullif(..., '')`).
