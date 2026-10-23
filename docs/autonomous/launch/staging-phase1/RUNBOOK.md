# Staging Phase 1 — Execution runbook (gates G0–G7)

**Status: PREPARED — NOT EXECUTED.** No step in this runbook has been
run. Phase 1 begins only when the owner approves it
(`OWNER_APPROVAL_CHECKLIST.md` §1) and then proceeds **one gate at a
time**, each gate under its own approval where the checklist says so.

Phase 1 scope: migration 0046 on scratch, non-provider secrets, all 24
Edge Functions, Auth configuration, test fixtures, and the
**zero-paid-AI** test matrix (G6). Phase 1 spends **$0**: it runs
entirely **before any provider key exists on scratch**. Provider keys,
the live-model journeys, and the $10 exercise budget from the merged
staging plan are a **separate, later phase gate** (G2b in the
checklist) — not part of Phase 1.

Source tree: `main` @ `7237a17cc2d47bbfe146678ba98c21117dac46ea`.
Evidence base: `PREFLIGHT_EVIDENCE.md` (live preflight, 2026-10-13).
Companion docs: `../STAGING_DEPLOYMENT_PLAN.md` (merged plan),
`../STAGING_TEST_PLAN.md` (scenario source for G5/G6),
`../OPENAI_INTEGRATION_AUDIT.md` (provider configuration),
`RISK_BLOCKER_REGISTER.md`, `OWNER_APPROVAL_CHECKLIST.md`.

## Conventions (apply to EVERY gate)

- **Target ref — the only ref any operation may touch:**
  `SCRATCH_REF = caimavjwasxiegjhxdsr`
- **REF CHECK ritual (before every mutating call, no exceptions):**
  the executor prints the fully-built request URL, reads the ref in it
  character by character, and confirms it equals the scratch ref
  before sending. The production ref `mwjzosfrxwxcrzcsiear` may appear
  in this runbook **only** inside "must NOT equal" warnings — if it
  ever appears in a request URL, the operation is aborted before
  sending and the phase halts.
- **Management API:** base `https://api.supabase.com/v1`, header
  `Authorization: Bearer <MGMT_TOKEN>`. `<MGMT_TOKEN>` is the owner's
  transient Management API token, supplied per session under the
  standing transient-credential rule. It is never written to a file,
  a log, chat, or this repo, and joins the owner's revoke list after
  the session.
- **SQL route:** `POST /v1/projects/{ref}/database/query` with body
  `{"query": "<SQL>"}` — the established route on this database
  (migrations 0001–0045 were applied exactly this way; the migration
  tracking schema is absent — see `PREFLIGHT_EVIDENCE.md`).
- **Execution log:** the executor maintains a timestamped log for the
  whole phase (UTC, operator, gate, REF CHECK result, operation,
  verbatim result summary, PASS/FAIL per check). Secret **values**
  never enter the log — names and set-equality results only. The log
  is appended to `docs/autonomous/EXECUTION_LEDGER.md` when the phase
  closes.
- **Benchmark invariant:** scratch holds frozen benchmark data —
  `items = 100,002`, `notes = 20,001`, `spaces = 2`. No step deletes
  or modifies it; fixtures live only in **new** spaces created by G5.
  Counts are re-checked at every gate.
- **Fail posture:** any FAIL or stop condition halts the phase at that
  gate. Do not "fix forward" past a failed postcheck without recording
  the failure and getting the owner's direction.

## Gate map

| Gate | Content | Owner approval | Depends on |
|---|---|---|---|
| G0 | Access + preflight re-run (read-only) | Runbook approval | — |
| G1 | Migration 0046 on scratch only | **Yes — specific** | G0 |
| G2a | Non-provider secrets on scratch | **Yes — specific** | G0 |
| G2b | Provider keys | **Deferred — separate paid-phase gate** | NOT in Phase 1 |
| G3 | Deploy all 24 Edge Functions | **Yes — specific** | G1, G2a |
| G4 | Auth Site URL / redirect allow-list | **Yes — specific + URL decision** | URL decision (R-URL) |
| G5 | Test fixtures (accounts T1–T6) | **Yes — specific** | G3 |
| G6 | Zero-paid-AI test matrix | **Yes — specific** | G1, G2a, G3, G5 (G4 only for row (a)-full) |
| G7 | Staging web build (optional in Phase 1) | **Yes — specific + URL decision** | G4 |

Gates G1 and G2a are independent of each other and of the URL decision;
G6's API/harness rows are independent of G4/G7 (see R-URL).

## Global stop conditions (any one halts the phase immediately)

1. Any request URL contains a ref other than `caimavjwasxiegjhxdsr`
   (REF CHECK failure).
2. Benchmark counts drift from 100,002 / 20,001 / 2 at any check where
   the gate itself did not create the delta (G5 creates **users and
   new spaces only** — its expected spaces delta is recorded in G5 and
   replaces the invariant from that point, with `items`/`notes`
   baselines still frozen outside fixture spaces).
3. Any row appears in `ai_spend_daily` attributable to a gate-BLOCKED
   fixture user (T4/T5 class) during G6, or any ledger row that is not
   fully explained by a deliberate gate-passing probe (corrected
   2026-10-13 — designed charge-before-attempt reservations from
   gate-passing probes are expected; see G6 row (i)).
4. Any cross-space read or write succeeds in G6(c)/(f)/(g).
5. The secrets list (G0/G2 postchecks) shows any unexpected name — in
   particular `AI_SPEND_CAP_OFF` or any provider key before G2b.
6. Any postcheck FAILs and the cause is not identified before
   proceeding.
7. The Management API token stops working mid-phase (do not substitute
   another credential source; halt and report — B2-access).

**Universal stop action:** stop sending requests, preserve the
execution log, report gate + failing check + observed values to the
owner. Unsetting all user-defined scratch secrets (G2 rollback) is the
additional hard stop if anything suggests unintended AI capability —
in Phase 1 there are no provider keys, so scratch cannot spend in any
case.

---

## G0 — Access & preflight re-run (read-only)

**Purpose.** Re-establish access for the session and re-verify that
scratch still matches the 2026-10-13 preflight exactly. Any drift =
STOP (the phase plan was written against those values).

**Prechecks.** Owner has approved this runbook (checklist §1); a fresh
transient `<MGMT_TOKEN>` is available to the executor's shell
(environment only).

**Operations (all read-only).**

```bash
REF=caimavjwasxiegjhxdsr   # REF CHECK: must be exactly this string
API=https://api.supabase.com/v1
AUTH="Authorization: Bearer <MGMT_TOKEN>"

# 1. Both projects present + healthy
curl -s -H "$AUTH" $API/projects
#    expect: scratch + production refs both ACTIVE_HEALTHY

# 2. Scratch secrets — names only (API never returns values)
curl -s -H "$AUTH" $API/projects/$REF/secrets
#    expect BEFORE G2a: [] — after G2a: exactly the G2a name set

# 3. Scratch functions
curl -s -H "$AUTH" $API/projects/$REF/functions
#    expect BEFORE G3: [] — after G3: the 24 slugs of G3

# 4. Scratch Auth config
curl -s -H "$AUTH" $API/projects/$REF/config/auth
#    expect BEFORE G4: site_url=http://localhost:3000, uri_allow_list=""
```

SQL probes (`POST $API/projects/$REF/database/query`, SELECT-only):

```sql
-- 5. Schema markers of 0045-level state
select column_name, data_type from information_schema.columns
 where table_name='profiles' and column_name='birth_date';        -- 1 row, date
select count(*) from information_schema.columns
 where table_name='items' and column_name='updated_at';           -- 1
select proname from pg_proc
 where proname in ('try_charge_ai_spend','ai_spend_total');       -- 2 rows
select count(*) from information_schema.tables
 where table_schema='public'
   and table_name in ('pending_actions','ai_spend_daily');        -- 2

-- 6. 0046 state (expected ABSENT before G1, PRESENT after)
select count(*) from pg_proc
 where proname in ('hard_delete_items','hard_delete_shopping_list');
select policyname, cmd from pg_policies
 where schemaname='public' and tablename in ('items','shopping_lists')
 order by tablename, policyname;

-- 7. Benchmark invariant + spend baseline
select (select count(*) from public.items)  as items,             -- 100002
       (select count(*) from public.notes)  as notes,             -- 20001
       (select count(*) from public.spaces) as spaces;            -- 2 (pre-G5)
select count(*) from public.ai_spend_daily;                       -- record baseline

-- 8. Migration file integrity (compare with the repo tree)
--    local: sha256sum supabase/migrations/0046_items_delete_rpc.sql
--    expect: 955ee4e1d94a4077a42a0709f850c7147dd98ef7e4399bafcc595be76d2620e3
```

Note: `GET $API/projects/$REF/database/migrations` returns `[]` on
this database — a known artifact of the absent tracking schema
(`PREFLIGHT_EVIDENCE.md`). It is **not** a drift signal and must never
be "fixed" by adopting a migration runner mid-phase (R-TRACK).

**Postchecks / PASS criteria.** Every expected value above matches.
**FAIL** = any mismatch not explained by the gates already executed
in this phase (per the "after" expectations). **Stop** on FAIL.
**Rollback.** None — read-only.

---

## G1 — Migration 0046 on SCRATCH ONLY

**Purpose.** Close F-LAUNCH-01 on scratch: split the `items` and
`shopping_lists` FOR ALL policies into read/insert/update policies
(no client DELETE policy remains) and install the two authorized
deletion RPCs, exactly as merged in
`supabase/migrations/0046_items_delete_rpc.sql`.

**Prechecks.**
1. G0 PASS in this session.
2. Owner's specific G1 approval recorded (checklist §2).
3. **Pre-state snapshot** — run and file into the execution log
   (this snapshot is the rollback's source of truth):

```sql
select tablename, policyname, cmd, qual, with_check from pg_policies
 where schemaname='public' and tablename in ('items','shopping_lists')
 order by tablename, policyname;
-- expected pre-state: items = {items_member_read SELECT,
--   items_member_write ALL}; shopping_lists = {shopping_lists_member ALL}
select proname, prosecdef from pg_proc
 where proname in ('hard_delete_items','hard_delete_shopping_list');
-- expected pre-state: 0 rows
select (select count(*) from public.items) as items,
       (select count(*) from public.notes) as notes,
       (select count(*) from public.spaces) as spaces;
-- expected: 100002 / 20001 / 2
```

**Operation.** REF CHECK, then apply the migration file **verbatim**
as one raw-SQL call — the same route 0001–0045 were applied by:

```bash
# REF CHECK: URL must contain caimavjwasxiegjhxdsr — and must NOT
# contain mwjzosfrxwxcrzcsiear (production) anywhere.
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  $API/projects/$REF/database/query \
  -d "{\"query\": \"<verbatim contents of supabase/migrations/0046_items_delete_rpc.sql @ 7237a17c, sha256 955ee4e1…e3>\"}"
```

Notes that govern this step:
- The tracking schema stays absent. Nothing is registered anywhere;
  the record of application is the execution log + these postchecks.
  Do **not** create `supabase_migrations` and do not run any CLI
  migration command against this database (R-TRACK).
- The file is idempotent by design (`drop policy if exists`,
  `create or replace function`). The query endpoint may commit
  statement-by-statement, so a mid-file transport failure can leave a
  partial application — recovery is simply to **re-run the whole
  file** and re-run the postchecks. The postchecks, not the HTTP
  status, decide the state.

**Postchecks (all must hold).**

```sql
-- Policies: exactly these sets, no ALL/DELETE cmd anywhere
select tablename, policyname, cmd from pg_policies
 where schemaname='public' and tablename in ('items','shopping_lists')
 order by tablename, policyname;
-- items:          items_member_read (SELECT), items_member_insert (INSERT),
--                 items_member_update (UPDATE)
-- shopping_lists: shopping_lists_member_read (SELECT),
--                 shopping_lists_member_insert (INSERT),
--                 shopping_lists_member_update (UPDATE)

-- RPCs: present, SECURITY DEFINER, correct grant matrix
select proname, prosecdef from pg_proc
 where proname in ('hard_delete_items','hard_delete_shopping_list');
-- 2 rows, prosecdef = true for both
select has_function_privilege('authenticated',
  'public.hard_delete_items(uuid[])','execute');            -- true
select has_function_privilege('service_role',
  'public.hard_delete_items(uuid[])','execute');            -- true
select has_function_privilege('anon',
  'public.hard_delete_items(uuid[])','execute');            -- false
select has_function_privilege('authenticated',
  'public.hard_delete_shopping_list(uuid)','execute');      -- true
select has_function_privilege('anon',
  'public.hard_delete_shopping_list(uuid)','execute');      -- false

-- Benchmark invariant
select (select count(*) from public.items) as items,
       (select count(*) from public.notes) as notes,
       (select count(*) from public.spaces) as spaces;      -- 100002/20001/2
```

**PASS** = all postchecks hold. **FAIL** = any policy set differs, any
grant differs, or counts drifted. On FAIL: stop; if the policy posture
is mixed (some statements applied), re-run the file once (idempotent);
if postchecks still fail, execute the rollback below and report.

**Rollback (exact inverse of the pre-state).** Derived from the
pre-state snapshot above; this exact SQL was proven on local
PostgreSQL by `supabase/tests/hard-delete-check.mjs` §7 (rollback
restores the pre-0046 posture; re-applying 0046 closes it again —
20/20 suite):

```sql
drop function if exists public.hard_delete_items(uuid[]);
drop function if exists public.hard_delete_shopping_list(uuid);
drop policy if exists "items_member_insert" on public.items;
drop policy if exists "items_member_update" on public.items;
drop policy if exists "items_member_write" on public.items;
create policy "items_member_write" on public.items for all
  using (public.can_access_space(space_id))
  with check (public.can_access_space(space_id));
drop policy if exists "shopping_lists_member_read" on public.shopping_lists;
drop policy if exists "shopping_lists_member_insert" on public.shopping_lists;
drop policy if exists "shopping_lists_member_update" on public.shopping_lists;
drop policy if exists "shopping_lists_member" on public.shopping_lists;
create policy "shopping_lists_member" on public.shopping_lists for all
  using (public.can_access_space(space_id))
  with check (public.can_access_space(space_id));
```

After any rollback, re-run the G1 pre-state snapshot queries and
confirm the pre-state is restored exactly (policies
{`items_member_read`, `items_member_write` ALL} +
{`shopping_lists_member` ALL}, 0 RPCs, counts unchanged), and record
in the log that F-LAUNCH-01 is **open again on scratch** by virtue of
the rollback. Caveat: the rollback was proven on local PostgreSQL, not
against hosted scratch — the re-verification above is mandatory, not
ceremonial.

---

## G2a — Non-provider secrets on scratch

**Purpose.** Give the deployed functions their operational secrets —
fresh, staging-only values — **without** creating any AI capability.
Provider keys are deliberately excluded (G2b, paid phase).

**Inventory.** The authoritative inventory is
`OWNER_APPROVAL_CHECKLIST.md` §3. G2a sets exactly:
`INTERNAL_FN_SECRET`, `CRON_SECRET`, `ADMIN_TOKEN`,
`VAULT_MGMT_SECRET` (each generated fresh), and
`AI_DAILY_SPEND_CAP_USD` = `0.50` (the merged plan §6 staging value;
production's $2.00 provisional default is untouched).

**Generation doctrine.**
- Each custom secret: `openssl rand -hex 32` (64 hex chars), generated
  **by the executor at execution time**, in the same shell that makes
  the API call, passed directly into the request body — never echoed,
  never written to a file, never pasted into chat or the log.
- The only durable copies: the scratch project's secret store and the
  **owner's password manager** (the executor hands the values to the
  owner through the owner's secure channel at execution time; if that
  handoff cannot happen, generate-and-set still proceeds only with
  the owner's recorded approval, and regeneration is the recovery for
  a lost value — the old value is never recoverable from Supabase).
- Production's values are never read and never reused.

**Operation.** REF CHECK, then:

```bash
# Values enter via shell variables set from openssl output in the
# same command line; nothing is printed.
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  $API/projects/$REF/secrets \
  -d '[{"name":"INTERNAL_FN_SECRET","value":"<generated>"},
       {"name":"CRON_SECRET","value":"<generated>"},
       {"name":"ADMIN_TOKEN","value":"<generated>"},
       {"name":"VAULT_MGMT_SECRET","value":"<generated>"},
       {"name":"AI_DAILY_SPEND_CAP_USD","value":"0.50"}]'
```

**Postchecks.**
```bash
curl -s -H "$AUTH" $API/projects/$REF/secrets
# PASS = the returned NAME set is exactly the five G2a names above.
# FAIL (and global stop) if any of these is present:
#   AI_SPEND_CAP_OFF  (must NEVER be set in staging — it disables
#                      the spend cap entirely)
#   JANITOR_ENABLED   (left unset in Phase 1; janitor stays off)
#   OPENAI_API_KEY / GROQ_API_KEY  (G2b only — their presence here
#                      voids the G6 zero-spend proof, R-SPEND)
```

**PASS** = exact name-set equality. **Rollback** = delete the five
names (Management API secrets DELETE with the name list in the body),
re-run the GET, expect `[]` (or the pre-G2a set recorded at G0).

**Ordering doctrine (binding).** G6 is designed to run with **no**
provider keys on scratch. If the owner later prefers a single secrets
step, G2b stays a separate approval regardless — the moment any
provider key is set, the zero-spend proof of G6 is void and G6 must
be re-planned as a paid run under the merged plan's §6 budget and hard
stops (R-SPEND).

---

## G3 — Deploy all 24 Edge Functions to scratch

**Purpose.** Deploy the source tree's 24 functions so the fixtures
(G5) and the matrix (G6) have a backend. Functions are independent
bundles that inline `_shared/` at build time, so **deployment order
does not affect correctness**; batching exists purely to bound blast
radius and give smoke checkpoints.

**Prechecks.** G1 + G2a PASS (functions read the G2a secrets at
runtime; deploying before G1 would let the matrix's delete probes run
against the pre-0046 posture). Owner's specific G3 approval recorded.

**Route (primary).** Management API deploy endpoint — the same
endpoint the Supabase CLI uses internally:

```
POST https://api.supabase.com/v1/projects/{ref}/functions/deploy?slug=<slug>
Authorization: Bearer <MGMT_TOKEN>
Content-Type: multipart/form-data
  metadata: {"entrypoint_path": "index.ts", "name": "<slug>", "verify_jwt": true}
  file:     the function's index.ts            as filename "index.ts"
  file:     any sibling files in the function's directory, paths
            relative to the function directory
  file:     every file of supabase/functions/_shared/,
            as filename "../_shared/<file>"
```

(If the owner instead provides Supabase CLI access at execution time,
`supabase functions deploy <slug> --project-ref caimavjwasxiegjhxdsr`
is an equivalent front-end to the same operation; the API route stays
primary because Phase 1 access is token-based.)

**verify_jwt — documented state.** The repo contains **no**
`supabase/config.toml` (verified by file search at the source tree),
so there are no in-repo per-function `verify_jwt` overrides to honor.
Phase 1 deploys every function with `verify_jwt: true` (the platform
default, stated explicitly in the deploy metadata). This blocks no
planned test: every client call in G5/G6 carries either the anon key
(a JWT, which passes platform verification) or a user JWT, and
function-level auth then applies (`route`/`classify` return 401
without a caller via `_shared/edge-auth.ts`; `public-config` is
anon-safe by design). Any future no-key endpoint is a G4/G7 decision,
not a Phase 1 one.

**Batches (alphabetical, 6 per batch).**

| Batch | Slugs |
|---|---|
| 1 | account-delete, account-export, admin-ai-governance, admin-broadcast, admin-catalog, admin-set-limits |
| 2 | admin-stats, admin-subscribe, admin-user, ask, chat, classify |
| 3 | extract, family-members, join-family, memory-consolidate, memory-learn, notify |
| 4 | public-config, report-error, route, telemetry-janitor, transcribe, vault-master |

**Per-batch smoke (after each batch).**
```bash
curl -s -H "$AUTH" $API/projects/$REF/functions
# PASS = every slug deployed so far is present with status ACTIVE,
#        count grows by exactly the batch size (6/12/18/24).
```
Any deploy error or non-ACTIVE status: **stop**. Previously deployed
batches may stay (functions are additive and inert without callers);
the phase does not proceed to the next batch until the failure is
explained in the log.

**Final smoke (after batch 4)** — uses the scratch project URL +
scratch **anon key** (obtained at execution time via
`GET $API/projects/$REF/api-keys`, held in shell env only):

```bash
FN=https://caimavjwasxiegjhxdsr.supabase.co/functions/v1   # REF CHECK
# public-config: no user JWT, anon key only → expect HTTP 200 + JSON config
curl -s -H "apikey: <SCRATCH_ANON_KEY>" -H "Authorization: Bearer <SCRATCH_ANON_KEY>" \
  $FN/public-config
# route / classify with NO user JWT → expect 401 (auth gate, PR #18), not 500
curl -s -X POST -H "apikey: <SCRATCH_ANON_KEY>" -H "Authorization: Bearer <SCRATCH_ANON_KEY>" \
  -H 'Content-Type: application/json' -d '{}' $FN/route
curl -s -X POST -H "apikey: <SCRATCH_ANON_KEY>" -H "Authorization: Bearer <SCRATCH_ANON_KEY>" \
  -H 'Content-Type: application/json' -d '{}' $FN/classify
# chat with NO user JWT → expect an auth refusal (401 / graceful
# refusal body), never a 500 and never a model call.
```

**PASS** = 24/24 ACTIVE + final smoke as above. **FAIL** = any slug
missing/non-ACTIVE, public-config not 200, or an unauthenticated call
reaching a model path.

**Rollback.** Per function:
`DELETE $API/projects/$REF/functions/<slug>` (REF CHECK first).
Roll back the failed batch, or all 24 for a whole-phase rollback.
Postcheck: `GET …/functions` returns the agreed remainder set.

---

## G4 — Auth configuration (Site URL + redirect allow-list)

**Purpose.** Let real sign-in flows (magic link / OAuth-style
redirects) land on the staging web origin instead of the platform
default.

**BLOCKER — read first.** The staging web URL is **UNDECIDED**
(register R-URL). This gate cannot execute until the owner picks one
of the candidates in `RISK_BLOCKER_REGISTER.md` §R-URL (existing
GitHub Pages trial origin — flagged for environment mixing,
R-KEYMIX; a staging-specific Pages location the owner creates; or
local-only `http://localhost:3000`, the current default). **No URL is
invented by this runbook.** G4 blocks only itself and G7 — G1–G3, G5,
and G6's API/harness rows proceed without it.

**Pre-state (from preflight, re-read at G0):**
`site_url = http://localhost:3000`, `uri_allow_list = ""`,
`mailer_autoconfirm = false`, `enable_anonymous_sign_ins = null`.

**Mechanics the owner is deciding with.** Supabase email links point
at `site_url`; an app-supplied `redirectTo` is honored only if it
appears in `uri_allow_list` (comma-separated). So both fields must
name the chosen origin (the allow-list typically also keeps
`http://localhost:3000` for executor-local testing, if the owner
wants that).

**Operation (once the URL is decided).** REF CHECK, then:

```bash
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  $API/projects/$REF/config/auth \
  -d '{"site_url": "<OWNER-DECIDED STAGING URL>",
       "uri_allow_list": "<OWNER-DECIDED URL>",
       "enable_anonymous_sign_ins": <true only if the owner approves
         real anonymous sessions for fixture T6 — see G5>}'
```

**Postcheck.** `GET …/config/auth` returns exactly the values set;
a `generate_link` probe (G6 row (a)) produces a link whose redirect
target is the chosen origin. **PASS** = values match the owner's
decision verbatim. **Rollback** = PATCH the pre-state values back
(recorded at G0) and re-GET to confirm.

---

## G5 — Test fixtures (accounts T1–T6)

**Purpose.** Create the `../STAGING_TEST_PLAN.md` §1 account matrix as
real Auth users on scratch, with spaces and DOB fixtures the matrix
needs. Fixtures live in **new** spaces only; benchmark data is never
touched.

**Prechecks.** G3 PASS. Owner's specific G5 approval recorded.
Executor holds the scratch **service_role key** for this gate only:
`GET $API/projects/$REF/api-keys` → the `service_role` entry, kept in
shell environment, never printed or logged. (Platform keys are not in
the secrets GET list — see `PREFLIGHT_EVIDENCE.md` — the api-keys
endpoint is the route.)

**Operations.**

1. Create users via the Auth Admin API (project Auth endpoint, NOT
   the Management API):

```bash
AUTHAPI=https://caimavjwasxiegjhxdsr.supabase.co/auth/v1   # REF CHECK
# per fixture T1..T5:
curl -s -X POST -H "apikey: <SCRATCH_SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SCRATCH_SERVICE_ROLE_KEY>" \
  -H 'Content-Type: application/json' \
  -d '{"email": "<owner-designated test address>",
       "password": "<executor-generated; owner password manager only>",
       "email_confirm": true}' \
  $AUTHAPI/admin/users
# Record ONLY the returned user ids in the execution log.
```

   - Email addresses are **owner-designated** (his own mailbox /
     aliases) — none are invented by this runbook, and none are
     recorded here.
   - `email_confirm: true` makes fixtures usable immediately despite
     `mailer_autoconfirm = false` (the real magic-link flow is tested
     separately in G6(a)).
   - Passwords are executor-generated at creation time and stored
     only in the owner's password manager — never in the log.

2. Spaces + membership (SQL via the query endpoint, or REST as the
   fixture users): T1 creates a new Family space (owner); T2 is added
   as a member; T3 creates its own private space. Record the new
   space ids in the log. **The spaces invariant changes here, by
   design:** from this gate on, the expected spaces count is
   `2 + <fixture spaces created>` and the execution log carries the
   explicit fixture id list; `items`/`notes` counts in the two
   pre-existing spaces remain frozen.

3. DOB seeding (SQL on `profiles`):
   - T1 `1990-05-17`, T2 `1988-03-02`, T3 `1995-07-21`,
     T5 `2012-01-01` (synthetic underage fixture — no real minor).
   - T4: leave `birth_date` **NULL** (undeclared).
   - Boundary fixtures for G6(b) are created at matrix time (below).
   - **Recorded deviation:** the test plan prefers seeding DOB through
     the in-app declaration flow because that flow is itself under
     test. Phase 1 has no staging web build until G7, so Phase 1
     seeds by SQL and tests the gate's **server side**; the in-app
     declaration UI is exercised at G7 if the owner runs it, and
     otherwise in the paid phase. The deviation is owner-visible in
     the checklist (§2, G5 line).

4. T6 anonymous: only if G4 set `enable_anonymous_sign_ins`. If it did
   not, G6 covers the trial-gate behavior through T4 (NULL DOB,
   signed in) and this substitution is recorded in the log — T6's
   distinct claim shape (`is_anonymous`) is then explicitly
   **untested in Phase 1**, not silently assumed.

**Postchecks.** Each fixture: password-grant login succeeds
(`POST $AUTHAPI/token?grant_type=password` with the anon key),
`profiles.birth_date` matches the matrix, space membership reads back
correctly, benchmark counts in pre-existing spaces unchanged.
**PASS** = all fixtures verified. **Rollback** = delete the fixture
users (`DELETE $AUTHAPI/admin/users/<id>`) and delete fixture spaces
**by the explicit id list from the log** — never by pattern, never
the bench space `047a3e5a-494d-43c8-b84a-142e364514ee` — then re-run
the G0 counts and confirm the pre-G5 invariant (2 spaces) is restored.

---

## G6 — Zero-paid-AI test matrix

**Purpose.** Prove the Phase 1 behaviors that do **not** need a model:
auth, the 18+ gate, tenant isolation, the storage layer under the
memory lifecycle, trash/restore + purge eligibility, the F-LAUNCH-01
delete posture **live**, offline sync, and audit logging.

**Precondition (the whole point).** Scratch holds **no provider
keys** (G2a only; G2b not executed). Under `_shared/ai.ts`, that
yields an empty-key Groq configuration: any code path that reaches a
model call fails at the provider seam and **cannot spend**. Rows
below treat that provider failure, where it occurs, as the EXPECTED
outcome and assert everything that must happen *before* it.

**Order.** (a) → (b) → (c) → (d) → (e) → (f) → (g) → (h) → (i).
Rows (f) and (g) require G1 (they probe the post-0046 posture; before
G1 the same probes would delete rows — that is precisely the finding
0046 closes). Every row records: request, verbatim response summary,
DB before/after probes, PASS/FAIL.

### (a) Authentication

Operations: T1 password-grant login (above) → expect 200 with
`access_token` + `refresh_token`; refresh grant → 200 with a new
token; wrong password → 400, no token; `chat` invocation with no user
JWT → refusal (never 500, never a model call).
Full email-link flow (requires G4): Admin `generate_link`
(`POST $AUTHAPI/admin/generate_link`, type `magiclink`) returns the
action link without depending on mail delivery; the link's redirect
target must equal the G4 origin — **pre-G4, the link points at the
default `site_url` and this sub-row is recorded as BLOCKED-BY-G4, not
failed**.
**PASS** = all non-G4 sub-rows behave as specified.
**FAIL** = a wrong credential yields a token, or an unauthenticated
function call reaches business logic.

### (b) 18+ gate (chat, server-side)

Invoke `chat` with each fixture's user JWT and a trivial text body.

| Fixture | Expected | PASS evidence |
|---|---|---|
| T4 (DOB NULL) | Graceful refusal body `{age_gate: true, actions: []}` (HTTP 200), **before** any spend check or model call | `ops_events` row `kind='age_gate.blocked'`, `detail='not_declared'`; **no** `ai_spend_daily` row for T4 |
| T5 (underage) | Same refusal shape | `ops_events` row with `detail='under_18'`; no ledger row |
| T1 (adult) | NOT age-gated: the request passes the gate and fails only at the provider seam (zero-key config) | Response is a provider-seam failure, not an `age_gate` body; the gate ordering (gate → spend pre-check → model) is thereby demonstrated |
| T7a boundary: DOB = run-date − 18 years exactly | Admitted (passes the gate, fails at provider seam like T1) | Same as T1 |
| T7b boundary: DOB = T7a + 1 day | Refused | `age_gate` body + ops row |

T7a/T7b are throwaway fixtures created for this row (SQL-seeded DOB
computed from the **run date**, not hard-coded), deleted when the
matrix ends. Age math reference: `_shared/age.ts` /
`packages/voice-engine/src/age.ts` (strict YYYY-MM-DD; Feb-29 → Mar 1
in non-leap years), pinned by the unit suite.
**FAIL** = T4/T5 reaches a model path, any ledger row appears, or a
boundary case lands on the wrong side.

### (c) Tenant / space isolation

With T3's user JWT against T1's space (REST, scratch anon key +
T3 Bearer):
- `GET /rest/v1/items?space_id=eq.<T1 space>` → **0 rows**;
  same for `notes` and `spaces` membership reads.
- Photo probe: a photo-bearing note exists in T1's space (fixture
  created as T1 in row (d) prep: note with `photo_url` set); T3's
  read of the note returns nothing, and a direct Storage object GET
  for that photo path (bucket identified from the fixture's
  `photo_url`) under T3's JWT → denied (400/403), per the 0038
  `can_read_photo` posture.
- Cross-space write: `POST /rest/v1/items` with `space_id` = T1's
  space under T3's JWT → rejected (RLS 403), and a confirming read
  shows no row was created.
**PASS** = every probe returns empty/denied. **Any success = global
stop condition 4** (phase halts, owner notified before anything else
runs).

### (d) Memory lifecycle — storage layer (no AI)

The AI-driven lifecycle (dictate → extract → forget-by-chat) is the
paid phase. Phase 1 verifies the storage layer it rides on, via REST
as T1 in T1's fixture space:

1. Create item with a known full field set → read back → field-by-
   field equality (title/details/meta) with what was sent.
2. Update the item → read back → only the intended fields changed;
   `updated_at` advanced (0042 touch trigger).
3. Trash (the engine's `trashFact` equivalent, `_shared/memory.ts`):
   `status` → `'trashed'` and `meta.trashed_at` stamped → the row is
   excluded from open-item reads and present in trashed reads.
4. Restore: `status` → `'open'`, `meta.trashed_at` removed → read
   back **byte-identical** to the pre-trash state (compare the full
   row JSON).
5. Confirmation-claim semantics (SQL-level simulation of the exact
   pattern the engine uses — `_shared/memory.ts`
   `claimForgetPreview`, migration 0037): insert a `pending_actions`
   preview row (`action_type='forget_memory'`, a 6-digit
   `confirm_code` in the payload, `status='pending'`,
   `expires_at = now() + 30 minutes`), then:
   - Claim: `update pending_actions set status='executing'
     where id=<row> and status='pending'` → **exactly 1 row**.
   - Second identical claim → **0 rows** (single-use).
   - A second preview row with `expires_at` in the past: the
     validation predicate the engine applies (`status='pending'`
     AND `expires_at > now()`, fail-closed on missing/malformed
     expiry) excludes it — assert by the same predicate query.
   - Clean up: mark the simulation rows `cancelled`; they are
     fixtures, identified by id in the log.
   This row proves the claim pattern against the hosted schema; it
   is **not** a substitute for the paid phase's live
   «نفّذ <code>» journey, and the log must say so.

**PASS** = every equality and count above holds. **FAIL** = any
round-trip difference, or a second claim succeeding.

### (e) Trash / restore + purge eligibility (selection only)

With test-owned fixtures only (created in row (d)'s space):
- Fixture A: trashed, `meta.trashed_at` = now − 31 days.
- Fixture B: trashed, `meta.trashed_at` = now − 29 days.
- Fixture C: trashed then restored (status `open`).
- Baseline: record the eligibility count **before** inserting the
  fixtures:
```sql
-- the purge selection purgeExpiredTrashedFacts applies
-- (_shared/memory.ts): status='trashed' AND meta.trashed_at
-- older than the 30-day retention floor (profiles floor >= 30,
-- migration 0035)
select count(*) from public.items
 where status='trashed'
   and (meta->>'trashed_at')::timestamptz < now() - interval '30 days';
```
**PASS** = after fixtures, the count is baseline + 1 (only A), and
the selection by id returns A only — B survives (floor respected),
C is excluded (restored). **No purge is executed in Phase 1.** The
only deletion a purge may ever touch in a later phase is a fixture
row the test itself created; the engine purge path is exercised live
only in the paid phase under the test plan §3.6. Benchmark rows are
never selected by id-targeted fixture checks and never deleted.

### (f) Direct DELETE denial — the live F-LAUNCH-01 probe (needs G1)

With real user JWTs, raw REST deletes against fixture rows:
- T1 (owner): `DELETE /rest/v1/items?id=eq.<own fixture item>` →
  **0 rows affected**; a follow-up GET shows the row intact.
- T2 (member): same probe → 0 rows, row intact.
- Same pair of probes against a fixture `shopping_lists` row → 0
  rows, list and its items intact.
(PostgREST reports RLS-filtered deletes as success with an empty
result set — the row-intact GET, not the status code, is the
evidence.)
**PASS** = all four probes delete nothing. **Any deletion = FAIL +
global stop** (it would mean G1's posture is not actually live).

### (g) Authorized hard-delete RPCs (needs G1)

Via `POST /rest/v1/rpc/...` with user JWTs:
- T1 `hard_delete_items {p_ids: [own fixture]}` → returns **1**;
  row gone on re-read.
- T1 batch of two own fixtures → returns **2**.
- T2 (member) on a shared-space fixture → returns 1 (member
  semantics preserved — the app's delete-forever flows keep working).
- T3 (outsider) on T1's fixture → error **42501**; row intact.
- Mixed batch `[T3's own, T1's]` under T3 → **42501 and NOTHING is
  deleted** (both rows intact — all-or-nothing).
- Anon key only (no user JWT) calling the RPC → denied (no EXECUTE
  grant for `anon`; platform/function auth refuses before any row is
  touched).
- `hard_delete_shopping_list` on T1's fixture list → returns 1; the
  list's items cascade **inside** the authorized call; T3 on T1's
  list → 42501, list intact.
**PASS** = every count, error code, and intactness check above.
These mirror the local proof `supabase/tests/hard-delete-check.mjs`
(20/20 on local PostgreSQL) — G6(f)/(g) is its first live repetition.

### (h) Offline sync (engine harness route — no web build needed)

Primary route: a Node harness driving `packages/voice-engine`
(`VoiceEngine` + `enableOffline` with an in-memory KV) against the
scratch URL + anon key, signed in as T1. The harness script is an
execution artifact (kept with the execution log, not committed as a
product test).
1. With the transport blocked, create 3 items through the offline-
   first path → outbox holds 3, each with its stable client-generated
   id (the idempotency mechanism, `packages/voice-engine/src/
   offline.ts`: server insert collides on the PK on replay).
2. Unblock + `flushOutbox()` → server reads show each item **exactly
   once**, ids equal to the client-generated ids.
3. Flush again (forced double-flush) → still exactly 3 server rows.
4. Watch + expense helper creates (the PR #39 N1 paths — the same
   `createWatch`/`recordExpense` helpers the app calls) queued
   offline → flushed → correct kinds on the server, exactly once.
5. `listItemsCached` while blocked → returns the created items from
   cache.
**PASS** = exactly-once server state after both flushes + cached
reads correct. **FAIL** = duplicates, losses, or a helper path that
bypasses the outbox. (The app-UI variant of this row runs at G7/the
paid phase with the real web build — test plan §5.)

### (i) Audit logging + the zero-spend proof

After rows (a)–(h):
```sql
-- gate evidence exists
select kind, detail, count(*) from public.ops_events
 where kind = 'age_gate.blocked' group by 1, 2;
-- expect rows covering T4 (not_declared) + T5/T7b (under_18)

-- no successful provider call happened for any fixture user
select count(*) from public.ai_events
 where user_id in (<fixture user ids>) and <success marker per the
 ai_events schema>;   -- expect 0 successful calls; failed provider-
                     -- seam attempts, where logged, show the
                     -- zero-key failure

-- THE zero-spend proof (CORRECTED 2026-10-13 after the first live
-- G6 execution — see the execution note below)
select user_id, spent_usd from public.ai_spend_daily
 where user_id in (<fixture user ids>);
-- expect: rows ONLY for gate-PASSING fixture users (T1 class), each
-- equal to the designed charge-before-attempt reservation for the
-- probe's model attempts. Rows for gate-BLOCKED users (T4/T5 class)
-- or any unexplained row = FAIL.
select count(*) from public.ai_spend_daily;  -- baseline + explained
                                             -- probe reservations
```
RPC outcomes from (f)/(g) are reconstructable from the execution log
+ before/after row state (the RPCs write no ops rows of their own —
stated so nobody goes looking for them).
**PASS** = gate rows present, zero successful provider calls, and the
ledger carrying ONLY designed reservations from gate-passing probes.

> **Execution note (2026-10-13, first live G6):** the original wording
> ("ledger untouched; any ledger row = stop") was WRONG against the
> shipped design and is corrected here. `chargeModelCall` charges the
> measured bound BEFORE the provider attempt (that ordering is what
> makes the cap race-proof), so an adult fixture's deliberate chat
> probe legitimately leaves a reservation row even when the provider
> call then fails — in the live run: exactly one row, T1, $0.086669,
> covering that probe's attempts. Actual provider spend was $0.00,
> proven independently: no provider keys exist on scratch, so no
> provider could bill anything. The zero-spend proof is therefore
> "zero successful provider calls + zero provider billing + ledger
> rows fully explained by gate-passing probes" — never "ledger
> empty".

**G6 overall PASS** = every row PASS (with row (a)'s G4 sub-row
allowed as BLOCKED-BY-G4 and T6 as recorded-substitution, both
explicit in the log). Anything else = FAIL, filed as a finding with
severity in `RISK_BLOCKER_REGISTER.md` + the ledger before any next
phase is discussed.

**G6 rollback.** Fixtures created by the matrix (T7a/T7b users,
simulation `pending_actions` rows, row (d)–(g) items/lists not
already consumed by the RPC rows) are deleted by explicit id list —
RPC rows are already gone by design. G5 fixtures may stay for the
paid phase if the owner directs; otherwise G5's rollback applies.

---

## G7 — Staging web build (OPTIONAL in Phase 1)

**Purpose.** A browser/device surface for the UI-level rows (in-app
age declaration, drawer sync indicator, magic-link landing). Phase 1
sign-off does **not** require G7 if G6 passes via the API/harness
routes; the UI rows then remain owed to the paid phase.

**Prechecks.** G4 executed (a decided URL exists — the build's origin
and the Auth config must agree). Owner's specific G7 approval.

**Operations.** Per `../STAGING_DEPLOYMENT_PLAN.md` §2 and the
AGENTS.md baseUrl procedure:
```bash
# from apps/mobile, with the SCRATCH project's public values
EXPO_PUBLIC_SUPABASE_URL=https://caimavjwasxiegjhxdsr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<scratch anon key>
npx expo export --platform web
# baseUrl: temp-set app.json experiments.baseUrl for the Pages
# subpath, restore immediately after the export (AGENTS.md)
```
Verify before publishing: grep the exported bundle for the scratch
ref (must be present) and for the production ref (must be **absent**
— its presence is a global stop). Publish only to the G4-decided
staging location; never overwrite a build that points at production.

**Smoke.** Load the build → sign in as T1 (magic link lands per G4)
→ the in-app age declaration appears for a fresh fixture and persists
(the UI half of G6(b)) → create an item online, then offline (drawer
pending indicator), reconnect → flush (the UI half of G6(h)).
**Rollback.** Unpublish / restore the previous build at that
location; scratch backend state is unaffected.

---

## Whole-phase rollback (return scratch to the preflight state)

Executed only on the owner's direction (or after a stop the owner
resolves as "back out"). Order matters — capability first, then data:

1. **Secrets:** delete all user-defined scratch secrets (the G2a name
   list; secrets DELETE with names in the body) → GET secrets = `[]`.
2. **Functions:** `DELETE …/functions/<slug>` for all 24 → GET
   functions = `[]`.
3. **Fixtures:** delete G5/G6 fixture spaces **by the explicit id
   list in the execution log**, then the fixture Auth users
   (`DELETE $AUTHAPI/admin/users/<id>`). The bench space
   `047a3e5a-494d-43c8-b84a-142e364514ee` and all benchmark rows are
   never in any deletion list.
4. **Migration 0046:** apply the G1 rollback SQL → re-run the G1
   pre-state snapshot and confirm the pre-0046 posture is restored
   (0046 may alternatively be left applied if the owner prefers —
   it is part of the release-candidate schema; the log records which
   choice was made).
5. **Auth config:** PATCH back the G0 pre-state values
   (`site_url http://localhost:3000`, empty allow-list) if G4 ran.
6. **Verify:** re-run the full G0 battery — every value must equal
   the `PREFLIGHT_EVIDENCE.md` baseline (counts 100,002 / 20,001 / 2,
   0 secrets, 0 functions, 0046 absent-or-owner-documented, Auth
   defaults). Any residual difference is listed in the closing ledger
   entry, not silently accepted.

## Appendix — endpoint index (all against the scratch ref only)

| Operation | Endpoint |
|---|---|
| Projects list | `GET /v1/projects` |
| SQL (query endpoint) | `POST /v1/projects/{ref}/database/query` |
| Migrations list (artifact — see G0 note) | `GET /v1/projects/{ref}/database/migrations` |
| Secrets list / set / delete | `GET|POST|DELETE /v1/projects/{ref}/secrets` |
| Functions list / delete | `GET /v1/projects/{ref}/functions`, `DELETE /v1/projects/{ref}/functions/{slug}` |
| Function deploy | `POST /v1/projects/{ref}/functions/deploy?slug={slug}` (multipart) |
| API keys (platform keys) | `GET /v1/projects/{ref}/api-keys` |
| Auth config read / update | `GET|PATCH /v1/projects/{ref}/config/auth` |
| Auth Admin: create/delete user | `POST|DELETE https://{ref}.supabase.co/auth/v1/admin/users[/{id}]` (service_role key) |
| Auth Admin: generate link | `POST https://{ref}.supabase.co/auth/v1/admin/generate_link` (service_role key) |
| Auth: password grant / refresh | `POST https://{ref}.supabase.co/auth/v1/token?grant_type=password|refresh_token` (anon key) |
| Data (REST) | `https://{ref}.supabase.co/rest/v1/<table>` / `/rest/v1/rpc/<fn>` (anon key + user JWT) |
| Function invoke | `https://{ref}.supabase.co/functions/v1/<slug>` (anon key + user JWT as the row specifies) |
