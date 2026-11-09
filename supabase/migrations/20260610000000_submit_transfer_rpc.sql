-- Atomic submit RPC + admin soft-delete support

-- --------------------------------------------------------
-- submit_transfer RPC
-- Accepts a JSONB payload, validates nothing (Edge Function
-- validates), computes totals server-side, inserts all rows
-- in one transaction, is idempotent on retry.
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_transfer(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id                uuid;
  v_existing_status   text;
  v_existing_updated  timestamptz;
  v_dnevnica_eur      numeric(10,2);
  v_total_cestarina   numeric(10,2) := 0;
  v_total_gorivo      numeric(10,2) := 0;
  v_total_ostalo      numeric(10,2) := 0;
  v_total_avionska    numeric(10,2) := 0;
  v_total_autobusna   numeric(10,2) := 0;
  v_total_smjestaj    numeric(10,2) := 0;
  v_receipt           jsonb;
  v_photo             jsonb;
  v_submitted_at      timestamptz;
  v_dnevnica_map      jsonb := '{
    "AARHUS":200,"AMSTERDAM":160,"BANJA LUKA":35,"BARCELONA":180,"BARI":115,
    "BASEL":115,"BEČ":65,"BEOGRAD":65,"BERGAMO":80,"BERLIN":130,"BERN":115,
    "BILBAO":220,"BOLOGNA":80,"BORDEAUX":180,"BRATISLAVA":70,"BREMEN":160,
    "BRISEL":150,"BUDIMPEŠTA":65,"CATANIA":210,"CHERBOURG":190,"COMO":100,
    "DIJON":150,"DORTMUND":130,"DRESDEN":115,"DUBROVNIK":80,"DUSELDORF":130,
    "EINDHOVEN":160,"ESSEN":130,"FAENZA":80,"FIRENCA":90,"FRANKFURT":115,
    "FRIEDRICHSHAFEN":100,"GDANJSK":160,"GENEVA":120,"GENOA":105,"GRAZ":35,
    "HAMBURG":150,"HANNOVER":130,"INNSBRUCK":85,"KLAGENFURT":45,"KOELN":130,
    "KOPENHAGEN":180,"KRAKOV":105,"KOŠICE":90,"KRISTIANSTADT":200,"LA SPEZIA":10,
    "LEIPZIG":120,"LILLE":165,"LINZ":65,"LONDON":220,"LUGANO":95,"LYON":130,
    "LJUBLJANA":30,"MARSEILLE":130,"MILANO":90,"MUNCHEN":80,"NAPULJ":130,
    "NICE":120,"NURNBERG":95,"OSIJEK":40,"OSLO":240,"OSTRAVA":100,"PALERMO":200,
    "PARIZ":160,"PISA":100,"PODGORICA":45,"POZNAN":125,"PRAG":100,"PULA":40,
    "RAVENA":80,"RHEDE":145,"RIJEKA":30,"RIM":115,"ROTTERDAM":160,"SALZBURG":70,
    "SARAJEVO":65,"SENJ":40,"SISAK":20,"SL. BROD":30,"SPLIT":55,"STUTTGART":105,
    "TIVAT":35,"TORINO":105,"TOULOUSE":180,"TREVISO":65,"TRST":45,"TUZLA":60,
    "UDINE":50,"VARŠAVA":130,"VENECIJA":65,"VERONA":70,"ZADAR":40,"ZURICH":110,
    "PREUZIMANJA / POVRATI":0,"RAD NA KUĆICAMA":0
  }'::jsonb;
BEGIN
  v_id := (payload->>'transfer_id')::uuid;

  -- Idempotency: if already submitted for this driver, return existing summary
  SELECT status, updated_at
  INTO v_existing_status, v_existing_updated
  FROM transfers
  WHERE id = v_id
    AND driver_id = 'Demo Vozač'
    AND status = 'submitted'
    AND deleted_at IS NULL;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'transfer_id', v_id,
      'status', 'submitted',
      'submitted_at', v_existing_updated,
      'idempotent', true
    );
  END IF;

  v_submitted_at := now();

  -- Derive dnevnica_amount from server-side config (never trust client)
  v_dnevnica_eur := CASE
    WHEN payload->>'dnevnica_location' IS NOT NULL
     AND v_dnevnica_map ? (payload->>'dnevnica_location')
    THEN (v_dnevnica_map->>(payload->>'dnevnica_location'))::numeric
    ELSE NULL
  END;

  -- Recompute totals from receipt rows (ignore client-provided totals)
  FOR v_receipt IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload->'receipts', '[]'::jsonb))
  LOOP
    CASE v_receipt->>'category'
      WHEN 'cestarina' THEN
        v_total_cestarina := v_total_cestarina + COALESCE((v_receipt->>'eur_amount')::numeric, 0);
      WHEN 'gorivo' THEN
        v_total_gorivo := v_total_gorivo + COALESCE((v_receipt->>'eur_amount')::numeric, 0);
      WHEN 'ostalo' THEN
        v_total_ostalo := v_total_ostalo + COALESCE((v_receipt->>'eur_amount')::numeric, 0);
      WHEN 'avionska_karta' THEN
        v_total_avionska := v_total_avionska + COALESCE((v_receipt->>'eur_amount')::numeric, 0);
      WHEN 'autobusna_karta', 'blablacar' THEN
        v_total_autobusna := v_total_autobusna + COALESCE((v_receipt->>'eur_amount')::numeric, 0);
      WHEN 'smjestaj' THEN
        v_total_smjestaj := v_total_smjestaj + COALESCE((v_receipt->>'eur_amount')::numeric, 0);
      ELSE NULL;
    END CASE;
  END LOOP;

  v_total_cestarina := ROUND(v_total_cestarina, 2);
  v_total_gorivo    := ROUND(v_total_gorivo,    2);
  v_total_ostalo    := ROUND(v_total_ostalo,    2);
  v_total_avionska  := ROUND(v_total_avionska,  2);
  v_total_autobusna := ROUND(v_total_autobusna, 2);
  v_total_smjestaj  := ROUND(v_total_smjestaj,  2);

  -- Upsert transfers row (ON CONFLICT handles the case where a draft row exists
  -- or a previous failed attempt already wrote a partial row)
  INSERT INTO transfers (
    id, driver_id, transfer_date,
    plate_hr, plate_rotation, vehicle_model,
    odometer_km_start, odometer_km,
    route_from, route_to,
    petrol_card, visa_card, enc_device, payout_method,
    total_cestarina_eur, total_gorivo_eur, total_ostalo_eur,
    total_avionska_eur, total_autobusna_eur, total_smjestaj_eur,
    dnevnica_location, dnevnica_amount_eur,
    status, started_at, updated_at
  ) VALUES (
    v_id,
    'Demo Vozač',
    (payload->>'transfer_date')::date,
    payload->>'plate_hr',
    NULLIF(payload->>'plate_rotation', ''),
    NULLIF(payload->>'vehicle_model', ''),
    NULLIF(payload->>'odometer_km_start', '')::integer,
    (payload->>'odometer_km')::integer,
    COALESCE(NULLIF(payload->>'route_from', ''), 'Zagreb'),
    COALESCE(NULLIF(payload->>'route_to', ''), 'Zagreb'),
    payload->>'petrol_card',
    payload->>'visa_card',
    payload->>'enc_device',
    payload->>'payout_method',
    v_total_cestarina,
    v_total_gorivo,
    v_total_ostalo,
    v_total_avionska,
    v_total_autobusna,
    v_total_smjestaj,
    NULLIF(payload->>'dnevnica_location', ''),
    v_dnevnica_eur,
    'submitted',
    NULLIF(payload->>'started_at', '')::timestamptz,
    v_submitted_at
  )
  ON CONFLICT (id) DO UPDATE SET
    status               = 'submitted',
    plate_hr             = EXCLUDED.plate_hr,
    plate_rotation       = EXCLUDED.plate_rotation,
    vehicle_model        = EXCLUDED.vehicle_model,
    odometer_km_start    = EXCLUDED.odometer_km_start,
    odometer_km          = EXCLUDED.odometer_km,
    route_from           = EXCLUDED.route_from,
    route_to             = EXCLUDED.route_to,
    petrol_card          = EXCLUDED.petrol_card,
    visa_card            = EXCLUDED.visa_card,
    enc_device           = EXCLUDED.enc_device,
    payout_method        = EXCLUDED.payout_method,
    total_cestarina_eur  = EXCLUDED.total_cestarina_eur,
    total_gorivo_eur     = EXCLUDED.total_gorivo_eur,
    total_ostalo_eur     = EXCLUDED.total_ostalo_eur,
    total_avionska_eur   = EXCLUDED.total_avionska_eur,
    total_autobusna_eur  = EXCLUDED.total_autobusna_eur,
    total_smjestaj_eur   = EXCLUDED.total_smjestaj_eur,
    dnevnica_location    = EXCLUDED.dnevnica_location,
    dnevnica_amount_eur  = EXCLUDED.dnevnica_amount_eur,
    updated_at           = EXCLUDED.updated_at;

  -- Delete and re-insert transfer_photos (idempotent on retry)
  DELETE FROM transfer_photos WHERE transfer_id = v_id;
  FOR v_photo IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload->'transfer_photos', '[]'::jsonb))
  LOOP
    INSERT INTO transfer_photos (transfer_id, type, photo_path, extraction)
    VALUES (
      v_id,
      v_photo->>'type',
      v_photo->>'photo_path',
      v_photo->'extraction'
    );
  END LOOP;

  -- Delete and re-insert receipts (idempotent on retry)
  DELETE FROM receipts WHERE transfer_id = v_id;
  FOR v_receipt IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload->'receipts', '[]'::jsonb))
  LOOP
    INSERT INTO receipts (
      transfer_id, category,
      native_amount, native_currency, eur_amount,
      fx_rate, fx_rate_date, receipt_date,
      vendor, photo_path,
      confidence, raw_text, model,
      travel_details, confirmed
    ) VALUES (
      v_id,
      v_receipt->>'category',
      (v_receipt->>'native_amount')::numeric,
      COALESCE(v_receipt->>'native_currency', 'EUR'),
      (v_receipt->>'eur_amount')::numeric,
      CASE WHEN v_receipt->>'fx_rate'      IS NULL THEN NULL ELSE (v_receipt->>'fx_rate')::numeric       END,
      CASE WHEN v_receipt->>'fx_rate_date' IS NULL THEN NULL ELSE (v_receipt->>'fx_rate_date')::date     END,
      CASE WHEN v_receipt->>'receipt_date' IS NULL THEN NULL ELSE (v_receipt->>'receipt_date')::date     END,
      v_receipt->>'vendor',
      v_receipt->>'photo_path',
      v_receipt->'confidence',
      v_receipt->>'raw_text',
      COALESCE(v_receipt->>'model', 'gpt-4o'),
      v_receipt->'travel_details',
      COALESCE((v_receipt->>'confirmed')::boolean, false)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'transfer_id', v_id,
    'status', 'submitted',
    'submitted_at', v_submitted_at,
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_transfer(jsonb) TO service_role;

-- --------------------------------------------------------
-- Admin: allow service_role to soft-delete transfers
-- (RLS is bypassed by service_role anyway; grant for clarity)
-- --------------------------------------------------------
GRANT UPDATE (deleted_at, updated_at) ON transfers TO service_role;
