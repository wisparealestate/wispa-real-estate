-- Add conversations table and extend messages table for new schema
BEGIN;

-- Create conversations table if missing
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  title TEXT,
  last_message TEXT,
  updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add new columns to existing messages table when absent. This is idempotent.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS sender TEXT,
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS meta JSONB,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Populate new columns from legacy schema where appropriate
-- Copy legacy `content` into `body`
UPDATE messages SET body = content WHERE body IS NULL AND content IS NOT NULL;

-- Ensure sent_at is set for legacy rows
UPDATE messages SET sent_at = NOW() WHERE sent_at IS NULL;

-- Add a simple conversation_id for legacy rows that reference users
UPDATE messages
SET conversation_id = 'user-' || COALESCE(CAST(sender_id AS TEXT), CAST(receiver_id AS TEXT), 'unknown')
WHERE conversation_id IS NULL;

-- Add a lightweight meta JSON with legacy ids for traceability
UPDATE messages
SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('legacy_sender_id', sender_id, 'legacy_receiver_id', receiver_id)
WHERE (meta IS NULL OR meta = '{}'::jsonb) AND (sender_id IS NOT NULL OR receiver_id IS NOT NULL);

COMMIT;

-- Create an index to speed conversation lookups
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
