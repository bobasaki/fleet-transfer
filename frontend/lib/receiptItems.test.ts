import { describe, it, expect } from "vitest";
import { getSlotItems, slotNeedsConfirm, type ReceiptSlot } from "./receiptItems";

function baseSlot(patch: Partial<ReceiptSlot> = {}): ReceiptSlot {
  return {
    id: "slot-1",
    file: null,
    loading: false,
    result: null,
    categoryOverride: null,
    receiptDateOverride: null,
    vendorOverride: null,
    confirmed: false,
    itemCategoryOverrides: null,
    itemAmountOverrides: null,
    ...patch,
  };
}

const HUF_RESULT = {
  native_currency: "HUF",
  receipt_date: "2026-06-05",
  vendor: "MOL",
  raw_text: null,
  model: "gpt-5.4-mini-2026-03-17",
  confidence: { native_currency: 0.99, receipt_date: 0.95 },
  items: [
    {
      category: "gorivo",
      native_amount: 10000,
      native_currency: "HUF",
      eur_amount: 25.4,
      fx_rate: 0.00254,
      fx_rate_date: "2026-06-05",
      confidence: { category: 0.97, native_amount: 0.99 },
    },
  ],
};

const EUR_RESULT = {
  native_currency: "EUR",
  receipt_date: "2026-06-05",
  vendor: "INA",
  raw_text: null,
  model: "gpt-5.4-mini-2026-03-17",
  confidence: { native_currency: 0.99, receipt_date: 0.95 },
  items: [
    {
      category: "gorivo",
      native_amount: 68.4,
      native_currency: "EUR",
      eur_amount: 68.4,
      fx_rate: null,
      fx_rate_date: null,
      confidence: { category: 0.97, native_amount: 0.99 },
    },
  ],
};

// Old flat format (pre-items drafts)
const FLAT_RESULT = {
  category: "cestarina",
  native_amount: 12.5,
  native_currency: "EUR",
  eur_amount: 12.5,
  fx_rate: null,
  fx_rate_date: null,
  receipt_date: "2026-06-01",
  vendor: "HAC",
  confidence: { category: 0.9, native_amount: 0.92 },
};

describe("getSlotItems — no overrides", () => {
  it("returns extracted amounts unchanged", () => {
    const items = getSlotItems(baseSlot({ result: HUF_RESULT }));
    expect(items).toHaveLength(1);
    expect(items[0].nativeAmount).toBe(10000);
    expect(items[0].eurAmount).toBe(25.4);
    expect(items[0].nativeCurrency).toBe("HUF");
  });

  it("returns empty array for error results", () => {
    const items = getSlotItems(baseSlot({ result: { error: "extraction_failed" } }));
    expect(items).toEqual([]);
  });
});

describe("getSlotItems — amount overrides", () => {
  it("native override with fx rate recomputes EUR", () => {
    const items = getSlotItems(baseSlot({
      result: HUF_RESULT,
      itemAmountOverrides: [{ native: "20000", eur: null }],
    }));
    expect(items[0].nativeAmount).toBe(20000);
    expect(items[0].eurAmount).toBe(50.8); // 20000 * 0.00254
  });

  it("explicit EUR override wins over fx recompute", () => {
    const items = getSlotItems(baseSlot({
      result: HUF_RESULT,
      itemAmountOverrides: [{ native: "20000", eur: "51.00" }],
    }));
    expect(items[0].nativeAmount).toBe(20000);
    expect(items[0].eurAmount).toBe(51);
  });

  it("native override on EUR receipt mirrors to eurAmount", () => {
    const items = getSlotItems(baseSlot({
      result: EUR_RESULT,
      itemAmountOverrides: [{ native: "70.10", eur: null }],
    }));
    expect(items[0].nativeAmount).toBe(70.1);
    expect(items[0].eurAmount).toBe(70.1);
  });

  it("invalid override string falls back to extracted values", () => {
    const items = getSlotItems(baseSlot({
      result: HUF_RESULT,
      itemAmountOverrides: [{ native: "12.", eur: "abc" }],
    }));
    // "12." parses to 12 via parseFloat — partial typing should still apply
    expect(items[0].nativeAmount).toBe(12);
    // "abc" is invalid → recompute from native override and fx
    expect(items[0].eurAmount).toBe(Math.round(12 * 0.00254 * 100) / 100);
  });

  it("empty/garbage native override falls back entirely to extracted", () => {
    const items = getSlotItems(baseSlot({
      result: HUF_RESULT,
      itemAmountOverrides: [{ native: "x", eur: "" }],
    }));
    expect(items[0].nativeAmount).toBe(10000);
    expect(items[0].eurAmount).toBe(25.4);
  });

  it("accepts comma as decimal separator", () => {
    const items = getSlotItems(baseSlot({
      result: EUR_RESULT,
      itemAmountOverrides: [{ native: "70,5", eur: null }],
    }));
    expect(items[0].nativeAmount).toBe(70.5);
    expect(items[0].eurAmount).toBe(70.5);
  });
});

describe("getSlotItems — legacy flat format", () => {
  it("normalizes flat results into one item", () => {
    const items = getSlotItems(baseSlot({ result: FLAT_RESULT }));
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe("cestarina");
    expect(items[0].eurAmount).toBe(12.5);
  });

  it("applies amount overrides to flat results", () => {
    const items = getSlotItems(baseSlot({
      result: FLAT_RESULT,
      itemAmountOverrides: [{ native: "15.00", eur: null }],
    }));
    expect(items[0].nativeAmount).toBe(15);
    expect(items[0].eurAmount).toBe(15); // EUR currency mirrors
  });

  it("applies category override to flat results", () => {
    const items = getSlotItems(baseSlot({
      result: FLAT_RESULT,
      categoryOverride: "ostalo",
    }));
    expect(items[0].category).toBe("ostalo");
  });
});

describe("slotNeedsConfirm", () => {
  it("false when all confidences above threshold", () => {
    expect(slotNeedsConfirm(baseSlot({ result: HUF_RESULT }))).toBe(false);
  });

  it("true when an item confidence is low", () => {
    const low = {
      ...HUF_RESULT,
      items: [{ ...HUF_RESULT.items[0], confidence: { category: 0.5, native_amount: 0.99 } }],
    };
    expect(slotNeedsConfirm(baseSlot({ result: low }))).toBe(true);
  });

  it("true for manual-entry synthetic results (zero confidence)", () => {
    const manual = {
      items: [{
        category: "ostalo",
        native_amount: 0,
        native_currency: "EUR",
        eur_amount: 0,
        fx_rate: null,
        fx_rate_date: null,
        confidence: { category: 0, native_amount: 0 },
      }],
      native_currency: "EUR",
      receipt_date: null,
      vendor: null,
      raw_text: null,
      model: "manual",
      confidence: { native_currency: 0, receipt_date: 0 },
    };
    expect(slotNeedsConfirm(baseSlot({ result: manual }))).toBe(true);
  });

  it("false for error results", () => {
    expect(slotNeedsConfirm(baseSlot({ result: { error: "extraction_failed" } }))).toBe(false);
  });

  // Missing FX rate (e.g. RSD, or Frankfurter down): the extractor injects
  // fx_rate: 0 into the item confidence so the slot is mandatory-review even
  // when everything else was read with high confidence.
  it("true when the extractor flags a missing FX rate (confidence.fx_rate = 0)", () => {
    const rsd = {
      ...HUF_RESULT,
      native_currency: "RSD",
      items: [{
        ...HUF_RESULT.items[0],
        native_currency: "RSD",
        native_amount: 5000,
        eur_amount: 5000, // fallback copy of native — wrong money, must be reviewed
        fx_rate: null,
        fx_rate_date: null,
        confidence: { category: 0.97, native_amount: 0.99, fx_rate: 0 },
      }],
    };
    expect(slotNeedsConfirm(baseSlot({ result: rsd }))).toBe(true);
  });
});
