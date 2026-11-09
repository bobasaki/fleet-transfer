import { test, expect } from "@playwright/test";
import {
  blockUnmockedFunctions, gotoTransfer, mockFn, receiptResult,
  uploadGalerija, GALERIJA, selects, DRAFT_KEY,
} from "./helpers";

// Flow (f): draft persistence — fill fields, reload, assert restore.
// The literal "fleet_draft_v1" key name is FROZEN and must stay stable across releases.

test("f. draft persists under fleet_draft_v1 and restores after reload", async ({ page }) => {
  await blockUnmockedFunctions(page);
  await mockFn(page, "extract_receipt", receiptResult());
  await gotoTransfer(page);

  await selects.dnevnica(page).selectOption("LJUBLJANA");
  await page.getByRole("button", { name: "Povrat u Zagreb" }).click();
  await selects.payout(page).selectOption("Gotovina");
  await selects.enc(page).selectOption("ZG 1 – 10000000001");
  await uploadGalerija(page, GALERIJA.receipt1);
  await expect(page.locator('input[inputmode="decimal"]').first()).toHaveValue("68.4");

  // The draft is written under the frozen key name with the frozen shape
  const draftRaw = await page.evaluate(
    ([key]) => localStorage.getItem(key),
    [DRAFT_KEY] as const,
  );
  expect(draftRaw).toBeTruthy();
  const draft = JSON.parse(draftRaw!);
  expect(draft.dnevnicaLocation).toBe("LJUBLJANA");
  expect(draft.payoutMethod).toBe("Gotovina");
  expect(draft.encDevice).toBe("ZG 1 – 10000000001");
  expect(draft.routeDirection).toBe("povrat");
  expect(draft.receipts).toHaveLength(1);
  expect(draft.receipts[0].result.vendor).toBe("INA");

  await page.reload();

  await expect(page.getByText("Nastavljaš gdje si stao/la.")).toBeVisible();
  await expect(selects.dnevnica(page)).toHaveValue("LJUBLJANA");
  await expect(selects.payout(page)).toHaveValue("Gotovina");
  await expect(selects.enc(page)).toHaveValue("ZG 1 – 10000000001");
  // Route direction restored: pickup/dropoff readout renders again
  await expect(page.locator('span:text-is("LJUBLJANA")')).toBeVisible();
  await expect(page.locator('span:text-is("Zagreb")')).toBeVisible();
  // Receipt extraction restored from the draft (no re-extraction needed)
  await expect(page.locator('input[type="text"]').first()).toHaveValue("INA");
  await expect(page.locator('input[inputmode="decimal"]').first()).toHaveValue("68.4");
});
