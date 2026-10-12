# D0.5 — User Roles and Permissions

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** Workstream 01 §3 · **Status:** Planning only — does not authorize implementation, production migration, billing activation, or owner approval.

---

## 1. Roles

| Role | Code | Description |
|---|---|---|
| Anonymous trial | `ANON` | Pre-registration trial user; local/trial space only |
| Free | `FREE` | Registered user, 18+, on the free tier |
| Plus | `PLUS` | Registered user, 18+, on a paid subscription |
| Family member | `FMEM` | Member of a family space (space-scoped; orthogonal to FREE/PLUS) |
| Family manager | `FMGR` | Manager of a family space (space-scoped; orthogonal to FREE/PLUS) |
| Admin | `ADMIN` | Platform administrator (ops/entitlements; no user-data access) |

**Key structural facts:**
- FMGR/FMEM are **space-scoped** and orthogonal to the FREE/PLUS billing tier — a Plus user can be a plain member of someone else's family, and a Free user can manage a family.
- Vault access reflects Decision #4 (gate off): vault available as designed; entitlement enforcement deferred until billing + entitlements are ready.
- 18+ only at launch (Decision #5) — no child roles exist.

## 2. Permissions matrix

`—` = not applicable.

| Feature | ANON | FREE | PLUS | FMEM | FMGR | ADMIN |
|---|---|---|---|---|---|---|
| Register / magic-link (F-11.1) | — (pre) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anonymous trial (F-11.2) | ✅ | — | — | — | — | — |
| Private space (F-1.1) | ✅ local | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create family/work space (F-1.1) | ❌ | ✅* | ✅ | ✅* | ✅ | ✅ |
| Join via invite (F-6.2) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invite members (F-6.3) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Remove members (F-6.3) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| 2nd+ family slot (F-6.4) | ❌ | ❌ | ✅† | ❌ | ❌ | ✅ |
| Voice notes + transcription (F-4.1) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI chat / ask (F-3.1/3.2) | ✅‡ | ✅‡ | ✅ | ✅‡ | ✅‡ | ✅ |
| AI extraction (F-4.2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fast-path intents (F-4.3) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Text notes (F-5.1) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Photos (F-5.2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Documents (F-5.3) | ❌ | ✅† | ✅ | ✅† | ✅† | ✅ |
| Belongings: things/lookup (F-7.1/7.2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Borrowing (F-7.3) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Watches (F-7.4) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shopping lists (F-7.5) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Expenses (F-7.6) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tasks/agenda/reminders (F-9.1/9.2) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Morning digest (F-9.3) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vault (F-8.1) | ❌ | ✅ (D4) | ✅ | ✅ (D4) | ✅ (D4) | ❌§ |
| Vault documents (F-8.2) | ❌ | ✅† (D4) | ✅ | ✅† (D4) | ✅† (D4) | ❌§ |
| Search (F-10.1) | ✅ own | ✅ own | ✅ | ✅ space | ✅ space | ❌§ |
| Tab proposals create (F-1.2) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage tabs (delete/rename) | ❌ | ✅ own | ✅ own | ❌ | ✅ | ✅ |
| Memory feedback (F-2.4) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export own data (F-14.2) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌§ |
| Trash restore own (F-14.3) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌§ |
| Delete account (F-11.6) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌§ |
| Email change (F-11.4) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deactivate account (F-11.5) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Billing: subscribe/manage (F-12.1) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin console (F-13.1) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin broadcast (F-9.4) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| AI governance (F-3.3) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## 3. Legend

- `*` — Creating a family space consumes a family slot; first is free (F-6.4).
- `†` — Subject to tier quotas/storage limits once Decision #2 options are owner-approved; enforcement fails closed (F-12.2).
- `‡` — ANON/FREE AI usage subject to the per-user daily AI spend cap (F-3.5) and rate limits.
- `§` — Admin has **no user-data access** — admin tools operate on accounts/entitlements, never read user memories, vault, or exports. (Privacy boundary; verify in tests.)
- `(D4)` — Vault rows reflect Decision #4: paid gate stays off; vault available as designed until billing + entitlements are ready.

## 4. Permission principles

1. **Space membership is the data boundary** — no role grants cross-space reads.
2. **Family membership never grants vault access** (Decision #4 / privacy).
3. **Entitlement checks fail closed** — deny on error or unknown state (F-12.2).
4. **Destructive actions require explicit confirmation** — member removal, space delete, account delete.
5. **Admin actions are audit-logged** — every mutating admin action writes an audit record (F-13.1 remediation).
6. **Durability overrides tier** — no permission change may cause silent deletion of saved memories (Decision #1); downgrade blocks new over-quota creation only.
