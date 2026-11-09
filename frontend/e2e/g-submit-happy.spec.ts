import { test, expect } from "@playwright/test";
import {
  setupHappyPathMocks, gotoTransfer, fillHappyPath, submitButton,
  DRAFT_KEY, LAST_TRANSFER_KEY, TRANSFER_ID,
} from "./helpers";

// Flow (g): happy-path submit with mocked success → saved state ("Transfer
// poslan"), draft cleared, last-transfer card data written.

test("g. happy-path submit reaches the saved state and clears the draft", async ({ page }) => {
  await setupHappyPathMocks(page);
  await gotoTransfer(page);
  await fillHappyPath(page);

  const submit = submitButton(page);
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText("✓ Transfer poslan")).toBeVisible();
  await expect(page.getByText(TRANSFER_ID)).toBeVisible();
  await expect(page.getByRole("button", { name: "⬇ Preuzmi putni nalog" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Završi transfer" })).toBeVisible();
  await expect(submit).toBeHidden();

  // Draft cleared; last-transfer card written (frozen key names)
  const keys = await page.evaluate(
    ([draftKey, lastKey]) => ({
      draft: localStorage.getItem(draftKey),
      last: localStorage.getItem(lastKey),
    }),
    [DRAFT_KEY, LAST_TRANSFER_KEY] as const,
  );
  expect(keys.draft).toBeNull();
  expect(keys.last).toBeTruthy();
  const last = JSON.parse(keys.last!);
  expect(last.id).toBe(TRANSFER_ID);
  expect(last.plateHr).toBe("ZG 1234 AB");
  expect(last.dnevnicaLocation).toBe("LJUBLJANA");
});
