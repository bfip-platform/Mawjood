// ── AI spend cap (roadmap T-D2-4, F-SEC-03; atomic ledger: owner audit) ────
// Per-user DAILY AI spend ceiling. The gate's source of truth is the
// ai_spend_daily ledger (migration 0044), updated by ONE atomic upsert
// (charge_ai_spend) — never by summing telemetry in the edge function.
//
// WHY (owner audit finding): the original implementation summed
// ai_events rows fetched with .limit(5000). Past 5,000 events/day —
// and past PostgREST's own server row cap — the sum silently
// UNDERCOUNTED, so the cap stopped binding exactly when spend was
// highest. The events sum survives below as sumSpendFromEvents() for
// reporting/reconciliation, now fully paginated; it is NOT the gate.
//
// GATE SEMANTICS: checkSpendCap reads the ledger total (single row —
// no truncation possible), denies at/over the cap, and otherwise
// PRE-CHARGES a worst-case estimate for the request
// (estimateWorstCaseChargeUsd). Pre-charging an upper bound means the
// ledger is always >= the actual provider spend of completed calls;
// concurrent in-flight requests can push the LEDGER past the cap by at
// most their combined charges, while actual spend stays below the
// ledger. The cap is therefore enforced conservatively (it can only
// bite early, never late) — the fail-closed direction.
//
// FAIL-CLOSED: any ledger failure (RPC error, malformed payload)
// denies the AI call. Deterministic no-model paths are never gated —
// callers check only on model-bound paths.
//
// Configuration (edge env):
//   AI_DAILY_SPEND_CAP_USD — daily cap per user (default 2.00, provisional
//                            pending the owner's tier decisions)
//   AI_SPEND_CAP_OFF=1     — kill-switch: disables the cap entirely

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
  const pin = Math.max(0, Number(promptTokens) || 0);
  const pout = Math.max(0, Number(completionTokens) || 0);
  return (pin * rate.input + pout * rate.output) / 1_000_000;
}

/**
 * Worst-case charge for a request, pre-charged to the ledger at the
 * gate. Output dominates price, so the bound is: `calls` model calls,
 * each with `maxOutTokens` output priced by estimateCostUsd at the
 * model's rate, plus a flat input allowance per call. Deliberately an
 * UPPER bound of what the request can actually cost.
 */
export function estimateWorstCaseChargeUsd(
  model: string,
  calls: number,
  maxOutTokens: number,
  inputAllowanceTokens = 2000,
): number {
  return Math.max(0, calls) * estimateCostUsd(model, inputAllowanceTokens, maxOutTokens);
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
  /** Ledger total (USD) after this check (includes the pre-charge when allowed). */
  spentUsd?: number;
  capUsd?: number | null;
  /** 'cap_reached' | 'check_failed' when denied. */
  reason?: string;
}

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The gate. Reads the atomic ledger, denies at/over the cap, and
 * pre-charges `chargeUsd` (the request's worst case) atomically when
 * allowing. Any ledger failure denies (fail-closed), except when the
 * cap is disabled via the kill-switch.
 */
// deno-lint-ignore no-explicit-any
export async function checkSpendCap(
  supa: any,
  userId: string,
  capOverride?: number | null,
  chargeUsd = estimateWorstCaseChargeUsd('gpt-5-mini', 1, 2000),
): Promise<SpendCapResult> {
  const capUsd = capOverride !== undefined ? capOverride : parseSpendCapUsd(envGet('AI_DAILY_SPEND_CAP_USD'), envGet('AI_SPEND_CAP_OFF'));
  if (capUsd === null) return { allowed: true, capUsd: null };
  try {
    const day = utcDay();
    const { data: total, error: readErr } = await supa.rpc('ai_spend_total', { p_user: userId, p_day: day });
    const spent = Number(total);
    if (readErr || !Number.isFinite(spent)) {
      return { allowed: false, capUsd, reason: 'check_failed' };
    }
    if (spent >= capUsd) return { allowed: false, spentUsd: spent, capUsd, reason: 'cap_reached' };
    const { data: newTotal, error: chargeErr } = await supa.rpc('charge_ai_spend', {
      p_user: userId, p_day: day, p_amount: Math.max(0, chargeUsd),
    });
    const after = Number(newTotal);
    if (chargeErr || !Number.isFinite(after)) {
      // The charge may or may not have landed; either way the ledger
      // is now unknown-or-higher — fail closed (conservative).
      return { allowed: false, capUsd, reason: 'check_failed' };
    }
    return { allowed: true, spentUsd: after, capUsd };
  } catch {
    return { allowed: false, capUsd, reason: 'check_failed' };
  }
}

/**
 * Reporting/reconciliation ONLY (not the gate): sum today's ai_events
 * with FULL pagination — .range() pages of 1,000 until a short page —
 * so no row cap can silently truncate the total. Throws on telemetry
 * error; callers that need fail-closed behavior use checkSpendCap.
 */
// deno-lint-ignore no-explicit-any
export async function sumSpendFromEvents(supa: any, userId: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const PAGE = 1000;
  let spent = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa
      .from('ai_events')
      .select('model, prompt_tokens, completion_tokens')
      .eq('user_id', userId)
      .gte('created_at', dayStart.toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !Array.isArray(data)) throw new Error('ai_events read failed');
    for (const row of data) spent += estimateCostUsd(row.model, row.prompt_tokens, row.completion_tokens);
    if (data.length < PAGE) break;
  }
  if (!Number.isFinite(spent)) throw new Error('ai_events total malformed');
  return spent;
}

export function spendCapMessage(uiAr: boolean): string {
  return uiAr
    ? 'وصلت للحد اليومي لاستخدام الذكاء الاصطناعي — ذكرياتك محفوظة بأمان، والحد بيتجدد بكرا.'
    : "You've reached today's AI usage limit. Your saved memories are safe, and the limit resets tomorrow.";
}
