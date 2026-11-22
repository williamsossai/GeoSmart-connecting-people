CREATE TABLE IF NOT EXISTS family_stories (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  media_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  consent_version TEXT NOT NULL,
  consent_confirmed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS family_stories_owner_created_idx
  ON family_stories (owner_user_id, created_at DESC);
