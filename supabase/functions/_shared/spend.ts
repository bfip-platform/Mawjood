// ── AI spend cap (roadmap T-D2-4, F-SEC-03; atomic ledger: owner audit) ────
// Per-user DAILY AI spend ceiling. Enforcement lives in the
// ai_spend_daily ledger (migration 0044) behind ONE atomic operation:
//
//   try_charge_ai_spend(user, day, amount, cap) -> new total | NULL
//
// A single upsert whose UPDATE carries the cap predicate under the row
// lock: authorization and reservation are the same database operation,
// so concurrent requests can never race past the cap, and the ledger
// can never exceed it.
//
// HISTORY (why not a telemetry sum): the original gate summed ai_events
// rows fetched with .limit(5000) — past 5,000 events/day, and past
// PostgREST's own row cap, the sum silently UNDERCOUNTED and the cap
// stopped binding exactly when spend was highest. The first fix split
// read and charge into two calls (still a boundary race). The events
// sum survives as sumSpendFromEvents() for reporting only, fully
// paginated; it is NOT the gate.
//
// CHARGE ACCURACY (owner correction): every model call is charged
// BEFORE it runs, at a MEASURED upper bound of its own payload:
//   - input tokens: payload characters × TOKENS_PER_CHAR_BOUND, a
//     conservative chars->tokens factor for mixed Arabic/English GPT
//     tokenizers (Arabic tokenizes denser than English; 0.75 tok/char
//     plus slack covers observed worst cases), plus a flat
//     IMAGE_TOKEN_BOUND per attached image (vision bills per image,
//     not per character).
//   - output tokens: the call's own max_tokens — a hard bound the
//     provider enforces on every request.
//   - price: FALLBACK_RATE, the most expensive rate in the table, so
//     provider fallback chains (OpenAI -> Groq) can never out-price
//     the charge: every chain member's rates are <= the fallback's.
// Retries are separate attempts and are charged per attempt at the
// seam (callModel/callVision/extract loop), because a retried call is
// a real second request. The ledger therefore always >= the actual
// provider spend of completed calls, and reaches the cap exactly —
// never past it.
//
// FAIL-CLOSED everywhere: pre-check read failure denies; a missing,
// non-finite, or negative charge estimate denies WITHOUT calling the
// RPC; an RPC error denies ('check_failed'); a NULL from the RPC
// denies ('cap_reached'). Deterministic no-model paths are never
// gated — callers charge only at model-call seams.
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

/** Conservative chars->tokens bound for mixed AR/EN GPT tokenizers. */
export const TOKENS_PER_CHAR_BOUND = 0.75;
/** Flat per-image input-token bound for vision calls. */
export const IMAGE_TOKEN_BOUND = 2000;

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
 * The charge for ONE model-call attempt, from its measured payload.
 * inputChars counts every character of the messages payload (system,
 * history, context, tool results — whatever the caller assembled);
 * images add IMAGE_TOKEN_BOUND each. Priced at FALLBACK_RATE (the
 * table maximum) so no provider/fallback combination can exceed it.
 * Returns NaN for invalid specs — callers must treat NaN as a denial.
 */
export function estimateCallChargeUsd(spec: {
  inputChars: number;
  maxOutTokens: number;
  images?: number;
}): number {
  const chars = Number(spec?.inputChars);
  const maxOut = Number(spec?.maxOutTokens);
  const images = Number(spec?.images ?? 0);
  if (!Number.isFinite(chars) || chars < 0 || !Number.isFinite(maxOut) || maxOut <= 0
    || !Number.isFinite(images) || images < 0) {
    return NaN;
  }
  const inputTokens = Math.ceil(chars * TOKENS_PER_CHAR_BOUND) + images * IMAGE_TOKEN_BOUND;
  return estimateCostUsd('__fallback__', inputTokens, maxOut);
}

/** Total characters in a chat-messages payload (content strings only). */
// deno-lint-ignore no-explicit-any
export function payloadChars(messages: any[]): number {
  let n = 0;
  for (const m of messages ?? []) {
    const c = m?.content;
    if (typeof c === 'string') n += c.length;
    else if (Array.isArray(c)) {
      for (const part of c) {
        if (typeof part?.text === 'string') n += part.text.length;
      }
    }
  }
  return n;
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
  /** Ledger total (USD) when known. */
  spentUsd?: number;
  capUsd?: number | null;
  /** 'cap_reached' | 'check_failed' when denied. */
  reason?: string;
}

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function resolveCap(capOverride?: number | null): number | null {
  return capOverride !== undefined
    ? capOverride
    : parseSpendCapUsd(envGet('AI_DAILY_SPEND_CAP_USD'), envGet('AI_SPEND_CAP_OFF'));
}

/**
 * Read-only pre-check (NO charge): denies when the ledger is already
 * at/over the cap, so callers can fail fast before assembling prompts.
 * The authoritative enforcement is chargeModelCall — this check alone
 * never authorizes spend. Fail-closed on any ledger failure.
 */
// deno-lint-ignore no-explicit-any
export async function checkSpendCap(supa: any, userId: string, capOverride?: number | null): Promise<SpendCapResult> {
  const capUsd = resolveCap(capOverride);
  if (capUsd === null) return { allowed: true, capUsd: null };
  try {
    const { data: total, error } = await supa.rpc('ai_spend_total', { p_user: userId, p_day: utcDay() });
    const spent = Number(total);
    if (error || !Number.isFinite(spent)) return { allowed: false, capUsd, reason: 'check_failed' };
    if (spent >= capUsd) return { allowed: false, spentUsd: spent, capUsd, reason: 'cap_reached' };
    return { allowed: true, spentUsd: spent, capUsd };
  } catch {
    return { allowed: false, capUsd, reason: 'check_failed' };
  }
}

/**
 * THE GATE — charge one model-call attempt atomically against the
 * daily cap. The RPC applies the charge only if the resulting total
 * stays <= cap, under the ledger row lock. Outcomes:
 *   - new total (number)  -> allowed; the attempt may proceed.
 *   - NULL                -> denied 'cap_reached' (or invalid amount).
 *   - RPC error / throw   -> denied 'check_failed' (fail-closed).
 *   - invalid estimate    -> denied 'check_failed' WITHOUT any RPC.
 * The kill-switch (cap = null) allows without touching the ledger.
 */
// deno-lint-ignore no-explicit-any
export async function chargeModelCall(
  supa: any,
  userId: string,
  spec: { inputChars: number; maxOutTokens: number; images?: number },
  capOverride?: number | null,
): Promise<SpendCapResult> {
  const capUsd = resolveCap(capOverride);
  if (capUsd === null) return { allowed: true, capUsd: null };
  const charge = estimateCallChargeUsd(spec);
  if (!Number.isFinite(charge) || charge < 0) {
    return { allowed: false, capUsd, reason: 'check_failed' };
  }
  try {
    const { data, error } = await supa.rpc('try_charge_ai_spend', {
      p_user: userId, p_day: utcDay(), p_amount: charge, p_cap: capUsd,
    });
    if (error) return { allowed: false, capUsd, reason: 'check_failed' };
    if (data === null || data === undefined) return { allowed: false, capUsd, reason: 'cap_reached' };
    const after = Number(data);
    if (!Number.isFinite(after)) return { allowed: false, capUsd, reason: 'check_failed' };
    return { allowed: true, spentUsd: after, capUsd };
  } catch {
    return { allowed: false, capUsd, reason: 'check_failed' };
  }
}

/**
 * Reporting/reconciliation ONLY (not the gate): sum today's ai_events
 * with FULL pagination — .range() pages of 1,000 until a short page —
 * so no row cap can silently truncate the total. Throws on telemetry
 * error; callers that need fail-closed behavior use the ledger gate.
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
