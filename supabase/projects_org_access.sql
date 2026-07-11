-- ─── Org-based project access ────────────────────────────────────────────────
-- Adds org_id to projects so an entire org can access shared projects.

-- 1. Add org_id column
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

-- 2. Assign the two existing projects to Partners in Construction
UPDATE public.projects
SET org_id = '9c78bfcb-5209-4c50-a0b0-a5e28bca2029'
WHERE id IN ('l68ws0yv', '6qpd0056');

-- 3. RLS: any member of the project's org gets full access
DROP POLICY IF EXISTS "projects_org_member_all" ON public.projects;
CREATE POLICY "projects_org_member_all" ON public.projects
  FOR ALL USING (
    org_id IS NOT NULL AND org_id = ANY(auth_user_org_ids())
  )
  WITH CHECK (
    org_id IS NOT NULL AND org_id = ANY(auth_user_org_ids())
  );
