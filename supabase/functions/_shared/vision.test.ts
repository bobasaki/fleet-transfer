// Run locally: deno test supabase/functions/_shared/
// Tests the retry/backoff wrapper in isolation by stubbing globalThis.fetch.
// Delays are injected as 1 ms so tests don't sit through real backoff.

import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import {
  MODEL_CAPABLE,
  MODEL_FAST,
  OPENAI_MODEL,
  postChatCompletionsWithRetry,
} from "./vision.ts";

const TEST_DELAYS = [1, 1];

Deno.test("all extraction routes use the pinned OpenAI model", () => {
  assertEquals(MODEL_FAST, OPENAI_MODEL);
  assertEquals(MODEL_CAPABLE, OPENAI_MODEL);
});

function okResponse(text: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: text } }] }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function withFetchStub<T>(
  responses: (() => Response | Promise<never>)[],
  fn: (calls: () => number) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    const next = responses[Math.min(calls, responses.length - 1)];
    calls++;
    const result = next();
    return result instanceof Response ? Promise.resolve(result) : result;
  };
  try {
    return await fn(() => calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("posts to OpenAI Chat Completions with bearer authentication", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return Promise.resolve(okResponse("ok"));
  };

  try {
    const body = JSON.stringify({ model: OPENAI_MODEL });
    assertEquals(
      await postChatCompletionsWithRetry(body, "test-key", []),
      "ok",
    );
    assertEquals(requestUrl, "https://api.openai.com/v1/chat/completions");
    assertEquals(requestInit?.method, "POST");
    assertEquals(
      new Headers(requestInit?.headers).get("Authorization"),
      "Bearer test-key",
    );
    assertEquals(requestInit?.body, body);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("retries 503 (unavailable) and succeeds on a later attempt", async () => {
  await withFetchStub(
    [
      () => new Response("unavailable", { status: 503 }),
      () => new Response("unavailable", { status: 503 }),
      () => okResponse("recovered"),
    ],
    async (calls) => {
      const text = await postChatCompletionsWithRetry(
        "{}",
        "test-key",
        TEST_DELAYS,
      );
      assertEquals(text, "recovered");
      assertEquals(calls(), 3);
    },
  );
});

Deno.test("retries 429 and 500", async () => {
  await withFetchStub(
    [
      () => new Response("rate limited", { status: 429 }),
      () => new Response("server error", { status: 500 }),
      () => okResponse("ok"),
    ],
    async (calls) => {
      assertEquals(
        await postChatCompletionsWithRetry("{}", "test-key", TEST_DELAYS),
        "ok",
      );
      assertEquals(calls(), 3);
    },
  );
});

Deno.test("does NOT retry a non-transient 400", async () => {
  await withFetchStub(
    [() => new Response("bad image", { status: 400 })],
    async (calls) => {
      const err = await assertRejects(
        () => postChatCompletionsWithRetry("{}", "test-key", TEST_DELAYS),
        Error,
      );
      assertStringIncludes(err.message, "OpenAI 400");
      assertEquals(calls(), 1);
    },
  );
});

Deno.test("retries a network throw and succeeds", async () => {
  await withFetchStub(
    [
      () => Promise.reject(new Error("connection reset")),
      () => okResponse("ok"),
    ],
    async (calls) => {
      assertEquals(
        await postChatCompletionsWithRetry("{}", "test-key", TEST_DELAYS),
        "ok",
      );
      assertEquals(calls(), 2);
    },
  );
});

Deno.test("rethrows the last error after exhausting retries", async () => {
  await withFetchStub(
    [() => new Response("still unavailable", { status: 503 })],
    async (calls) => {
      const err = await assertRejects(
        () => postChatCompletionsWithRetry("{}", "test-key", TEST_DELAYS),
        Error,
      );
      assertStringIncludes(err.message, "OpenAI 503");
      assertEquals(calls(), TEST_DELAYS.length + 1);
    },
  );
});
