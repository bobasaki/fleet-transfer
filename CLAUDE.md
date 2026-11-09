# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A mobile PWA that replaces a manual Google Form for rental-transfer drivers. Drivers snap photos (vehicle plate, odometer, receipts), an AI extracts the data, the driver reviews/corrects, then submits. **Goal: eliminate double-entry of uploading a photo AND retyping its content.**

v1 = one driver (`Demo Vozač`), validate it works. **iPhone Safari is the primary design target; Android Chrome must also work.**

## Stack

- **Frontend**: PWA, deploys to Vercel, runs locally first
- **Backend**: Supabase — Postgres (source of truth), Storage (`transfer-photos` bucket), Edge Functions (AI proxy)
- **AI**: OpenAI GPT-5.4 mini, pinned to `gpt-5.4-mini-2026-03-17`, called only from Edge Functions behind the `callVision()` / `callText()` wrapper in `supabase/functions/_shared/vision.ts`

## Frontend layout (after the plan11 decomposition)

- `frontend/app/transfer/page.tsx` — container: all state, submit flow, section composition. House limit 800 lines — extract, don't grow it back.
- `frontend/app/components/transfer/` — presentational sections (Vehicle, Odometer, DestinationPayout, TravelDocs, Totals, Submit, banners, chrome). State stays in `page.tsx`, passed via props — no context providers, no state library.
- `frontend/app/components/` — `ReceiptCard`, `TravelDocCard`, `PhotoCaptureButtons` (renders the two Kamera/Galerija inputs), `formStyles.ts` (single source for shared style tokens — never redefine them locally).
- `frontend/hooks/` — `useExtraction`, `useDraftPersistence` (localStorage key names and draft JSON shape are frozen), `useOnlineStatus`.
- `frontend/lib/` — pure, unit-tested utilities (`format`, `api`, `buildSubmitPayload` pins the wire format, `submitValidation`, …).
- `frontend/e2e/` — Playwright characterization suite (Chromium + WebKit, visual snapshots). Full check: `cd frontend && npx tsc --noEmit && npx vitest run && npx playwright test && npm run build`.

## Hard constraints (non-negotiable)

- AI/OpenAI key + Supabase `service_role` key: **server-side only, never in the browser bundle**
- Photo capture: two explicit buttons per slot — **Kamera** (`capture="environment"`, uses `new Date()` as timestamp) and **Galerija** (no `capture`, reads EXIF timestamp from metadata). Do NOT collapse them into a single input. Do NOT use `getUserMedia`.
- One receipt per photo — do NOT segment multiple receipts from one image
- Plates: store as-read, no country/format validation, `country_guess` must never alter `plate_raw`
- Card fields (`petrol_card`, `visa_card`): **MANUAL dropdowns, not AI-extracted**
- Online required to submit (no offline sync queue), but preserve photos + form state locally so a failed submit doesn't lose work
- UI strings: **Croatian**. Code/comments: **English**
- Flag any AI confidence field `< 0.85` as mandatory review (threshold in one constant)
- Build one slice at a time, stop after each for testing

## Data contract

`DATA_CONTRACT.md` (same folder) is authoritative. **Read it before writing any schema, extraction, or review code.** Use its exact field/column names and enum values — no renaming, no camelCase drift.

Key shapes:
- `extract_receipt` → `category`, `native_amount`, `native_currency`, `eur_amount`, `fx_rate`, `receipt_date`, `vendor`, `confidence` (per-field 0–1)
- `extract_plate` → `plate_raw`, `country_guess`, `confidence`
- `extract_odometer` → `odometer_km`, `confidence`
- Error shape (all functions): `{ error, detail, model }`

DB tables: `transfers`, `receipts`, `transfer_photos`. Storage: `transfer-photos/{transfer_id}/{type}.jpg`.

## Build order (one slice per turn, stop after each)

1. **Spike**: odometer photo → Edge Function → GPT-5.4 mini → editable km field → one DB row
2. All 4 photo types extracting (plates + receipts + EUR conversion + per-category totals)
3. Review screen: all fields, low-confidence flagged, manual dropdowns, submit-blocked until confirmed
4. Submit → DB + photos to Storage + local draft safety net
5. PWA shell: manifest, installable, opens offline with "no signal" state; last-transfer card

Google Sheet mirror and multi-user auth are **not in v1**.

## v1 hardcoded constants

```js
const V1_DRIVER = "Demo Vozač"; // driver_id and visa_card default share this value in v1 only
```

`petrol_card` = `["Nisam koristio/la", "1"…"25"]`  
`payout_method` = `["Gotovina", "Studentski", "Faktura"]`  
`enc_device`: 5 demo devices in DATA_CONTRACT §4 (en-dash separator, exact match matters)  
`visa_card` cardholders: 6 demo names in DATA_CONTRACT §4  
`DNEVNICA`: 95 destinations + 2 zero-€ entries — driver picks location, amount is derived, not typed

**For any enum value still marked TODO in DATA_CONTRACT — STOP and ask before treating it as final.**

## Submit-blocking validation

- Any `gorivo` receipt → `petrol_card` must be 1–25 (not "Nisam koristio/la")
- `"Nisam koristio/la"` for a card ↔ zero receipts of that card's type
- Treat `"Nisam koristio/la"` as distinct from `null` ("unanswered" must never silently read as "none used")
