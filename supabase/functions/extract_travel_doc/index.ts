import { callVision, callText, MODEL_CAPABLE } from "../_shared/vision.ts";
import { extractPdfText } from "../_shared/extractPdf.ts";
import { validateDocumentFile } from "../_shared/uploadGuard.ts";
import { fetchFxRate } from "../_shared/fx.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

type DocType = "avionska_karta" | "autobusna_karta" | "blablacar" | "smjestaj";
type InputMode = "image" | "text";

function buildPrompt(docType: DocType, mode: InputMode): string {
  const src = mode === "text"
    ? "the TEXT CONTENT extracted from a PDF document"
    : "a screenshot or photo";

  if (docType === "avionska_karta") {
    return `You are reading ${src} of an airline ticket, booking confirmation, or flight receipt. Return ONLY valid JSON — no markdown, no code fences.

{
  "native_amount": <total price as shown in the document, decimal>,
  "native_currency": "<ISO 4217, e.g. EUR GBP HUF BAM>",
  "receipt_date": "<departure date YYYY-MM-DD, not booking date>",
  "vendor": "<airline name, e.g. Ryanair, Wizz Air, Croatia Airlines>",
  "travel_details": {
    "flight_number": "<flight code e.g. FR 1234, or null>",
    "route_from": "<departure city or airport name>",
    "route_to": "<arrival city or airport name>",
    "departure_time": "<HH:MM local or null>"
  },
  "raw_text": "<all visible text>",
  "confidence": {
    "native_amount": <0.0-1.0>,
    "receipt_date": <0.0-1.0>
  }
}

Rules:
- native_amount: TOTAL final amount paid (all fees, taxes, booking fees included).
- receipt_date: DEPARTURE date.
Confidence: 0.95+ = perfectly clear; 0.80–0.94 = mostly readable, minor uncertainty; 0.65–0.79 = partially legible, some reconstruction; below 0.65 = significant guesswork.`;
  }

  if (docType === "autobusna_karta") {
    return `You are reading ${src} of a bus ticket, booking confirmation, or bus receipt (FlixBus, Arriva, Croatia Bus, GetByBus, physical ticket). Return ONLY valid JSON — no markdown, no code fences.

{
  "native_amount": <total price as shown, decimal>,
  "native_currency": "<ISO 4217>",
  "receipt_date": "<travel/departure date YYYY-MM-DD>",
  "vendor": "<bus company name>",
  "travel_details": {
    "route_from": "<departure city or station>",
    "route_to": "<arrival city or station>",
    "departure_time": "<HH:MM or null>"
  },
  "raw_text": "<all visible text>",
  "confidence": {
    "native_amount": <0.0-1.0>,
    "receipt_date": <0.0-1.0>
  }
}
Confidence: 0.95+ = perfectly clear; 0.80–0.94 = mostly readable, minor uncertainty; 0.65–0.79 = partially legible, some reconstruction; below 0.65 = significant guesswork.`;
  }

  if (docType === "blablacar") {
    return `You are reading ${src} of a BlaBlaCar booking confirmation or receipt. Return ONLY valid JSON — no markdown, no code fences.

{
  "native_amount": <total price paid by the passenger, decimal>,
  "native_currency": "<ISO 4217>",
  "receipt_date": "<travel/departure date YYYY-MM-DD>",
  "vendor": "BlaBlaCar",
  "travel_details": {
    "route_from": "<departure city>",
    "route_to": "<arrival city>",
    "departure_time": "<HH:MM or null>"
  },
  "raw_text": "<all visible text>",
  "confidence": {
    "native_amount": <0.0-1.0>,
    "receipt_date": <0.0-1.0>
  }
}
Confidence: 0.95+ = perfectly clear; 0.80–0.94 = mostly readable, minor uncertainty; 0.65–0.79 = partially legible, some reconstruction; below 0.65 = significant guesswork.`;
  }

  // smjestaj
  return `You are reading ${src} of a hotel booking confirmation, accommodation invoice, or lodging receipt (Booking.com, Airbnb, hotel invoice, etc.). Return ONLY valid JSON — no markdown, no code fences.

{
  "native_amount": <total price as shown, decimal — include room rate + VAT + city tax + all fees>,
  "native_currency": "<ISO 4217>",
  "receipt_date": "<check-in date YYYY-MM-DD>",
  "vendor": "<hotel or property name>",
  "travel_details": {
    "checkin_date": "<YYYY-MM-DD>",
    "checkout_date": "<YYYY-MM-DD>",
    "nights": <integer number of nights>,
    "address": "<property address or null>"
  },
  "raw_text": "<all visible text>",
  "confidence": {
    "native_amount": <0.0-1.0>,
    "receipt_date": <0.0-1.0>
  }
}

Rules:
- native_amount: TOTAL charged (room + VAT + city tax).
- receipt_date = check-in date = travel_details.checkin_date.
Confidence: 0.95+ = perfectly clear; 0.80–0.94 = mostly readable, minor uncertainty; 0.65–0.79 = partially legible, some reconstruction; below 0.65 = significant guesswork.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const form = await req.formData();
    const imageFile = form.get("image") as File | null;
    const rawDocType = (form.get("doc_type") as string | null)?.toLowerCase().trim();

    if (!imageFile) {
      return json({ error: "extraction_failed", detail: "Field 'image' missing", model: MODEL_CAPABLE }, 400);
    }

    const uploadError = validateDocumentFile(imageFile);
    if (uploadError) {
      return json({ error: "extraction_failed", detail: uploadError, model: MODEL_CAPABLE }, 415);
    }

    const validTypes: DocType[] = ["avionska_karta", "autobusna_karta", "blablacar", "smjestaj"];
    if (!rawDocType || !validTypes.includes(rawDocType as DocType)) {
      return json({
        error: "extraction_failed",
        detail: "Field 'doc_type' must be avionska_karta | autobusna_karta | blablacar | smjestaj",
        model: MODEL_CAPABLE,
      }, 400);
    }

    const docType = rawDocType as DocType;
    const bytes = new Uint8Array(await imageFile.arrayBuffer());
    const isPdf = imageFile.type === "application/pdf" ||
      imageFile.name?.toLowerCase().endsWith(".pdf");

    let raw: string;
    if (isPdf) {
      const text = await extractPdfText(bytes);
      if (!text) {
        return json({
          error: "extraction_failed",
          detail: "PDF contains no readable text (scanned image PDF not supported).",
          model: MODEL_CAPABLE,
        }, 422);
      }
      raw = await callText(text, buildPrompt(docType, "text"), 2000, MODEL_CAPABLE, {
        functionName: "extract_travel_doc",
      });
    } else {
      raw = await callVision(bytes, buildPrompt(docType, "image"), imageFile.type || "image/jpeg", 2000, MODEL_CAPABLE, {
        functionName: "extract_travel_doc",
      });
    }

    let parsed: Record<string, unknown>;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Model returned non-JSON: ${raw}`);
    }

    const nativeCurrency = typeof parsed.native_currency === "string"
      ? parsed.native_currency.toUpperCase().trim()
      : "EUR";
    const nativeAmount = typeof parsed.native_amount === "number"
      ? Math.round(parsed.native_amount * 100) / 100
      : 0;
    const receiptDate = typeof parsed.receipt_date === "string" ? parsed.receipt_date : null;

    let fxRate: number | null = null;
    let fxRateDate: string | null = receiptDate;
    let eurAmount = nativeAmount;
    let confidence = (parsed.confidence ?? {}) as Record<string, number>;

    if (nativeCurrency !== "EUR") {
      const fx = await fetchFxRate(nativeCurrency, receiptDate);
      if (fx) {
        fxRate = fx.fx_rate;
        fxRateDate = fx.fx_rate_date;
        eurAmount = Math.round(nativeAmount * fxRate * 100) / 100;
      } else {
        // No rate (currency not in ECB feed, unreadable date, or service down):
        // eur_amount stays = native_amount, which is wrong money. fx_rate: 0
        // in the confidence map makes the slot mandatory-review on the client
        // and blocks unconfirmed submit on the server.
        confidence = { ...confidence, fx_rate: 0 };
      }
    }

    return json({
      doc_type: docType,
      native_amount: nativeAmount,
      native_currency: nativeCurrency,
      eur_amount: eurAmount,
      fx_rate: fxRate,
      fx_rate_date: fxRateDate,
      receipt_date: receiptDate,
      vendor: typeof parsed.vendor === "string" ? parsed.vendor : null,
      travel_details: parsed.travel_details ?? null,
      raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : null,
      model: MODEL_CAPABLE,
      confidence,
    });
  } catch (err) {
    console.error("extract_travel_doc:", err);
    return json({ error: "extraction_failed", detail: String(err), model: MODEL_CAPABLE }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
