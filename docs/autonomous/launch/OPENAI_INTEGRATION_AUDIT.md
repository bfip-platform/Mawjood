# OpenAI integration audit — existing configuration (2026-10-13)

*Read-only audit. No keys were exposed, rotated, or used; no paid calls
were made. Prepared before any staging credential provisioning, per the
owner's instruction.*

## 1. What configuration exists (code — verified at `main @ 7f4bad04`)

- **Single seam:** `supabase/functions/_shared/ai.ts` → `aiConfig()`,
  consumed by all 8 model-calling functions (ask, chat, classify,
  extract, memory-consolidate, memory-learn, route, transcribe). There
  is no other provider code path and no per-environment branching.
- **Selection logic:** if `OPENAI_API_KEY` is set on the deployed
  project → OpenAI provider (chat `gpt-5-mini`, vision `gpt-4o-mini`);
  transcription uses Groq `whisper-large-v3-turbo` while `GROQ_API_KEY`
  also exists, else `gpt-4o-mini-transcribe`. If `OPENAI_API_KEY` is
  absent → Groq provider for everything (chat `gpt-oss-120b`, vision
  `qwen/qwen3.8-27b`, whisper transcription) with whatever
  `GROQ_API_KEY` holds.
- Provider choice is therefore **per-project, by secrets only** — the
  same deployed code behaves differently on production vs scratch purely
  from each project's secret store.

## 2. Which environment uses it

| Project | Provider secrets (by program record) | Effective config |
|---|---|---|
| **Production** `mwjzosfrxwxcrzcsiear` | `OPENAI_API_KEY` set 2026-09-27 (owner's key, provided transiently, never stored by the agent); `GROQ_API_KEY` set (free tier, whisper) | OpenAI premium path + Groq transcription |
| **Scratch/staging** `caimavjwasxiegjhxdsr` | **None** — created 2026-10-12 with zero functions; no provider secret was ever set on it by this program | No AI capability at all today |

The app build on this machine points at production
(`apps/mobile/.env` → the production project URL; anon key, not a
provider credential).

**Verification limit (stated plainly):** secret *values* are never
visible to the agent, and the agent currently has no live Supabase
access route, so the production secrets' presence rests on the program
record (curated memory + architecture docs + deployment history), not a
fresh live probe. Re-verification is step 0 of the staging plan.

## 3. Can the existing integration be reused for staging?

**The code integration: yes, entirely.** Staging deploys the identical
functions; the only step is setting secrets on the scratch project. No
code change, no new integration work.

**The production key value: do NOT reuse it on scratch.** A key is
technically portable, but reusing the same value would (a) mix staging
test spend with production spend on one OpenAI account with no clean
provider-side attribution (the Supabase spend ledger separates by
project; OpenAI's reporting would not), and (b) double the secret's
exposure surface — a later revocation would break production.

**Recommended owner configuration (nothing else is needed):**
1. Create a **dedicated staging OpenAI key** — ideally in a separate
   OpenAI project with its own hard usage limit set to the approved
   exercise budget ($10 per the staging plan §6).
2. Set it as `OPENAI_API_KEY` on the **scratch project only**, in the
   Supabase dashboard — never via chat (transient-only rule).
3. Optionally a separate free-tier `GROQ_API_KEY` for staging
   transcription (keeps attribution clean; costs nothing).
4. Confirm the OpenAI account actually holds credit before the run —
   the account had an unresolved payment-page issue on 2026-09-23
   (records say it stopped blocking once the key path was used, but
   only the owner can see the current balance).

**Isolation note:** staging is safely isolated *by absence* today — with
no secrets on scratch, a staging deployment cannot spend through
production's key (the key exists only inside production's secret store),
and `aiConfig()` with no keys yields failing-closed model calls, not
spend. The production key needs **no rotation** for staging purposes
and is untouched by this audit.
