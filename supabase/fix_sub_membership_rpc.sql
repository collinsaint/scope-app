-- ─── Reliable sub-membership lookup for current user ─────────────────────────
-- The join in useCurrentUser (subcontractor_members + organizations) can fail
-- silently when RLS on subcontractor_members causes infinite recursion.
-- This SECURITY DEFINER function bypasses RLS so the frontend always gets
-- accurate sub org + role data for the logged-in user.
--
-- Also re-applies the RLS fixes from fix_subcontractor_members_rls.sql and
-- fix_org_members_rls.sql to ensure they're in effect.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Helper: returns sub-org IDs the current user belongs to (bypasses RLS)
CREATE OR REPLACE FUNCTION auth_user_sub_org_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(SELECT org_id FROM public.subcontractor_members WHERE user_id = auth.uid())
$$;

-- 2. Helper: returns contractor org IDs the current user belongs to (bypasses RLS)
CREATE OR REPLACE FUNCTION auth_user_org_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
$$;

-- 3. Fix subcontractor_members SELECT policy (remove recursive self-join)
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

-- 4. Fix org_members SELECT policy (remove recursive self-join)
DROP POLICY IF EXISTS "orgmembers_select_sameorg" ON public.org_members;
CREATE POLICY "orgmembers_select_sameorg" ON public.org_members
  FOR SELECT USING (org_id = ANY(auth_user_org_ids()));

-- 5. Admin bypass for sub_members (re-apply in case it was dropped)
DROP POLICY IF EXISTS "admin_select_all_sub_members" ON public.subcontractor_members;
CREATE POLICY "admin_select_all_sub_members" ON public.subcontractor_members
  FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@proscope.app');

-- 6. RPC: get current user's sub-org membership (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION get_my_sub_membership()
RETURNS TABLE(org_id uuid, org_name text, org_type text, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sm.org_id, o.name, o.type, sm.role
  FROM public.subcontractor_members sm
  JOIN public.organizations o ON o.id = sm.org_id
  WHERE sm.user_id = auth.uid()
  LIMIT 1
$$;
