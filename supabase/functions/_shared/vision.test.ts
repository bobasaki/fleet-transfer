// Run locally: deno test supabase/functions/_shared/
// Network-free: covers the pure request/response helpers around the Claude call.
// Retries and backoff are the Anthropic SDK's job and aren't re-tested here.

import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import type Anthropic from "npm:@anthropic-ai/sdk@1.6.0";
import {
  buildRequest,
  callVision,
  EFFORT,
  FALLBACK_BETA,
  MIN_MAX_TOKENS,
  MODEL_CAPABLE,
  MODEL_FAST,
  responseText,
  toTokenUsage,
} from "./vision.ts";

Deno.test("receipts/travel docs use Sonnet 5.5, plates/odometers use Haiku 5.5", () => {
  assertEquals(MODEL_CAPABLE, "claude-sonnet-5-5");
  assertEquals(MODEL_FAST, "claude-haiku-5-5");
});

Deno.test("Sonnet requests opt into server-side refusal fallback", () => {
  const params = buildRequest(MODEL_CAPABLE, "hi", 2000);
  assertEquals(params.betas, [FALLBACK_BETA]);
  assertEquals(params.fallbacks, "default");
});

Deno.test("Haiku requests carry no fallback (unsupported on Haiku 5.5)", () => {
  const params = buildRequest(MODEL_FAST, "hi", 1024);
  assertEquals(params.betas, undefined);
  assertEquals(params.fallbacks, undefined);
});

Deno.test("requests set low effort, a single user turn, and a max_tokens floor", () => {
  const params = buildRequest(MODEL_FAST, "prompt", 1024);
  assertEquals(params.output_config, { effort: EFFORT });
  assertEquals(params.max_tokens, MIN_MAX_TOKENS);
  assertEquals(params.messages, [{ role: "user", content: "prompt" }]);
  assertEquals(buildRequest(MODEL_FAST, "p", MIN_MAX_TOKENS + 1).max_tokens, MIN_MAX_TOKENS + 1);
  assertEquals("thinking" in params, false);
});

function message(overrides: Partial<Anthropic.Beta.BetaMessage>): Anthropic.Beta.BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODEL_FAST,
    content: [],
    stop_reason: "end_turn",
    stop_details: null,
    stop_sequence: null,
    usage: {} as Anthropic.Beta.BetaUsage,
    ...overrides,
  } as Anthropic.Beta.BetaMessage;
}

Deno.test("responseText joins text blocks and skips thinking blocks", () => {
  const text = responseText(message({
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: '{"odometer_km": ', citations: null },
      { type: "text", text: "128450}", citations: null },
    ] as Anthropic.Beta.BetaContentBlock[],
  }));
  assertEquals(text, '{"odometer_km": 128450}');
});

Deno.test("responseText throws on a refusal, naming the category", () => {
  assertThrows(
    () =>
      responseText(message({
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber", explanation: null },
      } as Partial<Anthropic.Beta.BetaMessage>)),
    Error,
    "refusal: cyber",
  );
});

Deno.test("responseText throws when the answer was cut off at max_tokens", () => {
  assertThrows(
    () =>
      responseText(message({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: '{"odo', citations: null }] as Anthropic.Beta.BetaContentBlock[],
      })),
    Error,
    "max_tokens",
  );
});

Deno.test("responseText throws when there is no text", () => {
  assertThrows(() => responseText(message({ content: [] })), Error, "did not contain text");
});

Deno.test("toTokenUsage counts cache reads and writes as input", () => {
  const usage = toTokenUsage({
    input_tokens: 100,
    output_tokens: 40,
    cache_read_input_tokens: 900,
    cache_creation_input_tokens: 50,
  } as Anthropic.Beta.BetaUsage);
  assertEquals(usage, { inputTokens: 1050, outputTokens: 40, cachedTokens: 900 });
});

Deno.test("toTokenUsage treats missing cache counts as zero", () => {
  const usage = toTokenUsage({
    input_tokens: 1500,
    output_tokens: 60,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
  } as Anthropic.Beta.BetaUsage);
  assertEquals(usage, { inputTokens: 1500, outputTokens: 60, cachedTokens: 0 });
});

Deno.test("callVision rejects HEIC before any API call", async () => {
  await assertRejects(
    () => callVision(new Uint8Array([1, 2, 3]), "prompt", "image/heic"),
    Error,
    "Claude accepts JPEG, PNG, GIF and WebP",
  );
});
