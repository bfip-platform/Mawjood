# iOS native auth — owner-gated remote steps (NOT executed by the agent)

Companion to the Group 3 code change (branch `fix/g3-g5-auth-deps`, finding
P1-1): the app now sends native magic links with
`emailRedirectTo = mawjood://auth-callback` (expo-linking
`Linking.createURL('auth-callback')`, app scheme `mawjood` already in
`apps/mobile/app.json`), completes the session from the deep link
(`exchangeCodeForSession` / `setSession`), and offers a 6-digit email-code
fallback (`verifyOtp`) on the AuthScreen.

None of the steps below were executed by the agent. They are remote-config
and workflow-file changes, which are owner-gated (and workflow files cannot
be pushed by the agent's token at all — 403, same precedent as
`docs/autonomous/audit/CI_SPEND_LEDGER_STEP.md`).

## Step 1 — Scratch (staging) Supabase Auth redirect allow-list

Project: scratch/staging `caimavjwasxiegjhxdsr` ONLY. Do NOT touch
production (`mwjzosfrxwxcrzcsiear`) in this step.

1. Supabase Dashboard → project `caimavjwasxiegjhxdsr` →
   Authentication → URL Configuration.
2. Under **Redirect URLs**, add:
   - `mawjood://auth-callback`
   - If the dashboard rejects the bare form or the link returns with
     additional path segments, also add the wildcard form: `mawjood://**`
3. Save. No Site URL change is needed for the native flow (the Site URL
   stays as-is for web).

Until this entry exists, Supabase falls back to the project Site URL and
the native magic link will NOT return to the app (the 6-digit code entry
on the AuthScreen still works — it needs no redirect).

## Step 2 — Production (ONLY at production rollout, separate approval)

At the production rollout — and not before — repeat Step 1 in the
production project `mwjzosfrxwxcrzcsiear`: add `mawjood://auth-callback`
(and `mawjood://**` if required) to Authentication → URL Configuration →
Redirect URLs.

## Step 3 — Pin eas-cli in the iOS workflows (owner-applied file edits)

`.github/workflows/build-ios.yml` (line 22) and
`.github/workflows/submit-ios.yml` (line 27) currently install an unpinned
CLI (finding P1-5):

```yaml
        run: npm install -g eas-cli
```

Change both to a pinned 16.x (the repo's eas.json floor is `>= 16.0.0`):

```yaml
        run: npm install -g eas-cli@16.28.0
```

`eas-cli@16.28.0` is a real published version (verified via
`npm view eas-cli@16 version`, 2026-10-13; the newest published 16.x at
that date is 16.32.0 — either pin is acceptable, keep both workflows on
the SAME version). Apply by editing the files in the GitHub web UI or a
local clone and pushing from an account whose token has Workflows
permission, then confirm CI stays green on the next run.
