import { callVision, MODEL_CAPABLE } from "../_shared/vision.ts";
import { validateImageFile } from "../_shared/uploadGuard.ts";
import { fetchFxRate } from "../_shared/fx.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// A single receipt can contain charges of different categories (e.g. fuel + highway toll
// paid at the same station). The prompt asks for an items array so we can capture all of them.
const PROMPT = `You extract structured data from one receipt image. Process only the receipt itself and ignore unrelated background text.

Return only valid JSON. Do not return Markdown, code fences, explanations, or additional fields.

Required structure:
{
  "items": [
    {
      "category": "<cestarina|gorivo|ostalo>",
      "native_amount": <decimal number using a period>,
      "confidence": {
        "category": <number from 0.0 to 1.0>,
        "native_amount": <number from 0.0 to 1.0>
      }
    }
  ],
  "native_currency": "<ISO 4217 code or null>",
  "receipt_date": "<YYYY-MM-DD or null>",
  "vendor": "<merchant or station name or null>",
  "raw_text": "<verbatim legible receipt text>",
  "confidence": {
    "native_currency": <number from 0.0 to 1.0>,
    "receipt_date": <number from 0.0 to 1.0>
  }
}

Category definitions:
- "cestarina": motorway, highway, bridge, tunnel, vignette, or road-access charge
- "gorivo": petrol, diesel, LPG, CNG, hydrogen, or EV charging
- "ostalo": parking, food, accommodation, retail, repairs, services, and everything else

Extraction rules:
1. Return one item per distinct category, with no duplicate categories.
2. If the entire receipt belongs to one category, return one item using the final amount payable.
3. Split items only when separate amounts for different categories are clearly shown.
4. Prefer an explicit category subtotal. Otherwise, sum clearly legible line totals belonging to that category.
5. When splitting categories, do not also return the receipt’s combined grand total.
6. Do not treat VAT, tax summaries, subtotals, unit prices, quantities, discounts, payment tendered, card authorization amounts, or change as separate items.
7. Use the final charged amount after discounts and including applicable tax.
8. If no defensible charge amount can be read, return an empty items array.
9. Choose the currency in which the transaction was actually charged. Ignore informational conversions. If multiple currencies appear and the charged currency is unclear, return native_currency as null and items as an empty array.
10. Use the transaction date. Ignore card expiry dates, print dates, and unrelated dates unless no transaction date is identifiable.
11. Do not infer obscured digits from totals, tax calculations, merchant conventions, or expected prices.
12. In raw_text, transcribe only legible receipt text in reading order. Represent line breaks with \n and escape quotation marks correctly.

Confidence measures visual evidence:
- 0.95–1.00: completely clear and unambiguous
- 0.85–0.94: readable with minor visual degradation
- 0.65–0.84: ambiguous or partially legible; mandatory review
- 0.00–0.64: unreliable; do not invent a value`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const form = await req.formData();
    const imageFile = form.get("image") as File | null;

    if (!imageFile) {
      return json(
        { error: "extraction_failed", detail: "Field 'image' missing", model: MODEL_CAPABLE },
        400,
      );
    }

    const uploadError = validateImageFile(imageFile);
    if (uploadError) {
      return json(
        { error: "extraction_failed", detail: uploadError, model: MODEL_CAPABLE },
        415,
      );
    }

    const bytes = new Uint8Array(await imageFile.arrayBuffer());
    const raw = await callVision(bytes, PROMPT, imageFile.type || "image/jpeg", 2000, MODEL_CAPABLE, {
      functionName: "extract_receipt",
    });

    let parsed: Record<string, unknown>;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Model returned non-JSON: ${raw}`);
    }

    const nativeCurrency =
      typeof parsed.native_currency === "string"
        ? parsed.native_currency.toUpperCase().trim()
        : "EUR";
    const receiptDate =
      typeof parsed.receipt_date === "string" ? parsed.receipt_date : null;
    const topConf = parsed.confidence ?? {};

    // FX lookup — one call for the whole receipt (all items share the same currency/date)
    let fxRate: number | null = null;
    let fxRateDate: string | null = receiptDate;
    let fxMissing = false;
    if (nativeCurrency !== "EUR") {
      const fx = await fetchFxRate(nativeCurrency, receiptDate);
      if (fx) {
        fxRate = fx.fx_rate;
        fxRateDate = fx.fx_rate_date;
      } else {
        // No rate (currency not in ECB feed, unreadable date, or service down):
        // eur_amount falls back to native_amount below, which is wrong money.
        // fx_rate: 0 in each item's confidence makes the slot mandatory-review
        // on the client and blocks unconfirmed submit on the server.
        fxMissing = true;
      }
    }

    // Parse items array; fall back gracefully to a single-item response
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const validCategories = ["cestarina", "gorivo", "ostalo"];

    const items = rawItems.map((item: Record<string, unknown>) => {
      const category = validCategories.includes(item.category as string)
        ? (item.category as string)
        : "ostalo";
      const nativeAmount =
        typeof item.native_amount === "number"
          ? Math.round((item.native_amount as number) * 100) / 100
          : 0;
      const eurAmount =
        fxRate !== null
          ? Math.round(nativeAmount * fxRate * 100) / 100
          : nativeAmount;

      const itemConf = (item.confidence ?? null) as Record<string, number> | null;

      return {
        category,
        native_amount: nativeAmount,
        native_currency: nativeCurrency,
        eur_amount: eurAmount,
        fx_rate: fxRate,
        fx_rate_date: fxRateDate,
        confidence: fxMissing ? { ...(itemConf ?? {}), fx_rate: 0 } : itemConf,
      };
    });

    // If the model returned nothing recognisable, return an error
    if (items.length === 0) {
      throw new Error("No items extracted from receipt");
    }

    return json({
      items,
      native_currency: nativeCurrency,
      receipt_date: receiptDate,
      vendor: typeof parsed.vendor === "string" ? parsed.vendor : null,
      raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : null,
      model: MODEL_CAPABLE,
      confidence: topConf,
    });
  } catch (err) {
    console.error("extract_receipt:", err);
    return json(
      { error: "extraction_failed", detail: String(err), model: MODEL_CAPABLE },
      500,
    );
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
