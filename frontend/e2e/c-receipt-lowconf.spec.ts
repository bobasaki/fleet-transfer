import { test, expect } from "@playwright/test";
import {
  blockUnmockedFunctions, gotoTransfer, mockFn, receiptResult,
  uploadGalerija, GALERIJA, totalReceipts,
} from "./helpers";

// Flow (c): receipt photo → mocked low-confidence (< 0.85) response →
// review flag visible; amount editable; confirm clears the block.

test("c. low-confidence receipt is flagged for review and stays editable", async ({ page }) => {
  await blockUnmockedFunctions(page);
  await mockFn(page, "extract_receipt", receiptResult({ amountConfidence: 0.62 }));
  await gotoTransfer(page);

  await uploadGalerija(page, GALERIJA.receipt1);

  // Review flag (badge + low-confidence percentage + confirm button)
  await expect(page.getByText("⚠ Provjeri").first()).toBeVisible();
  await expect(page.getByText("62%")).toBeVisible();
  const confirmBtn = page.getByRole("button", { name: "✓ Potvrdi označene vrijednosti" });
  await expect(confirmBtn).toBeVisible();

  // Unconfirmed low-confidence receipt blocks submit (Croatian error listed)
  await expect(
    page.getByText("Račun 'cestarina' ima nisku pouzdanost i nije potvrđen"),
  ).toBeVisible();

  // Amount is editable and totals follow (plan1 behavior)
  await expect(totalReceipts(page)).toHaveText("68.40 €");
  const amount = page.locator('input[inputmode="decimal"]').first();
  await expect(amount).toHaveValue("68.4");
  await amount.fill("70.00");
  await expect(totalReceipts(page)).toHaveText("70.00 €");

  // Confirming clears the flag and the blocking error
  await confirmBtn.click();
  await expect(page.getByText("✓ Potvrđeno")).toBeVisible();
  await expect(
    page.getByText("Račun 'cestarina' ima nisku pouzdanost i nije potvrđen"),
  ).toBeHidden();
});
