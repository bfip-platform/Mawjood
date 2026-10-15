# update-beta.yml — owner-applied workflow (the agent's token cannot push workflow files)

Create `.github/workflows/update-beta.yml` in the GitHub web UI with EXACTLY
the content below (one paste). Hardened in the PR #57 review pass:

- **One environment source.** The job NEVER reads the GitHub Supabase
  secrets. Both the pre-publish guard and the publish itself resolve the
  EAS **production** environment — the guard via
  `eas env:exec --environment production`, the publish via
  `eas update --environment production` — so the environment that is
  *validated* is by construction the environment that *ships*. ("production"
  is the EAS environment NAME; its values are the Scratch project's —
  the same layer the builds use.)
- **Exact + provenance guards.** `scripts/ota-env-guard.mjs` (committed)
  requires the resolved URL to EQUAL the Scratch URL (no substring
  matching) and the anon key to prove it belongs to Scratch: for JWT keys,
  its decoded claims must say ref=Scratch, role=anon, unexpired. For
  opaque (`sb_publishable_…`) keys it fails closed unless the dispatcher
  supplies the attestation input described in the YAML.
- **Inputs are data, never code.** Workflow inputs reach shell steps only
  through `env:` mappings (no `${{ }}` interpolation inside `run:`), so a
  crafted update message cannot inject shell commands.
- **Least privilege.** `permissions: contents: read`; EXPO_TOKEN is
  present only on the steps that call EAS; actions are pinned by commit
  SHA; publishing is possible only from `main` and only to channel `beta`
  (hardcoded; the eas.json channel lock is re-checked in the job).

```yaml
name: Publish OTA Update (beta)

on:
  workflow_dispatch:
    inputs:
      message:
        description: "Update message (shown in expo.dev update history)"
        required: true
        default: "OTA update"
      confirm_opaque_key:
        description: "ONLY if the project's anon key is an opaque sb_publishable_ key (not a JWT): type KEY-VERIFIED-IN-DASHBOARD to attest you copied it from the SCRATCH project's API settings in the Supabase dashboard. Leave empty otherwise."
        required: false
        default: ""

permissions:
  contents: read

concurrency:
  group: ota-beta
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/mobile
    steps:
      - name: Guard — main branch only
        env:
          DISPATCH_REF: ${{ github.ref }}
        run: |
          if [ "$DISPATCH_REF" != "refs/heads/main" ]; then
            echo "OTA updates may only be published from main (got: $DISPATCH_REF)"
            exit 1
          fi

      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          ref: main

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22

      - name: Install EAS CLI (pinned, same as build-ios.yml)
        run: npm install -g eas-cli@16.28.0

      - name: Install dependencies
        working-directory: .
        run: npm install

      - name: Guard — beta channel is locked in eas.json
        run: |
          CH=$(python3 -c "import json; print(json.load(open('eas.json'))['build']['production'].get('channel',''))")
          if [ "$CH" != "beta" ]; then
            echo "eas.json production channel is '$CH', expected 'beta' — refusing to publish"
            exit 1
          fi
          echo "channel lock OK: beta"

      - name: Guard — update message is sane
        env:
          UPDATE_MESSAGE: ${{ inputs.message }}
        run: |
          if [ "${#UPDATE_MESSAGE}" -gt 200 ] || [ -z "$UPDATE_MESSAGE" ]; then
            echo "Update message must be 1-200 characters"
            exit 1
          fi

      - name: Guard — environment provenance (exact URL + key belongs to Scratch)
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          CONFIRM_OPAQUE_KEY: ${{ inputs.confirm_opaque_key }}
        run: eas env:exec --environment production -- node scripts/ota-env-guard.mjs

      - name: Publish update to beta
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          UPDATE_MESSAGE: ${{ inputs.message }}
        run: eas update --channel beta --environment production --message "$UPDATE_MESSAGE"

      - name: Show latest beta updates
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: eas update:list --branch beta --limit 3
```

Notes for the owner:

- The guard step and the publish step draw from the SAME EAS environment.
  If you ever rotate the Scratch anon key, update it in the EAS production
  environment (expo.dev → project → Environment variables) — there is no
  second copy in this workflow to drift out of sync.
- Rollback is NOT part of this workflow on purpose: `eas update:republish`
  / rollback-to-embedded are run by the owner from any authenticated
  EAS CLI (or the expo.dev dashboard) per OTA_RUNBOOK.md — interactive
  rollback verbs do not belong in an unattended pipeline.
- Do NOT run this workflow until Build 24 is installed on the target
  iPhone (see OTA_RUNBOOK.md, Build 24 checklist + baseline B0).
