import { test, expect } from "@playwright/test";
import {
  setupHappyPathMocks, gotoTransfer, fillHappyPath, mockFn, receiptResult,
  uploadGalerija, GALERIJA, selects, submitButton,
} from "./helpers";

// Flow (e): submit-blocking validation — a gorivo receipt with
// petrol_card = "Nisam koristio/la" blocks submit; choosing a number unblocks.

test("e. gorivo receipt blocks submit until a petrol card number is chosen", async ({ page }) => {
  await setupHappyPathMocks(page);
  await mockFn(page, "extract_receipt", receiptResult({ category: "gorivo" }));
  await gotoTransfer(page);
  await fillHappyPath(page);

  const submit = submitButton(page);
  await expect(submit).toBeEnabled();

  await uploadGalerija(page, GALERIJA.receipt1);
  await expect(page.locator('input[inputmode="decimal"]').first()).toHaveValue("68.4");

  // Blocking error (lib/submitValidation) + inline warn tag on the dropdown
  await expect(
    page.getByText("Imaš račune za gorivo — odaberi broj petrol kartice"),
  ).toBeVisible();
  await expect(page.getByText("⚠ Imaš račun za gorivo")).toBeVisible();
  await expect(submit).toBeDisabled();

  // petrol_card is a MANUAL dropdown — choosing 1–25 unblocks
  await selects.petrol(page).selectOption("1");
  await expect(
    page.getByText("Imaš račune za gorivo — odaberi broj petrol kartice"),
  ).toBeHidden();
  await expect(submit).toBeEnabled();
});
