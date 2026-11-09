import { describe, it, expect, vi, afterEach } from "vitest";
import { fnUrl, authHdr, unsupportedFormatResult, hasLowConf } from "./api";
import { CONFIDENCE_THRESHOLD } from "./constants";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fnUrl", () => {
  it("builds the Edge Function URL from NEXT_PUBLIC_SUPABASE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(fnUrl("extract_receipt")).toBe(
      "https://example.supabase.co/functions/v1/extract_receipt",
    );
  });
});

describe("authHdr", () => {
  it("sends the anon key as a Bearer token", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-123");
    expect(authHdr()).toEqual({ Authorization: "Bearer anon-key-123" });
  });
});

describe("unsupportedFormatResult", () => {
  it("matches the DATA_CONTRACT error shape { error, detail, model }", () => {
    expect(unsupportedFormatResult()).toEqual({
      error: "unsupported_format",
      detail: "Format fotografije nije podržan — odaberi JPEG/PNG.",
      model: "client",
    });
  });
});

describe("hasLowConf", () => {
  it("flags a scalar confidence below the threshold", () => {
    expect(hasLowConf({ confidence: 0.5 })).toBe(true);
    expect(hasLowConf({ confidence: 0.99 })).toBe(false);
  });

  it("treats exactly CONFIDENCE_THRESHOLD as NOT low", () => {
    expect(hasLowConf({ confidence: CONFIDENCE_THRESHOLD })).toBe(false);
  });

  it("flags per-field confidence objects when ANY field is low", () => {
    expect(hasLowConf({ confidence: { plate_raw: 0.99, country_guess: 0.4 } })).toBe(true);
    expect(hasLowConf({ confidence: { plate_raw: 0.99, country_guess: 0.95 } })).toBe(false);
  });

  it("ignores non-numeric per-field values", () => {
    expect(hasLowConf({ confidence: { note: "n/a" } })).toBe(false);
  });

  it("returns false when confidence is missing or null", () => {
    expect(hasLowConf({})).toBe(false);
    expect(hasLowConf({ confidence: null })).toBe(false);
  });
});
