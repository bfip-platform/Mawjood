# D0.5 — Product Vision and Scope

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0.5/product-spec`
**Source:** Workstream 01 §1 · **Status:** Planning only — does not authorize implementation, production migration, billing activation, or owner approval.

---

## 1. Vision

**Mawjood (موجود — "found it")** is an AI-powered personal and family memory platform: a durable, commercial-grade web application that remembers what matters to you and your family, answers questions about it in natural language (bilingual Arabic/English), and helps households coordinate — items, tasks, lists, reminders, and private information — from voice or text.

## 2. Product promises (priority order)

1. **Durability.** A saved memory is never silently deleted — not by age, plan downgrade, or quota overflow (Owner Decision #1). Trust is the product.
2. **Family-first.** Private, Work, and Family spaces with manager/member permissions; coordination tools (tasks, shopping, borrowing, expenses) built for real households.
3. **Reusable architecture.** The platform is designed as a memory core (API-first services, RLS-isolated data) reusable for future iOS/Android native clients and future product lines, with the web app as the first complete commercial surface.

## 3. Target users

- **Primary:** Adults (18+) managing personal and household memory — individuals who want a trusted place for notes, voice memos, photos, tasks, and belongings, and families coordinating across shared spaces.
- **Secondary:** Small workgroups using Work spaces for lightweight coordination.
- **Explicitly excluded at launch:** Children and child accounts (Owner Decision #5 — 18+ only; architecture preserves extensibility for future parent-managed child accounts without implementing them now).

## 4. What Mawjood is

- A durable memory store with conversational AI retrieval (bilingual AR/EN).
- A family coordination surface (spaces, invites, tasks, shopping, borrowing, expenses, reminders).
- A private vault for sensitive personal information, isolated from family spaces.
- A commercial web product: subscriptions, entitlements, admin, support, observability, legal compliance.

## 5. What Mawjood is not

- Not a generic SaaS dashboard, note-taking clone, or chatbot wrapper.
- Not a social network — no public profiles, feeds, or discovery of other users.
- Not a children's product (18+ only at launch).
- Not a file-backup service — storage serves memories and vault content, not bulk backup.
- Not a medical, legal, or financial advice product.

## 6. Scope boundaries

**In scope (not MVP):** auth and account lifecycle; durable memories and memory management; AI conversational assistant; voice capture, transcription, and extraction; notes, photos, documents, attachments; family membership, invitations, permissions; belongings and item management; vault and private information; tasks, reminders, notifications; memory search, retrieval, organization, discovery; user profiles; subscription plans, billing, entitlements; administration, support, operational tools; privacy, export, deletion, recovery; web (SEO/PWA/deep-links), accessibility (WCAG 2.2 AA target), localization (AR/EN), and future mobile support.

**Scope discipline:** Anything marked NEW in the feature catalog is required for launch unless an open question resolves otherwise; nothing is deferred to "v2" by default. Open questions (Q-1…Q-20 in the catalog) are explicitly not owner-approved and must not be treated as decisions.

## 7. Non-goals

- Native iOS/Android apps in the initial launch (web-first; architecture must be reusable for future native clients).
- Child accounts or child-specific features (Decision #5).
- Public API for third parties at launch.
- Real-time collaboration editing (concurrent multi-user editing of the same note).
- Offline-first full functionality (offline read cache + queued sync is in scope; full offline authoring is not).
- Inventing numeric Free/Plus quotas (Decision #2 — evidence-based options only, owner approves numbers).
- Billing activation or pricing decisions without owner approval (Decision #3 — design only).
