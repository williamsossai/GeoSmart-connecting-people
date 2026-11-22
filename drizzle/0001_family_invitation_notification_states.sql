CREATE TABLE IF NOT EXISTS family_invitation_notification_states (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  activity_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
