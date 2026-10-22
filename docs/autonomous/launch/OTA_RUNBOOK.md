# OTA Runbook — Mawjood private beta (channel: beta)

Companion to `OTA_UPDATE_PLAN.md`. Everything here is owner-dispatched;
the agent never dispatches builds, submits, or publishes.

## Concepts in one paragraph

Build 24 is the first binary containing `expo-updates`. It is stamped with
channel **beta** (eas.json) and a **fingerprint** runtimeVersion (a hash of
the native layer). An update published to branch **beta** is served only
to devices whose platform + fingerprint match exactly. The JS embedded in
the binary is the permanent fallback ("embedded update"). There is no
`production` channel and none may be created under this program.

## Build 24 preparation checklist (bootstrap)

1. Implementation PR (OTA infrastructure) merged → main contains:
   expo-updates dependency, `updates.url`, fingerprint policy, eas.json
   channel `beta`, guards green (CI 9/9).
2. Owner applies `.github/workflows/update-beta.yml` from
   `UPDATE_BETA_WORKFLOW_OWNER_STEP.md` (web UI paste).
3. Set `apps/mobile/app.json` `"buildNumber": "24"` (owner/ChatGPT step,
   as with build 23) — NOT in the implementation PR, so the PR stays a
   pure infrastructure change.
4. Dispatch **Build iOS Production** (existing workflow, from main).
5. IPA gates, in order:
   - **Bundle gate:** scratch host present, production host absent
     (the PR #54/#55 gate).
   - **OTA gate:** the embedded `EXConstants.bundle/app.config` shows
     `updates.url = https://u.expo.dev/8e464152-4348-424b-8632-9ebb5028837e`,
     a fingerprint runtimeVersion value, and the build's channel is
     `beta` (also visible on the EAS build page).
6. Dispatch **Submit iOS**, install Build 24 on the iPhone from
   TestFlight (replaces Build 23). Build 23 remains OTA-ineligible
   forever; nothing about it changes.
7. On expo.dev, confirm exactly one channel exists: **beta**, mapped to
   branch **beta**.

## Safe first-update baseline (B0)

Before the first functional update, make sure there is a known-good update group that can be republished for rollback. For a new binary without one, publish an embedded-equivalent baseline from the same build commit, using message `baseline B0 (embedded-equivalent)`.

### Recorded baseline for Build 24 (2026-10-22)

- Build 24 source commit: `20098105f248507411d3000991bee0902d8d6eb7`.
- Build 24 iOS fingerprint: `d1c70031cf41280e2b6d526fd62cb52c7418b361`.
- First successful OTA, `OTA TEST 01`, was published from `ef788458d0e71a0ad32c1b923fc87a8ec2927a84` and verified on the target iPhone.
- Comparison with the Build 24 source shows the only app-source difference in that update was the visible `· OTA TEST 01` marker; the other intervening changes were OTA workflow/preflight files. Its iOS bundle had the same fingerprint as Build 24, so this is the known-good, embedded-equivalent rollback baseline for this installed binary.
- iOS B0-equivalent group: `92647e98-1cf9-44f1-9e61-dcc01a706426`.
- Android group (separate runtime): `3490ddfa-b132-412c-9796-bb07d78ff6a4`.
- Latest published OTA before waves #109–#111: run #48, message `Chat first-token streaming`, source commit `308a7b8d02f5b702fb54666501ad47273c73b39e`; iOS group `9c7b4446-54da-45a3-8c4c-d203a2c7654a` (runtime above), Android group `9e1b5990-3123-4b8f-be96-166f85a48259`. The publish succeeded; device verification for this later group is not recorded.

## Current release — Waves 1–3 (2026-10-21)

- Published successfully by workflow run `39716229825` from main commit `1985b3ebbfd0155cf7550c3c668ea1bdaefb83ca`, message `Mawjood waves 1-3: reliability, spaces, privacy`.
- iOS group: `64d9ea92-9ef9-4dc9-b818-247ad1b7e8bf`; iOS runtime: `d1c70031cf41280e2b6d526fd62cb52c7418b361` (matches Build 24).
- Android group: `ad141c83-322b-4efb-b429-1d6c24c65917` (separate runtime).
- OTA preflight and publish guards passed. The iPhone still needs the two-launch install check and feature smoke checks in the section below.
- Until that device check passes, the device-verified `OTA TEST 01` iOS group above is the safe rollback target. After verification, this release can be used as the next known-good rollback group. Do not republish either group before a normal update; that would replace the currently served bundle.

## Publishing a normal update

1. Merge the JS change to main through the normal Draft-PR flow (CI 9/9).
2. Actions → **Publish OTA Update (beta)** → Run workflow (branch: main)
   with a descriptive message.
3. The workflow's guards must pass. A guard failure publishes nothing —
   fix the cause, never bypass. The guards, in order:
   - **main-only** dispatch ref; **channel lock** (`eas.json` production
     channel must be `beta`);
   - **environment provenance** (`apps/mobile/scripts/ota-env-guard.mjs`,
     executed inside `eas env:exec --environment production`, i.e. inside
     the SAME EAS production environment the publish step uses — the
     validated environment and the shipped environment are one source,
     and the job never reads the GitHub Supabase secrets):
     the resolved URL must EQUAL the Scratch URL exactly (substring
     matches are forgeable and rejected), and the anon key must belong
     to Scratch — for JWT keys its decoded claims must show
     ref=Scratch, role=`anon`, unexpired (a `service_role` key fails:
     it must never ship in an app bundle). For opaque
     `sb_publishable_…` keys (no claims exist to check) the guard fails
     closed unless the dispatcher typed the attestation input
     `KEY-VERIFIED-IN-DASHBOARD`, asserting the key was copied from the
     Scratch project's own API settings page. Key values are never
     printed — the guard reports booleans only.
4. Note the new update group ID from the run log / expo.dev.
5. Key rotation: rotate the Scratch anon key ONLY in the EAS production
   environment (expo.dev → Environment variables) — the publish path has
   no second copy.

## Device verification protocol (first two updates, then spot-checks)

1. Fully close the app on the iPhone (swipe away), reopen → the update
   downloads in the background.
2. Close and reopen again → the new bundle is now running.
3. For the very first functional update use a harmless visible marker
   (e.g., an `(OTA-1)` suffix on the About version line) and confirm it
   appears; confirm the matching group/runtime on expo.dev.
4. Sanity: sign-in state, spaces, and chat load normally (the update is
   JS-only; data and auth are untouched by delivery).

## Rollback

Rollback runs from any owner-authenticated EAS CLI (`eas login`, or
`EXPO_TOKEN` in the environment) or the expo.dev dashboard — it is
deliberately NOT a step in the publish workflow: the rollback verbs are
interactive, and an unattended pipeline must never carry a rollback
trigger.

**Case A — a previous good update group exists (normal case):**
`eas update:republish --group <good-group-id>` (owner, via EAS CLI or the
expo.dev dashboard: Updates → select group → republish to branch beta).
Devices converge on next launches. B0 (§baseline) guarantees this case
always applies after the first publish.

**Case B — no previous update group exists (roll back the FIRST update):**
republish is impossible (nothing to republish). Use **rollback to
embedded**: `eas update:rollback` and choose the rollback-to-embedded
option for branch beta (dashboard equivalent under Updates). Clients are
directed back to Build 24's embedded bundle. A later normal publish
re-enables OTA delivery — a rollback is not a pin.

**Case C — the update crashes on launch:** expo-updates automatically
discards an update whose first launch fails and falls back to the last
known-good update (or embedded). If the app still misbehaves, apply
Case A/B; if the BINARY is at fault, OTA cannot help — ship a new build.

**Case D — wrong-content scare (e.g., suspected wrong Supabase target):**
the publish guards make this structurally improbable; if suspected,
rollback per Case A/B, then verify on the device that the app talks to
scratch (staging fixtures only). Never "fix forward" under suspicion.

## Compatibility — what may ship OTA vs what needs a build

OTA: JS/TS code, screens, styles, copy, JS-bundled assets.
Build required: any native module add/remove/upgrade, Expo SDK upgrade,
config-plugin changes, app.json native fields (bundle ID, permissions,
icons/splash native assets, entitlements, URL scheme), and anything that
changes the fingerprint. Fingerprint mismatch = the update is simply not
served (safe), but also reaches nobody — when in doubt, check the
fingerprint of the publish commit (`eas update:list` shows the runtime
each group targets) before expecting delivery.

Frozen during OTA operation: `app.config.ts` (a fingerprint-relevant
input class). Changing it is a deliberate, build-accompanied act.

## Reminders

- OTA does not extend TestFlight's 90-day build expiry; schedule native
  builds accordingly.
- OTA ships fixes/polish within the app's reviewed purpose only
  (App Store Guideline 3.3.2); new feature categories go through a build.
- Never create a `production` channel under this program; the future
  store release gets its own owner decision.
