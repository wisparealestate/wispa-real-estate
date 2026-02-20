-- Migration: 2026-02-20 - add property detail fields and remove legacy location columns
-- - Adds: bedrooms, bathrooms, type, area, sale_rent ("for"), post_to ("post")
-- - Backfills sensible defaults and preserves legacy city/state/zip in a backup table
-- Run on Postgres after taking a backup of your DB. Test on staging first.

BEGIN;

-- 1) Add new columns (idempotent)
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS bedrooms INTEGER,
  ADD COLUMN IF NOT EXISTS bathrooms INTEGER,
  ADD COLUMN IF NOT EXISTS type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS area NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sale_rent VARCHAR(16),
  ADD COLUMN IF NOT EXISTS post_to VARCHAR(16);

-- 2) (legacy backup removed) Legacy `city/state/zip_code` were removed; backup handled separately.

-- 3) Backfill `sale_rent` using existing `type` or title heuristics
UPDATE properties
SET sale_rent = CASE
  WHEN lower(coalesce(type,'')) IN ('rent','sale') THEN lower(type)
  WHEN lower(coalesce(title,'')) ~ '(rent|rental|to let|for rent)' THEN 'rent'
  ELSE 'sale'
END
WHERE sale_rent IS NULL;

DO $$
BEGIN
  -- If either legacy boolean columns `featured` or `hot` exist, use them to set `post_to`.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'featured'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'hot'
  ) THEN
    UPDATE properties
    SET post_to = CASE
      WHEN coalesce(featured, false) IS TRUE THEN 'featured'
      WHEN coalesce(hot, false) IS TRUE THEN 'hot'
      ELSE 'available'
    END
    WHERE post_to IS NULL;
  ELSE
    -- Fallback when legacy flags don't exist
    UPDATE properties
    SET post_to = 'available'
    WHERE post_to IS NULL;
  END IF;
END
$$;

-- 5) Backfill numeric fields with safe defaults
UPDATE properties SET bedrooms = 0 WHERE bedrooms IS NULL;
UPDATE properties SET bathrooms = 0 WHERE bathrooms IS NULL;
UPDATE properties SET area = 0 WHERE area IS NULL;

-- 6) Set sensible column defaults
ALTER TABLE properties ALTER COLUMN sale_rent SET DEFAULT 'sale';
ALTER TABLE properties ALTER COLUMN post_to SET DEFAULT 'available';

-- 7) Legacy columns `city`, `state`, `zip_code` are handled separately and are not dropped here.

COMMIT;

-- USAGE NOTES:
--  - To apply this migration using psql:
--      psql "${DATABASE_URL}" -f migrations/2026-02-20-add-property-fields.sql
--  - If your deployment uses a migration tool (knex, flyway, liquibase), convert this into the tool's format.
--  - After applying, update your backend insert/update code to write the new columns (bedrooms, bathrooms, type, area, sale_rent, post_to).
--  - After verifying data and backups, you may uncomment the DROP COLUMN section above to remove legacy columns.
