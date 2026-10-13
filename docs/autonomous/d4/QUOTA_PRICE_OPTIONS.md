# D4 T-D4-3 — Quota & price OPTIONS paper (no final numbers)

> Status: options for the owner's decision (OD-01/02 remain OPEN). Per Decision #2, quotas are **designed, not invented** — this paper assembles the evidence and the decision matrix; it chooses nothing. D1 built quota mechanics only; **no memory cap is configured anywhere in the product today.**

## 1. Evidence gathered so far

- **AI unit costs (measured, from the spend-cap telemetry pricing, 2026-10-12):** gpt-5-mini $0.25 in / $2.00 out per 1M tokens; gpt-4o-mini $0.15/$0.60; Groq transcription on the free tier today. A typical chat turn is a few thousand tokens → per-turn cost is on the order of a tenth of a cent to ~1¢ depending on context size; the provisional global safety cap is $2/user/day (PR #19, owner to revisit with tiers).
- **Memory storage costs:** negligible per fact (a row + trigram index share ≈ a few KB); the D3 benchmarks show 100k items/user-scale is far beyond realistic use, and search stays in single-digit ms. Storage is NOT the binding constraint; AI tokens are.
- **What we do NOT have yet:** real per-user usage distributions (facts/user, turns/day) — prod telemetry exists (`ai_events`) but reading prod data for this analysis needs the owner's go-ahead; anonymous-trial conversion data doesn't exist pre-launch.

## 2. The options (from the D0.5 spec §4.4, unchanged)

| Option | Shape | Fits if… |
|---|---|---|
| **A** | Free: 500 facts / 5,000 total · Paid: higher/uncapped-ish | Simplicity wins; most users never approach the cap |
| **B** | Free: 200 / 2,000 · Paid: higher | Cost control matters early; risk: the cap becomes the product's first impression |
| **C** | Usage-based (AI turns/day metered, memory uncapped) | The AI-cost analysis above is the whole story — memory itself is free to keep, answers are what cost |

## 3. Recommendation logic (not a decision)

- The evidence points at **AI usage, not memory count**, as the real cost driver. A memory cap taxes the product's core promise ("we remember for you") to save ~nothing; an AI-turn allowance taxes the actual cost. Option C (or A-with-C's metering for the AI side) aligns the meter with the cost.
- Whatever the owner picks, the mechanics already exist: `quotaGate`/`upsertFacts` caps (D1), the daily spend cap (PR #19), and the entitlement matrix (ENTITLEMENTS.md) — wiring numbers in is configuration, not new engineering.
- Pricing (the $ figure for `family_plus`) has NO evidence base yet — it should wait for the App Store/Play comparable pass and the owner's margin call. This paper deliberately carries no price recommendation.

## 4. What would settle it

1. Owner reads prod `ai_events` aggregates (turns/user/day distribution) — a one-query answer once approved.
2. A soft-launch cohort's fact counts after 30/60/90 days.
3. The owner's call on positioning: generous-memory brand (favor A/C) vs tight free tier (favor B).

**Until then: no cap is configured, and the spend cap remains the only (provisional) numeric guard.**
