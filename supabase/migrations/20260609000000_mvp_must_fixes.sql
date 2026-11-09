-- MVP must-fix alignment:
-- - permit odometer_start photo rows
-- - permit BlaBlaCar travel documents as receipt rows
-- - keep Storage private by removing broad client read/update policies
-- - allow the single-driver dashboard to read submitted transfer summaries

-- transfer_photos.type: add odometer_start.
DO $$
DECLARE _cname text;
BEGIN
  SELECT conname INTO _cname
  FROM pg_constraint
  WHERE conrelid = 'transfer_photos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%';

  IF _cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE transfer_photos DROP CONSTRAINT %I', _cname);
  END IF;
END $$;

ALTER TABLE transfer_photos
  ADD CONSTRAINT transfer_photos_type_check
    CHECK (type IN ('vehicle_hr', 'vehicle_rotation', 'odometer_start', 'odometer'));

-- receipts.category: add blablacar to the travel document categories.
DO $$
DECLARE _cname text;
BEGIN
  SELECT conname INTO _cname
  FROM pg_constraint
  WHERE conrelid = 'receipts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%category%';

  IF _cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE receipts DROP CONSTRAINT %I', _cname);
  END IF;
END $$;

ALTER TABLE receipts
  ADD CONSTRAINT receipts_category_check
    CHECK (
      category IN (
        'cestarina',
        'gorivo',
        'ostalo',
        'avionska_karta',
        'autobusna_karta',
        'blablacar',
        'smjestaj'
      )
    );

-- Storage stays upload-only from the browser for MVP. Reads should go through
-- signed URLs later; updates/overwrites are intentionally not public.
DROP POLICY IF EXISTS "Allow transfer photo reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow transfer photo updates" ON storage.objects;

-- Dashboard monthly card: single-driver, submitted-only, live rows.
DROP POLICY IF EXISTS "mvp_demo_dashboard_select" ON transfers;
CREATE POLICY "mvp_demo_dashboard_select"
  ON transfers FOR SELECT
  TO anon, authenticated
  USING (
    driver_id = 'Demo Vozač'
    AND status = 'submitted'
    AND deleted_at IS NULL
  );
