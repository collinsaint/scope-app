-- ─── Fix cross-table RLS recursion ───────────────────────────────────────────
-- contractor_subcontractors.contractorsub_select_member queries subcontractor_members,
-- which (via its own policy) queries contractor_subcontractors → infinite loop.
-- Fix: use auth_user_sub_org_ids() SECURITY DEFINER helper to break the cycle.

DROP POLICY IF EXISTS "contractorsub_select_member" ON public.contractor_subcontractors;
CREATE POLICY "contractorsub_select_member" ON public.contractor_subcontractors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = contractor_subcontractors.contractor_org_id
        AND org_members.user_id = auth.uid()
    )
    OR contractor_subcontractors.subcontractor_org_id = ANY(auth_user_sub_org_ids())
  );
