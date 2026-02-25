-- Migration: create notifications table
-- Date: 2026-02-25

BEGIN;

-- Create an enum for notification categories
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_category') THEN
        CREATE TYPE notification_category AS ENUM ('all','alerts','messages','activities','sent_alert');
    END IF;
END$$;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  category notification_category NOT NULL DEFAULT 'all',
  title TEXT,
  body TEXT,
  target TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

COMMIT;

-- Down / teardown (use manually to drop)
-- BEGIN;
-- DROP TABLE IF EXISTS notifications;
-- DROP TYPE IF EXISTS notification_category;
-- COMMIT;
