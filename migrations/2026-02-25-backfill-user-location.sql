-- Backfill `location` on users from their most-recent property
-- Preference: city, then address, then state

WITH latest AS (
  SELECT DISTINCT ON (user_id) user_id,
    COALESCE(NULLIF(city,''), NULLIF(address,''), NULLIF(state,'')) AS inferred_location
  FROM properties
  WHERE user_id IS NOT NULL
  ORDER BY user_id, created_at DESC
)
UPDATE users
SET location = latest.inferred_location
FROM latest
WHERE users.id = latest.user_id
  AND (users.location IS NULL OR users.location = '');
