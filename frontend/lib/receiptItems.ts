import { CONFIDENCE_THRESHOLD } from "./constants";

// Per-item amount overrides, raw strings so partial typing ("12.") doesn't
// break controlled inputs. null entry = no override for that item.
export type AmountOverride = { native: string | null; eur: string | null };

export type ReceiptSlot = {
  id: string;
  file: File | null;
  loading: boolean;
  result: Record<string, unknown> | null;
  // Single-item overrides (used when result is old flat format or items.length == 1)
  categoryOverride: string | null;
  receiptDateOverride: string | null;
  vendorOverride: string | null;
  confirmed: boolean;
  // Per-item category overrides for multi-item receipts (indexed by item position)
  itemCategoryOverrides: (string | null)[] | null;
  // Per-item amount overrides, indexed by item position (works for single- and multi-item)
  itemAmountOverrides: (AmountOverride | null)[] | null;
};

export type ExtractedItem = {
  category: string;
  eurAmount: number;
  nativeAmount: number;
  nativeCurrency: string;
  fxRate: number | null;
  fxRateDate: string | null;
  confidence: Record<string, number> | null;
};

// Parses a driver-typed amount; accepts comma decimals, rejects negatives.
export function parseAmount(s: string | null | undefined): number | null {
  if (s == null || s.trim() === "") return null;
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : null;
}

// Override precedence: explicit EUR edit > recompute from native edit via fx
// > mirror native edit when currency is EUR > extracted value.
function applyAmountOverride(
  base: Pick<ExtractedItem, "nativeAmount" | "eurAmount" | "nativeCurrency" | "fxRate">,
  ov: AmountOverride | null | undefined,
): { nativeAmount: number; eurAmount: number } {
  const nativeOv = parseAmount(ov?.native);
  const eurOv = parseAmount(ov?.eur);
  const nativeAmount = nativeOv ?? base.nativeAmount;
  let eurAmount = base.eurAmount;
  if (eurOv !== null) {
    eurAmount = eurOv;
  } else if (nativeOv !== null && typeof base.fxRate === "number") {
    eurAmount = Math.round(nativeOv * base.fxRate * 100) / 100;
  } else if (nativeOv !== null && base.nativeCurrency === "EUR") {
    eurAmount = nativeOv;
  }
  return { nativeAmount, eurAmount };
}

// Normalize a slot result into a canonical items array.
// Handles both the new {items:[]} format and old flat {category,eur_amount} format
// so that existing drafts still work after the Edge Function upgrade.
export function getSlotItems(slot: ReceiptSlot): ExtractedItem[] {
  const res = slot.result;
  if (!res || res.error) return [];

  // New format: result has items array
  if (Array.isArray(res.items)) {
    return (res.items as Record<string, unknown>[]).map((item, i) => {
      const base = {
        nativeAmount: typeof item.native_amount === "number" ? item.native_amount : 0,
        eurAmount: typeof item.eur_amount === "number" ? item.eur_amount : 0,
        nativeCurrency: (res.native_currency as string) ?? "EUR",
        fxRate: typeof item.fx_rate === "number" ? item.fx_rate : null,
      };
      return {
        category:
          slot.itemCategoryOverrides?.[i] ??
          (item.category as string) ??
          "ostalo",
        ...base,
        ...applyAmountOverride(base, slot.itemAmountOverrides?.[i]),
        fxRateDate: typeof item.fx_rate_date === "string" ? item.fx_rate_date : null,
        confidence: (item.confidence ?? null) as Record<string, number> | null,
      };
    });
  }

  // Old format: flat result (backward compat with existing drafts)
  if (res.category) {
    const base = {
      nativeAmount: typeof res.native_amount === "number" ? res.native_amount : 0,
      eurAmount: typeof res.eur_amount === "number" ? res.eur_amount : 0,
      nativeCurrency: (res.native_currency as string) ?? "EUR",
      fxRate: typeof res.fx_rate === "number" ? res.fx_rate : null,
    };
    return [{
      category: slot.categoryOverride ?? (res.category as string) ?? "ostalo",
      ...base,
      ...applyAmountOverride(base, slot.itemAmountOverrides?.[0]),
      fxRateDate: typeof res.fx_rate_date === "string" ? res.fx_rate_date : null,
      confidence: (res.confidence ?? null) as Record<string, number> | null,
    }];
  }

  return [];
}

export function slotNeedsConfirm(slot: ReceiptSlot): boolean {
  if (!slot.result || slot.result.error) return false;

  // New format: check per-item confidence + top-level (date, currency)
  if (Array.isArray(slot.result.items)) {
    const topConf = (slot.result.confidence ?? {}) as Record<string, number>;
    if (Object.values(topConf).some((v) => typeof v === "number" && v < CONFIDENCE_THRESHOLD)) {
      return true;
    }
    for (const item of slot.result.items as Record<string, unknown>[]) {
      const c = (item.confidence ?? {}) as Record<string, number>;
      if (Object.values(c).some((v) => typeof v === "number" && v < CONFIDENCE_THRESHOLD)) {
        return true;
      }
    }
    return false;
  }

  // Old format
  const c = slot.result.confidence;
  if (!c || typeof c !== "object") return false;
  return Object.values(c as Record<string, number>).some(
    (v) => typeof v === "number" && v < CONFIDENCE_THRESHOLD,
  );
}
