// ── AI spend cap (roadmap T-D2-4, F-SEC-03) ────────────────────────────────
// Per-user DAILY AI spend ceiling, estimated from the ai_events telemetry
// every user-facing function already writes (prompt/completion tokens per
// call). This is a guardrail against runaway/abusive spend — estimates use
// published list prices, it is not a billing ledger.
//
// FAIL-CLOSED by design (roadmap exit gate): if today's spend cannot be
// determined (telemetry query error), the AI call is DENIED. Deterministic
// no-model paths are never gated by this module — callers check it only on
// model-bound paths.
//
// Configuration (edge env):
//   AI_DAILY_SPEND_CAP_USD — daily cap per user (default 2.00, provisional
//                            pending the owner's tier decisions — heavy
//                            legitimate chat use is ~$0.002–0.01/message)
//   AI_SPEND_CAP_OFF=1     — kill-switch: disables the cap entirely
//                            (recovery path per the roadmap)

// USD per 1M tokens { input, output }. Sources: OpenAI published pricing
// (verified 2026-10-12): gpt-5-mini 0.25/2.00, gpt-4o-mini 0.15/0.60.
// Groq-hosted models are priced at the gpt-4o-mini rate as a guardrail
// estimate. Unknown models fall back to the MOST EXPENSIVE known rate so
// a new model can never silently under-count spend.
export const MODEL_RATES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai/gpt-oss-120b': { input: 0.15, output: 0.6 },
  'qwen/qwen3.8-27b': { input: 0.15, output: 0.6 },
};
export const FALLBACK_RATE = MODEL_RATES_USD_PER_1M['gpt-5-mini'];

export function estimateCostUsd(
  model: string,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
): number {
  const rate = MODEL_RATES_USD_PER_1M[model] ?? FALLBACK_RATE;
  const pin = Math.max(0, promptTokens ?? 0);
  const pout = Math.max(0, completionTokens ?? 0);
  return (pin * rate.input + pout * rate.output) / 1_000_000;
}

/** Parse cap configuration. Returns null when the kill-switch disables the cap.
 *  A non-positive or unparseable value falls back to the $2.00 default —
 *  note this means "0" does NOT mean block-all; use a tiny positive cap
 *  (or the kill-switch semantics in reverse) deliberately if ever needed. */
export function parseSpendCapUsd(rawCap: string | undefined, rawOff: string | undefined): number | null {
  if (rawOff === '1') return null;
  const n = rawCap !== undefined ? Number(rawCap) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 2.0;
}

function envGet(name: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  const d = (globalThis as any).Deno;
  try {
    return d?.env?.get?.(name);
  } catch {
    return undefined;
  }
}

export interface SpendCapResult {
  allowed: boolean;
  /** Estimated USD spent today (UTC) when the check ran. */
  spentUsd?: number;
  capUsd?: number | null;
  /** 'cap_reached' | 'check_failed' when denied. */
  reason?: string;
}

/**
 * Sum today's (UTC) ai_events for the user and compare against the cap.
 * Any telemetry failure denies (fail-closed), except when the cap is
 * disabled via the kill-switch.
 */
// deno-lint-ignore no-explicit-any
export async function checkSpendCap(supa: any, userId: string, capOverride?: number | null): Promise<SpendCapResult> {
  const capUsd = capOverride !== undefined ? capOverride : parseSpendCapUsd(envGet('AI_DAILY_SPEND_CAP_USD'), envGet('AI_SPEND_CAP_OFF'));
  if (capUsd === null) return { allowed: true, capUsd: null };
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  // Fail-closed on EVERY telemetry failure channel: a returned { error },
  // a non-array payload, or a thrown/rejected query (R2) all deny.
  try {
    const { data, error } = await supa
      .from('ai_events')
      .select('model, prompt_tokens, completion_tokens')
      .eq('user_id', userId)
      .gte('created_at', dayStart.toISOString())
      .order('created_at', { ascending: true })
      .limit(5000);
    if (error || !Array.isArray(data)) {
      return { allowed: false, capUsd, reason: 'check_failed' };
    }
    let spent = 0;
    for (const row of data) {
      spent += estimateCostUsd(row.model, row.prompt_tokens, row.completion_tokens);
    }
    if (spent >= capUsd) return { allowed: false, spentUsd: spent, capUsd, reason: 'cap_reached' };
    return { allowed: true, spentUsd: spent, capUsd };
  } catch {
    return { allowed: false, capUsd, reason: 'check_failed' };
  }
}

export function spendCapMessage(uiAr: boolean): string {
  return uiAr
    ? 'وصلت للحد اليومي لاستخدام الذكاء الاصطناعي — ذكرياتك محفوظة بأمان، والحد بيتجدد بكرا.'
    : "You've reached today's AI usage limit. Your saved memories are safe, and the limit resets tomorrow.";
}
