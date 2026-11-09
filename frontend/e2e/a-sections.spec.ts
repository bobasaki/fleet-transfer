import { test, expect } from "@playwright/test";
import { blockUnmockedFunctions, gotoTransfer, kamera, galerija } from "./helpers";

// Flow (a): page loads, all nine section labels render.

test("a. page loads with all nine section labels", async ({ page }) => {
  await blockUnmockedFunctions(page);
  await gotoTransfer(page);

  const labels = [
    "Datum transfera",
    "Vozilo (HR tablica)",
    "Kilometraža — početak",
    "Kilometraža — kraj",
    "Rotacijsko vozilo",
    "Destinacija i isplata",
    "Oprema",
    "Računi (1–10)",
    "Putne isprave",
  ];
  for (const label of labels) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

// HARD CONSTRAINT (CLAUDE.md): two explicit photo inputs per slot — Kamera
// with capture="environment", Galerija without. This pins the rendered DOM
// structure that Phase 2 step 3 (PhotoCaptureButtons) must preserve.
test("a. every photo slot keeps the two-input Kamera/Galerija structure", async ({ page }) => {
  await blockUnmockedFunctions(page);
  await gotoTransfer(page);

  // 4 slots on a fresh page: vehicle HR, odometer start, odometer end, receipt 1.
  await expect(kamera(page)).toHaveCount(4);
  await expect(galerija(page)).toHaveCount(4);

  // Both buttons are labelled in Croatian, one pair per slot.
  await expect(page.getByText("Kamera", { exact: true })).toHaveCount(4);
  await expect(page.getByText("Galerija", { exact: true })).toHaveCount(4);
});
