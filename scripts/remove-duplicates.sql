-- Preview duplicate property groups (no changes)
-- Run this first to inspect candidate duplicates
SELECT lower(trim(coalesce(title,''))) AS title_norm,
       lower(trim(coalesce(address,''))) AS addr_norm,
       coalesce(price,0) AS price_norm,
       array_agg(id ORDER BY created_at ASC) AS ids,
       count(*) AS cnt
FROM properties
GROUP BY title_norm, addr_norm, price_norm
HAVING count(*) > 1
ORDER BY cnt DESC;

-- Backup duplicate rows into properties_backup (create table if missing)
CREATE TABLE IF NOT EXISTS properties_backup (LIKE properties INCLUDING ALL);

WITH dup AS (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(trim(coalesce(title,''))), lower(trim(coalesce(address,''))), coalesce(price,0) ORDER BY created_at ASC) AS rn
    FROM properties
  ) t WHERE rn > 1
)
INSERT INTO properties_backup
SELECT p.* FROM properties p JOIN dup d ON p.id = d.id;

-- Clear images for duplicate properties and delete the duplicate properties
BEGIN;
WITH dup AS (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(trim(coalesce(title,''))), lower(trim(coalesce(address,''))), coalesce(price,0) ORDER BY created_at ASC) AS rn
    FROM properties
  ) t WHERE rn > 1
)
-- remove photos for duplicates
UPDATE properties SET images = '[]'::jsonb WHERE id IN (SELECT id FROM dup);
-- remove duplicate properties themselves
DELETE FROM properties WHERE id IN (SELECT id FROM dup);
COMMIT;

-- Remove exact duplicate photo rows for the same property (keeps one row)
-- Legacy `property_photos` cleanup is no longer required; images are stored on properties.images
