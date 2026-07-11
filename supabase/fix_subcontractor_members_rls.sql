-- ─── Fix infinite recursion in subcontractor_members RLS ─────────────────────
-- Same pattern as fix_org_members_rls.sql: policies that query
-- subcontractor_members from within a subcontractor_members policy cause
-- infinite recursion. Fix with a SECURITY DEFINER helper that bypasses RLS.

-- Helper: returns sub-org IDs the current user belongs to (bypasses RLS)
CREATE OR REPLACE FUNCTION auth_user_sub_org_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(SELECT org_id FROM public.subcontractor_members WHERE user_id = auth.uid())
$$;

-- Replace recursive SELECT policy
DROP POLICY IF EXISTS "submembers_select_sameorg" ON public.subcontractor_members;
CREATE POLICY "submembers_select_sameorg" ON public.subcontractor_members
  FOR SELECT USING (
    org_id = ANY(auth_user_sub_org_ids())
    OR EXISTS (
      SELECT 1
      FROM contractor_subcontractors cs
      JOIN org_members om ON om.org_id = cs.contractor_org_id
      WHERE cs.subcontractor_org_id = subcontractor_members.org_id
        AND om.user_id = auth.uid()
    )
  );

-- Replace recursive DELETE policy
DROP POLICY IF EXISTS "submembers_delete_manager_or_self" ON public.subcontractor_members;
CREATE POLICY "submembers_delete_manager_or_self" ON public.subcontractor_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.subcontractor_members sm2
      WHERE sm2.org_id = subcontractor_members.org_id
        AND sm2.user_id = auth.uid()
        AND sm2.role = 'manager'
    )
  );

-- Replace recursive INSERT policy
DROP POLICY IF EXISTS "submembers_insert_manager" ON public.subcontractor_members;
CREATE POLICY "submembers_insert_manager" ON public.subcontractor_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.subcontractor_members sm2
      WHERE sm2.org_id = subcontractor_members.org_id
        AND sm2.user_id = auth.uid()
        AND sm2.role = 'manager'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.subcontractor_members sm2
      WHERE sm2.org_id = subcontractor_members.org_id
    )
  );

-- Admin bypass
DROP POLICY IF EXISTS "admin_select_all_sub_members" ON public.subcontractor_members;
CREATE POLICY "admin_select_all_sub_members" ON public.subcontractor_members
  FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@proscope.app');
