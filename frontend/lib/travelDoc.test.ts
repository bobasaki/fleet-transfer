import { describe, it, expect } from "vitest";
import {
  travelDocNeedsConfirm,
  travelDocEurAmount,
  type TravelDocSlot,
} from "../app/components/TravelDocCard";

function baseSlot(patch: Partial<TravelDocSlot> = {}): TravelDocSlot {
  return {
    id: "doc-1",
    docType: "avionska_karta",
    file: null,
    loading: false,
    result: null,
    eurAmountOverride: null,
    travelDateOverride: null,
    vendorOverride: null,
    confirmed: false,
    transportFrom: "",
    transportTo: "",
    ...patch,
  };
}

const OK_RESULT = {
  doc_type: "avionska_karta",
  native_amount: 89.99,
  native_currency: "EUR",
  eur_amount: 89.99,
  fx_rate: null,
  fx_rate_date: null,
  receipt_date: "2026-06-10",
  vendor: "Ryanair",
  travel_details: null,
  raw_text: null,
  model: "gpt-5.4-mini-2026-03-17",
  confidence: { native_amount: 0.98, receipt_date: 0.96 },
};

describe("travelDocNeedsConfirm", () => {
  it("false when all confidences above threshold", () => {
    expect(travelDocNeedsConfirm(baseSlot({ result: OK_RESULT }))).toBe(false);
  });

  it("true when a confidence value is low", () => {
    const low = { ...OK_RESULT, confidence: { native_amount: 0.7, receipt_date: 0.96 } };
    expect(travelDocNeedsConfirm(baseSlot({ result: low }))).toBe(true);
  });

  // Missing FX rate (e.g. RSD ticket): the extractor injects fx_rate: 0 into
  // the top-level confidence so the doc is mandatory-review.
  it("true when the extractor flags a missing FX rate (confidence.fx_rate = 0)", () => {
    const rsd = {
      ...OK_RESULT,
      native_currency: "RSD",
      eur_amount: 10500, // fallback copy of native — wrong money
      confidence: { native_amount: 0.98, receipt_date: 0.96, fx_rate: 0 },
    };
    expect(travelDocNeedsConfirm(baseSlot({ result: rsd }))).toBe(true);
  });

  it("true for manual-entry synthetic results (zero confidence)", () => {
    const manual = {
      ...OK_RESULT,
      native_amount: 0,
      eur_amount: 0,
      model: "manual",
      confidence: { native_amount: 0, receipt_date: 0 },
    };
    expect(travelDocNeedsConfirm(baseSlot({ result: manual }))).toBe(true);
  });

  it("false for error results", () => {
    expect(travelDocNeedsConfirm(baseSlot({ result: { error: "extraction_failed" } }))).toBe(false);
  });
});

describe("travelDocEurAmount", () => {
  it("returns the extracted eur_amount without an override", () => {
    expect(travelDocEurAmount(baseSlot({ result: OK_RESULT }))).toBe(89.99);
  });

  it("a valid override wins over the extracted amount", () => {
    expect(travelDocEurAmount(baseSlot({ result: OK_RESULT, eurAmountOverride: "95.50" })))
      .toBe(95.5);
  });

  it("an unparsable override yields 0", () => {
    expect(travelDocEurAmount(baseSlot({ result: OK_RESULT, eurAmountOverride: "abc" })))
      .toBe(0);
  });

  it("returns 0 for error results and empty slots", () => {
    expect(travelDocEurAmount(baseSlot({ result: { error: "extraction_failed" } }))).toBe(0);
    expect(travelDocEurAmount(baseSlot())).toBe(0);
  });
});
