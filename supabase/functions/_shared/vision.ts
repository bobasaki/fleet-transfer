// Provider seam — swap the implementation here to change AI backend.
// All extraction functions import callVision / callText from this module only.

import Anthropic from "npm:@anthropic-ai/sdk@1.6.0";
import { type AiTokenUsage, type AiUsageContext, recordAiUsage } from "./aiUsage.ts";

// Receipts and travel documents: fine print, several items per document.
export const MODEL_CAPABLE = "claude-sonnet-5-5";
// Plates and odometers: short, single-value reads.
export const MODEL_FAST = "claude-haiku-5-5";

// Extraction is short structured output, so keep thinking shallow for latency.
export const EFFORT = "low";

// Thinking shares the max_tokens budget with the JSON answer. Callers still pass
// the small output budgets from the OpenAI era; raise them to this floor so a
// long think never truncates the JSON. Billing is per token used, not this cap.
export const MIN_MAX_TOKENS = 16000;

// Server-side refusal fallback: if the model declines (safety classifier), the
// API re-runs the request on a fallback model inside the same call. Claude
// Haiku 5.5 has no server-side fallback, so only Sonnet requests opt in.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const FALLBACK_MODELS = new Set<string>([MODEL_CAPABLE]);

// The SDK retries 408/409/429/5xx and connection errors with backoff.
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 60_000;

const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
type ImageMediaType = Anthropic.Beta.BetaBase64ImageSource["media_type"];

// Chunk-based encoding avoids call-stack overflow on large phone images.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Build the Messages API request. Pure, so tests can check its shape. */
export function buildRequest(
  model: string,
  content: Anthropic.Beta.BetaContentBlockParam[] | string,
  maxTokens: number,
): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: Math.max(maxTokens, MIN_MAX_TOKENS),
    output_config: { effort: EFFORT },
    messages: [{ role: "user", content }],
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = [FALLBACK_BETA];
    params.fallbacks = "default";
  }
  return params;
}

/**
 * Return the response's text. Thinking blocks are skipped. Throws when the model
 * refused, ran out of tokens, or produced no text, so callers never parse a
 * partial answer.
 */
export function responseText(message: Anthropic.Beta.BetaMessage): string {
  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category ?? "unspecified";
    throw new Error(`Model declined the request (refusal: ${category})`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Model response hit max_tokens before finishing");
  }
  const text = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) throw new Error("Model response did not contain text");
  return text;
}

/**
 * Map Claude usage onto the ai_usage columns. input_tokens excludes cached
 * tokens, so add cache reads and writes back in: prompt_tokens keeps meaning
 * "all input tokens", with cached_tokens as the cheaper subset.
 */
export function toTokenUsage(usage: Anthropic.Beta.BetaUsage): AiTokenUsage {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return {
    inputTokens: usage.input_tokens + cacheRead + cacheWrite,
    outputTokens: usage.output_tokens,
    cachedTokens: cacheRead,
  };
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY secret not set");
  client = new Anthropic({ apiKey, maxRetries: MAX_RETRIES, timeout: REQUEST_TIMEOUT_MS });
  return client;
}

async function run(
  params: Anthropic.Beta.MessageCreateParamsNonStreaming,
  ctx?: AiUsageContext,
): Promise<string> {
  const startedAt = Date.now();
  const message = await getClient().beta.messages.create(params);
  if (ctx) {
    recordAiUsage({
      ...ctx,
      // The served model: differs from params.model when a fallback answered.
      model: message.model,
      usage: toTokenUsage(message.usage),
      durationMs: Date.now() - startedAt,
      ok: true,
    });
  }
  return responseText(message);
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
  const mediaType = mimeType.toLowerCase();
  if (!IMAGE_MEDIA_TYPES.has(mediaType)) {
    throw new Error(
      `Unsupported image type '${mimeType}'. Claude accepts JPEG, PNG, GIF and WebP.`,
    );
  }
  const params = buildRequest(model, [
    {
      type: "image",
      source: { type: "base64", media_type: mediaType as ImageMediaType, data: toBase64(imageBytes) },
    },
    { type: "text", text: prompt },
  ], maxTokens);
  return await run(params, ctx);
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
  const params = buildRequest(model, prompt + "\n\nDOCUMENT TEXT:\n" + textContent, maxTokens);
  return await run(params, ctx);
}
