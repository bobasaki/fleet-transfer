// Server-mirrored validation logic — used by unit tests and for UX pre-checks.
// The Edge Function re-validates authoritatively; these match its rules exactly.

import { PETROL_CARD, VISA_CARD, ENC_DEVICE, PAYOUT_METHOD, DNEVNICA, CONFIDENCE_THRESHOLD } from "./constants";

export const TRAVEL_DOC_CATEGORIES = new Set([
  "avionska_karta", "autobusna_karta", "blablacar", "smjestaj",
]);

export const RECEIPT_CATEGORIES = new Set([
  "cestarina", "gorivo", "ostalo",
  "avionska_karta", "autobusna_karta", "blablacar", "smjestaj",
]);

// Bounds mirrored from the Edge Function (supabase/functions/submit_transfer)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_AMOUNT_EUR = 100000;
export const MAX_ODOMETER_KM = 10000000;
export const MAX_FX_RATE = 10000;

// Strict YYYY-MM-DD check: format AND a real calendar date (rejects 2026-13-45).
export function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidAmount(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n < MAX_AMOUNT_EUR;
}

export function isValidOdometer(n: unknown): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < MAX_ODOMETER_KM;
}

const PETROL_CARD_SET = new Set(PETROL_CARD);
const VISA_CARD_SET = new Set(VISA_CARD);
const ENC_DEVICE_SET = new Set(ENC_DEVICE);
const PAYOUT_METHOD_SET = new Set(PAYOUT_METHOD);
const DNEVNICA_SET = new Set(Object.keys(DNEVNICA));

export interface ReceiptRow {
  slot_id: string;
  photo_path: string;
  category: string;
  native_amount: number;
  native_currency: string;
  eur_amount: number;
  fx_rate: number | null;
  fx_rate_date: string | null;
  receipt_date: string | null;
  vendor: string | null;
  raw_text: string | null;
  model: string;
  confidence: Record<string, number> | null;
  confirmed: boolean;
  travel_details: Record<string, unknown> | null;
}

export interface SubmitPayload {
  transfer_id: string;
  transfer_date: string;
  plate_hr: string;
  plate_rotation: string | null;
  vehicle_model: string | null;
  odometer_km_start: number;
  odometer_km: number;
  route_from: string;
  route_to: string;
  petrol_card: string;
  visa_card: string;
  enc_device: string;
  payout_method: string;
  dnevnica_location: string;
  started_at: string | null;
  receipts: ReceiptRow[];
  transfer_photos: { type: string; photo_path: string; extraction: unknown }[];
}

export function validateSubmitPayload(p: Partial<SubmitPayload>): string[] {
  const errors: string[] = [];

  if (!p.transfer_id) errors.push("transfer_id je obavezan");
  if (!p.transfer_date) errors.push("Datum transfera je obavezan");
  else if (!isValidDateStr(p.transfer_date))
    errors.push("Datum transfera nije valjan");
  if (!p.plate_hr?.trim()) errors.push("Registracija HR je obavezna");
  if (typeof p.odometer_km_start !== "number" || isNaN(p.odometer_km_start))
    errors.push("Početno stanje brojila je obavezno");
  else if (!isValidOdometer(p.odometer_km_start))
    errors.push("Početno stanje brojila nije valjano");
  if (typeof p.odometer_km !== "number" || isNaN(p.odometer_km))
    errors.push("Završno stanje brojila je obavezno");
  else if (!isValidOdometer(p.odometer_km))
    errors.push("Završno stanje brojila nije valjano");
  if (
    typeof p.odometer_km === "number" &&
    typeof p.odometer_km_start === "number" &&
    p.odometer_km < p.odometer_km_start
  )
    errors.push("Završno stanje brojila mora biti ≥ početnom");
  if (!p.dnevnica_location)
    errors.push("Destinacija dnevnice je obavezna");
  else if (!DNEVNICA_SET.has(p.dnevnica_location))
    errors.push(`Destinacija '${p.dnevnica_location}' nije valjana`);
  if (!p.payout_method)
    errors.push("Način isplate je obavezan");
  else if (!PAYOUT_METHOD_SET.has(p.payout_method))
    errors.push(`Način isplate '${p.payout_method}' nije valjan`);
  if (!p.petrol_card)
    errors.push("Petrol kartica je obavezna");
  else if (!PETROL_CARD_SET.has(p.petrol_card))
    errors.push(`Petrol kartica '${p.petrol_card}' nije valjana`);
  if (!p.visa_card)
    errors.push("Visa kartica je obavezna");
  else if (!VISA_CARD_SET.has(p.visa_card))
    errors.push(`Visa kartica '${p.visa_card}' nije valjana`);
  if (!p.enc_device)
    errors.push("ENC uređaj je obavezan");
  else if (!ENC_DEVICE_SET.has(p.enc_device))
    errors.push(`ENC uređaj '${p.enc_device}' nije valjan`);

  const receipts = p.receipts ?? [];

  // Petrol card coupling
  const hasGorivo = receipts.some((r) => r.category === "gorivo");
  if (hasGorivo && p.petrol_card === "Nisam koristio/la")
    errors.push("Imaš račune za gorivo — odaberi broj petrol kartice");

  // Receipt-level checks
  for (const r of receipts) {
    if (!RECEIPT_CATEGORIES.has(r.category))
      errors.push(`Kategorija računa '${r.category}' nije valjana`);
    if (!isValidAmount(r.native_amount))
      errors.push(`Račun '${r.category}': iznos nije valjan`);
    if (!isValidAmount(r.eur_amount))
      errors.push(`Račun '${r.category}': EUR iznos nije valjan`);
    if (r.fx_rate !== null && r.fx_rate !== undefined &&
        (typeof r.fx_rate !== "number" || !Number.isFinite(r.fx_rate) ||
         r.fx_rate <= 0 || r.fx_rate >= MAX_FX_RATE))
      errors.push(`Račun '${r.category}': tečaj nije valjan`);
    if (r.receipt_date !== null && r.receipt_date !== undefined && !isValidDateStr(r.receipt_date))
      errors.push(`Račun '${r.category}': datum računa nije valjan`);
    if (r.fx_rate_date !== null && r.fx_rate_date !== undefined && !isValidDateStr(r.fx_rate_date))
      errors.push(`Račun '${r.category}': datum tečaja nije valjan`);
    if (!r.confirmed && confIsLow(r.confidence))
      errors.push(`Račun '${r.category}' ima nisku pouzdanost i nije potvrđen`);
  }

  return errors;
}

// Soft warnings — rendered as amber, non-blocking hints. These must NEVER
// block submit; they flag plausible-but-suspicious combinations for review.
export function softWarnings(p: Partial<SubmitPayload>): string[] {
  const warnings: string[] = [];
  const receipts = p.receipts ?? [];

  // Converse of the petrol hard block (DATA_CONTRACT §4): a numbered petrol
  // card selected but no fuel receipts attached.
  const hasGorivo = receipts.some((r) => r.category === "gorivo");
  if (p.petrol_card && p.petrol_card !== "Nisam koristio/la" && !hasGorivo)
    warnings.push("Odabrana je petrol kartica, ali nema računa za gorivo — provjeri.");

  // Intentionally NO visa rule: DATA_CONTRACT §4 notes Visa-vs-other payment
  // is not reliably extractable, and v1 has no per-receipt "paid by Visa"
  // marker, so the visa ↔ receipt coupling cannot be checked client-side.

  return warnings;
}

export function confIsLow(conf: Record<string, number> | null | undefined): boolean {
  if (!conf || typeof conf !== "object") return false;
  return Object.values(conf).some(
    (v) => typeof v === "number" && v < CONFIDENCE_THRESHOLD,
  );
}

export function deriveDnevnicaAmount(location: string): number | null {
  if (!(location in DNEVNICA)) return null;
  return DNEVNICA[location] ?? null;
}
