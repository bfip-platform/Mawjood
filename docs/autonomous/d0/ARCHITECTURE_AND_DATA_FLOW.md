# D0 — Architecture & Data Flow

**Version:** 1.0 · **Date:** 2026-10-12 · **Branch:** `d0/discovery-audit` @ `1c3c57b`

## System overview

```
┌─────────────┐     HTTPS/WSS      ┌──────────────────┐
│  Expo app   │ ◄──────────────► │  Supabase         │
│  (RN + web) │                   │  - Postgres + RLS │
│  voice-     │                   │  - Auth           │
│  engine     │                   │  - Storage        │
│  client.ts  │                   │  - 22 Edge Fns    │
└─────────────┘                   │  - Realtime       │
       │                          └──────────────────┘
       │                                   │
       ▼                                   ▼
  Groq (Whisper)              OpenAI (GPT-5-mini)
  transcription               chat / extract / memory
```

## Request flows

### Voice note → memory
1. App records audio → uploads to Storage (private bucket)
2. `transcribe` fn → Groq Whisper → transcript
3. Audio **deleted** post-transcription (user policy: "بنمسح الصوت")
4. `extract` fn → GPT-5-mini → tasks/items/memories → `notes`/`items` tables
5. `memory-learn` → facts into `items` (kind=memory)

### Chat turn
1. `classify`/`route` (public — finding) → fast-path or full chat
2. `chat` fn: ReAct loop, ≤5 steps; tools: search, save_fact, forget_fact, structural actions
3. Governed actions (tabs/spaces) require **double approval**
4. `ai_events` logs tokens (accounting exists, caps don't)

### Family invite
1. Manager creates code (`space_invites`: 7d expiry, 10 uses)
2. `join-family` redeems → `space_members` row
3. RLS enforces per-space isolation (behavioral tests pass)

## Data model (key tables)

- `spaces` (private/family/work/custom) → `space_members` → `notes` → `items`
- `items`: kind ∈ {memory, task, shopping, borrow, agenda, expense, ...}
- `chat_sessions` (7-day retention, separate from memories)
- `vaults` (secret tabs, bcrypt codes)
- `user_subscriptions`, `trash_bin`, `device_tokens`, `ai_events`, `ops_events`

## Trust boundaries

- **Client → Edge:** JWT (Supabase Auth); service_role confined to edge fns
- **Edge → DB:** RLS via user JWT; service_role bypass for system ops (with server-side checks)
- **Admin:** `x-admin-token` (non-constant-time compare — MEDIUM finding)
- **Cron:** `x-cron-secret` for `memory-consolidate` (no in-repo scheduler)

## AI provider abstraction

`supabase/functions/_shared/ai.ts` (67 lines): Groq + OpenAI paths, GPT-5 quirks. D-1.1 recommends ADOPT `ai-provider-core`.

## Gaps in architecture docs

- No `config.toml` in repo → deployed `verify_jwt` settings unverifiable
- No sequence diagrams for governed actions (recommendation: add in D0.5)
- No data-flow diagram for vault crypto (test-first gate before ADAPT)
