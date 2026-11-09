// Provider seam — swap the implementation here to change AI backend.
// All extraction functions import callVision / callText from this module only.

import { type AiUsageContext, type OpenAiUsage, recordAiUsage } from "./aiUsage.ts";

export const OPENAI_MODEL = "gpt-5.4-mini-2026-03-17";
export const MODEL_CAPABLE = OPENAI_MODEL;
export const MODEL_FAST = OPENAI_MODEL;

// Pin the snapshot so extraction behavior cannot drift behind the model alias.
// GPT-5.4 mini rejects custom temperature values and uses
// `max_completion_tokens`. Low reasoning preserves latency and output budget.
export const REASONING_EFFORT = "low";

// Transient OpenAI failures worth retrying. Anything else (400 bad image,
// 401 authentication failure, etc.) fails immediately.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
export const RETRY_DELAYS_MS = [1000, 2500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Chunk-based encoding avoids call-stack overflow on large phone images.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * POST a Chat Completions request body, retrying transient failures (retryable
 * HTTP statuses and network errors) with backoff before rethrowing the last
 * error. `delays` is injectable so tests don't sit through real backoff.
 *
 * `onUsage` (optional) receives the response's `usage` object on success — the
 * seam through which callVision/callText feed token telemetry without changing
 * this function's string return contract.
 */
export async function postChatCompletionsWithRetry(
  body: string,
  apiKey: string,
  delays: number[] = RETRY_DELAYS_MS,
  onUsage?: (usage: OpenAiUsage | undefined) => void,
): Promise<string> {
  let lastError = new Error("OpenAI request failed");

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1]);

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });
    } catch (err) {
      lastError = new Error(`OpenAI fetch failed: ${err}`);
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      lastError = new Error(`OpenAI ${response.status}: ${text}`);
      if (!RETRYABLE_STATUSES.has(response.status)) throw lastError;
      continue;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI response did not contain message content");
    }
    onUsage?.(data.usage as OpenAiUsage | undefined);
    return content;
  }

  throw lastError;
}

function requireApiKey(): string {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY secret not set");
  return apiKey;
}

/**
 * Send an image to the vision model and return the raw text response.
 * The caller is responsible for parsing and validating the JSON it expects.
 * Pass `ctx` to record token usage in ai_usage (best-effort; never blocks).
 */
export async function callVision(
  imageBytes: Uint8Array,
  prompt: string,
  mimeType = "image/jpeg",
  maxTokens = 1024,
  model = MODEL_FAST,
  ctx?: AiUsageContext,
): Promise<string> {
  const body = JSON.stringify({
    model,
    response_format: { type: "json_object" },
    max_completion_tokens: maxTokens,
    reasoning_effort: REASONING_EFFORT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${toBase64(imageBytes)}`,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  let usage: OpenAiUsage | undefined;
  const startedAt = Date.now();
  const content = await postChatCompletionsWithRetry(
    body,
    requireApiKey(),
    RETRY_DELAYS_MS,
    (u) => (usage = u),
  );
  if (ctx) {
    recordAiUsage({ ...ctx, model, usage, durationMs: Date.now() - startedAt, ok: true });
  }
  return content;
}

/**
 * Send plain text to the model and return the raw text response.
 * Used for PDF documents where text has already been extracted.
 * The caller is responsible for parsing and validating the JSON it expects.
 * Pass `ctx` to record token usage in ai_usage (best-effort; never blocks).
 */
export async function callText(
  textContent: string,
  prompt: string,
  maxTokens = 1200,
  model = MODEL_FAST,
  ctx?: AiUsageContext,
): Promise<string> {
  const body = JSON.stringify({
    model,
    response_format: { type: "json_object" },
    max_completion_tokens: maxTokens,
    reasoning_effort: REASONING_EFFORT,
    messages: [
      {
        role: "user",
        content: prompt + "\n\nDOCUMENT TEXT:\n" + textContent,
      },
    ],
  });

  let usage: OpenAiUsage | undefined;
  const startedAt = Date.now();
  const content = await postChatCompletionsWithRetry(
    body,
    requireApiKey(),
    RETRY_DELAYS_MS,
    (u) => (usage = u),
  );
  if (ctx) {
    recordAiUsage({ ...ctx, model, usage, durationMs: Date.now() - startedAt, ok: true });
  }
  return content;
}
