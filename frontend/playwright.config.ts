import { defineConfig } from "@playwright/test";

// Phase 1 characterization suite for the transfer page (docs/plans/plan11.md).
// Pins today's behavior with mocked Edge Function responses BEFORE any
// extraction refactor. Local runs only — no CI pipeline (out of v1 scope).
//
// Run: npx playwright test            (starts its own dev server on :3100)
//      npx playwright test --ui       (interactive)
export default defineConfig({
  testDir: "./e2e",
  // Visual snapshots are macOS-specific (*-darwin.png) and would all "miss" on a
  // Linux CI runner. Skip visual.spec.ts when CI is set, so the OS-portable
  // behavioral specs (a–g) can gate every PR. The visual oracle stays a local +
  // real-device gate until containerized/Linux baselines exist (revisit post-R4).
  testIgnore: process.env.CI ? ["**/visual.spec.ts"] : [],
  fullyParallel: true,
  retries: 0,
  // First-ever run compiles Next routes on demand — keep generous timeouts.
  timeout: 60_000,
  reporter: [["list"]],
  expect: {
    toHaveScreenshot: {
      // Strict gate (R0): the former maxDiffPixelRatio:0.02 allowed ~2% of a
      // full-page image to drift — enough to hide a real layout/cascade change
      // that R1–R4 must catch. Replaced with a small ABSOLUTE cap so the gate
      // stays equally strict whether a page is short (desktop) or tall (phone).
      // 100px tolerates only cross-run sub-pixel anti-aliasing (mainly WebKit
      // text); empirically the clean re-run diffs at 0 on this machine, so this
      // is a conservative margin, not a crutch for an unstable baseline.
      maxDiffPixels: 100,
      animations: "disabled",
      stylePath: "./e2e/screenshot.css",
    },
  },
  use: {
    baseURL: "http://localhost:3100",
    // iPhone 12/13/14 logical viewport — primary design target.
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    colorScheme: "dark",
    // The app registers /sw.js; an active service worker would intercept
    // fetches BEFORE page.route() and break the network mocks.
    serviceWorkers: "block",
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    // WebKit matters: iPhone Safari is the primary target.
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
    // The suite mocks ALL network (Edge Functions + Supabase REST), so the real
    // backend is never contacted. But the landing page calls getSupabase() on
    // mount, which THROWS if these are unset — and in a clean checkout there is
    // no .env.local (only .env.example ships). That throw leaves the monthly
    // query's loading skeleton stuck, so the landing snapshots hang. Inject
    // placeholders so the client constructs; the route mocks still own every
    // response and the rendered output is identical to a real-env run.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
    },
  },
});
