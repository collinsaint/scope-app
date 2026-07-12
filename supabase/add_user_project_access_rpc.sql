-- RPC: get_org_user_access
-- Returns all org members with their profile info and the set of project IDs they have access to.
-- Only callable by org admins/managers.
CREATE OR REPLACE FUNCTION get_org_user_access(p_org_id uuid)
RETURNS TABLE (
  user_id   uuid,
  role      text,
  display_name text,
  email     text,
  project_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only org admins/managers may call this
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    om.role::text,
    pr.display_name,
    pr.email,
    COALESCE(
      ARRAY(
        SELECT pa.project_id
        FROM project_access pa
        WHERE pa.user_id = om.user_id
      ),
      '{}'::uuid[]
    ) AS project_ids
  FROM org_members om
  LEFT JOIN profiles pr ON pr.id = om.user_id
  WHERE om.org_id = p_org_id
  ORDER BY om.role, pr.display_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_org_user_access(uuid) TO authenticated;


-- RPC: manage_user_project_access
-- Grants or revokes a user's access to a specific project within the org.
-- Only callable by org admins/managers.
CREATE OR REPLACE FUNCTION manage_user_project_access(
  p_org_id     uuid,
  p_user_id    uuid,
  p_project_id uuid,
  p_grant      boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only org admins/managers may call this
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Target user must belong to the same org
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Target user not in org';
  END IF;

  IF p_grant THEN
    INSERT INTO project_access (project_id, user_id, granted_by, granted_at)
    VALUES (p_project_id, p_user_id, auth.uid(), now())
    ON CONFLICT (project_id, user_id) DO NOTHING;
  ELSE
    DELETE FROM project_access
    WHERE project_id = p_project_id AND user_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION manage_user_project_access(uuid, uuid, uuid, boolean) TO authenticated;
