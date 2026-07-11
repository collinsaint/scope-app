-- ─── Admin bypass policies ──────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor after roles_schema.sql has been applied.
-- Grants admin@proscope.app full read access to all projects and invitations,
-- and allows the admin to create organizations + invitations without being
-- an org member (the normal RLS requirement).

-- ── Projects: admin can read all rows ──
DROP POLICY IF EXISTS "admin_select_all_projects" ON public.projects;
CREATE POLICY "admin_select_all_projects" ON public.projects
  FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@proscope.app');

-- ── Invitations: admin can read all ──
DROP POLICY IF EXISTS "admin_select_all_invitations" ON public.invitations;
CREATE POLICY "admin_select_all_invitations" ON public.invitations
  FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@proscope.app');

-- ── Invitations: admin can insert for any org ──
DROP POLICY IF EXISTS "admin_insert_invitations" ON public.invitations;
CREATE POLICY "admin_insert_invitations" ON public.invitations
  FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'admin@proscope.app');

-- ── Invitations: admin can delete any ──
DROP POLICY IF EXISTS "admin_delete_invitations" ON public.invitations;
CREATE POLICY "admin_delete_invitations" ON public.invitations
  FOR DELETE USING (auth.jwt() ->> 'email' = 'admin@proscope.app');

-- ── Organizations: admin can read all ──
DROP POLICY IF EXISTS "admin_select_all_orgs" ON public.organizations;
CREATE POLICY "admin_select_all_orgs" ON public.organizations
  FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@proscope.app');
