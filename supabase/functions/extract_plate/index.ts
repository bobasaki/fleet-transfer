import { callVision, MODEL_FAST } from "../_shared/vision.ts";
import { validateImageFile } from "../_shared/uploadGuard.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Explicitly forbid any normalisation or country-based correction of plate_raw.
const PROMPT =
  "Read the vehicle license plate in this photo. " +
  "Also identify the visible vehicle make and model if the body, badge, or shape is clear enough. " +
  "Return ONLY valid JSON with exactly these fields: " +
  '{"plate_raw": "<characters exactly as printed — no reformatting, no correction, no spacing changes>", ' +
  '"country_guess": "<2-letter ISO country code if a country flag or band is visible, otherwise null>", ' +
  '"vehicle_model": "<model, e.g. Golf, or null if unclear>", ' +
  '"confidence": <float 0.0–1.0 for how clearly the plate is readable>}. ' +
  "plate_raw MUST be copied character-for-character as it appears. " +
  "country_guess is informational only and must never change what you write in plate_raw. " +
  "vehicle_model is a best guess and may be null; never invent it if the vehicle is not visible enough. " +
  "Confidence: 0.95+ every character perfectly clear; 0.80–0.94 mostly readable minor uncertainty; " +
  "0.65–0.79 partial reconstruction; below 0.65 significant guesswork. " +
  "No other text outside the JSON.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const form = await req.formData();
    const imageFile = form.get("image") as File | null;

    if (!imageFile) {
      return json(
        { error: "extraction_failed", detail: "Field 'image' missing", model: MODEL_FAST },
        400,
      );
    }

    const uploadError = validateImageFile(imageFile);
    if (uploadError) {
      return json(
        { error: "extraction_failed", detail: uploadError, model: MODEL_FAST },
        415,
      );
    }

    const bytes = new Uint8Array(await imageFile.arrayBuffer());
    const raw = await callVision(bytes, PROMPT, imageFile.type || "image/jpeg", 1024, MODEL_FAST, {
      functionName: "extract_plate",
    });

    let parsed: Record<string, unknown>;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Model returned non-JSON: ${raw}`);
    }

    return json({
      plate_raw: typeof parsed.plate_raw === "string" ? parsed.plate_raw : null,
      country_guess: typeof parsed.country_guess === "string" ? parsed.country_guess : null,
      vehicle_model: typeof parsed.vehicle_model === "string" ? parsed.vehicle_model : null,
      model: MODEL_FAST,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
    });
  } catch (err) {
    console.error("extract_plate:", err);
    return json(
      { error: "extraction_failed", detail: String(err), model: MODEL_FAST },
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
