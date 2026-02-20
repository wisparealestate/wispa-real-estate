-- Migration: 2026-02-20 - drop legacy location columns (city, state, zip_code)
-- This assumes you already created a backup table `properties_legacy_location_backup` in a previous migration.
-- Verify backup exists before applying.

BEGIN;

-- Verify backup exists (this will not fail the script, simply warn in a client)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'properties_legacy_location_backup') THEN
    RAISE NOTICE 'Backup table properties_legacy_location_backup does not exist. Proceed only if you have a backup elsewhere.';
  ELSE
    RAISE NOTICE 'Found properties_legacy_location_backup. Proceeding to drop legacy columns.';
  END IF;
END$$;

-- Drop legacy columns from properties table
ALTER TABLE properties
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS zip_code;

COMMIT;

-- Usage:
-- psql "${DATABASE_URL}" -f migrations/2026-02-20-drop-legacy-location-columns.sql

-- IMPORTANT: Only run this after confirming that `properties_legacy_location_backup` contains the data you need.
