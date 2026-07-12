-- Subcontractors need UPDATE permission on projects so that when they mark
-- a scope item as pending approval, the change syncs back to Supabase and
-- becomes visible to the contractor/superintendent in real time.
--
-- The USING clause limits the policy to rows the sub already has read access
-- to via project_access; WITH CHECK enforces the same constraint on writes.

CREATE POLICY "projects_update_granted_sub"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM project_access
      WHERE project_access.project_id = projects.id
        AND project_access.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_access
      WHERE project_access.project_id = projects.id
        AND project_access.user_id = auth.uid()
    )
  );
