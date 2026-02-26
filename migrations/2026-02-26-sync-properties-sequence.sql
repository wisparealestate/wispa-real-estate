-- Migration: set properties id sequence to MAX(id) to avoid conflicts after explicit id inserts
BEGIN;
SELECT setval(pg_get_serial_sequence('properties','id'), (SELECT COALESCE(MAX(id), 1) FROM properties));
COMMIT;

-- To apply:
-- psql "${DATABASE_URL}" -f migrations/2026-02-26-sync-properties-sequence.sql
