-- ─── Superintendent project access ───────────────────────────────────────────
-- Goals:
--   1. Admin + manager roles → full access to all org projects (unchanged)
--   2. Superintendent role → access ONLY to projects they are assigned to
--      (via project_access, same mechanism as subcontractors)
--   3. When a superintendent is assigned in project details the app calls
--      assign_project_superintendent() to write/remove project_access rows.
--
-- Run this once in the Supabase SQL Editor.

-- ─── 1. Split projects_org_member_all ────────────────────────────────────────
-- Drop the old policy that gives every org member (incl. superintendent) access.
DROP POLICY IF EXISTS "projects_org_member_all" ON public.projects;

-- Admin and manager: full access to all projects in their org.
DROP POLICY IF EXISTS "projects_admin_manager_all" ON public.projects;
CREATE POLICY "projects_admin_manager_all" ON public.projects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = projects.org_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = projects.org_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- Superintendent role: access via project_access only.
-- The existing "projects_select_granted" and "projects_update_granted_sub"
-- policies already cover this — no additional SELECT policy needed.
-- Superintendents also need UPDATE so they can approve/reject items.
DROP POLICY IF EXISTS "projects_update_granted_superintendent" ON public.projects;
CREATE POLICY "projects_update_granted_superintendent" ON public.projects
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_access
      WHERE project_id = projects.id
        AND user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND role = 'superintendent'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_access
      WHERE project_id = projects.id
        AND user_id = auth.uid()
    )
  );

-- ─── 2. Expand profiles SELECT so contractors can look up org member names ───
-- Currently profiles are only readable by the profile owner.
-- Contractor org members need to read display_name for their superintendent
-- dropdown. Using auth_user_org_ids() (SECURITY DEFINER) avoids RLS recursion.
DROP POLICY IF EXISTS "profiles_select_org_member" ON public.profiles;
CREATE POLICY "profiles_select_org_member" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = profiles.id
        AND org_id = ANY(auth_user_org_ids())
    )
  );

-- ─── 3. RPC: assign (or reassign) a superintendent to a project ──────────────
-- Called by the frontend whenever the superintendent field changes on a project.
-- SECURITY DEFINER: bypasses RLS so it can write project_access regardless of
-- who calls it — but the caller must be a contractor admin or manager.
CREATE OR REPLACE FUNCTION public.assign_project_superintendent(
  p_project_id    text,
  p_new_user_id   uuid,
  p_old_user_id   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only contractor admin/manager can assign superintendents.
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized: only contractor admin or manager can assign superintendents';
  END IF;

  -- Remove previous superintendent's project_access entry (if changing).
  -- Only removes if they are actually a superintendent-role org member so we
  -- don't accidentally revoke a subcontractor's access.
  IF p_old_user_id IS NOT NULL AND p_old_user_id IS DISTINCT FROM p_new_user_id THEN
    DELETE FROM project_access
    WHERE project_id = p_project_id
      AND user_id = p_old_user_id
      AND EXISTS (
        SELECT 1 FROM org_members
        WHERE user_id = p_old_user_id AND role = 'superintendent'
      );
  END IF;

  -- Grant access to the new superintendent.
  IF p_new_user_id IS NOT NULL THEN
    INSERT INTO project_access (project_id, user_id, granted_by)
    VALUES (p_project_id, p_new_user_id, auth.uid())
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;
END;
$$;

-- Allow authenticated users to call this RPC (the function itself enforces authorization).
GRANT EXECUTE ON FUNCTION public.assign_project_superintendent TO authenticated;
