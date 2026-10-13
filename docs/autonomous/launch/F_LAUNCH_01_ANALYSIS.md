# F-LAUNCH-01 — Investigation: client hard-delete surface on `items`

*Ordered by the owner in the final launch-readiness integration (2026-10-13).
Analysis only — NO deletion semantics were changed. A recommendation follows;
any change requires separate owner approval.*

## 1. Who can hard-delete items today — exactly

Migration `0002_items.sql` defines two policies on `public.items`:

- `items_member_read` — SELECT, `using (can_access_space(space_id))`
- `items_member_write` — **FOR ALL** (SELECT/INSERT/UPDATE/DELETE),
  `using (can_access_space(space_id)) with check (can_access_space(space_id))`

`can_access_space` (migration 0001) is true for the space **owner** and for
**every member** in `space_members`. No later migration narrows either policy
(grep-verified across 0001–0045; confirmed on scratch: `items_member_write`
reports `polcmd='*'`).

**Therefore:** any authenticated user who owns or belongs to a space can
hard-delete **any** `items` row in that space with a direct PostgREST call —
regardless of who created the item, regardless of its status, with no trash
snapshot, no audit row, and no undo. Anonymous users and non-members cannot
(the predicate still gates access to the space).

## 2. How the app itself uses this permission (intended flows)

All client-side `items` deletes live in `packages/voice-engine/src/client.ts`
and are deliberate, user-initiated flows:

| Site | Flow | Trash semantics |
|---|---|---|
| `trashItem` (~L1279) | user trashes an item | inserts a full snapshot into `trash_bin` **first**, then deletes the row — restorable until `emptyTrash`/expiry |
| `trashNote` (~L1221), `trashSecretNote` (~L1253) | user trashes a note | snapshot pattern; the note's extracted items are deleted with it |
| `deleteSpaceTab` cascade (~L1179), `deleteTabForever` (~L1192) | user deletes a custom tab (forever) | the tab's items are deleted with it |
| list cascade (~L1303) | `trashShoppingList` | list + items moved to trash (or permanent when retention ≤ 0, the user's explicit choice) |
| `deleteSpace` (L1544) | owner deletes a whole space | deletes the `spaces` row directly — `items.space_id` is **ON DELETE CASCADE** (0002:6), so items cascade with **no trash snapshot**. Owner-only (`spaces_owner_all` policy), so the member-scope exposure is unchanged, but it is a third parent-cascade surface alongside lists |

Two schema facts matter for any fix:

- `items.note_id` is `ON DELETE SET NULL` — deleting a note without the
  client's pre-delete would orphan its items; the pre-delete is deliberate.
- `items.list_id` is `ON DELETE CASCADE` — deleting a `shopping_lists` row
  cascades to items at the DB level, bypassing the items policy entirely.
  Parent-table deletes are part of the same surface.

Server side is unaffected by this finding: the AI/engine paths never rely on
the client policy. Within the memory engine (`_shared/memory.ts`) the only
`items` delete is `purgeExpiredTrashedFacts` (service role; trashed +
past-retention only); the one other server-side items delete is
`account-delete` (service role; erases the user's own spaces on account
closure — intended). AI trashing goes through the 0036/0037/0041
confirmation rails.

## 3. Does it bypass the intended confirmation/trash behavior?

- **The delete-safety ruling (AI): NOT bypassed.** It binds the AI; those
  rails are server-side and intact.
- **The app's own user flows: NOT bypassed.** They snapshot to `trash_bin`
  before deleting, by design.
- **The gap:** the policy grants the raw DELETE power *outside* those flows.
  Any member (e.g. an invited family member), a buggy or malicious client, or
  a hijacked session can permanently wipe shared items — including the space
  owner's saved memories in a family space — skipping the trash safety net
  the product promises, leaving no trace. This is an insider-scope,
  authenticated-only exposure: **MEDIUM** stands.

## 4. Options

**A — Accept as-is.** The owner's data authority argument. Leaves the
insider/bug/hijack hole open in shared spaces. Zero work.

**B — RPC-mediated deletion (RECOMMENDED).** Migration 0046:
1. Split `items_member_write`: INSERT and UPDATE policies keep
   `can_access_space`; **no client DELETE policy remains**.
2. A `SECURITY DEFINER` RPC (e.g. `hard_delete_items(p_ids uuid[])`,
   authenticated-only, service-verified `can_access_space` per row) becomes
   the single client deletion path.
3. The seven `client.ts` delete sites call the RPC instead of
   `.from('items').delete()` — **zero UX change**: `trashItem` still
   snapshots first; delete-forever, note/list/tab/space flows behave
   identically; the engine purge (service role) is untouched.
4. Same treatment flagged for the parent cascade (`shopping_lists` delete +
   `list_id` CASCADE) if the owner wants defense in depth; list deletion
   already snapshots first via `trashShoppingList`. The spaces cascade
   (`deleteSpace`, §2) should be named in the same scope: it is owner-only
   today, and Option B can leave it as an explicit owner prerogative or
   route it through the same RPC — owner's choice when scoping 0046.

*Impact:* one additive migration (policy split + one function; rollback =
restore the FOR ALL policy, which re-opens the hole but breaks nothing) +
a call-site swap in one file + tests. Scratch-provable both directions:
direct member DELETE of an open item must fail post-fix while every app
flow stays green. No data migration, no UX change, no pricing/behavior
change. **Effort: small.**

**C — Creator/owner-only DELETE policy.** `using (can_access_space AND
(created_by = auth.uid() OR space-owner))`. NOT recommended: breaks
`trashItem` for items a member didn't create and shared-list cleanup —
real regressions in family spaces for a weaker guarantee than B.

## 5. Recommendation

**Adopt Option B as a small follow-up PR after this integration merges**,
with the scratch proof and an extended census guard (no `.from('items')
.delete(` may remain in client code; the RPC is the only path). Until then,
F-LAUNCH-01 stays open at MEDIUM with Option A as the interim posture —
which is a launch-gate input for the owner, not a silent acceptance.

---

## Status update (2026-10-13)

The owner approved Option B. It is implemented as **Draft PR #43**
(migration `0046_items_delete_rpc.sql`; `hard_delete_items(uuid[])`
SECURITY DEFINER, `search_path` pinned empty, authenticated/service_role
grants only, all-or-nothing per-row `can_access_space` validation; all
nine client delete sites in `voice-engine/src/client.ts` routed through
the RPC — the implementation census found two multi-line sites, 352 and
1747, beyond the seven originally cited). Behavioral proof:
`supabase/tests/hard-delete-check.mjs` (owner/member/outsider/atomicity/
concurrency/rollback on real PostgreSQL). The spaces-cascade question
(§2/§4) stays as documented: `deleteSpace` remains an owner-only direct
path, unchanged.

**Review addenda (PR #43 security review, 2026-10-13):** (i) the cascade
inventory also includes `items.vault_id` → `secret_vault` CASCADE — the
vault policy is strictly owner-only, so it reaches only the owner's own
vault items on their own vault deletion; not a member bypass. (ii) The
RPC's outsider behavior distinguishes existing foreign ids (42501) from
nonexistent ids (returns 0) — a theoretical UUID-existence oracle,
accepted as negligible (ids are unguessable). (iii) Validation and delete
run as two statements in one transaction; a concurrent space-move between
them is not re-checked — exploiting it needs access to both spaces, so no
privilege gain in practice. (iv) The review caught that 0014's FOR ALL
policy was also the lists SELECT grant; 0046 now re-creates an explicit
`shopping_lists_member_read` policy (the split initially broke list
reads — fixed pre-merge, with a member-read case added to the behavioral
proof).
