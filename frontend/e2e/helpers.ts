import { expect, type Page } from "@playwright/test";
import path from "path";

// ---- localStorage keys ----
// FROZEN (plan11): names and persisted JSON shape must survive Phase 2 —
// an in-flight draft from the previous app version must restore correctly.
export const DRAFT_KEY = "fleet_draft_v1";
export const LAST_TRANSFER_KEY = "fleet_last_transfer_v1";

// ---- Photo fixtures ----
// photo.jpg has NO EXIF -> readPhotoTime falls back to "now"
// photo-exif.jpg has DateTimeOriginal 2026-06-12 09:15 (local) -> "exif" path
export const PHOTO = path.join(__dirname, "fixtures", "photo.jpg");
export const PHOTO_EXIF = path.join(__dirname, "fixtures", "photo-exif.jpg");

// Fixed wall-clock (page.clock.setFixedTime) so today(), the date input and
// the photo-time fallback caption are deterministic. Explicit +02:00 offset
// matches the pinned timezoneId Europe/Zagreb in playwright.config.ts.
export const FIXED_TIME = new Date("2026-06-12T11:30:00+02:00");
export const FIXED_DATE = "2026-06-12";

export const TRANSFER_ID = "0f3f2a4e-9c1d-4e8b-a7f5-2d6c8b9a1e30";
export const SUBMITTED_AT = "2026-06-12T12:00:00.000Z";

// ---- Mock responses — DATA_CONTRACT.md §1 shapes, exact field names ----

export function plateResult(overrides: Record<string, unknown> = {}) {
  return {
    plate_raw: "ZG 1234 AB",
    country_guess: "HR",
    vehicle_model: "Opel Corsa",
    model: "gpt-5.4-mini-2026-03-17",
    confidence: 0.97,
    ...overrides,
  };
}

export function odometerResult(km: number, confidence = 0.95) {
  return { odometer_km: km, model: "gpt-5.4-mini-2026-03-17", confidence };
}

export function receiptResult(opts: {
  category?: string;
  amount?: number;
  amountConfidence?: number;
  categoryConfidence?: number;
} = {}) {
  const {
    category = "cestarina",
    amount = 68.4,
    amountConfidence = 0.99,
    categoryConfidence = 0.97,
  } = opts;
  return {
    native_currency: "EUR",
    receipt_date: "2026-06-05",
    vendor: "INA",
    raw_text: "RACUN BR. 123 ...",
    model: "gpt-5.4-mini-2026-03-17",
    confidence: { native_currency: 0.99, receipt_date: 0.91 },
    items: [
      {
        category,
        native_amount: amount,
        native_currency: "EUR",
        eur_amount: amount,
        fx_rate: null,
        fx_rate_date: "2026-06-05",
        confidence: { category: categoryConfidence, native_amount: amountConfidence },
      },
    ],
  };
}

// Error shape (all functions): { error, detail, model } served with HTTP 500,
// matching supabase/functions/*/index.ts `json(..., 500)`.
export function extractionError(detail = "vision call failed") {
  return { error: "extraction_failed", detail, model: "gpt-5.4-mini-2026-03-17" };
}

export function submitSuccess() {
  return { transfer_id: TRANSFER_ID, status: "submitted", submitted_at: SUBMITTED_AT };
}

// ---- Network mocking (route layer — app code untouched) ----

type MockResponse = { status: number; body: unknown };
type Responder = unknown | MockResponse | ((callIndex: number) => unknown | MockResponse);

function isMockResponse(r: unknown): r is MockResponse {
  return !!r && typeof r === "object" && "status" in r && "body" in r;
}

// Mocks one Edge Function endpoint (URL built by fnUrl() in the app).
// `responder` may be a plain JSON body, a {status, body} pair, or a function
// of the 0-based call index (for first-fails-then-succeeds sequences).
export async function mockFn(page: Page, name: string, responder: Responder) {
  let calls = 0;
  await page.route(`**/functions/v1/${name}`, async (route) => {
    const r = typeof responder === "function" ? responder(calls++) : responder;
    const { status, body } = isMockResponse(r) ? r : { status: 200, body: r };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

// Belt and braces: no test traffic may ever reach a real Edge Function.
// Register FIRST in each test — Playwright matches routes newest-first, so
// the specific mockFn() routes registered afterwards take precedence.
export async function blockUnmockedFunctions(page: Page) {
  await page.route("**/functions/v1/**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: "unmocked_function",
        detail: "e2e: no mock registered for this endpoint",
        model: "e2e",
      }),
    }),
  );
}

// ---- Page helpers ----

// HARD CONSTRAINT (CLAUDE.md): every photo slot renders TWO separate inputs —
// Kamera (capture="environment") and Galerija (no capture). Tests upload via
// the existing inputs with setInputFiles; the structure itself is asserted
// in a-sections.spec.ts.
export const kamera = (page: Page) =>
  page.locator('input[type="file"][capture="environment"]');
export const galerija = (page: Page) =>
  page.locator('input[type="file"]:not([capture])');

// DOM order of the Galerija inputs on a fresh page (no rotacijsko, 1 receipt).
export const GALERIJA = { vehicleHr: 0, odometerStart: 1, odometer: 2, receipt1: 3 } as const;

export async function uploadGalerija(page: Page, index: number, file: string = PHOTO) {
  await galerija(page).nth(index).setInputFiles(file);
}

// Content-based <select> locators — unique option values per dropdown.
export const selects = {
  dnevnica: (page: Page) => page.locator('select:has(option[value="LJUBLJANA"])'),
  payout: (page: Page) => page.locator('select:has(option[value="Gotovina"])'),
  // en-dash separator — exact match matters (DATA_CONTRACT §4)
  enc: (page: Page) => page.locator('select:has(option[value="ZG 1 – 10000000001"])'),
  petrol: (page: Page) => page.locator('select:has(option[value="25"])'),
  visa: (page: Page) => page.locator('select:has(option[value="Tomislav Firšt"])'),
  receiptCategory: (page: Page) => page.locator('select:has(option[value="gorivo"])'),
};

// The big "Ukupno računi" total readout.
export const totalReceipts = (page: Page) =>
  page.locator('div:has(> span:text-is("Ukupno računi")) > span').nth(1);

export const submitButton = (page: Page) =>
  page.getByRole("button", { name: "Pošalji transfer" });

// Navigate with a deterministic clock. Mocks must be registered BEFORE this.
export async function gotoTransfer(page: Page, fixedTime: Date = FIXED_TIME) {
  await page.clock.setFixedTime(fixedTime);
  await page.goto("/transfer");
  await dismissSplash(page, fixedTime);
  await expect(page.getByText("Putne isprave")).toBeVisible();
}

// ---- Visual-matrix helpers (R0) ----

export type Theme = "dark" | "light";

// Apply BEFORE navigating. setViewportSize fixes the layout width; emulateMedia
// drives prefers-color-scheme, which the layout.tsx init <script> reads to set
// [data-theme] on <html> before first paint (no localStorage in a fresh ctx).
// Both must be set pre-goto so the very first render is at the target width and
// theme — the screenshot oracle compares the settled, correct render.
export async function applyViewportTheme(page: Page, width: number, theme: Theme) {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ colorScheme: theme });
}

// Splash overlay (SplashScreen.tsx) renders on EVERY route. Its unmount timers
// (minDuration + fade = 2500 + 550 ms) are registered in a useEffect that only
// runs AFTER hydration, and page.clock.fastForward advances ONLY the timers
// that already exist when it fires. On a cold browser — notably WebKit's first
// page, which can take >10s to hydrate in CI — the first fast-forward can run
// before those timers exist, leaving them pinned in the future so they never
// run once the clock is re-pinned, and the overlay sits there forever (the
// pre-fix flake). Retry the fast-forward until one lands after hydration and
// drains the timers; the app has no other timers, so repeated 3.1s advances
// are side-effect-free. Re-pin afterwards so every Date-based assertion
// (photo-time captions, transfer date) stays deterministic.
async function dismissSplash(page: Page, fixedTime: Date) {
  await expect(async () => {
    await page.clock.fastForward(3100);
    await expect(page.locator(".ftSplash")).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.clock.setFixedTime(fixedTime);
}

// Landing dashboard (app/page.tsx). It queries Supabase REST for this month's
// transfers when online; mock it to [] so the settled state is deterministic
// (no monthly list, no shimmer skeleton). Mocks/clock set BEFORE goto.
export async function gotoLanding(page: Page, fixedTime: Date = FIXED_TIME) {
  await page.route("**/rest/v1/transfers**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.clock.setFixedTime(fixedTime);
  await page.goto("/");
  await dismissSplash(page, fixedTime);
  await expect(page.getByRole("button", { name: "Započni Transfer" })).toBeVisible();
  // SWR query resolved -> loading skeleton gone; settle before capture.
  await expect(page.locator(".shimmer")).toHaveCount(0);
}

// Admin login state (app/admin/page.tsx). Unauthenticated render does no
// network on load; just clear the splash and wait for the login form.
export async function gotoAdmin(page: Page, fixedTime: Date = FIXED_TIME) {
  await blockUnmockedFunctions(page);
  await page.clock.setFixedTime(fixedTime);
  await page.goto("/admin");
  await dismissSplash(page, fixedTime);
  await expect(page.getByRole("button", { name: "Prijava" })).toBeVisible();
}

// Standard mocks for a full valid transfer. Receipt mocks are per-spec.
export async function setupHappyPathMocks(page: Page) {
  await blockUnmockedFunctions(page);
  await mockFn(page, "extract_plate", plateResult());
  // Sequential uploads: 1st call = odometer start, 2nd = odometer end.
  await mockFn(page, "extract_odometer", (i: number) =>
    odometerResult(i === 0 ? 128450 : 128460),
  );
  await mockFn(page, "submit_transfer", submitSuccess());
}

// Drives the form to a submittable state (no receipts; petrol/visa defaults).
export async function fillHappyPath(page: Page) {
  await uploadGalerija(page, GALERIJA.vehicleHr);
  await expect(page.locator('input[type="text"]').first()).toHaveValue("ZG 1234 AB");

  await uploadGalerija(page, GALERIJA.odometerStart);
  await expect(page.locator('input[inputmode="numeric"]').nth(0)).toHaveValue("128450");

  await uploadGalerija(page, GALERIJA.odometer);
  await expect(page.locator('input[inputmode="numeric"]').nth(1)).toHaveValue("128460");

  await selects.dnevnica(page).selectOption("LJUBLJANA");
  await page.getByRole("button", { name: "Povrat u Zagreb" }).click();
  await selects.payout(page).selectOption("Gotovina");
  await selects.enc(page).selectOption("ZG 1 – 10000000001");
  // petrol_card stays "Nisam koristio/la", visa_card stays "Demo Vozač"
  // (v1 defaults) — both valid with zero receipts.
}
