// Builds the exact payload onSpremi submits — also fed to the validation
// lib at render time so pre-submit errors mirror the server precisely.
// (plan11 phase 2 step 5 — moved verbatim out of app/transfer/page.tsx.)
// DATA_CONTRACT.md field names are authoritative — no renaming.

import { V1_DRIVER } from "./constants";
import { getSlotItems, type ReceiptSlot } from "./receiptItems";
import { travelDocEurAmount, type TravelDocSlot } from "../app/components/TravelDocCard";
import type { ReceiptRow } from "./submitValidation";
import type { PhotoState } from "./api";

// A slot enters the payload only with a photo and a non-error extraction.
export const validReceiptSlots = (receipts: ReceiptSlot[]) =>
  receipts.filter((r) => r.file && r.result && !r.result.error);

export const validTravelDocSlots = (travelDocs: TravelDocSlot[]) =>
  travelDocs.filter((t) => t.file && t.result && !t.result.error);

export interface SubmitSnapshot {
  transferDate: string;
  plateHrValue: string;
  vehicleModelHrValue: string;
  showRot: boolean;
  plateRotValue: string;
  kmStartValue: string;
  kmValue: string;
  routeFrom: string;
  routeTo: string;
  petrolCard: string;
  visaCard: string;
  encDevice: string;
  payoutMethod: string;
  dnevnicaLocation: string;
  startedAt: string | null;
  odometerStartTakenAt: string | null;
  odometerTakenAt: string | null;
  vehicleHr: PhotoState;
  vehicleRot: PhotoState;
  odometerStart: PhotoState;
  odometer: PhotoState;
  receipts: ReceiptSlot[];
  travelDocs: TravelDocSlot[];
}

export function buildSubmitPayload(tid: string, s: SubmitSnapshot) {
  const {
    transferDate, plateHrValue, vehicleModelHrValue, showRot, plateRotValue,
    kmStartValue, kmValue, routeFrom, routeTo, petrolCard, visaCard, encDevice,
    payoutMethod, dnevnicaLocation, startedAt, odometerStartTakenAt, odometerTakenAt,
    vehicleHr, vehicleRot, odometerStart, odometer, receipts, travelDocs,
  } = s;
  const validReceipts = validReceiptSlots(receipts);
  const validTravelDocs = validTravelDocSlots(travelDocs);

  // One receipt row per extracted item × slot
  const allReceipts: ReceiptRow[] = [];

  let receiptIdx = 0;
  for (const slot of validReceipts) {
    receiptIdx++;
    const photoPath = `${tid}/receipt_${receiptIdx}.jpg`;
    const res = slot.result!;
    for (const item of getSlotItems(slot)) {
      allReceipts.push({
        slot_id: slot.id,
        photo_path: photoPath,
        category: item.category,
        native_amount: item.nativeAmount,
        native_currency: item.nativeCurrency,
        eur_amount: item.eurAmount,
        fx_rate: item.fxRate ?? null,
        fx_rate_date: item.fxRateDate ?? null,
        receipt_date: slot.receiptDateOverride ?? (res.receipt_date as string | null) ?? null,
        vendor: slot.vendorOverride ?? (res.vendor as string | null) ?? null,
        raw_text: (res.raw_text as string | null) ?? null,
        model: (res.model as string | null) ?? "unknown",
        confidence: item.confidence ?? null,
        confirmed: slot.confirmed,
        travel_details: null,
      });
    }
  }

  const typeCounters: Record<string, number> = {};
  for (const slot of validTravelDocs) {
    typeCounters[slot.docType] = (typeCounters[slot.docType] ?? 0) + 1;
    const n = typeCounters[slot.docType];
    const ext = slot.file!.type === "application/pdf" ? "pdf" : "jpg";
    const photoPath = `${tid}/travel_${slot.docType}_${n}.${ext}`;
    const res = slot.result!;
    const eurAmt = travelDocEurAmount(slot);
    const nativeAmt = typeof res.native_amount === "number" ? res.native_amount : eurAmt;
    allReceipts.push({
      slot_id: slot.id,
      photo_path: photoPath,
      category: slot.docType,
      native_amount: nativeAmt,
      native_currency: typeof res.native_currency === "string" ? res.native_currency : "EUR",
      eur_amount: eurAmt,
      fx_rate: typeof res.fx_rate === "number" ? res.fx_rate : null,
      fx_rate_date: typeof res.fx_rate_date === "string" ? res.fx_rate_date : null,
      receipt_date: slot.travelDateOverride ?? (res.receipt_date as string | null) ?? null,
      vendor: slot.vendorOverride ?? (res.vendor as string | null) ?? null,
      raw_text: (res.raw_text as string | null) ?? null,
      model: (res.model as string | null) ?? "unknown",
      confidence: (res.confidence as Record<string, number> | null) ?? null,
      confirmed: slot.confirmed,
      travel_details: (res.travel_details as Record<string, unknown> | null) ?? null,
    });
  }

  // Empty or non-positive km inputs become NaN so the validation lib
  // reports them as missing instead of treating Number("") as a valid 0;
  // canSave blocks submit before a NaN could reach the server.
  const kmNum = (v: string): number => (Number(v) > 0 ? Number(v) : NaN);

  return {
    transfer_id: tid,
    driver_id: V1_DRIVER,
    transfer_date: transferDate,
    plate_hr: plateHrValue,
    plate_rotation: showRot && plateRotValue ? plateRotValue : null,
    vehicle_model: vehicleModelHrValue.trim() || null,
    odometer_km_start: kmNum(kmStartValue),
    odometer_km: kmNum(kmValue),
    route_from: routeFrom.trim(),
    route_to: routeTo.trim(),
    petrol_card: petrolCard,
    visa_card: visaCard,
    enc_device: encDevice,
    payout_method: payoutMethod,
    dnevnica_location: dnevnicaLocation,
    started_at: startedAt ?? null,
    odometer_start_taken_at: odometerStartTakenAt ?? null,
    odometer_taken_at: odometerTakenAt ?? null,
    receipts: allReceipts,
    transfer_photos: [
      { type: "vehicle_hr", photo_path: `${tid}/vehicle_hr.jpg`, extraction: vehicleHr.result },
      ...(showRot && vehicleRot.file
        ? [{ type: "vehicle_rotation", photo_path: `${tid}/vehicle_rotation.jpg`, extraction: vehicleRot.result }]
        : []),
      { type: "odometer_start", photo_path: `${tid}/odometer_start.jpg`, extraction: odometerStart.result },
      { type: "odometer", photo_path: `${tid}/odometer.jpg`, extraction: odometer.result },
    ],
  };
}
