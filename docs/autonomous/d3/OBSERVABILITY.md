# D3 T-D3-3 — Observability design

**Status:** design + tested scrub module. Account creation (Sentry org/project, uptime monitor) and production wiring are owner-approved deploy steps — nothing here phones home by itself.

## Principles

1. **Errors are telemetry, not content.** An error report may carry the error class, a scrubbed message, and stack shape — never note text, transcripts, photo URLs, chat content, or credentials. The D2 `report-error` sanitizer (PR #20) already enforces this for the in-house pipeline; this design extends the same contract to Sentry.
2. **One choke point.** Every report — mobile client, web, edge functions — passes through `scrubSentryEvent` (`supabase/functions/_shared/sentry-scrub.ts`, mirrored for the client bundle at wiring time). It redacts credential-shaped keys at any depth, strips Bearer/JWT/email substrings, drops URL query strings (signed URLs carry tokens), caps string length, and removes the user object and request bodies.
3. **Ops data stays in-house too.** `ops_events` already records the operational story (AI cost events, spend-cap hits, janitor + consolidate reports). Sentry is for *crashes and exceptions*; product/usage analytics are explicitly out of scope.

## Sentry wiring (when approved)

- **Mobile/web:** Sentry React Native / browser SDK, `dsn` from app config (public DSN is fine — it is a write-only ingest key), `beforeSend: scrubSentryEvent`, `tracesSampleRate: 0` at launch (errors only; performance tracing is a later, separately-costed decision), release tagged with the app version + OTA update id.
- **Edge functions:** no SDK dependency; a thin reporter POSTs scrubbed events to the Sentry envelope endpoint from a wrapper around the existing `logOps` error paths, gated on a `SENTRY_DSN_EDGE` secret. Fire-and-forget; a Sentry outage must never affect a user request (same posture as `logOps`).
- **Source maps / symbols:** uploaded at build time by CI when the wiring lands (D8 release work), never shipped in the app bundle.

## Uptime

- External probe (provider choice at wiring: Better Stack / UptimeRobot free tier is sufficient): HTTPS check every 5 min against two function endpoints that answer without side effects — `route`/`classify` unauthenticated now return 401 (a *correct* 401 is the liveness signal: function up + auth gate live), plus the GitHub Pages trial site.
- Supabase platform status is consumed from status.supabase.com, not re-invented.

## Alerts (thresholds over ops_events + probe)

| Signal | Threshold | Channel |
|---|---|---|
| Uptime probe failure | 2 consecutive | email/SMS to owner |
| `spend_cap.hit` | any (already ops-logged by PR #19) | daily digest |
| Edge 5xx rate (ops `ok=false`) | > 5% over 1h | email |
| Janitor / consolidate report missing | > 26h since last `memory.consolidate` / `telemetry.janitor*` kind | email |
| AI provider error kinds spike | > 3× 7-day baseline | daily digest |

Alerting implementation at wiring time: a scheduled job reading `ops_events` (the same data the admin dashboard shows) — no new data collection.

## What is NOT collected

No session replay, no breadcrumbs containing user input (SDK default breadcrumbs for console/navigation are disabled at wiring; only app-lifecycle and HTTP-status breadcrumbs survive the scrubber), no performance traces at launch, no third-party analytics SDKs.
