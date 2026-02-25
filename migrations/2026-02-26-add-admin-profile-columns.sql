-- Add admin profile columns to admin_logins if they don't exist
ALTER TABLE admin_logins ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE admin_logins ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE admin_logins ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE admin_logins ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE admin_logins ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
