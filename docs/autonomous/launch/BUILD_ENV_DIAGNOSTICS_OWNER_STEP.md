# Build env diagnostics + anon-key supply (owner steps, NOT executed by the agent)

Companion to the `fix/eas-json-env` PR. Background: build 23's second IPA
(PR #54 merged) packaged `extra.supabaseUrl = ""` / `extra.supabaseAnonKey = ""`.
Expo's documented model explains it: for EAS builds, the dynamic app config
is resolved with the **build profile's environment** (eas.json `env` +
EAS project environment variables) — the CI runner's shell env is not an
input to that resolution. PR #54's channel was correct; its input layer was
empty. The PR therefore puts the (public) scratch URL into
`eas.json build.production.env`. The anon key must travel the same layer —
two options below.

## Option A (recommended) — anon key as an EAS environment variable (never in git)

1. expo.dev → the Mawjood project → **Environment variables** → create:
   - Name: `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Value: the **scratch** project's anon key (Supabase Dashboard →
     project `caimavjwasxiegjhxdsr` → Project Settings → API → `anon` `public`)
   - Environment: **production**
2. Nothing else changes: `eas.json` already sets
   `"environment": "production"` on the production profile, and EAS makes
   production-environment variables available during the build AND when
   resolving the dynamic app config.

(The scratch Supabase URL is already in eas.json env from the PR; the same
dashboard route also works for the URL if it ever needs to move out of git.)

## Option B — anon key in eas.json env (committed, like the URL)

Add one line next to the URL in `apps/mobile/eas.json`:

```json
"env": {
  "EXPO_PUBLIC_SUPABASE_URL": "https://caimavjwasxiegjhxdsr.supabase.co",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<scratch anon key>"
}
```

Note: the anon key is a public client credential by design (it ships inside
every distributed build and is extractable from the IPA; RLS is the security
boundary) — but it will live in git history on a public repo. Option A avoids
that. The agent does not hold the key and cannot fill this in.

## Diagnostics step (apply in the GitHub web UI — the agent's token cannot push workflow files)

Insert into `.github/workflows/build-ios.yml` immediately BEFORE the
`Build iOS` step. It prints presence only — never values — and settles
whether the repo secrets themselves are populated on the runner:

```yaml
      - name: Diagnose Supabase env (values never printed)
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.EXPO_PUBLIC_SUPABASE_URL }}
          EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_ANON_KEY }}
        run: |
          if [ -n "$EXPO_PUBLIC_SUPABASE_URL" ]; then
            case "$EXPO_PUBLIC_SUPABASE_URL" in
              *caimavjwasxiegjhxdsr*) echo "EXPO_PUBLIC_SUPABASE_URL: SET (scratch host: yes)" ;;
              *) echo "EXPO_PUBLIC_SUPABASE_URL: SET (scratch host: no)" ;;
            esac
          else
            echo "EXPO_PUBLIC_SUPABASE_URL: MISSING"
          fi
          if [ -n "$EXPO_PUBLIC_SUPABASE_ANON_KEY" ]; then
            echo "EXPO_PUBLIC_SUPABASE_ANON_KEY: SET"
          else
            echo "EXPO_PUBLIC_SUPABASE_ANON_KEY: MISSING"
          fi
```

Additionally, `app.config.ts` now logs an `[app.config] …` line with the same
SET/MISSING + scratch-host booleans at every config evaluation, so the EAS
build log shows what the config resolution itself received.

## After applying

Re-dispatch **Build iOS Production** and re-run the IPA bundle gate:
`EXConstants.bundle/app.config` must show `extra.supabaseUrl` = the scratch
URL and a non-empty `extra.supabaseAnonKey`, and the scratch hostname must
appear in the bundle. Submit only that new artifact.
