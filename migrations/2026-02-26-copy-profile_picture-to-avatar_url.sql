-- Copy profile_picture -> avatar_url for admin_logins (idempotent)
-- Ensures `avatar_url` column exists, then copies values from legacy `profile_picture` where avatar_url is empty
ALTER TABLE admin_logins ADD COLUMN IF NOT EXISTS avatar_url TEXT;
UPDATE admin_logins SET avatar_url = profile_picture
 WHERE (avatar_url IS NULL OR avatar_url = '') AND profile_picture IS NOT NULL;
-- Optionally leave legacy column intact for audit; this migration is safe to run multiple times.
