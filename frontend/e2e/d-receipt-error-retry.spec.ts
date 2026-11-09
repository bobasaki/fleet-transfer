import { test, expect } from "@playwright/test";
import {
  blockUnmockedFunctions, gotoTransfer, mockFn,
  extractionError, receiptResult, uploadGalerija, GALERIJA,
} from "./helpers";

// Flow (d): extraction error → mocked { error, detail, model } → Croatian
// error text + recovery buttons; retry (retryReceipt) succeeds.

test("d. extraction error shows Croatian recovery UI and retry succeeds", async ({ page }) => {
  await blockUnmockedFunctions(page);
  // First call fails like the real Edge Function (HTTP 500 + error shape),
  // every later call succeeds.
  await mockFn(page, "extract_receipt", (call: number) =>
    call === 0
      ? { status: 500, body: extractionError("model timeout") }
      : { status: 200, body: receiptResult() },
  );
  await gotoTransfer(page);

  await uploadGalerija(page, GALERIJA.receipt1);

  await expect(
    page.getByText("Ne mogu pročitati račun — pokušaj ponovno ili unesi ručno."),
  ).toBeVisible();
  const retryBtn = page.getByRole("button", { name: "Pokušaj ponovno" });
  await expect(retryBtn).toBeVisible();
  await expect(page.getByRole("button", { name: "Unesi ručno" })).toBeVisible();

  // Retry re-extracts the same stored photo and renders the editable fields
  await retryBtn.click();
  await expect(page.locator('input[inputmode="decimal"]').first()).toHaveValue("68.4");
  await expect(page.locator('input[type="text"]').first()).toHaveValue("INA");
  await expect(
    page.getByText("Ne mogu pročitati račun — pokušaj ponovno ili unesi ručno."),
  ).toBeHidden();
});
