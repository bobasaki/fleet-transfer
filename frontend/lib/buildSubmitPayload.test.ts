import { describe, it, expect } from "vitest";
import {
  buildSubmitPayload, validReceiptSlots, validTravelDocSlots,
  type SubmitSnapshot,
} from "./buildSubmitPayload";
import type { ReceiptSlot } from "./receiptItems";
import type { TravelDocSlot } from "../app/components/TravelDocCard";
import type { PhotoState } from "./api";

// Pins the wire format: exact DATA_CONTRACT.md field names, photo-path
// numbering, override precedence, and the NaN-for-missing-km rule.

const TID = "0f3f2a4e-9c1d-4e8b-a7f5-2d6c8b9a1e30";

const jpg = () => new File(["x"], "photo.jpg", { type: "image/jpeg" });
const pdf = () => new File(["x"], "doc.pdf", { type: "application/pdf" });

const photo = (result: Record<string, unknown> | null): PhotoState => ({
  file: result ? jpg() : null,
  loading: false,
  result,
});

function receiptSlot(patch: Partial<ReceiptSlot> = {}): ReceiptSlot {
  return {
    id: "r-1",
    file: jpg(),
    loading: false,
    result: {
      native_currency: "EUR",
      receipt_date: "2026-06-05",
      vendor: "INA",
      raw_text: "RACUN BR. 123",
      model: "gpt-5.4-mini-2026-03-17",
      confidence: { native_currency: 0.99, receipt_date: 0.91 },
      items: [
        {
          category: "cestarina",
          native_amount: 68.4,
          native_currency: "EUR",
          eur_amount: 68.4,
          fx_rate: null,
          fx_rate_date: "2026-06-05",
          confidence: { category: 0.97, native_amount: 0.99 },
        },
      ],
    },
    categoryOverride: null,
    receiptDateOverride: null,
    vendorOverride: null,
    confirmed: false,
    itemCategoryOverrides: null,
    itemAmountOverrides: null,
    ...patch,
  };
}

function travelDocSlot(patch: Partial<TravelDocSlot> = {}): TravelDocSlot {
  return {
    id: "t-1",
    docType: "avionska_karta",
    file: jpg(),
    loading: false,
    result: {
      native_amount: 120,
      native_currency: "EUR",
      eur_amount: 120,
      fx_rate: null,
      fx_rate_date: null,
      receipt_date: "2026-06-04",
      vendor: "Croatia Airlines",
      travel_details: { route_from: "Zagreb", route_to: "Split" },
      raw_text: null,
      model: "gpt-5.4-mini-2026-03-17",
      confidence: { native_amount: 0.95, receipt_date: 0.9 },
    },
    eurAmountOverride: null,
    travelDateOverride: null,
    vendorOverride: null,
    confirmed: false,
    transportFrom: "Zagreb",
    transportTo: "Split",
    ...patch,
  };
}

function snapshot(patch: Partial<SubmitSnapshot> = {}): SubmitSnapshot {
  return {
    transferDate: "2026-06-12",
    plateHrValue: "ZG 1234 AB",
    vehicleModelHrValue: " Opel Corsa ",
    showRot: false,
    plateRotValue: "",
    kmStartValue: "128450",
    kmValue: "128460",
    routeFrom: "LJUBLJANA",
    routeTo: "Zagreb",
    petrolCard: "Nisam koristio/la",
    visaCard: "Demo Vozač",
    encDevice: "ZG 1 – 10000000001",
    payoutMethod: "Gotovina",
    dnevnicaLocation: "LJUBLJANA",
    startedAt: "2026-06-12T07:00:00.000Z",
    odometerStartTakenAt: "2026-06-12T07:15:00.000Z",
    odometerTakenAt: "2026-06-12T11:45:00.000Z",
    vehicleHr: photo({ plate_raw: "ZG 1234 AB", confidence: 0.97 }),
    vehicleRot: photo(null),
    odometerStart: photo({ odometer_km: 128450, confidence: 0.95 }),
    odometer: photo({ odometer_km: 128460, confidence: 0.95 }),
    receipts: [receiptSlot()],
    travelDocs: [],
    ...patch,
  };
}

describe("valid-slot filters", () => {
  it("drop slots without a file, without a result, or with an error result", () => {
    const ok = receiptSlot();
    const noFile = receiptSlot({ id: "r-2", file: null });
    const noResult = receiptSlot({ id: "r-3", result: null });
    const errored = receiptSlot({
      id: "r-4",
      result: { error: "extraction_failed", detail: "x", model: "client_error" },
    });
    expect(validReceiptSlots([ok, noFile, noResult, errored])).toEqual([ok]);

    const okDoc = travelDocSlot();
    const erroredDoc = travelDocSlot({
      id: "t-2",
      result: { error: "extraction_failed", detail: "x", model: "client_error" },
    });
    expect(validTravelDocSlots([okDoc, erroredDoc])).toEqual([okDoc]);
  });
});

describe("buildSubmitPayload", () => {
  it("emits exactly the DATA_CONTRACT top-level keys", () => {
    const p = buildSubmitPayload(TID, snapshot());
    expect(Object.keys(p).sort()).toEqual([
      "driver_id",
      "dnevnica_location",
      "enc_device",
      "odometer_km",
      "odometer_km_start",
      "odometer_start_taken_at",
      "odometer_taken_at",
      "payout_method",
      "petrol_card",
      "plate_hr",
      "plate_rotation",
      "receipts",
      "route_from",
      "route_to",
      "started_at",
      "transfer_date",
      "transfer_id",
      "transfer_photos",
      "vehicle_model",
      "visa_card",
    ].sort());
    expect(p.transfer_id).toBe(TID);
    expect(p.driver_id).toBe("Demo Vozač");
    expect(p.transfer_date).toBe("2026-06-12");
    expect(p.odometer_km_start).toBe(128450);
    expect(p.odometer_km).toBe(128460);
  });

  it("builds one receipt row per extracted item with the slot photo path", () => {
    const multi = receiptSlot({
      id: "r-multi",
      result: {
        native_currency: "EUR",
        receipt_date: "2026-06-06",
        vendor: "HAC",
        raw_text: null,
        model: "gpt-5.4-mini-2026-03-17",
        confidence: { native_currency: 0.99, receipt_date: 0.95 },
        items: [
          { category: "cestarina", native_amount: 10, native_currency: "EUR", eur_amount: 10, fx_rate: null, fx_rate_date: null, confidence: { category: 0.99, native_amount: 0.99 } },
          { category: "ostalo", native_amount: 5, native_currency: "EUR", eur_amount: 5, fx_rate: null, fx_rate_date: null, confidence: { category: 0.6, native_amount: 0.99 } },
        ],
      },
    });
    const p = buildSubmitPayload(TID, snapshot({ receipts: [receiptSlot(), multi] }));

    expect(p.receipts).toHaveLength(3);
    // Slot numbering is 1-based and per-slot, not per-item.
    expect(p.receipts[0].photo_path).toBe(`${TID}/receipt_1.jpg`);
    expect(p.receipts[1].photo_path).toBe(`${TID}/receipt_2.jpg`);
    expect(p.receipts[2].photo_path).toBe(`${TID}/receipt_2.jpg`);
    expect(p.receipts[1].slot_id).toBe("r-multi");
    expect(p.receipts[2].category).toBe("ostalo");
    // Row shape: exact DATA_CONTRACT receipt keys.
    expect(Object.keys(p.receipts[0]).sort()).toEqual([
      "category", "confidence", "confirmed", "eur_amount", "fx_rate",
      "fx_rate_date", "model", "native_amount", "native_currency",
      "photo_path", "raw_text", "receipt_date", "slot_id", "travel_details",
      "vendor",
    ]);
  });

  it("prefers driver overrides for receipt date and vendor", () => {
    const slot = receiptSlot({
      receiptDateOverride: "2026-06-07",
      vendorOverride: "Petrol d.o.o.",
      confirmed: true,
    });
    const p = buildSubmitPayload(TID, snapshot({ receipts: [slot] }));
    expect(p.receipts[0].receipt_date).toBe("2026-06-07");
    expect(p.receipts[0].vendor).toBe("Petrol d.o.o.");
    expect(p.receipts[0].confirmed).toBe(true);
  });

  it("appends travel docs as receipt rows with docType category and per-type numbering", () => {
    const docs = [
      travelDocSlot({ id: "t-1" }),
      travelDocSlot({ id: "t-2" }),
      travelDocSlot({ id: "t-3", docType: "smjestaj", file: pdf() }),
    ];
    const p = buildSubmitPayload(TID, snapshot({ travelDocs: docs }));
    const travelRows = p.receipts.slice(1);

    expect(travelRows[0].photo_path).toBe(`${TID}/travel_avionska_karta_1.jpg`);
    expect(travelRows[1].photo_path).toBe(`${TID}/travel_avionska_karta_2.jpg`);
    // PDF uploads keep the pdf extension.
    expect(travelRows[2].photo_path).toBe(`${TID}/travel_smjestaj_1.pdf`);
    expect(travelRows[0].category).toBe("avionska_karta");
    expect(travelRows[2].category).toBe("smjestaj");
    expect(travelRows[0].travel_details).toEqual({ route_from: "Zagreb", route_to: "Split" });
  });

  it("uses the driver-edited EUR amount for travel docs", () => {
    const doc = travelDocSlot({ eurAmountOverride: "99.5" });
    const p = buildSubmitPayload(TID, snapshot({ travelDocs: [doc] }));
    const row = p.receipts[1];
    expect(row.eur_amount).toBe(99.5);
    expect(row.native_amount).toBe(120); // extracted native stays
  });

  it("turns empty or non-positive km inputs into NaN (validation reports them as missing)", () => {
    const p = buildSubmitPayload(TID, snapshot({ kmStartValue: "", kmValue: "0" }));
    expect(Number.isNaN(p.odometer_km_start)).toBe(true);
    expect(Number.isNaN(p.odometer_km)).toBe(true);
  });

  it("nulls plate_rotation unless rotacijsko is shown AND has a plate", () => {
    expect(buildSubmitPayload(TID, snapshot()).plate_rotation).toBeNull();
    expect(
      buildSubmitPayload(TID, snapshot({ showRot: true, plateRotValue: "" })).plate_rotation,
    ).toBeNull();
    expect(
      buildSubmitPayload(TID, snapshot({ showRot: true, plateRotValue: "ST 999 ZZ" })).plate_rotation,
    ).toBe("ST 999 ZZ");
  });

  it("trims vehicle_model and route fields; empty model becomes null", () => {
    const p = buildSubmitPayload(TID, snapshot());
    expect(p.vehicle_model).toBe("Opel Corsa");
    expect(buildSubmitPayload(TID, snapshot({ vehicleModelHrValue: "  " })).vehicle_model).toBeNull();
    expect(p.route_from).toBe("LJUBLJANA");
    expect(p.route_to).toBe("Zagreb");
  });

  it("lists transfer_photos with vehicle_rotation only when present", () => {
    const base = buildSubmitPayload(TID, snapshot());
    expect(base.transfer_photos.map((t) => t.type)).toEqual([
      "vehicle_hr", "odometer_start", "odometer",
    ]);
    expect(base.transfer_photos[0].photo_path).toBe(`${TID}/vehicle_hr.jpg`);

    const withRot = buildSubmitPayload(TID, snapshot({
      showRot: true,
      vehicleRot: photo({ plate_raw: "ST 999 ZZ", confidence: 0.9 }),
    }));
    expect(withRot.transfer_photos.map((t) => t.type)).toEqual([
      "vehicle_hr", "vehicle_rotation", "odometer_start", "odometer",
    ]);
  });
});
