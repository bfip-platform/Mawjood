# D0.5 → D1 Handoff

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** `docs/autonomous/d05/workstream-07-roadmap.md` §7 (authoritative)
**Status:** D1 is NOT authorized. This document defines what must be true before D1 starts.

## D1 prerequisites (all must hold)

1. **D0.5 spec approved + merged by owner.** D1 executes this spec; starting on an unapproved spec risks rework against unratified decisions.
2. **Decisions #1–9 detailed designs reviewed.** The decay/pruneFacts/forget_fact redesigns, quota mechanics, and non-destructive maintenance model have independent review sign-off.
3. **Test harness ready.** CI baseline green on the D1 base branch; new behavioral tests (90-day survival, >200 facts, forget_fact confirmation, trash restore) written and failing-then-passing as work lands.
4. **Scratch Supabase project provisioned.** Destructive-path repros and migration dry-runs never touch prod; prod migration state documented (which of the 34 migrations are applied — unresolved per D0).
5. **Routing confirmed.** Per the standing routing rule: the D1 execution prompt states its intended scope, branch, and PR plan; the owner confirms the prompt belongs to the executing chat before the first repo mutation.
6. **Kill criteria agreed.** If any T-D1 task cannot meet its exit criteria without a new product decision, work stops and returns to the owner — the stage is not "completed" by weakening the criterion.

## D1 entry criteria checklist

- [ ] Owner approval of the D0.5 package recorded (this document set)
- [ ] D0.5 Draft PR merged by owner into main
- [ ] D1 base branch created from merged main HEAD
- [ ] Scratch Supabase project credentials available to the agent (transient, never stored)
- [ ] Owner cron check: is `memory-consolidate` scheduled in prod? (D0 unresolved — determines R-1 urgency)
- [ ] Token/PAT revocations confirmed (outstanding from D-1.1)
- [ ] Independent reviewer assigned for D1's memory-retention review
- [ ] Routing confirmation given for the D1 execution prompt

## D1 scope reminder (from the roadmap)

D1 = P0 data protection (decisions #1, #2, #6, #7): remove 90-day decay (T-D1-1), design non-destructive maintenance (T-D1-2), redesign pruneFacts (T-D1-3), redesign forget_fact (T-D1-4), enforce trash 30-day (T-D1-5), verify cascade map (T-D1-6), quota mechanics + numeric options (T-D1-7). Exit: zero destructive memory-deletion paths (static + behavioral proof), review sign-off, CI 9/9, Draft PR owner-mergeable, quota numbers explicitly unfinalized.

## Branch / PR strategy for D1

- Branch: `d1/data-protection` from merged main HEAD.
- One Draft PR containing T-D1-1–T-D1-7; split order if review demands: decay removal first (launch blocker), then pruneFacts/forget_fact, then trash/quota.
- Each PR: implement → test → independent review → exact-head CI (9/9 green) → Draft PR. Agent never merges.
- No PR stacks on an unreviewed or red PR.

## What D1 must NOT do (bans carry forward)

- No production migrations (additive migrations on scratch/CI only; prod execution needs separate owner approval).
- No destructive migration even on staging without owner sign-off.
- No quota numbers finalized (options only — OD-01/OD-02 stay open).
- No D2 work (security hardening is a separate stage with its own review).
- No merges, deploys, billing activation.
- No weakening exit criteria to claim completion.

## Recovery anchor

- D0.5 base: main @ `8be1f8e` (D0 merged). D1 branches from the post-D0.5-merge main HEAD (TBD at authorization time).
- D1's own recovery plan: migrations additive (new columns/flags like `deleted_via`, `deletion_confirmed_at`); rollback = revert function deploys; nothing destructive runs during the window; scratch-project repro before any staging deploy.

## Authorization required

D1 begins only on the owner's explicit "begin D1" instruction after this handoff's checklist is satisfied. The agent will not infer authorization from the D0.5 approval.

---

*End of D0.5 → D1 handoff.*
