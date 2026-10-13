# Owner action — wire the spend-ledger concurrency proof into CI

**Status: PREPARED, awaiting owner application.** The integration agent's
connector token lacks GitHub's *Workflows* permission, so any ref update
touching `.github/workflows/*` is rejected (403). This document is the
complete, ready-to-apply change — no broader credentials are requested;
the owner applies it with their own account in about a minute.

## The change (one step, one existing job)

In `.github/workflows/ci.yml`, inside the **`rls-audit`** job (the job
that already runs a PostgreSQL service and builds the migrated
`mawjood_migtest` database), insert this step **after** the
"Migrate check" step and **before** the "RLS audit" step:

```yaml
      - name: Spend-ledger concurrency proof — atomic authorize+charge (0044)
        run: node supabase/tests/spend-ledger-check.mjs
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
```

As a unified diff:

```diff
@@ rls-audit job, after the migrate-check step @@
       - name: Migrate check — full chain applies twice + schema assertions
         run: node supabase/tests/migrate-check.mjs
         env:
           DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
+
+      - name: Spend-ledger concurrency proof — atomic authorize+charge (0044)
+        run: node supabase/tests/spend-ledger-check.mjs
+        env:
+          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
 
       - name: RLS audit — policies hold on the migrated schema
```

(If the anchor lines differ slightly at application time, placement is
what matters: same job, after migrate-check, same `DATABASE_URL` env.)

## How to apply (owner, either route)

1. **GitHub web UI:** open `.github/workflows/ci.yml` on the
   `integration/program-16-35` branch (or on `main` after PR #36
   merges), click ✏️ Edit, paste the step at the anchor, commit.
2. **Local clone:** apply the diff, commit, push with your own
   credentials.

## Verify

The next CI run's `rls-audit` job log should show
`spend-ledger-check: ALL GREEN` — 50 parallel charges of $0.10 against
a $2.05 cap landing on exactly $2.000000 (the proof that migration
0044's authorize+charge is atomic at the threshold). Until this lands,
the proof is local-evidence only, as the findings register states.
