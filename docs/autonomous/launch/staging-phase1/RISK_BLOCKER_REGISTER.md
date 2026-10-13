# Staging Phase 1 — Risk & blocker register

Companion to `RUNBOOK.md`. IDs are stable references for the
execution log and the ledger. Statuses are as of 2026-10-13 (package
preparation). "Blocks" names the runbook gates that cannot execute
while the item is open.

## Blockers

### B1 — Plan & budget approval (paid phase only)
The merged staging plan (`../STAGING_DEPLOYMENT_PLAN.md` §6) and its
$10 exercise budget remain unapproved. **Phase 1 does not need it** —
Phase 1 spends $0 by construction (no provider keys). B1 gates only
the later paid phase (checklist §4). *Owner action:* approve/amend
when the paid phase is proposed.

### B2-access — No standing agent access route to scratch
Live access exists only per session, via the owner's transient
Management API token (the route used for the 2026-10-13 preflight).
There is no persistent connector, stored token, or CLI profile, by
design (transient-credential rule; earlier tokens are on the owner's
revoke list). *Impact:* every execution session needs the owner to
supply a fresh token (or execute personally); a token expiring
mid-phase is global stop condition 7. *Blocks:* all gates, per
session. *Owner action:* be present / supply the token per session,
or execute the gates personally from the runbook.

### B3-secrets — Provider keys are owner-held
No AI provider key exists on scratch, and the agent never provisions
one. Cleared only by the owner setting a **dedicated staging**
`OPENAI_API_KEY` (separate OpenAI project + hard usage limit; the
production key value must NOT be reused — `../OPENAI_INTEGRATION_AUDIT.md`).
*Blocks:* G2b only — deliberately deferred past Phase 1.
*Owner action:* at the paid-phase gate, not before.

### B4 / R-URL — Staging web URL is UNDECIDED
Scratch Auth `site_url` is the platform default
(`http://localhost:3000`) and `uri_allow_list` is empty (preflight).
No staging origin has been chosen, and **none is invented here**.
Candidates, with their trade-offs:

| Candidate | State today | Trade-off |
|---|---|---|
| `https://bfip-platform.github.io/Mawjood/` (existing GitHub Pages trial origin) | Exists; currently serves the trial build that points at **production** | Publishing a staging build there replaces the production-pointing trial, and one origin would serve both environments at different times — environment mixing (R-KEYMIX) |
| A staging-specific Pages location (separate path/repo/branch) | Does **not** exist; owner must create/approve it | Clean separation; small owner setup cost |
| `http://localhost:3000` (current default) | Already the configured value | Sufficient for executor-local web testing and all API-level work; no real-device or shareable-browser E2E |

*Blocks:* G4 and G7 only. G1–G3, G5, and G6's API/harness rows —
including the auth token flows via `generate_link` — do **not**
depend on this decision. *Owner action:* pick a candidate (checklist
§2, G4 line) or explicitly defer G4/G7.

### B5-0046 — Migration 0046 not yet on scratch
Proven absent at preflight (two ways — see
`PREFLIGHT_EVIDENCE.md`). Retired by executing runbook G1. Until
then, scratch still carries the F-LAUNCH-01 posture (clients hold a
FOR ALL write policy on items), which is also why G6 rows (f)/(g)
must run only after G1. *Blocks:* nothing in Phase 1's order — G1 is
the second gate. *Owner action:* approve G1 (checklist §2).

## Risks

### R-TRACK — No migration tracking schema on scratch
`supabase_migrations.schema_migrations` does not exist; 0001–0045
were applied as raw SQL. Any tool that trusts the tracking table
(CLI `db push`, `migration list`, a future teammate's dashboard view)
will misread scratch as unmigrated and could attempt to re-apply the
whole chain. *Mitigation (binding for Phase 1):* migrations are
applied only via the runbook's raw-SQL route; state is proven only
by object-inventory postchecks; no CLI is pointed at this database;
creating the tracking schema is a **separate owner decision**, never
a silent side effect. *Residual:* a future operator who skips this
register can still misread the state — the G0 battery exists to
catch exactly that.

### R-BENCH — Benchmark residue shares the staging database
100,002 items / 20,001 notes / 2 spaces of D2/D3 benchmark data live
in the same database the matrix runs against, including the bench
space `047a3e5a-494d-43c8-b84a-142e364514ee`. A careless fixture
cleanup ("delete test spaces") or a global selection (purge
eligibility) could touch it. *Mitigations:* the counts are a
standing invariant re-checked at every gate (global stop condition
2); fixtures live only in new, explicitly id-listed spaces; all
deletions in the runbook are by explicit id list, never by pattern;
purge work in Phase 1 is selection-only and id-targeted. *Residual:*
low, given the invariant checks.

### R-KEYMIX — One origin, two environments (feeds the R-URL decision)
If the owner picks the existing Pages trial origin for staging, the
same origin alternately serves a production-pointing build and a
staging-pointing build. Risks: a stale cached staging build used
against production expectations (or vice versa), and Auth allow-list
entries that outlive their purpose. *Mitigation if chosen:* the G7
bundle grep (scratch ref present, production ref **absent**) before
every publish, and a note in the execution log each time that origin
changes which backend it points at. The cleaner alternative is the
staging-specific location (R-URL table).

### R-SPEND — A provider key set early voids the zero-spend proof
G6's evidentiary value is "no key exists, therefore no spend is
possible, therefore every refusal happened for the stated reason."
Setting any provider key before G6 (e.g. merging G2a+G2b into one
step, or the owner pre-setting a key in the dashboard) silently
converts G6 into a paid run and invalidates rows (b) and (i).
*Mitigation:* G2 is split (G2a in Phase 1, G2b at the paid gate);
the G0/G2 postchecks assert the provider keys' **absence**; global
stop condition 5 fires on any unexpected secret name. If a key is
found set at G0, the phase does not proceed as Phase 1 — it is
re-planned under the merged plan §6 budget + hard stops with the
owner.

### R-PARTIALSQL — Raw-SQL application can stop mid-file
The `database/query` route may commit statement-by-statement, so a
transport failure during G1 can leave a partial policy split.
*Mitigation:* migration 0046 is idempotent by construction
(`drop … if exists`, `create or replace`); recovery is re-running
the whole file; the G1 postchecks (exact policy sets + grant matrix),
not the HTTP response, decide the state; the proven rollback SQL is
in the runbook if a clean revert is preferred. *Residual:* a partial
state between failure and re-run — acceptable on a staging database
with no users, and the gate does not proceed until postchecks pass.

### R-MAIL — Default mailer limits on scratch
Scratch uses Supabase's default email service (low send limits, no
custom SMTP). The full magic-link journey (test plan §2/§5) could
hit rate limits or slow delivery during a long matrix run.
*Mitigation:* G6(a) uses the Auth Admin `generate_link` route as the
primary evidence (no mail delivery involved); the true inbox flow is
exercised at most a few times (G7 smoke). *Residual:* the delivered-
email path remains lightly tested until a phase with custom SMTP —
recorded here so it is not mistaken for covered.

### R-ANON — Anonymous sign-ins are not enabled on scratch
Preflight: `enable_anonymous_sign_ins = null`. Fixture T6 (anonymous
trial) cannot be created as a true anonymous session unless G4
enables it — an owner decision bundled with the Auth gate.
*Mitigation if not enabled:* G6 substitutes T4 (NULL DOB, signed in)
for the gate-behavior evidence and records T6's `is_anonymous` claim
shape as **untested in Phase 1**. Never silently reported as covered.

### R-FIXTURE-DRIFT — SQL-seeded DOB bypasses the declaration UI
Phase 1 seeds `birth_date` by SQL (no staging web build exists until
G7), so the in-app declaration flow — itself a shipped feature
(PR #38) — gets no Phase 1 coverage unless G7 runs. Recorded as a
deviation in G5 and in the checklist so the owner approves it
knowingly. The server-side gate, which is the security boundary, is
fully covered by G6(b).

## Standing gates (not blockers — by design)

- The owner holds every gate approval listed in
  `OWNER_APPROVAL_CHECKLIST.md`; the agent merges nothing and
  deploys nothing on its own authority.
- Production is never a target of any Phase 1 operation; the
  production ref appears in the runbook only inside "must NOT equal"
  warnings, and the REF CHECK ritual guards every mutating call.
- Credential revocations from earlier phases (transient tokens) stay
  on the owner's list; each Phase 1 session's token joins it.
