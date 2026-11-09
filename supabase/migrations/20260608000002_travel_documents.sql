-- Travel document support:
-- 1. Expand receipts.category to include avionska_karta | autobusna_karta | smjestaj
-- 2. Add travel_details JSONB for route, flight numbers, check-in/out dates, etc.
-- 3. Add per-type EUR totals to transfers

-- Drop existing category check (name varies by PG version / migration tool)
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
    CHECK (category IN ('cestarina', 'gorivo', 'ostalo', 'avionska_karta', 'autobusna_karta', 'smjestaj'));

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS travel_details jsonb;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS total_avionska_eur  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_autobusna_eur numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_smjestaj_eur  numeric(10,2) NOT NULL DEFAULT 0;
