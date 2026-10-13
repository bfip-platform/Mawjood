# Production rollout runbook — migrations 0035 → 0046 + function deploy

**Status: PREPARED, NOT EXECUTED.** Production is never touched without
the owner's separate, explicit approval. This runbook is written so the
owner (or the agent, on the owner's go) can execute it in one sitting
with verification at every step and a defined way back.

Release candidate: `main` @ `843c8734128dd4d3fb55a794f722cf60c779ddf6`
(PR #42 merge — includes the launch-readiness PRs #37–#41). This runbook
covers 0035→0045 for that RC. The F-LAUNCH-01 remediation (PR #43,
migration **0046**) extends the range by one when the owner merges it;
its row is in the table below.

## 0. Pre-flight (read-only; run ALL before changing anything)

1. **Confirm the backup posture** in the Supabase dashboard for project
   `mwjzosfrxwxcrzcsiear`: daily backups on / PITR state noted. Take a
   manual backup/snapshot if the plan allows. Do not proceed on an
   unknown backup state.
2. **Establish production's current migration state** (the open D0
   question). Via the SQL editor:
   ```sql
   select version, name from supabase_migrations.schema_migrations
   order by version desc limit 8;
   ```
   If that table does not reflect reality (migrations were applied out
   of band), fall back to per-migration probes:
   ```sql
   -- 0035: items status check includes 'trashed'?
   select pg_get_constraintdef(oid) from pg_constraint
   where conname like 'items%status%';
   -- 0036/0037: pending_actions exists, status set includes 'executing'
   select pg_get_constraintdef(oid) from pg_constraint
   where conname = 'pending_actions_status_check';
   -- 0042 PRE-CHECK (the known drift question):
   select count(*) from information_schema.columns
   where table_schema='public' and table_name='items'
     and column_name='updated_at';   -- 1 = already exists out of band
   -- 0044: ledger present?
   select count(*) from pg_proc where proname='try_charge_ai_spend';
   -- 0045: birth_date present?
   select count(*) from information_schema.columns
   where table_name='profiles' and column_name='birth_date';
   ```
   Record the answers in the execution ledger before proceeding.
   **Every migration in 0035–0045 is idempotent** (guards / IF NOT
   EXISTS / drop-then-create), so applying the full chain over a
   partially-applied schema is safe — that is by design.
3. **Note the currently deployed function set + versions** (dashboard →
   Edge Functions) so a redeploy rollback has a known prior state.

## 1. Apply migrations, in order, one at a time

Apply via the dashboard SQL editor or the Management API, **in numeric
order 0035 → 0045**, verifying after each with its probe (the
`migrate-lib.mjs` assertion for that migration is the exact check —
19 assertions total). Highlights per migration:

| # | Content | Verify | Rollback |
|---|---|---|---|
| 0035 | items `'trashed'` status; profiles trash floor ≥30 + clamp trigger | status check text; trigger `profiles_trash_floor` exists | Forward-fix preferred: once `'trashed'` rows exist the CHECK cannot narrow safely. Trigger drop is safe: `drop trigger profiles_trash_floor on public.profiles;` |
| 0036 | `pending_actions` CHECKs gain `forget_memory` (the table + RLS themselves were created in 0034; 0036 only extends them) | constraint text names `forget_memory` | Reversing 0036 alone = narrow the CHECK back. `drop table public.pending_actions;` removes 0034's governed-actions table too — only as a last resort, and only if no previews are in flight |
| 0037 | claim states (`executing`) | constraint text includes `executing` | Narrow the CHECK only when zero rows are `executing` |
| 0038 | `can_read_photo` hardened | function body requires folder = note author | Restore the pre-0038 body from migration history (0024-era) — NOT recommended; it reopens the HIGH finding |
| 0039 | `notes_preserve_authorship` trigger | trigger exists on notes | `drop trigger notes_preserve_authorship on public.notes;` (reopens the forgeability hole — not recommended) |
| 0040 | `claim_invite_use(uuid)` atomic | function exists, service-role only | `drop function public.claim_invite_use(uuid);` + revert join-family deploy |
| 0041 | `pending_actions` accepts `merge_memory` | constraint text | Narrow only when zero `merge_memory` rows exist |
| 0042 | `items.updated_at` + touch trigger | column exists; an UPDATE bumps it | Drop trigger + function; the column itself is derived data — keeping it is harmless |
| 0043 | trigram indexes | indexes exist | `drop index concurrently <name>;` per index |
| 0044 | `ai_spend_daily` + `try_charge_ai_spend` / `ai_spend_total` | RPCs service-role only; RLS on, no client policies | `drop function` ×2 + `drop table` (loses spend history — keep unless necessary) |
| 0045 | `profiles.birth_date` | column type `date` | `alter table public.profiles drop column birth_date;` (loses declarations — keep unless necessary) |
| 0046 | items policy split (no client DELETE) + `hard_delete_items` RPC (F-LAUNCH-01 Option B; PR #43) | `pg_policies` for items shows INSERT/UPDATE policies only (no ALL/DELETE); `hard_delete_items` prosecdef + authenticated-executable, anon NOT | Restore the pre-0046 posture: `drop function public.hard_delete_items(uuid[]); drop policy "items_member_insert" on public.items; drop policy "items_member_update" on public.items; create policy "items_member_write" on public.items for all using (public.can_access_space(space_id)) with check (public.can_access_space(space_id));` — safe in any order vs the client (the RPC path and the restored direct path coexist); re-opens F-LAUNCH-01 by definition |

**0043 at scale:** if production `items`/`notes` are large, do NOT run
0043's plain `CREATE INDEX` inside the migration transaction — build
each index `CREATE INDEX CONCURRENTLY` first (per the migration's
header), then apply the migration (its `IF NOT EXISTS` guards make it
a no-op over pre-built indexes).

## 2. Deploy edge functions

Deploy ALL functions from the release-candidate tree (eliminates
version skew between `_shared/*` and individual functions):

```
supabase functions deploy --project-ref mwjzosfrxwxcrzcsiear
```

Secrets/env that must exist (owner verifies in dashboard; values are
never printed in the ledger): `OPENAI_API_KEY` and/or `GROQ_API_KEY`,
`INTERNAL_API_SECRET` (internal chains: extract/consolidate/janitor),
`ADMIN_TOKEN`, `CRON_SECRET`, plus the optional spend controls —
`AI_DAILY_SPEND_CAP_USD` (unset = provisional $2.00 default) and
`AI_SPEND_CAP_OFF` (kill switch; leave unset).

## 3. Post-deploy verification (all must pass)

1. `migrate-check` assertions against production are NOT run (it builds
   its own DB) — instead re-run the §0 probes: every migration's verify
   column reads true.
2. Smoke, with a dedicated test account: sign in → **age gate appears**
   (no DOB on file) → declare an adult DOB → chat home → send a note →
   extraction lands → ask a question → answer cites the note.
3. Spend ledger: the test account's chat produced an `ai_spend_daily`
   row for today (`select * from ai_spend_daily where user_id = …`).
4. Forget rail: in chat, request forgetting a test fact → preview with
   a 6-digit code appears → the fact is NOT trashed until «نفّذ <code>»
   is sent → after execution it is in trash and restorable.
5. Photo isolation spot check: a photo attached to the test account's
   private note is not readable under a second test account's session.

## 4. App release

Build from the same RC (EAS/TestFlight per the owner's standing
process). The web trial (GitHub Pages) redeploys from the RC tree with
the documented baseUrl procedure (AGENTS.md).

## 5. Rollback doctrine

- **Functions/app roll back freely**: redeploy the previous build; all
  schema changes in this range are additive and tolerated by the old
  code (the one exception: pre-0042 code never touches `updated_at`,
  which is exactly the bug 0042 fixes — rolling functions back
  reintroduces no NEW failure).
- **Schema rolls forward by preference.** Per-migration reversals are
  listed above with their data-loss notes; none is required for a
  code rollback.
- If anything in §3 fails: stop, redeploy the previous functions, and
  record the failure + probe outputs in the execution ledger before
  any second attempt.
