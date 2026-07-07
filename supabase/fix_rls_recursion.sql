-- Fix: infinite recursion in project_access RLS policies
-- The old policies queried the `projects` table from `project_access` policies,
-- which looped back when `projects` policies queried `project_access`.
--
-- Run this in the Supabase SQL Editor to patch the policies.

-- Drop the recursive policies
DROP POLICY IF EXISTS "access_all_owner" ON public.project_access;
DROP POLICY IF EXISTS "access_select_self" ON public.project_access;

-- Replace with non-recursive policies that only use auth.uid() directly
CREATE POLICY "access_select_participant" ON public.project_access
  FOR SELECT USING (granted_by = auth.uid() OR user_id = auth.uid());

CREATE POLICY "access_insert_owner" ON public.project_access
  FOR INSERT WITH CHECK (granted_by = auth.uid());

CREATE POLICY "access_update_owner" ON public.project_access
  FOR UPDATE USING (granted_by = auth.uid());

CREATE POLICY "access_delete_owner" ON public.project_access
  FOR DELETE USING (granted_by = auth.uid());
