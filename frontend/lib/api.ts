// Edge Function call plumbing shared by the transfer page
// (plan11 phase 2 step 2 — moved verbatim out of app/transfer/page.tsx).

import { CONFIDENCE_THRESHOLD } from "./constants";

export type ApiResult = Record<string, unknown>;

// Per-slot extraction call state (photo + in-flight flag + last result).
export type PhotoState = {
  file: File | null;
  loading: boolean;
  result: ApiResult | null;
};

export function fnUrl(name: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
}

export function authHdr(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` };
}

export function unsupportedFormatResult(): ApiResult {
  return {
    error: "unsupported_format",
    detail: "Format fotografije nije podržan — odaberi JPEG/PNG.",
    model: "client",
  };
}

export function hasLowConf(result: ApiResult): boolean {
  if (typeof result.confidence === "number") return result.confidence < CONFIDENCE_THRESHOLD;
  if (result.confidence && typeof result.confidence === "object") {
    return Object.values(result.confidence as Record<string, number>).some(
      (v) => typeof v === "number" && v < CONFIDENCE_THRESHOLD,
    );
  }
  return false;
}
