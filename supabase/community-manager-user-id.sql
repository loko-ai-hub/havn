-- Link a community's assigned manager to a real Havn user, so the
-- management-company contact card can be derived from the user's profile +
-- organization data instead of being maintained as a separate hand-edited
-- record. Reassigning the manager updates the contact automatically.
--
-- The legacy `manager_name` column stays in place as a fallback display for
-- communities that haven't been migrated to a real user yet.

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS manager_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_communities_manager_user_id
  ON public.communities(manager_user_id);
