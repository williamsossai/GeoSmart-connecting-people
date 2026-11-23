ALTER TABLE family_group_invitations
  ADD COLUMN IF NOT EXISTS relationship_type TEXT NOT NULL DEFAULT 'relative';
