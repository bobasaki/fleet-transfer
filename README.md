# Fleet Transfer

A mobile web app (PWA) for drivers who move rental vehicles between locations. Instead of filling in a form and retyping what's on their photos, the driver takes the photos and AI reads them: plate, odometer, receipts and travel tickets. The driver checks the result, fixes anything flagged, and submits.

**Live demo:** <https://fleet-transfer.vercel.app>. Open it on a phone and use "Add to Home Screen" to install it as an app. The interface is in Croatian.

## What it does

- **Vehicle and odometer photos.** The AI reads the plate exactly as printed, a best guess at the make and model, and the start and end mileage.
- **Receipts.** One receipt per photo. The AI reads the vendor, date, amount and currency, and sorts each item into tolls, fuel or other. Foreign currencies are converted to EUR at the ECB reference rate for the receipt date.
- **Travel documents.** Plane and bus tickets, BlaBlaCar rides and accommodation, as photos or PDFs.
- **Review before submit.** Every field stays editable. Anything the AI is less than 85% sure of is flagged and must be confirmed. Submit stays blocked until fuel-card and receipt choices are consistent.
- **Per diems and payout.** The driver picks a destination; the daily allowance is looked up, not typed.
- **Travel order export.** After submitting, the driver can download a filled-in *putni nalog* (Croatian travel-expense form) as an Excel file.
- **Safe against bad signal.** The form and photos are saved on the phone as the driver works, so a failed submit or a closed tab loses nothing. Submitting needs a connection.
- **Admin page** (`/admin`, protected by a shared secret): list and delete transfers, and clean up orphaned photos.

## How it works

```
Phone (Next.js PWA on Vercel)
  │  photos, compressed on the device
  ▼
Supabase Edge Functions ──► Claude API
  extract_plate / extract_odometer      Haiku 5.5   (short, single-value reads)
  extract_receipt / extract_travel_doc  Sonnet 5.5  (fine print, several items)
  submit_transfer / admin_transfer
  │
  ▼
Supabase Postgres (transfers, receipts, photos, AI usage)  +  Storage (photos)
```

- **The AI key never reaches the browser.** All Claude calls go through Supabase Edge Functions, behind one wrapper (`supabase/functions/_shared/vision.ts`), so the model or provider can be changed in one place.
- **Every AI call is logged** to the `ai_usage` table with the model and its token counts, so running costs are measured rather than estimated.
- **The AI only reads; the driver decides.** Payment-card fields are manual dropdowns, and plates are stored exactly as read, never "corrected".

## Running cost

AI usage is roughly **1–3 US cents per transfer**, depending mostly on how many receipts it has. Measured on test images: a receipt costs about $0.005 on Sonnet 5.5, and a plate or odometer read costs about $0.0001 on Haiku 5.5. Hosting fits within the Supabase and Vercel free tiers at pilot scale.

## Repository layout

| Path | What's there |
|---|---|
| `frontend/` | Next.js 15 / React 19 app (`app/` routes and components, `hooks/`, `lib/` utilities, `e2e/` Playwright tests) |
| `supabase/functions/` | Edge Functions (Deno/TypeScript); shared code in `_shared/` |
| `supabase/migrations/` | Database schema, storage bucket, policies and the submit RPC |
| `DATA_CONTRACT.md` | Field names, shapes and dropdown values shared by the frontend, functions and database |
| `CLAUDE.md`, `AGENTS.md` | Project instructions for AI coding assistants |

## Setup

You need Node.js 20+, a [Supabase](https://supabase.com) project and a [Claude API key](https://platform.claude.com).

**1. Database and functions.** From the repo root:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --remote
npx supabase secrets set ANTHROPIC_API_KEY='sk-ant-...' ADMIN_SECRET='<long random string>' --remote=<your-project-ref>
npx supabase functions deploy --remote=<your-project-ref> --use-api
```

When you create the Supabase project, leave **"Automatically expose new tables"** enabled; the app relies on Supabase's default table grants. Generate the admin secret with `openssl rand -base64 32`.

**2. Frontend.** Create `frontend/.env.local` with your project's URL and anon key (Supabase → Project Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Then:

```bash
cd frontend
npm install
npm run dev
```

**3. Deploy.** Import the repo in Vercel, set **Root Directory** to `frontend`, and add the same two environment variables. Pushes to `main` redeploy automatically.

## Tests

```bash
cd frontend
npx tsc --noEmit      # type-check
npm test              # unit tests (Vitest)
npm run test:e2e      # behavioural tests (Playwright, Chromium + WebKit)
npm run build
```

```bash
npx deno test supabase/functions/_shared/   # Edge Function unit tests
```

CI (GitHub Actions) runs the type-check, unit tests, build and behavioural e2e tests on every push and pull request. Visual snapshot tests exist, but their Linux baselines haven't been generated yet; see `frontend/playwright.config.ts`.

## Demo data and current scope

This is a v1 pilot, deliberately kept small:

- **One driver.** The app runs as a single built-in demo driver, "Demo Vozač". There's no login yet, so anyone with the link can use it.
- **Fictional data.** Driver names, card holders, toll devices and the company on the travel-order template are made up and need replacing with a real company's data.
- **Per-diem rates** are a fixed table in the code (`frontend/lib/constants.ts`).
- **Not in v1:** user accounts, a Google Sheets export, and an offline submit queue.
