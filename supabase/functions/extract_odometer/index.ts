import { callVision, MODEL_FAST } from "../_shared/vision.ts";
import { validateImageFile } from "../_shared/uploadGuard.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const PROMPT =
  "Read the odometer display in this photo. " +
  "If two distinct mileage readings are visible, use the larger one. " +
  'Return ONLY valid JSON with exactly these fields: {"odometer_km": <integer or null if unreadable>, ' +
  '"confidence": <float 0.0–1.0>}. ' +
  "Confidence: 0.95+ every digit perfectly clear; 0.80–0.94 mostly readable minor uncertainty; " +
  "0.65–0.79 partial reconstruction; below 0.65 significant guesswork. No other text.";

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
      functionName: "extract_odometer",
    });

    let parsed: Record<string, unknown>;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Model returned non-JSON: ${raw}`);
    }

    return json({
      odometer_km: typeof parsed.odometer_km === "number" ? parsed.odometer_km : null,
      model: MODEL_FAST,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
    });
  } catch (err) {
    console.error("extract_odometer:", err);
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
