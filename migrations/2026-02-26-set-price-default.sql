-- Migration: set default price to 0 so inserts that omit price get sensible default
BEGIN;
ALTER TABLE properties ALTER COLUMN price SET DEFAULT 0;
COMMIT;

-- To apply:
-- psql "${DATABASE_URL}" -f migrations/2026-02-26-set-price-default.sql
