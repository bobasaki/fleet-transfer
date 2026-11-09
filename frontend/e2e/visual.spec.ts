import { test, expect, type Page } from "@playwright/test";
import {
  applyViewportTheme, blockUnmockedFunctions, gotoAdmin, gotoLanding,
  gotoTransfer, mockFn, receiptResult, uploadGalerija, GALERIJA, type Theme,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────
// Visual regression oracle for the styling refactor (docs/plans/refactor).
//
// R0 widens the net from "transfer only, 390×844, dark" to every route the
// R1–R4 series touches, at all target widths, in both themes, on Chromium AND
// WebKit (WebKit = iPhone Safari, the primary target). These baselines are the
// "before" that R1–R3 must keep byte-stable and R4 re-baselines on purpose.
//
// Naming: `<slug>-w<width>-<theme>.png` (+ Playwright's `-<project>-linux`).
// The one exception is transfer @ 390 dark, which keeps the original plan11
// names (`empty-form.png`, …) so historical comparisons survive — see
// snapName(). Width AND theme are otherwise always in the filename.
// ─────────────────────────────────────────────────────────────────────────

async function settleForScreenshot(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

// Transfer target widths: 320 (smallest phone) … 1440 (wide desktop).
const TRANSFER_WIDTHS = [320, 390, 430, 768, 1024, 1440];
// Landing + admin: mobile and wide shells are enough to protect their layout.
const ROUTE_WIDTHS = [390, 1024];
const THEMES: Theme[] = ["dark", "light"];

// (390, dark) keeps its plan11 baseline filename; everything else is explicit.
function snapName(slug: string, width: number, theme: Theme): string {
  if (width === 390 && theme === "dark") return `${slug}.png`;
  return `${slug}-w${width}-${theme}.png`;
}

// ── Transfer page states ────────────────────────────────────────────────
// Each setup leaves the page settled and ready to capture. The receipt states
// wait for the PRIKAŽI lightbox button (the photo affordance after commit
// b06146f replaced the inline <img aria-hidden> thumbnail).
const TRANSFER_STATES = [
  {
    slug: "empty-form",
    title: "empty form",
    setup: async (page: Page) => {
      await blockUnmockedFunctions(page);
      await gotoTransfer(page);
    },
  },
  {
    slug: "receipt-extracted",
    title: "form with one extracted receipt",
    setup: async (page: Page) => {
      await blockUnmockedFunctions(page);
      await mockFn(page, "extract_receipt", receiptResult());
      await gotoTransfer(page);

      await uploadGalerija(page, GALERIJA.receipt1);
      await expect(page.locator('input[inputmode="decimal"]').first()).toHaveValue("68.4");
      await expect(page.getByRole("button", { name: "PRIKAŽI" })).toBeVisible();
    },
  },
  {
    slug: "validation-error",
    title: "validation-error state (gorivo receipt, no petrol card)",
    setup: async (page: Page) => {
      await blockUnmockedFunctions(page);
      await mockFn(page, "extract_receipt", receiptResult({ category: "gorivo" }));
      await gotoTransfer(page);

      await uploadGalerija(page, GALERIJA.receipt1);
      await expect(page.locator('input[inputmode="decimal"]').first()).toHaveValue("68.4");
      await expect(
        page.getByText("Imaš račune za gorivo — odaberi broj petrol kartice"),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "PRIKAŽI" })).toBeVisible();
    },
  },
];

for (const state of TRANSFER_STATES) {
  for (const width of TRANSFER_WIDTHS) {
    for (const theme of THEMES) {
      test(`transfer: ${state.title} @ ${width} ${theme}`, async ({ page }) => {
        await applyViewportTheme(page, width, theme);
        await state.setup(page);
        await settleForScreenshot(page);
        await expect(page).toHaveScreenshot(snapName(state.slug, width, theme), {
          fullPage: true,
        });
      });
    }
  }
}

// ── Landing page (/) and admin login (/admin) ──────────────────────────────
// NOTE: /admin uses a hardcoded light palette (no theme variables yet), but its
// dark/light captures still differ: globals.css sets `[data-theme="dark"] input
// { color-scheme: dark }`, so the password field renders a DARK native control
// on the otherwise-light page in dark theme (a pre-existing quirk — documented,
// not fixed here; tokenizing /admin in R1–R3 should resolve it).
for (const width of ROUTE_WIDTHS) {
  for (const theme of THEMES) {
    test(`landing @ ${width} ${theme}`, async ({ page }) => {
      await applyViewportTheme(page, width, theme);
      await gotoLanding(page);
      await settleForScreenshot(page);
      await expect(page).toHaveScreenshot(`landing-w${width}-${theme}.png`, {
        fullPage: true,
      });
    });

    test(`admin login @ ${width} ${theme}`, async ({ page }) => {
      await applyViewportTheme(page, width, theme);
      await gotoAdmin(page);
      await settleForScreenshot(page);
      await expect(page).toHaveScreenshot(`admin-w${width}-${theme}.png`, {
        fullPage: true,
      });
    });
  }
}
