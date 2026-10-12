# Mawjood D1 — Scratch Environment: Migration & Testing Plan

**Status:** SCRATCH CREATED + ISOLATION VERIFIED 2026-10-12 ~14:29 EDT (owner-authorized setup; D1 implementation NOT started)
**Scratch ref:** `caimavjwasxiegjhxdsr` (us-east-2, Free plan, $0 — creation form confirmed no charge, no payment method, no upgrade). DB password was set via the form generator and is NOT recorded anywhere; owner can reset it under Settings → Database.
**Companion document:** `D1_READINESS_AND_EXECUTION_PLAN.md` (same directory)

---

## 1. Environment identity (verify before every use)

| | Project | Ref | Role |
|---|---|---|---|
| PRODUCTION — **never a test target** | `rezeqaysar's Project` | `mwjzosfrxwxcrzcsiear` | Live users. DO NOT modify, deploy to, or run tests against. |
| SCRATCH | `mawjood-d1-scratch` | `caimavjwasxiegjhxdsr` | Isolated D1 testing only. Synthetic data only. |

**Identity gate (mandatory, before any scratch run):** confirm the target ref in TWO places (dashboard URL + Settings → General) and write it into the run log. If the ref on screen is `mwjzosfrxwxcrzcsiear`, STOP — that is production.

**Independent verification (per owner instruction):** before any destructive test runs, a second check confirms the scratch identity recorded here matches the dashboard and differs from production.

## 2. Cost & plan

- Organization `rezeqaysar`, Free Plan. Scratch project created only after the dashboard creation form confirmed **$0 / no payment method / no upgrade** (verified at creation; see creation report).
- If Supabase ever shows the free-project limit reached or any charge for this project: STOP, report to owner, do not proceed.

## 3. Migration application plan (schema parity with production)

Goal: scratch schema = production schema (migrations `0001`–`0034` from `supabase/migrations/` on `main` @ `cc7397f`), applied in filename order, nothing else.

Known tooling constraints (verified 2026-10-12):
- Agent VM has **no Supabase CLI and no Docker**; plain `git`/API access only.
- Dashboard SQL Editor text entry was **blocked for browser automation** (Monaco editor) during the cron inspection — so "paste 34 migrations via the browser" is not a reliable route.

Routes, in preference order:
1. **Owner-run CLI (recommended):** on the owner's machine — `supabase link --project-ref <<SCRATCH_REF>>` then `supabase db push`. Uses the DB password set at creation (owner can reset it under Settings → Database if needed). Agent verifies results read-only afterwards.
2. **Transient Management API token at D1 start:** owner provides an `sbp_` token transiently (used once via env, never stored — standing owner rule); agent applies migrations through the Management API and verifies. This is the same pattern used for the Oct-9 governance deploy.
3. Owner pastes migrations into the dashboard SQL Editor manually (34 files; slow, error-prone — last resort).

Verification after application: table count and migration list in scratch match the repo's 34 files; `cron.job` in scratch is EMPTY (migrations must not inherit production's reminder jobs pointing at real data — if any migration schedules jobs, list them here before proceeding: <<FILL AFTER APPLICATION>>).

## 4. Synthetic fixtures only

- Users: generated test accounts only (e.g. `d1-user-a@scratch.test`, `d1-user-b@scratch.test`), created inside scratch Auth.
- Content: generated facts/notes/photos (programmatically generated image bytes; no real photographs).
- NEVER copy production rows, memories, photos, credentials, or keys into scratch. NEVER point a scratch test at a production URL/key or vice versa. Scratch `.env` lives outside the repo's tracked files and stays gitignored.

## 5. Test sequence (each: seed → run → assert; all on scratch ref only)

Failing-first, in D1 batch order (see readiness plan §B1–B5):
1. **T-D1-1 decay:** seed an importance-1 fact older than 90 days → invoke `memory-consolidate` on scratch → on current code it is hard-deleted (repro); after the D1 fix it must survive.
2. **T-D1-2 pruneFacts cap:** seed 210 facts → trigger the write path (`memory-learn` save) → count facts.
3. **T-D1-3 forget_fact:** seed two facts sharing a substring, referenced from different conversations → run forget for one conversation → assert scoping + trash/restore behavior per spec.
4. **T-D1-4 trash retention:** trash an item → assert 30-day retention applies to all tiers and survives a plan downgrade (Decision #6).
5. **Photo-escalation repro (D0 Claim B):** synthetic user A private photo + user B session → attempt the `chat/index.ts` read path → document the result either way; upgrades/downgrades Claim B severity with evidence.
6. **Cron isolation re-check** before any test that invokes functions on a schedule: `cron.job` on the TARGET ref only, recorded in the run log.

Each run log records: date/time, target ref (double-checked), code SHA under test, seed summary, assertions, result. Logs live under `docs/autonomous/d1/` once D1 is authorized to commit docs.

## 6. Stop conditions

- Target ref ≠ recorded scratch ref → STOP.
- Any cost, billing, or plan prompt appears → STOP, owner approval required.
- Any production data visible in scratch → STOP (isolation breach), report to owner.
- Any step needs a production change → out of scope; D1 plan governs, owner decides.

## 7. Readiness after setup

- [x] Scratch project created, $0 confirmed (2026-10-12)
- [x] Ref recorded in §1 + isolation verified 2026-10-12 (empty public schema, 0 edge functions, cron not installed / no cron schema → 0 jobs, own API keys, no storage buckets; production project not opened)
- [ ] Migration route chosen (§3)
- [ ] Migrations applied + verified
- [ ] D1 execution still requires the owner's explicit "begin D1" — setup alone does not start it
