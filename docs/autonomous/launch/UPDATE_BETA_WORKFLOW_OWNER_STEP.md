# update-beta.yml — owner-applied workflow (the agent's token cannot push workflow files)

Create `.github/workflows/update-beta.yml` in the GitHub web UI with EXACTLY
the content below (one paste). It is manual-dispatch only, publishes ONLY to
the `beta` channel, ONLY from `main`, and fails closed unless the resolved
app config provably targets the Scratch Supabase project (booleans only —
no values are ever printed).

Design notes:
- Channel is hardcoded (`--channel beta`); there is no channel/branch input,
  so the workflow cannot be aimed at another channel by accident.
- `--environment production` makes the publish resolve the dynamic app
  config with the EAS **production** environment variables — the same layer
  the builds use (eas.json env + EAS env vars). "production" here is the
  EAS environment NAME, not the Supabase production project.
- The env guard greps the `[app.config]` diagnostic line (PR #55): it must
  read `scratch host: yes` AND `EXPO_PUBLIC_SUPABASE_ANON_KEY: SET`,
  otherwise the job stops BEFORE anything is published.
- eas.json itself is checked: `build.production.channel` must be `beta`.

```yaml
name: Publish OTA Update (beta)

on:
  workflow_dispatch:
    inputs:
      message:
        description: "Update message (shown in expo.dev update history)"
        required: true
        default: "OTA update"

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
        if: github.ref != 'refs/heads/main'
        run: |
          echo "OTA updates may only be published from main (got: $GITHUB_REF)"
          exit 1

      - uses: actions/checkout@v4
        with:
          ref: main

      - uses: actions/setup-node@v4
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

      - name: Guard — resolved config targets Scratch (values never printed)
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.EXPO_PUBLIC_SUPABASE_URL }}
          EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_ANON_KEY }}
        run: |
          npx expo config --type public --json > /dev/null 2> diag.txt || true
          grep "\[app.config\]" diag.txt || true
          if ! grep -q "scratch host: yes" diag.txt; then
            echo "Resolved Supabase URL is NOT the scratch host — refusing to publish"
            exit 1
          fi
          if ! grep -q "EXPO_PUBLIC_SUPABASE_ANON_KEY: SET" diag.txt; then
            echo "Anon key is not populated in the publish environment — refusing to publish"
            exit 1
          fi
          echo "env guard OK: scratch target confirmed, key populated"

      - name: Publish update to beta
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: eas update --channel beta --environment production --message "${{ inputs.message }}"

      - name: Show latest beta updates
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: eas update:list --branch beta --limit 3
```

After creating it: it appears under Actions as **Publish OTA Update (beta)**.
Do NOT run it until Build 24 (the first OTA-capable binary) is installed on
the target iPhone — updates published before any compatible binary exists
are harmless but pointless, and the verification protocol in OTA_RUNBOOK.md
starts from the bootstrap build.
