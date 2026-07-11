-- ─── Fix infinite recursion in org_members RLS ───────────────────────────────
-- The orgmembers_select_sameorg policy queries org_members from within an
-- org_members policy, causing infinite recursion. Fix: use a SECURITY DEFINER
-- helper that bypasses RLS to break the loop.

-- Helper: returns the org IDs the current user belongs to (bypasses RLS)
CREATE OR REPLACE FUNCTION auth_user_org_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
$$;

-- Replace the recursive SELECT policy with one that calls the helper
DROP POLICY IF EXISTS "orgmembers_select_sameorg" ON public.org_members;
CREATE POLICY "orgmembers_select_sameorg" ON public.org_members
  FOR SELECT USING (org_id = ANY(auth_user_org_ids()));

-- Also fix the other policies that reference org_members recursively
DROP POLICY IF EXISTS "orgmembers_delete_admin_or_self" ON public.org_members;
CREATE POLICY "orgmembers_delete_admin_or_self" ON public.org_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR (org_id = ANY(auth_user_org_ids()) AND EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.org_id = org_members.org_id
        AND om2.user_id = auth.uid()
        AND om2.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS "orgmembers_insert_admin_manager" ON public.org_members;
CREATE POLICY "orgmembers_insert_admin_manager" ON public.org_members
  FOR INSERT WITH CHECK (
    (EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.org_id = org_members.org_id
        AND om2.user_id = auth.uid()
        AND om2.role = ANY(ARRAY['admin', 'manager'])
    ))
    OR NOT (EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.org_id = org_members.org_id
    ))
  );

-- Admin bypass for org_members
DROP POLICY IF EXISTS "admin_select_all_org_members" ON public.org_members;
CREATE POLICY "admin_select_all_org_members" ON public.org_members
  FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@proscope.app');
