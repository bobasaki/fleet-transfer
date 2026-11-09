import { describe, it, expect } from "vitest";
import {
  validateSubmitPayload,
  softWarnings,
  deriveDnevnicaAmount,
  confIsLow,
  isValidDateStr,
  isValidAmount,
  isValidOdometer,
  MAX_AMOUNT_EUR,
  MAX_ODOMETER_KM,
  type SubmitPayload,
} from "./submitValidation";
import { CONFIDENCE_THRESHOLD } from "./constants";

function basePayload(overrides: Partial<SubmitPayload> = {}): Partial<SubmitPayload> {
  return {
    transfer_id: "aaaaaaaa-0000-4000-8000-000000000001",
    transfer_date: "2026-06-10",
    plate_hr: "ZG 123 AB",
    plate_rotation: null,
    vehicle_model: "Opel Crossland",
    odometer_km_start: 100000,
    odometer_km: 100300,
    route_from: "Zagreb",
    route_to: "Split",
    petrol_card: "Nisam koristio/la",
    visa_card: "Demo Vozač",
    enc_device: "ZG 1 – 10000000001",
    payout_method: "Gotovina",
    dnevnica_location: "SPLIT",
    started_at: null,
    receipts: [],
    transfer_photos: [],
    ...overrides,
  };
}

function confirmedReceipt(category: string, eurAmount = 10): SubmitPayload["receipts"][number] {
  return {
    slot_id: crypto.randomUUID(),
    photo_path: "uuid/receipt_1.jpg",
    category,
    native_amount: eurAmount,
    native_currency: "EUR",
    eur_amount: eurAmount,
    fx_rate: null,
    fx_rate_date: null,
    receipt_date: "2026-06-10",
    vendor: "Test",
    raw_text: null,
    model: "gpt-5.4-mini-2026-03-17",
    confidence: { category: 0.99, native_amount: 0.99 },
    confirmed: true,
    travel_details: null,
  };
}

describe("validateSubmitPayload", () => {
  it("passes a valid payload with no receipts", () => {
    expect(validateSubmitPayload(basePayload())).toHaveLength(0);
  });

  it("requires transfer_id", () => {
    const errs = validateSubmitPayload(basePayload({ transfer_id: "" }));
    expect(errs.some((e) => e.includes("transfer_id"))).toBe(true);
  });

  it("requires transfer_date", () => {
    const errs = validateSubmitPayload(basePayload({ transfer_date: "" }));
    expect(errs.some((e) => e.toLowerCase().includes("datum"))).toBe(true);
  });

  it("requires plate_hr", () => {
    const errs = validateSubmitPayload(basePayload({ plate_hr: "  " }));
    expect(errs.some((e) => e.toLowerCase().includes("registracija"))).toBe(true);
  });

  it("rejects invalid payout_method", () => {
    const errs = validateSubmitPayload(basePayload({ payout_method: "Bitcoin" }));
    expect(errs.some((e) => e.includes("Način isplate"))).toBe(true);
  });

  it("rejects invalid petrol_card value", () => {
    const errs = validateSubmitPayload(basePayload({ petrol_card: "999" }));
    expect(errs.some((e) => e.includes("Petrol kartica"))).toBe(true);
  });

  it("rejects invalid visa_card value", () => {
    const errs = validateSubmitPayload(basePayload({ visa_card: "Unknown Person" }));
    expect(errs.some((e) => e.includes("Visa kartica"))).toBe(true);
  });

  it("rejects invalid enc_device", () => {
    const errs = validateSubmitPayload(basePayload({ enc_device: "ZG 99 – 00000" }));
    expect(errs.some((e) => e.includes("ENC uređaj"))).toBe(true);
  });

  it("rejects invalid dnevnica_location", () => {
    const errs = validateSubmitPayload(basePayload({ dnevnica_location: "OUTER SPACE" }));
    expect(errs.some((e) => e.includes("Destinacija"))).toBe(true);
  });

  it("requires odometer end >= start", () => {
    const errs = validateSubmitPayload(
      basePayload({ odometer_km_start: 200000, odometer_km: 100000 }),
    );
    expect(errs.some((e) => e.includes("≥"))).toBe(true);
  });

  it("passes when odometer end equals start", () => {
    const errs = validateSubmitPayload(
      basePayload({ odometer_km_start: 100000, odometer_km: 100000 }),
    );
    expect(errs).toHaveLength(0);
  });

  describe("date and bounds validation", () => {
    it("rejects malformed transfer_date", () => {
      const errs = validateSubmitPayload(basePayload({ transfer_date: "2026-13-45" }));
      expect(errs.some((e) => e.includes("Datum transfera nije valjan"))).toBe(true);
    });

    it("rejects out-of-range odometer values", () => {
      const errs = validateSubmitPayload(
        basePayload({ odometer_km_start: -1, odometer_km: MAX_ODOMETER_KM }),
      );
      expect(errs.some((e) => e.includes("Početno stanje brojila nije valjano"))).toBe(true);
      expect(errs.some((e) => e.includes("Završno stanje brojila nije valjano"))).toBe(true);
    });

    it("rejects non-integer odometer values", () => {
      const errs = validateSubmitPayload(basePayload({ odometer_km: 100300.5 }));
      expect(errs.some((e) => e.includes("Završno stanje brojila nije valjano"))).toBe(true);
    });

    it("rejects receipt with malformed receipt_date", () => {
      const receipt = { ...confirmedReceipt("cestarina", 5), receipt_date: "2026-13-45" };
      const errs = validateSubmitPayload(basePayload({ receipts: [receipt] }));
      expect(errs.some((e) => e.includes("datum računa nije valjan"))).toBe(true);
    });

    it("rejects receipt with out-of-bounds amounts", () => {
      const receipt = {
        ...confirmedReceipt("cestarina", 5),
        native_amount: MAX_AMOUNT_EUR,
        eur_amount: -1,
      };
      const errs = validateSubmitPayload(basePayload({ receipts: [receipt] }));
      expect(errs.some((e) => e.includes("iznos nije valjan"))).toBe(true);
      expect(errs.some((e) => e.includes("EUR iznos nije valjan"))).toBe(true);
    });

    it("rejects receipt with non-positive fx_rate", () => {
      const receipt = { ...confirmedReceipt("cestarina", 5), fx_rate: 0 };
      const errs = validateSubmitPayload(basePayload({ receipts: [receipt] }));
      expect(errs.some((e) => e.includes("tečaj nije valjan"))).toBe(true);
    });

    it("accepts receipt with null fx_rate and null dates", () => {
      const receipt = {
        ...confirmedReceipt("cestarina", 5),
        fx_rate: null,
        fx_rate_date: null,
        receipt_date: null,
      };
      expect(validateSubmitPayload(basePayload({ receipts: [receipt] }))).toHaveLength(0);
    });
  });

  describe("petrol card coupling", () => {
    it("blocks 'Nisam koristio/la' when gorivo receipt present", () => {
      const receipts = [confirmedReceipt("gorivo", 50)];
      const errs = validateSubmitPayload(
        basePayload({ receipts, petrol_card: "Nisam koristio/la" }),
      );
      expect(errs.some((e) => e.includes("petrol kartice"))).toBe(true);
    });

    it("passes petrol card 1-25 with gorivo receipt", () => {
      const receipts = [confirmedReceipt("gorivo", 50)];
      const errs = validateSubmitPayload(
        basePayload({ receipts, petrol_card: "3" }),
      );
      expect(errs).toHaveLength(0);
    });

    it("allows 'Nisam koristio/la' with zero gorivo receipts", () => {
      const receipts = [confirmedReceipt("cestarina", 5)];
      const errs = validateSubmitPayload(
        basePayload({ receipts, petrol_card: "Nisam koristio/la" }),
      );
      expect(errs).toHaveLength(0);
    });
  });

  describe("low-confidence confirmation", () => {
    it("blocks unconfirmed receipt with low-conf field", () => {
      const receipt = {
        ...confirmedReceipt("gorivo", 50),
        confirmed: false,
        confidence: { category: 0.99, native_amount: 0.60 },
      };
      const errs = validateSubmitPayload(
        basePayload({ receipts: [receipt], petrol_card: "1" }),
      );
      expect(errs.some((e) => e.includes("nisku pouzdanost"))).toBe(true);
    });

    it("passes confirmed receipt with low-conf field", () => {
      const receipt = {
        ...confirmedReceipt("gorivo", 50),
        confirmed: true,
        confidence: { category: 0.99, native_amount: 0.60 },
      };
      const errs = validateSubmitPayload(
        basePayload({ receipts: [receipt], petrol_card: "1" }),
      );
      expect(errs).toHaveLength(0);
    });

    it("passes unconfirmed receipt with all high-conf fields", () => {
      const receipt = {
        ...confirmedReceipt("gorivo", 50),
        confirmed: false,
        confidence: { category: 0.95, native_amount: 0.96 },
      };
      const errs = validateSubmitPayload(
        basePayload({ receipts: [receipt], petrol_card: "1" }),
      );
      expect(errs).toHaveLength(0);
    });
  });
});

describe("softWarnings", () => {
  it("warns when a numbered petrol card has zero gorivo receipts", () => {
    const warnings = softWarnings(basePayload({ petrol_card: "7", receipts: [] }));
    expect(warnings).toEqual([
      "Odabrana je petrol kartica, ali nema računa za gorivo — provjeri.",
    ]);
  });

  it("warns when receipts exist but none are gorivo", () => {
    const warnings = softWarnings(
      basePayload({ petrol_card: "7", receipts: [confirmedReceipt("cestarina", 5)] }),
    );
    expect(warnings).toHaveLength(1);
  });

  it("does not warn when a gorivo receipt is present", () => {
    const warnings = softWarnings(
      basePayload({ petrol_card: "7", receipts: [confirmedReceipt("gorivo", 50)] }),
    );
    expect(warnings).toHaveLength(0);
  });

  it("does not warn for 'Nisam koristio/la' with zero gorivo receipts", () => {
    const warnings = softWarnings(
      basePayload({ petrol_card: "Nisam koristio/la", receipts: [] }),
    );
    expect(warnings).toHaveLength(0);
  });

  it("does not warn while petrol_card is still unselected", () => {
    const warnings = softWarnings(basePayload({ petrol_card: "", receipts: [] }));
    expect(warnings).toHaveLength(0);
  });

  it("never overlaps with blocking errors (warning payload still submits)", () => {
    const payload = basePayload({ petrol_card: "7", receipts: [] });
    expect(softWarnings(payload)).toHaveLength(1);
    expect(validateSubmitPayload(payload)).toHaveLength(0);
  });
});

describe("deriveDnevnicaAmount", () => {
  it("returns correct amount for a known location", () => {
    expect(deriveDnevnicaAmount("SPLIT")).toBe(55);
    expect(deriveDnevnicaAmount("LONDON")).toBe(220);
    expect(deriveDnevnicaAmount("OSLO")).toBe(240);
  });

  it("returns 0 for operational zero-€ entries", () => {
    expect(deriveDnevnicaAmount("PREUZIMANJA / POVRATI")).toBe(0);
    expect(deriveDnevnicaAmount("RAD NA KUĆICAMA")).toBe(0);
  });

  it("returns null for unknown location", () => {
    expect(deriveDnevnicaAmount("NARNIA")).toBeNull();
    expect(deriveDnevnicaAmount("")).toBeNull();
  });
});

describe("isValidDateStr", () => {
  it("accepts real YYYY-MM-DD dates", () => {
    expect(isValidDateStr("2026-06-11")).toBe(true);
    expect(isValidDateStr("2024-02-29")).toBe(true); // leap day
  });

  it("rejects impossible calendar dates", () => {
    expect(isValidDateStr("2026-13-45")).toBe(false);
    expect(isValidDateStr("2026-02-30")).toBe(false);
    expect(isValidDateStr("2025-02-29")).toBe(false); // not a leap year
  });

  it("rejects wrong formats", () => {
    expect(isValidDateStr("11.06.2026")).toBe(false);
    expect(isValidDateStr("2026-6-1")).toBe(false);
    expect(isValidDateStr("")).toBe(false);
  });
});

describe("isValidAmount / isValidOdometer", () => {
  it("enforces amount bounds [0, MAX_AMOUNT_EUR)", () => {
    expect(isValidAmount(0)).toBe(true);
    expect(isValidAmount(99999.99)).toBe(true);
    expect(isValidAmount(MAX_AMOUNT_EUR)).toBe(false);
    expect(isValidAmount(-0.01)).toBe(false);
    expect(isValidAmount(NaN)).toBe(false);
    expect(isValidAmount(Infinity)).toBe(false);
  });

  it("enforces odometer integer bounds [0, MAX_ODOMETER_KM)", () => {
    expect(isValidOdometer(0)).toBe(true);
    expect(isValidOdometer(MAX_ODOMETER_KM - 1)).toBe(true);
    expect(isValidOdometer(MAX_ODOMETER_KM)).toBe(false);
    expect(isValidOdometer(-1)).toBe(false);
    expect(isValidOdometer(123.5)).toBe(false);
  });
});

describe("confIsLow", () => {
  it("returns true when any value is below threshold", () => {
    expect(confIsLow({ category: 0.99, native_amount: CONFIDENCE_THRESHOLD - 0.01 })).toBe(true);
  });

  it("returns false when all values are at or above threshold", () => {
    expect(confIsLow({ category: CONFIDENCE_THRESHOLD, native_amount: 0.99 })).toBe(false);
  });

  it("returns false for null or empty conf", () => {
    expect(confIsLow(null)).toBe(false);
    expect(confIsLow({})).toBe(false);
  });
});
