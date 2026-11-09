// AI usage telemetry seam. Records one ai_usage row per model call so the
// roadmap cost section (§5) can be MEASURED, not estimated.
//
// Hard rule: telemetry must NEVER break extraction. Every path here swallows its
// own errors — a logging failure, a missing env, or a dead DB must surface a
// console.error and otherwise be invisible to the caller.
//
// supabase-js is imported DYNAMICALLY (not at module top) so the pure retry-logic
// unit tests in vision.test.ts stay network-free: with no SUPABASE_URL in the
// test runtime we return before the import ever runs.

// Provider-neutral token counts for one model call. vision.ts maps the
// provider's usage object onto this (see toTokenUsage there).
//   inputTokens  — all input tokens, cached ones included
//   outputTokens — generated tokens, thinking included
//   cachedTokens — the subset of inputTokens served from the prompt cache
export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

// Call-site context. functionName is required (it's the cost breakdown key);
// transferId/userId are best-effort and unused in the v1 single-driver pilot.
export interface AiUsageContext {
  functionName: string;
  transferId?: string | null;
  userId?: string | null;
}

export interface AiUsageRow extends AiUsageContext {
  model: string;
  usage: AiTokenUsage | undefined;
  durationMs: number;
  ok: boolean;
}

/**
 * Insert one ai_usage row. Best-effort and self-contained: returns silently when
 * Supabase env is absent (local tests) and never rethrows. Awaitable, but callers
 * should hand this to recordAiUsage() rather than block extraction on it.
 */
export async function logAiUsage(row: AiUsageRow): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // No env → not a real Edge runtime (e.g. `deno test`). Skip silently.
    if (!url || !key) return;

    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2"
    );
    const client = createClient(url, key, { auth: { persistSession: false } });

    const u = row.usage ?? { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    const { error } = await client.from("ai_usage").insert({
      function_name: row.functionName,
      model: row.model,
      prompt_tokens: u.inputTokens,
      completion_tokens: u.outputTokens,
      total_tokens: u.inputTokens + u.outputTokens,
      cached_tokens: u.cachedTokens,
      duration_ms: row.durationMs,
      transfer_id: row.transferId ?? null,
      user_id: row.userId ?? null,
      ok: row.ok,
    });
    if (error) console.error("ai_usage insert failed:", error.message);
  } catch (err) {
    console.error("ai_usage logging error:", err);
  }
}

/**
 * Fire-and-forget the insert without blocking the response. In the Supabase Edge
 * runtime the worker can be frozen once the Response is returned, so we hand the
 * task to EdgeRuntime.waitUntil when present to let it finish; otherwise we just
 * let the promise run (logAiUsage already swallows its own errors).
 */
export function recordAiUsage(row: AiUsageRow): void {
  const task = logAiUsage(row);
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task);
  } else {
    // Defensive: ensure an unhandled rejection can never bubble (it can't, but
    // keep the contract explicit).
    void task.catch(() => {});
  }
}
