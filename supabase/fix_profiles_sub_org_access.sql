-- ─── Allow sub org members to see each other's profiles ──────────────────────
-- profiles_select_own only lets users see their own row.
-- Sub managers need to see crew profiles; contractors need to see sub member profiles.
-- ──────────────────────────────────────────────────────────────────────────────

-- Sub org members can see profiles of users in the same sub org
DROP POLICY IF EXISTS "profiles_select_same_sub_org" ON public.profiles;
CREATE POLICY "profiles_select_same_sub_org" ON public.profiles
  FOR SELECT USING (
    id = ANY(
      SELECT user_id FROM public.subcontractor_members
      WHERE org_id = ANY(auth_user_sub_org_ids())
    )
  );

-- Contractor org members can see profiles of sub org members in their linked subs
DROP POLICY IF EXISTS "profiles_select_linked_sub_members" ON public.profiles;
CREATE POLICY "profiles_select_linked_sub_members" ON public.profiles
  FOR SELECT USING (
    id = ANY(
      SELECT sm.user_id
      FROM public.subcontractor_members sm
      JOIN public.contractor_subcontractors cs ON cs.subcontractor_org_id = sm.org_id
      WHERE cs.contractor_org_id = ANY(auth_user_org_ids())
    )
  );

-- Admin bypass
DROP POLICY IF EXISTS "admin_select_all_profiles" ON public.profiles;
CREATE POLICY "admin_select_all_profiles" ON public.profiles
  FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@proscope.app');

-- ─── SECURITY DEFINER RPC: load crew list for a sub org ──────────────────────
-- Used by SubcontractorSettingsView so a submanager can always read all crew
-- profiles without depending on RLS policy chaining.
CREATE OR REPLACE FUNCTION get_sub_org_crew(p_org_id uuid)
RETURNS TABLE(
  member_id   uuid,
  user_id     uuid,
  role        text,
  email       text,
  display_name text,
  language    text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sm.id          AS member_id,
    sm.user_id,
    sm.role,
    p.email,
    p.display_name,
    COALESCE(p.language, 'en') AS language
  FROM public.subcontractor_members sm
  JOIN public.profiles p ON p.id = sm.user_id
  WHERE sm.org_id = p_org_id
    AND (
      -- caller must be in this org OR be a contractor member of the linked org
      p_org_id = ANY(auth_user_sub_org_ids())
      OR EXISTS (
        SELECT 1
        FROM public.contractor_subcontractors cs
        WHERE cs.subcontractor_org_id = p_org_id
          AND cs.contractor_org_id = ANY(auth_user_org_ids())
      )
      OR auth.jwt() ->> 'email' = 'admin@proscope.app'
    )
  ORDER BY sm.role DESC, p.email;
$$;
