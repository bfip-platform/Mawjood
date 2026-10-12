# D4 T-D4-5 — Account lifecycle: email change + deactivation (DESIGN)

> Status: design only. Existing primitives: `account-export` and `account-delete` edge functions already exist; sign-in is email magic-link (Supabase Auth). Nothing here is wired by this PR.

## 1. Email change

Magic-link auth makes the email both the identity and the recovery channel, so a change is a high-risk flow:

1. **Re-authenticate first** (fresh magic link to the CURRENT address) within a short window (15 min) before a change can be requested.
2. **Verify the NEW address** (magic link / code) before anything changes.
3. **Notify the OLD address** that a change was requested, with a one-click revert link valid 24h (the standard account-takeover tripwire).
4. Apply the change in Supabase Auth (`updateUser({email})` with double-confirm enabled), which itself requires confirmation from both addresses — our flow mirrors that rather than replacing it.
5. Ops-log the event (`account.email_change`, user id only — never the addresses in telemetry, per the PR #20 sanitizer contract).
6. Family spaces/invites are keyed by user id, not email — no membership churn.

Failure posture: any step failing leaves the original email in force (never a half-changed state).

## 2. Deactivation (soft) vs deletion (hard)

Two distinct user intents the current single `account-delete` conflates:

- **Deactivate** (reversible, 30-day grace): account flagged `deactivated_at`; sign-in blocked with a clear "deactivated — reactivate within N days" message; data untouched; reminders/push stop immediately; family members see the member as inactive (their shared content stays — it belongs to the space). Reactivation = sign in + confirm within the window. After 30 days, deactivation converts to deletion automatically (janitor-class job, dry-run-first like D3's).
- **Delete now** (irreversible): the existing `account-delete` path, with the export offered FIRST (existing `account-export`) and a plain-language summary of what is destroyed: all spaces owned, notes, items/memories, photos, vault contents. Family content the user authored in OTHERS' spaces: removed with the account (authorship rows), with the space owner notified — this detail needs owner's product call; the design default is removal, stated in the confirmation screen.
- Both flows require an explicit typed/clicked confirmation distinct from ordinary buttons (the same respect for destructive actions as the D1 delete-safety ruling, applied to the account itself).

## 3. Data-retention alignment

Deactivation/deletion respect the existing retention machinery rather than inventing new paths: trash floor (30 days, D1) for memories; the telemetry janitor (D3) already bounds operational data; billing records (future) retain per Stripe/legal requirements and are explicitly carved out in the deletion summary once billing exists.

## 4. Open items for the owner

- Family-content-on-delete default (removal vs anonymized retention) — product call.
- Whether deactivation is offered at launch or deletion-only (simpler) — product call.
- Counsel review of both flows alongside LEGAL_DRAFTS.md.
