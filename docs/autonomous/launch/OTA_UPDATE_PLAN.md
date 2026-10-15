# EAS Update (OTA) — discovery findings & implementation record

Discovery: read-only, 2026-10-14 (evidence at main `67f9ed0f`).
Implementation: this branch (Draft PR), owner-authorized 2026-10-15:
channel **beta**, runtime policy **fingerprint**, publishing exclusively
via manually dispatched GitHub Actions. Build 24 is the bootstrap binary
(prepared, NOT dispatched by this PR).

## Findings (from the discovery)

- `expo-updates` was absent (not in `package.json`; 0 lockfile hits) and
  no `updates`/`runtimeVersion` config existed → **Build 23 cannot
  receive OTA updates** (the capability is native and baked in; TestFlight
  binaries are immutable). Build 24 is the mandatory bootstrap.
- EAS project exists: `@rezeqaysar/mawjood`,
  `extra.eas.projectId = 8e464152-4348-424b-8632-9ebb5028837e`.
- eas.json had one profile (`production`), `environment: "production"`,
  env = scratch Supabase URL (PR #55); no channel anywhere.
- Env layering (PR #54/#55 lessons) applies verbatim to OTA: a bundle's
  env is fixed where it is produced. Builds resolve on EAS from
  eas.json env + EAS environment variables; publishes resolve on the
  publishing machine — hence CI-only publishing with guards (§runbook).

## What this PR changes (exact file list)

1. `apps/mobile/package.json` + `package-lock.json` —
   `expo-updates ~57.0.26` via `npx expo install` (SDK-57 pin).
2. `apps/mobile/app.json` — `"updates": { "url":
   "https://u.expo.dev/8e464152-4348-424b-8632-9ebb5028837e" }`,
   `"runtimeVersion": { "policy": "fingerprint" }`, `"expo-updates"`
   added to `plugins`.
3. `apps/mobile/eas.json` — production profile gains `"channel": "beta"`.
   No other profile exists; no channel named `production` is created.
4. `supabase/tests/unit.test.mjs` — OTA census guards (see below).
5. `docs/autonomous/launch/OTA_UPDATE_PLAN.md` — this document.
6. `docs/autonomous/launch/OTA_RUNBOOK.md` — Build 24 checklist,
   baseline B0, publish/verify/rollback procedures.
7. `docs/autonomous/launch/UPDATE_BETA_WORKFLOW_OWNER_STEP.md` — the
   exact `update-beta.yml` for the owner to add via the web UI (the
   agent's token cannot push workflow files — same standing constraint
   as the eas-cli pin and the CI spend-ledger step). The workflow is
   therefore NOT in this PR's tree; its content is pinned by a census
   guard against this document.

No application source code changes: the library's default behavior
(check on load, background download, apply on next launch, embedded
fallback) is the desired beta behavior.

## Fingerprint support — validated empirically on this project

Required by the owner as a condition of the fingerprint decision:
`@expo/fingerprint` (the SDK-57 toolchain's own library) computed runtime
fingerprints for this exact tree after the config change —
iOS `ab5ce1f0a829b467…` (81 sources), Android `0a75af25b2ef6927…`
(84 sources) — deterministic across repeated runs, with 8 tracked
config/update-relevant sources. SDK 57 + eas-cli 16.28.0 (pinned in the
workflows) both support the policy.

## Environment isolation — verification performed

Scrubbed-environment config resolutions on this branch (values never
printed; booleans and the public scratch host only):

- **Build-side** (env = exactly what eas.json declares):
  `extra.supabaseUrl` = the scratch URL; diagnostics
  `URL: SET (scratch host: yes); ANON_KEY: MISSING` — the key joins at
  build time from the EAS production environment (PR #55 layer).
- **Publish-side** (CI-like env: scratch URL + key present):
  `extra.supabaseUrl` = scratch; diagnostics `SET (scratch host: yes);
  ANON_KEY: SET`; resolved config carries `updates.url`.
- **Wrong-project control** (production host injected): diagnostics read
  `scratch host: no` — the exact boolean the publish workflow's guard
  requires to be `yes`, failing closed otherwise.

Isolation argument: no layer anywhere in build or publish holds
production values (eas.json env = scratch URL; EAS production
environment = scratch key per PR #55; GitHub secrets = scratch per owner
setup), the publish channel is hardcoded to `beta`, and the workflow
refuses non-main refs. Targeting production or another channel would
require changing committed files, not just making a mistake at publish
time.

## Guards added (unit suite)

- `expo-updates` present in `apps/mobile/package.json`.
- app.json: `updates.url` equals the project URL; `runtimeVersion.policy`
  is `fingerprint`; plugins include `expo-updates`.
- eas.json: production channel is `beta`; NO profile uses a channel
  named `production`.
- app.config.ts contains no `runtimeVersion`/`updates` overrides (the
  static app.json stays the single source; the dynamic config stays
  frozen for fingerprint stability).
- The workflow owner-step document contains `workflow_dispatch`,
  `--channel beta`, no `--channel production`, drives the guard through
  `eas env:exec --environment production` + `ota-env-guard.mjs`, and
  never references the GitHub Supabase secrets.
- The guard script itself is behavior-tested against fabricated keys
  (see the hardening addendum below).

## Remaining owner actions (in order)

1. Merge this PR.
2. Add `.github/workflows/update-beta.yml` via web UI (owner-step doc).
3. When ready for the bootstrap: set buildNumber 24, dispatch Build iOS
   Production, run bundle + OTA gates (runbook), submit, install.
4. Publish baseline B0, then follow the runbook for all updates.

## Hardening addendum (PR #57 review pass)

The initial version's publish guard checked the GitHub-secrets environment
with substring host matching and no key-provenance check. Review required
better; this PR now also contains:

- **`apps/mobile/scripts/ota-env-guard.mjs`** — a committed, unit-tested
  guard (spawn-tested against fabricated keys: valid JWT passes;
  wrong-project, service_role, expired, substring-host, trailing-slash,
  un-attested opaque, and missing key all BLOCK):
  - URL must EQUAL `https://caimavjwasxiegjhxdsr.supabase.co` exactly.
  - JWT anon keys: decoded claims must show ref=Scratch, role=`anon`,
    unexpired exp (URL-form iss cross-checked). Method note: the claims
    are the issuer's own provenance record and deterministically catch
    misconfiguration (wrong project's key, wrong key type, expiry) —
    the realistic threat. Signature verification is intentionally not
    attempted (it would require the project JWT secret in CI).
  - Opaque `sb_publishable_…` keys carry no claims: the guard FAILS
    CLOSED unless the dispatcher attests dashboard provenance via the
    workflow's `confirm_opaque_key` input. Documented limitation, gated
    rather than weakened.
- **Single-source environments:** the publish workflow no longer reads
  the GitHub Supabase secrets at all. The guard runs inside
  `eas env:exec --environment production` and the publish uses
  `eas update --environment production` — the validated environment IS
  the shipped environment, eliminating guard/publisher drift.
- **Actions review:** inputs pass to shell only via `env:` (no `${{ }}`
  inside `run:` — injection-proof), message length capped, permissions
  `contents: read`, EXPO_TOKEN scoped to EAS-calling steps, checkout and
  setup-node pinned by commit SHA (v4), main-only + beta-channel locks
  retained, concurrency serialized. Rollback stays a manual owner action
  outside the workflow (interactive verbs; see runbook).

## Explicit non-goals of this PR

No build dispatched, no TestFlight submission, no OTA update published,
no channel created server-side yet (creation happens with the first
beta-stamped build/publish), no Supabase changes, no app behavior change.
