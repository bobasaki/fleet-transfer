import { test, expect } from "@playwright/test";
import {
  blockUnmockedFunctions, gotoTransfer, mockFn, odometerResult,
  uploadGalerija, GALERIJA, PHOTO, PHOTO_EXIF,
} from "./helpers";

// Flow (b): odometer-start photo → mocked extraction → km field populated AND
// editable; photo-time caption renders (plan8: EXIF vs fallback wording).

test("b. odometer-start photo fills an editable km field (no-EXIF fallback caption)", async ({ page }) => {
  await blockUnmockedFunctions(page);
  await mockFn(page, "extract_odometer", odometerResult(128450));
  await gotoTransfer(page);

  await uploadGalerija(page, GALERIJA.odometerStart, PHOTO);

  const km = page.locator('input[inputmode="numeric"]').first();
  await expect(km).toHaveValue("128450");

  // photo.jpg has no EXIF -> "now" source; clock is fixed at 11:30 local
  await expect(
    page.getByText("Vrijeme odabira: 11:30 (EXIF nedostupan)"),
  ).toBeVisible();

  // AI value must stay editable
  await km.fill("128999");
  await expect(km).toHaveValue("128999");
});

test("b. odometer-start photo with EXIF shows the capture-time wording", async ({ page }) => {
  await blockUnmockedFunctions(page);
  await mockFn(page, "extract_odometer", odometerResult(128450));
  await gotoTransfer(page);

  // photo-exif.jpg carries DateTimeOriginal 2026-06-12 09:15 local
  await uploadGalerija(page, GALERIJA.odometerStart, PHOTO_EXIF);

  await expect(page.locator('input[inputmode="numeric"]').first()).toHaveValue("128450");
  await expect(page.getByText("Foto snimljena u 09:15")).toBeVisible();
});
