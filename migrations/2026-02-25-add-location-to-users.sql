-- Add `location` column to users so admin UI can display user locations
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS location VARCHAR(255);
