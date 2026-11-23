CREATE TABLE IF NOT EXISTS family_group_invitations (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  inviter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'relative',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS family_group_invitations_invitee_status_idx
  ON family_group_invitations (invitee_user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS family_group_invitations_group_idx
  ON family_group_invitations (group_id, status);

CREATE TABLE IF NOT EXISTS family_group_posts (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS family_group_posts_group_created_idx
  ON family_group_posts (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS family_group_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES family_group_posts(id) ON DELETE CASCADE,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS family_group_comments_post_created_idx
  ON family_group_comments (post_id, created_at ASC);
