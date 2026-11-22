-- Community connection sharing is not exposed in the current app.
-- Keep saved community records private rather than carrying forward inactive
-- Shared/Public selections into a future sharing surface.
UPDATE person_communities SET visibility = 'private' WHERE visibility <> 'private';
UPDATE communities SET visibility = 'private' WHERE visibility <> 'private';
