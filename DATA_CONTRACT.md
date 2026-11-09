# DATA_CONTRACT — shared shapes every layer must agree on

> This is the interface. Frontend, Edge Function, and DB all use **these exact names**. No renaming, no `camelCase` vs `snake_case` drift. If a shape is wrong for a real reason — STOP and ask, don't silently change it.

Conventions: DB columns `snake_case`. JSON keys `snake_case` (match DB to avoid mapping layers). All money is `numeric`/number with 2 decimals. All currencies are ISO 4217 ("EUR", "HUF", "BAM"…). All dates `YYYY-MM-DD`.

---

## 1. Edge Function outputs

### 1a. `extract_receipt` — one call per receipt image (ONE receipt per photo)

```json
{
  "native_currency": "EUR",
  "receipt_date": "2026-06-05",
  "vendor": "INA",
  "raw_text": "<full OCR dump for debugging>",
  "model": "gpt-5.4-mini-2026-03-17",
  "confidence": {
    "native_currency": 0.99,
    "receipt_date": 0.91
  },
  "items": [
    {
      "category": "gorivo",
      "native_amount": 68.40,
      "native_currency": "EUR",
      "eur_amount": 68.40,
      "fx_rate": null,
      "fx_rate_date": "2026-06-05",
      "confidence": {
        "category": 0.97,
        "native_amount": 0.99
      }
    }
  ]
}
```

Rules:
- **ONE receipt per image.** The UI enforces single-receipt capture (see SPEC §3). Do NOT attempt to segment multiple receipts from one photo.
- One receipt may contain multiple distinct charge items (for example fuel and a separate toll amount on the same receipt). Extract each clearly separated charge type into `items[]`; most receipts return exactly one item.
- The frontend stores one DB `receipts` row per extracted item. Rows from the same receipt share `photo_path`, `receipt_date`, `vendor`, `raw_text`, and `model`.
- `category` ∈ `["cestarina","gorivo","ostalo"]`. Classify by what the receipt *is*, not by keyword — confirmed working across HR/DE/SI receipts in testing.
- `fx_rate` is `null` when `native_currency == "EUR"`; otherwise the ECB daily reference rate used, and `eur_amount = round(native_amount * fx_rate, 2)`.
- `fx_rate_date` = the receipt date the rate was pulled for.
- **Card is NOT extracted.** Both petrol_card and visa_card are MANUAL (real receipts show the number too faintly/inconsistently to trust; it gets human-confirmed regardless). The AI extracts only what receipts show legibly: amount, currency, category, date, vendor.
- `confidence` values 0–1. The frontend flags any field `< 0.85` as **mandatory review** (threshold tunable in one constant). Expect folded/angled receipts to score low → heavy review; mitigate with a "snimi ravno" capture hint.

### 1b. `extract_plate` — one call per vehicle photo (photos 1 & 2)

```json
{
  "plate_raw": "S B 1 2 3 K M",
  "country_guess": "SI",
  "vehicle_model": "Opel Crossland",
  "model": "gpt-5.4-mini-2026-03-17",
  "confidence": 0.88
}
```

Rules:
- `plate_raw` = characters exactly as printed. **No formatting, no country validation, no correction.**
- `country_guess` is non-authoritative (from flag/band if visible) and MUST NEVER be used to alter `plate_raw`. May be `null`.
- `vehicle_model` = best-guess make + model from visible body/badges/shape (e.g. `"Volkswagen Golf"`, `"Toyota Corolla"`). `null` if the vehicle body is not visible enough to identify. The driver must confirm this field in the UI before submitting.

### 1c. `extract_odometer` — one call for photo 3

```json
{
  "odometer_km": 128450,
  "model": "gpt-5.4-mini-2026-03-17",
  "confidence": 0.74
}
```

### Error shape (all functions)

```json
{ "error": "extraction_failed", "detail": "<human-readable>", "model": "<the model id actually used, e.g. gpt-5.4-mini-2026-03-17>" }
```

On error the frontend leaves the field blank + flagged, never blocks the whole form.

`model` is always the exact model id the Edge Function called. All extraction types currently use the pinned `gpt-5.4-mini-2026-03-17` snapshot through `OPENAI_MODEL` in `_shared/vision.ts`; `MODEL_FAST` and `MODEL_CAPABLE` both resolve to it. Special values: `"manual"` when extraction failed and the driver entered the values by hand (frontend builds a synthetic zero-confidence result; the row still requires human confirmation before submit); `"client_error"` for frontend-fabricated error results (never submitted); `"unknown"` as the payload-builder fallback when a stored result somehow lacks a model.

---

## 2. Database schema (Supabase / Postgres)

### `transfers` — one row per submitted form

```sql
create table transfers (
  id                    uuid primary key default gen_random_uuid(),
  driver_id             text not null,              -- hardcoded constant in v1; FK to users later
  transfer_date         date not null,              -- MANUAL input
  plate_hr              text not null,              -- any format, as-read
  plate_rotation        text,                       -- nullable (optional vehicle)
  vehicle_model         text,                       -- AI-detected make+model, driver-confirmed
  odometer_km           integer not null,
  petrol_card           text,                        -- enum value, see §4 (PLACEHOLDER)
  visa_card             text,                        -- enum value (PLACEHOLDER)
  enc_device            text,                        -- enum value (PLACEHOLDER)
  total_cestarina_eur   numeric(10,2) not null default 0,
  total_gorivo_eur      numeric(10,2) not null default 0,
  total_ostalo_eur      numeric(10,2) not null default 0,
  dnevnica_location     text,                        -- enum value (PLACEHOLDER)
  dnevnica_amount_eur   numeric(10,2),               -- looked up from config by location
  payout_method         text,                        -- enum value (PLACEHOLDER)
  status                text not null default 'draft', -- 'draft' | 'submitted'
  sheet_synced_at       timestamptz,                 -- null until mirrored to Google Sheet
  retention_until       date,                        -- policy deferred; column only
  deleted_at            timestamptz,                 -- soft delete; null = live
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
```

### `receipts` — many per transfer

```sql
create table receipts (
  id              uuid primary key default gen_random_uuid(),
  transfer_id     uuid not null references transfers(id) on delete cascade,
  category        text not null,                     -- 'cestarina' | 'gorivo' | 'ostalo' | travel document categories
  native_amount   numeric(10,2) not null,
  native_currency text not null,                     -- ISO 4217
  eur_amount      numeric(10,2) not null,
  fx_rate         numeric(12,6),                     -- null if EUR
  fx_rate_date    date,
  receipt_date    date,
  vendor          text,
  photo_path      text not null,                     -- Supabase Storage key (one receipt per photo)
  confidence      jsonb,                             -- the confidence object from extraction
  raw_text        text,
  model           text,
  travel_details  jsonb,                             -- travel documents only
  confirmed       boolean not null default false,    -- did the human confirm this receipt
  created_at      timestamptz not null default now()
);
```
Note: card attribution is NOT on receipts — `petrol_card` / `visa_card` live on the `transfers` row (one manual choice per transfer), not per receipt.

### `transfer_photos` — vehicle + odometer images

```sql
create table transfer_photos (
  id            uuid primary key default gen_random_uuid(),
  transfer_id   uuid not null references transfers(id) on delete cascade,
  type          text not null,                       -- 'vehicle_hr' | 'vehicle_rotation' | 'odometer_start' | 'odometer'
  photo_path    text not null,                       -- Supabase Storage key
  extraction    jsonb,                               -- the extract_plate/odometer output
  created_at    timestamptz not null default now()
);
```

Note: a `transfer` can be `draft` (saved locally / partially synced) before `submitted`. The "last transfer" card reads the most recent `status='submitted'`, `deleted_at is null` row for the driver.

---

## 3. Supabase Storage layout

Bucket: `transfer-photos` (private; access via signed URLs from the Edge Function).

```
transfer-photos/
  {transfer_id}/
    vehicle_hr.jpg
    vehicle_rotation.jpg          (optional)
    odometer_start.jpg
    odometer.jpg
    receipt_{n}.jpg               (n = 1..10)
```

`photo_path` columns store the key relative to the bucket, e.g. `{transfer_id}/receipt_2.jpg`.

---

## 4. Dropdown enums — partial. ⚠️ TODO items are PLACEHOLDERS, DO NOT INVENT

`petrol_card` is CONFIRMED. The rest still come from the company Sheet (no access yet). **For any value still marked TODO, STOP and ask before treating it as final.**

```js
const ENUMS = {
  // CONFIRMED. First option is the "none used" sentinel; then integers 1–25.
  // Receipt footer "petrol N" maps to N. No petrol receipts → "Nisam koristio/la".
  petrol_card:   ["Nisam koristio/la", "1", "2", ..., "25"],   // none + 1..25

  // CONFIRMED. visa_card = WHICH company Visa card, labelled by whose name it is
  // registered under. MANUAL field — AI cannot read a name off a receipt.
  // ⚠️ This is its OWN list, NOT the driver roster. A card name can be shared by
  // several drivers, and some drivers have no card. Do NOT source from DRIVERS.
  visa_card:     ["Nisam koristio/la", ...VISA_CARDHOLDERS],

  // DEMO DATA. MANUAL dropdown.
  // Format "LABEL – DEVICE_ID" (en-dash, not hyphen — exact match matters).
  // Decision: manual pick, NOT AI/photo, for v1.
  enc_device:    ["Nisam koristio/la", ...ENC_DEVICES],

  payout_method: ["Gotovina", "Studentski", "Faktura"] // CONFIRMED. Required, no none-option.
  // ("Gorivo" existed in the form but is deprecated/unused — excluded.)
};

// DEMO DATA — replace with the client's real devices. Store as label+id pairs. En-dash separator.
const ENC_DEVICES = [
  "ZG 1 – 10000000001", "ZG 2 – 10000000002", "ZG 3 – 10000000003",
  "ST 1 – 10000000004", "RI 1 – 10000000005"
];

// Generate petrol_card programmatically rather than hand-listing:
// const petrol_card = ["Nisam koristio/la", ...Array.from({length: 25}, (_, i) => String(i + 1))];

// DEMO DATA — Visa cardholder names (fictional).
// These label cards, not transfer drivers. Independent of DRIVERS below.
const VISA_CARDHOLDERS = [
  "Ana Anić", "Marko Marić", "Petra Perić",
  "Luka Lukić", "Ivana Ivić", "Demo Vozač"
];

// DEMO DATA — fictional driver roster. SEPARATE list from VISA_CARDHOLDERS;
// do not merge. Becomes the auth roster at the multi-user step (F2).
// v1 does NOT use this list (single hardcoded driver) — captured so multi-user is ready.
const DRIVERS = [
  "Demo Vozač", "Ana Anić", "Marko Marić", "Petra Perić", "Luka Lukić",
  "Ivana Ivić", "Tomo Tomić", "Sara Sarić"
];

// v1 DECISION (confirmed): single hardcoded driver.
//   driver_id  = "Demo Vozač"   // who is logging — becomes session identity later
//   visa_card defaults to "Demo Vozač" (the driver's own card) — but see note.
// ⚠️ driver_id and visa_card are TWO SEPARATE fields that share a value in v1 only.
// Do NOT collapse them into one constant: visa_card is a per-transfer manual choice
// (a transfer can use someone else's card), and driver_id becomes login-derived later.
const V1_DRIVER = "Demo Vozač";

// CONFIRMED (full list, from the form DOM). Location → daily per-diem in EUR.
// 95 destinations + 2 operational zero-€ entries. Driver picks location; amount derived.
// ("Option 96" in the raw dump was a Google Forms artifact, not a location — excluded.)
const DNEVNICA = {
  "AARHUS": 200, "AMSTERDAM": 160, "BANJA LUKA": 35, "BARCELONA": 180, "BARI": 115,
  "BASEL": 115, "BEČ": 65, "BEOGRAD": 65, "BERGAMO": 80, "BERLIN": 130, "BERN": 115,
  "BILBAO": 220, "BOLOGNA": 80, "BORDEAUX": 180, "BRATISLAVA": 70, "BREMEN": 160,
  "BRISEL": 150, "BUDIMPEŠTA": 65, "CATANIA": 210, "CHERBOURG": 190, "COMO": 100,
  "DIJON": 150, "DORTMUND": 130, "DRESDEN": 115, "DUBROVNIK": 80, "DUSELDORF": 130,
  "EINDHOVEN": 160, "ESSEN": 130, "FAENZA": 80, "FIRENCA": 90, "FRANKFURT": 115,
  "FRIEDRICHSHAFEN": 100, "GDANJSK": 160, "GENEVA": 120, "GENOA": 105, "GRAZ": 35,
  "HAMBURG": 150, "HANNOVER": 130, "INNSBRUCK": 85, "KLAGENFURT": 45, "KOELN": 130,
  "KOPENHAGEN": 180, "KRAKOV": 105, "KOŠICE": 90, "KRISTIANSTADT": 200, "LA SPEZIA": 10,
  "LEIPZIG": 120, "LILLE": 165, "LINZ": 65, "LONDON": 220, "LUGANO": 95, "LYON": 130,
  "LJUBLJANA": 30, "MARSEILLE": 130, "MILANO": 90, "MUNCHEN": 80, "NAPULJ": 130,
  "NICE": 120, "NURNBERG": 95, "OSIJEK": 40, "OSLO": 240, "OSTRAVA": 100, "PALERMO": 200,
  "PARIZ": 160, "PISA": 100, "PODGORICA": 45, "POZNAN": 125, "PRAG": 100, "PULA": 40,
  "RAVENA": 80, "RHEDE": 145, "RIJEKA": 30, "RIM": 115, "ROTTERDAM": 160, "SALZBURG": 70,
  "SARAJEVO": 65, "SENJ": 40, "SISAK": 20, "SL. BROD": 30, "SPLIT": 55, "STUTTGART": 105,
  "TIVAT": 35, "TORINO": 105, "TOULOUSE": 180, "TREVISO": 65, "TRST": 45, "TUZLA": 60,
  "UDINE": 50, "VARŠAVA": 130, "VENECIJA": 65, "VERONA": 70, "ZADAR": 40, "ZURICH": 110,
  "PREUZIMANJA / POVRATI": 0, "RAD NA KUĆICAMA": 0
};
// NOTE: amounts are current snapshot. Live/maintained pricing is deferred — when the
// company owns these, move DNEVNICA to a DB table or config, not a hardcoded const.
```

`dnevnica_amount_eur` is filled by looking up the chosen `dnevnica_location` in `DNEVNICA`. The driver picks the location; the amount is derived, not typed.

### Card ↔ receipt coupling (submit-blocking validation)

Confirmed business rule — enforce at the review step, block submit on violation. Note: both cards are now **manually selected** by the driver; this rule validates the human's choice against the extracted receipts.

- `"Nisam koristio/la"` for a card ⇔ **zero receipts** of that card's type. They are coupled, not independent.
- If any receipt classifies as `gorivo` (a fuel purchase), then `petrol_card` MUST be a number (1–25), NOT `"Nisam koristio/la"`.
- If any receipt was a Visa purchase, then `visa_card` MUST be a cardholder, NOT `"Nisam koristio/la"`. (Visa-vs-other payment isn't reliably extractable — treat this as a soft warning, not a hard block, unless the driver marks a receipt as Visa-paid.)
- Conversely, `"Nisam koristio/la"` selected ⇒ no receipts tagged to that card, and that path contributes 0 to its category total.

DB note: treat `"Nisam koristio/la"` as the **no-card answer**, distinct from `null` (= not yet answered). Per the business owner: no card ⇒ no receipts, so in practice "Nisam koristio/la" behaves as null for totals — but keep the two states distinct so "unanswered" never silently reads as "none used."

---

## 5. Google Sheet mirror (column order)

When a transfer is submitted, append one row to the company Sheet in this order. Final column set depends on the real Sheet (deferred until access). Until then, mirror these:

```
transfer_date | driver_id | plate_hr | plate_rotation | odometer_km |
petrol_card | visa_card | enc_device |
total_cestarina_eur | total_gorivo_eur | total_ostalo_eur |
dnevnica_location | dnevnica_amount_eur | payout_method |
receipt_photo_urls (comma-joined signed URLs) | submitted_at
```

The odometer's eventual separate destination is **deferred** — for now it rides in this same row.
