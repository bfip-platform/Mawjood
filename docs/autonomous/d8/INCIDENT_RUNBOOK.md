# Incident runbook (D8 T-D8-1)

Operational procedures for Mawjood production. Only mechanisms that exist in the codebase/program record are referenced. Actions marked **[owner]** need the owner's hands (merges, deploys, dashboard, secrets) — the agent never deploys.

## Severity & first response

| Sev | Example | First response |
|---|---|---|
| SEV-1 | user data loss/exposure; auth bypass; runaway AI spend | Stop the bleeding first (kill switches below), then diagnose. Notify owner immediately. |
| SEV-2 | a core flow down (chat/extract/transcribe) for all users | Check function logs + provider status; rollback if a deploy correlates. |
| SEV-3 | degraded (slow search, one provider down) | Failover paths exist (Groq↔OpenAI config in `_shared/ai.ts`); schedule fix. |

## Kill switches & levers that EXIST today

- **AI spend:** the daily spend cap (PR #19) fails closed on telemetry errors; set `AI_SPEND_CAP_OFF=1` only to *restore* service deliberately — to STOP spend, lower `AI_DAILY_SPEND_CAP_USD` or disable the provider key **[owner, Supabase secrets]**.
- **Telemetry janitor:** inert unless `JANITOR_ENABLED=1` + `?execute=1` (PR #23) — it can never be the cause of user-data loss (allowlist: rate_limits/ai_events/ops_events only).
- **Cron jobs:** memory-consolidate and friends authenticate by cron secret — rotating the secret **[owner]** halts all cron-driven writes instantly (Risk R-1 contingency).
- **Governed actions:** pending/executing rows fail closed on expiry; a stuck `executing` row blocks only its own action.

## Incident playbooks

**Data loss suspected:** 1) Freeze writers (rotate cron secret; note the time). 2) Identify scope with read-only queries (items status distribution; trash contents — since D1, deletions are trash-first with a 30-day floor, so most "loss" is recoverable via restore within the window). 3) Restore per DR_DRILL.md procedure (checksum-verify). 4) Post-incident: how did it bypass the rails? File a finding before closing.

**Privacy exposure (cross-user read):** 1) Treat as SEV-1. 2) The photo path is governed by `can_read_photo` + the authorship trigger (PR #17) — check storage access logs **[owner, dashboard]** for the window. 3) Rotate affected storage signing/config **[owner]**. 4) Affected-user notification is an owner/legal decision (drafts in D4 legal package are NOT final).

**Runaway AI spend:** 1) Cap should already have failed closed — if spend continued, telemetry is lying: check `ai_events` writes. 2) Disable the provider key **[owner]**. 3) The deterministic fast paths (confirmations) don't use the model and keep working by design.

**Bad deploy:** rollback = redeploy the previous function version / revert the merge **[owner]** — every stage in this program is a separate revertible PR for exactly this reason.

**Status communication:** post in the owner's channel: what broke, user impact, what was done, what's next, ETA honesty (no invented times). A public status page is an owner/infra choice (no page exists today — do not claim one).

## Standing unknowns to resolve pre-launch

Production schema/migration state (is prod at 0034? does `items.updated_at` exist there?) — see LAUNCH_GATE.md. Every playbook above assumes the D1–D3 code is what's deployed; if prod still runs pre-D1 code, the trash/restore recovery in "Data loss" does not exist there yet.
