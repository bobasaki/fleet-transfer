// Run locally: deno test supabase/functions/_shared/
// No network needed: the peg branch is static, and the ECB-path tests either
// skip the call (missing date) or stub globalThis.fetch.

import { assertEquals } from "jsr:@std/assert@1";
import { fetchFxRate } from "./fx.ts";

const BAM_PEG = 1 / 1.95583; // ≈ 0.511292 EUR per 1 BAM

Deno.test("BAM resolves via the static peg with a date", async () => {
  const fx = await fetchFxRate("BAM", "2026-06-01");
  assertEquals(fx?.fx_rate, BAM_PEG);
  assertEquals(fx?.fx_rate_date, "2026-06-01");
  assertEquals(fx?.source, "peg");
});

Deno.test("BAM peg works without a receipt date", async () => {
  const fx = await fetchFxRate("BAM", null);
  assertEquals(fx?.fx_rate, BAM_PEG);
  assertEquals(fx?.fx_rate_date, null);
  assertEquals(fx?.source, "peg");
});

Deno.test("BAM peg math: 50 BAM books as 25.56 EUR", async () => {
  const fx = await fetchFxRate("BAM", "2026-06-01");
  const eur = Math.round(50 * fx!.fx_rate * 100) / 100;
  assertEquals(eur, 25.56);
});

Deno.test("non-pegged currency without a date returns null (no network)", async () => {
  assertEquals(await fetchFxRate("RSD", null), null);
});

Deno.test("non-pegged currency returns null when the rate service fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("offline"));
  try {
    assertEquals(await fetchFxRate("RSD", "2026-06-01"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("currency unsupported by the ECB feed returns null", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(new Response("not found", { status: 404 }));
  try {
    assertEquals(await fetchFxRate("RSD", "2026-06-01"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ECB path parses a successful Frankfurter response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ date: "2026-05-29", rates: { EUR: 0.0026 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  try {
    const fx = await fetchFxRate("HUF", "2026-06-01");
    assertEquals(fx?.fx_rate, 0.0026);
    assertEquals(fx?.fx_rate_date, "2026-05-29");
    assertEquals(fx?.source, "ecb");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
