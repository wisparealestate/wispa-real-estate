-- Create notification-related tables: alerts, requests, sent_notifications,
-- chats, conversations, messages, activities

BEGIN;

-- Alerts: user-facing notifications (inbox)
CREATE TABLE IF NOT EXISTS alerts (
  id bigserial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_alerts_user_read ON alerts(user_id, read);

-- Requests: user/property action requests (e.g., viewing requests, contact requests)
CREATE TABLE IF NOT EXISTS requests (
  id bigserial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  property_id integer REFERENCES properties(id) ON DELETE CASCADE,
  request_type text NOT NULL,
  status text DEFAULT 'pending',
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requests_user_status ON requests(user_id, status);

-- Sent notifications: records of outgoing notifications (email/SMS/push)
CREATE TABLE IF NOT EXISTS sent_notifications (
  id bigserial PRIMARY KEY,
  to_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  channel text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  success boolean DEFAULT false,
  error text,
  sent_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sent_notifications_user ON sent_notifications(to_user_id);

-- Conversations: logical grouping of messages
CREATE TABLE IF NOT EXISTS conversations (
  id bigserial PRIMARY KEY,
  subject text,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Messages: individual messages within conversations
CREATE TABLE IF NOT EXISTS messages (
  id bigserial PRIMARY KEY,
  -- conversation_id uses text to be compatible with any existing conversations.id type
  conversation_id text,
  sender_id integer REFERENCES users(id) ON DELETE SET NULL,
  recipient_id integer REFERENCES users(id) ON DELETE SET NULL,
  body text,
  attachments jsonb DEFAULT '[]'::jsonb,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at DESC);

-- Chats: lightweight chat sessions (property-level or ad-hoc)
CREATE TABLE IF NOT EXISTS chats (
  id bigserial PRIMARY KEY,
  property_id integer REFERENCES properties(id) ON DELETE CASCADE,
  participants jsonb DEFAULT '[]'::jsonb,
  last_message text,
  last_sent_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_chats_property ON chats(property_id);

-- Activities: audit / activity feed entries
CREATE TABLE IF NOT EXISTS activities (
  id bigserial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  target_type text,
  target_id bigint,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);

-- Add foreign key constraints where appropriate without validating existing rows.
-- Using NOT VALID avoids failure when legacy data may exist; you can run
-- ALTER TABLE ... VALIDATE CONSTRAINT later to enforce fully.

-- alerts.user_id -> users(id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alerts_user') THEN
    EXECUTE 'ALTER TABLE alerts ADD CONSTRAINT fk_alerts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID';
  END IF;
END$$;

-- requests.user_id -> users(id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_requests_user') THEN
    EXECUTE 'ALTER TABLE requests ADD CONSTRAINT fk_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID';
  END IF;
END$$;

-- requests.property_id -> properties(id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_requests_property') THEN
    EXECUTE 'ALTER TABLE requests ADD CONSTRAINT fk_requests_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE NOT VALID';
  END IF;
END$$;

-- sent_notifications.to_user_id -> users(id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sent_user') THEN
    EXECUTE 'ALTER TABLE sent_notifications ADD CONSTRAINT fk_sent_user FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID';
  END IF;
END$$;

-- conversations.created_by -> users(id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_user') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='created_by') THEN
      EXECUTE 'ALTER TABLE conversations ADD CONSTRAINT fk_conversations_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL NOT VALID';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='user_id') THEN
      EXECUTE 'ALTER TABLE conversations ADD CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID';
    END IF;
  END IF;
END$$;

-- messages: conversation and sender/recipient
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_conv') THEN
    EXECUTE 'ALTER TABLE messages ADD CONSTRAINT fk_messages_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE NOT VALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_sender') THEN
    EXECUTE 'ALTER TABLE messages ADD CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_recipient') THEN
    EXECUTE 'ALTER TABLE messages ADD CONSTRAINT fk_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID';
  END IF;
END$$;

-- chats.property_id -> properties(id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chats_property') THEN
    EXECUTE 'ALTER TABLE chats ADD CONSTRAINT fk_chats_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE NOT VALID';
  END IF;
END$$;

-- activities.user_id -> users(id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_activities_user') THEN
    EXECUTE 'ALTER TABLE activities ADD CONSTRAINT fk_activities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID';
  END IF;
END$$;

COMMIT;
