import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateImageFile, validateDocumentFile } from "../_shared/uploadGuard.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const TRAVEL_DOC_CATEGORIES = new Set([
  "avionska_karta", "autobusna_karta", "blablacar", "smjestaj",
]);

const VALID_RECEIPT_CATEGORIES = new Set([
  "cestarina", "gorivo", "ostalo",
  "avionska_karta", "autobusna_karta", "blablacar", "smjestaj",
]);

const VALID_PETROL_CARDS = new Set([
  "Nisam koristio/la",
  ...Array.from({ length: 25 }, (_, i) => String(i + 1)),
]);

const VALID_VISA_CARDS = new Set([
  "Nisam koristio/la",
  "Ana Anić", "Marko Marić", "Petra Perić",
  "Luka Lukić", "Ivana Ivić", "Demo Vozač",
]);

const VALID_ENC_DEVICES = new Set([
  "Nisam koristio/la",
  "ZG 1 – 10000000001", "ZG 2 – 10000000002", "ZG 3 – 10000000003",
  "ST 1 – 10000000004", "RI 1 – 10000000005",
]);

const VALID_PAYOUT_METHODS = new Set(["Gotovina", "Studentski", "Faktura"]);

const DNEVNICA_LOCATIONS = new Set([
  "AARHUS","AMSTERDAM","BANJA LUKA","BARCELONA","BARI","BASEL","BEČ","BEOGRAD",
  "BERGAMO","BERLIN","BERN","BILBAO","BOLOGNA","BORDEAUX","BRATISLAVA","BREMEN",
  "BRISEL","BUDIMPEŠTA","CATANIA","CHERBOURG","COMO","DIJON","DORTMUND","DRESDEN",
  "DUBROVNIK","DUSELDORF","EINDHOVEN","ESSEN","FAENZA","FIRENCA","FRANKFURT",
  "FRIEDRICHSHAFEN","GDANJSK","GENEVA","GENOA","GRAZ","HAMBURG","HANNOVER",
  "INNSBRUCK","KLAGENFURT","KOELN","KOPENHAGEN","KRAKOV","KOŠICE","KRISTIANSTADT",
  "LA SPEZIA","LEIPZIG","LILLE","LINZ","LONDON","LUGANO","LYON","LJUBLJANA",
  "MARSEILLE","MILANO","MUNCHEN","NAPULJ","NICE","NURNBERG","OSIJEK","OSLO",
  "OSTRAVA","PALERMO","PARIZ","PISA","PODGORICA","POZNAN","PRAG","PULA","RAVENA",
  "RHEDE","RIJEKA","RIM","ROTTERDAM","SALZBURG","SARAJEVO","SENJ","SISAK",
  "SL. BROD","SPLIT","STUTTGART","TIVAT","TORINO","TOULOUSE","TREVISO","TRST",
  "TUZLA","UDINE","VARŠAVA","VENECIJA","VERONA","ZADAR","ZURICH",
  "PREUZIMANJA / POVRATI","RAD NA KUĆICAMA",
]);

const CONFIDENCE_THRESHOLD = 0.85;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_AMOUNT_EUR = 100000;
const MAX_ODOMETER_KM = 10000000;
const MAX_FX_RATE = 10000;

// Strict YYYY-MM-DD check: format AND a real calendar date (rejects 2026-13-45).
function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function isValidAmount(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n < MAX_AMOUNT_EUR;
}

function isValidOdometer(n: unknown): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < MAX_ODOMETER_KM;
}

interface PayloadReceipt {
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

interface TransferPayload {
  transfer_id: string;
  driver_id?: string;
  transfer_date: string;
  plate_hr: string;
  plate_rotation?: string | null;
  vehicle_model?: string | null;
  odometer_km_start: number;
  odometer_km: number;
  route_from?: string;
  route_to?: string;
  petrol_card: string;
  visa_card: string;
  enc_device: string;
  payout_method: string;
  dnevnica_location: string;
  started_at?: string | null;
  odometer_start_taken_at?: string | null;
  odometer_taken_at?: string | null;
  receipts: PayloadReceipt[];
  transfer_photos: { type: string; photo_path: string; extraction: unknown }[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function validationError(detail: string): Response {
  return json({ error: "validation_error", detail }, 422);
}

function validatePayload(p: TransferPayload): string | null {
  if (!p.transfer_id) return "transfer_id is required";
  if (!UUID_RE.test(p.transfer_id)) return "transfer_id must be a valid UUID";
  if (!p.transfer_date) return "transfer_date is required";
  if (!isValidDateStr(p.transfer_date))
    return "transfer_date must be a valid YYYY-MM-DD date";
  if (!p.plate_hr || !p.plate_hr.trim()) return "plate_hr is required";
  if (typeof p.odometer_km_start !== "number" || isNaN(p.odometer_km_start))
    return "odometer_km_start is required";
  if (!isValidOdometer(p.odometer_km_start))
    return `odometer_km_start must be an integer between 0 and ${MAX_ODOMETER_KM - 1}`;
  if (typeof p.odometer_km !== "number" || isNaN(p.odometer_km))
    return "odometer_km is required";
  if (!isValidOdometer(p.odometer_km))
    return `odometer_km must be an integer between 0 and ${MAX_ODOMETER_KM - 1}`;
  if (p.odometer_km < p.odometer_km_start)
    return "odometer_km must be >= odometer_km_start";
  if (!p.dnevnica_location) return "dnevnica_location is required";
  if (!DNEVNICA_LOCATIONS.has(p.dnevnica_location))
    return `dnevnica_location '${p.dnevnica_location}' is not valid`;
  if (!p.payout_method) return "payout_method is required";
  if (!VALID_PAYOUT_METHODS.has(p.payout_method))
    return `payout_method '${p.payout_method}' is not valid`;
  if (!p.petrol_card) return "petrol_card is required";
  if (!VALID_PETROL_CARDS.has(p.petrol_card))
    return `petrol_card '${p.petrol_card}' is not valid`;
  if (!p.visa_card) return "visa_card is required";
  if (!VALID_VISA_CARDS.has(p.visa_card))
    return `visa_card '${p.visa_card}' is not valid`;
  if (!p.enc_device) return "enc_device is required";
  if (!VALID_ENC_DEVICES.has(p.enc_device))
    return `enc_device '${p.enc_device}' is not valid`;

  // Petrol card coupling
  const hasGorivo = p.receipts.some((r) => r.category === "gorivo");
  if (hasGorivo && p.petrol_card === "Nisam koristio/la")
    return "petrol_card must be 1-25 when gorivo receipts are present";

  // Validate receipt categories, amounts, dates + low-conf confirmations
  for (const r of p.receipts) {
    if (!VALID_RECEIPT_CATEGORIES.has(r.category))
      return `receipt category '${r.category}' is not valid`;

    if (!isValidAmount(r.native_amount))
      return `receipt '${r.category}': native_amount must be a number between 0 and ${MAX_AMOUNT_EUR - 1}`;
    if (!isValidAmount(r.eur_amount))
      return `receipt '${r.category}': eur_amount must be a number between 0 and ${MAX_AMOUNT_EUR - 1}`;

    if (r.fx_rate !== null && r.fx_rate !== undefined) {
      if (typeof r.fx_rate !== "number" || !Number.isFinite(r.fx_rate) ||
          r.fx_rate <= 0 || r.fx_rate >= MAX_FX_RATE)
        return `receipt '${r.category}': fx_rate must be a number between 0 (exclusive) and ${MAX_FX_RATE}`;
    }

    if (r.receipt_date !== null && r.receipt_date !== undefined && !isValidDateStr(r.receipt_date))
      return `receipt '${r.category}': receipt_date must be a valid YYYY-MM-DD date`;
    if (r.fx_rate_date !== null && r.fx_rate_date !== undefined && !isValidDateStr(r.fx_rate_date))
      return `receipt '${r.category}': fx_rate_date must be a valid YYYY-MM-DD date`;

    if (!r.confirmed) {
      const lowConf = confIsLow(r.confidence);
      if (lowConf)
        return `receipt with category '${r.category}' has low confidence and was not confirmed`;
    }
  }

  return null;
}

function confIsLow(conf: Record<string, number> | null | undefined): boolean {
  if (!conf || typeof conf !== "object") return false;
  return Object.values(conf).some(
    (v) => typeof v === "number" && v < CONFIDENCE_THRESHOLD,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "bad_request", detail: "Expected multipart/form-data" }, 400);
  }

  const payloadStr = form.get("payload");
  if (!payloadStr || typeof payloadStr !== "string") {
    return json({ error: "bad_request", detail: "Field 'payload' is required" }, 400);
  }

  let payload: TransferPayload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return json({ error: "bad_request", detail: "Field 'payload' is not valid JSON" }, 400);
  }

  const valError = validatePayload(payload);
  if (valError) return validationError(valError);

  // Collect unique (slot_id → photo_path) for uploads to avoid double-uploading
  // multi-item receipt slots (same file, multiple receipt rows)
  const seenSlots = new Map<string, string>(); // slot_id → photo_path
  for (const r of payload.receipts) {
    if (!seenSlots.has(r.slot_id)) {
      seenSlots.set(r.slot_id, r.photo_path);
    }
  }

  const uploadedPaths: string[] = [];

  async function uploadFile(
    fieldName: string,
    storagePath: string,
    allowPdf: boolean,
  ): Promise<string | null> {
    const file = form.get(fieldName) as File | null;
    if (!file) return `file '${fieldName}' missing from form`;
    const validErr = allowPdf
      ? validateDocumentFile(file)
      : validateImageFile(file);
    if (validErr) return `${fieldName}: ${validErr}`;

    const contentType =
      file.type === "application/pdf" ? "application/pdf" : "image/jpeg";
    const { error } = await supabase.storage
      .from("transfer-photos")
      .upload(storagePath, file, { contentType, upsert: true });
    if (error) return `upload '${storagePath}': ${error.message}`;
    uploadedPaths.push(storagePath);
    return null;
  }

  async function cleanup() {
    if (uploadedPaths.length === 0) return;
    await supabase.storage
      .from("transfer-photos")
      .remove(uploadedPaths)
      .catch(() => {});
  }

  try {
    // Vehicle photos
    const e1 = await uploadFile("vehicle_hr", `${payload.transfer_id}/vehicle_hr.jpg`, false);
    if (e1) return validationError(e1);

    const hasRotation = payload.transfer_photos.some((p) => p.type === "vehicle_rotation");
    if (hasRotation) {
      const e2 = await uploadFile("vehicle_rotation", `${payload.transfer_id}/vehicle_rotation.jpg`, false);
      if (e2) { await cleanup(); return validationError(e2); }
    }

    // Odometer photos
    const e3 = await uploadFile("odometer_start", `${payload.transfer_id}/odometer_start.jpg`, false);
    if (e3) { await cleanup(); return validationError(e3); }

    const e4 = await uploadFile("odometer", `${payload.transfer_id}/odometer.jpg`, false);
    if (e4) { await cleanup(); return validationError(e4); }

    // Receipt and travel doc photos
    for (const [slotId, photoPath] of seenSlots) {
      const isTravelDoc = TRAVEL_DOC_CATEGORIES.has(
        payload.receipts.find((r) => r.slot_id === slotId)!.category,
      );
      const fieldName = isTravelDoc ? `travel_doc_${slotId}` : `receipt_${slotId}`;
      const uploadErr = await uploadFile(fieldName, photoPath, isTravelDoc);
      if (uploadErr) { await cleanup(); return validationError(uploadErr); }
    }

    // Call the atomic DB RPC
    const { data, error } = await supabase.rpc("submit_transfer", { payload });
    if (error) {
      await cleanup();
      console.error("submit_transfer rpc:", error);
      return json({ error: "db_error", detail: error.message }, 500);
    }

    const result = data as {
      transfer_id: string;
      status: string;
      submitted_at: string;
      idempotent: boolean;
    };

    return json({
      transfer_id: result.transfer_id,
      status: result.status,
      submitted_at: result.submitted_at,
    });
  } catch (err) {
    await cleanup();
    console.error("submit_transfer:", err);
    return json({ error: "internal_error", detail: String(err) }, 500);
  }
});
