-- Drop legacy profile_picture column from admin_logins (idempotent)
ALTER TABLE admin_logins DROP COLUMN IF EXISTS profile_picture;
-- If you rely on backups/audit, keep a snapshot before running in production.
