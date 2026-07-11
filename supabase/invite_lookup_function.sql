-- ─── Public invite lookup function ───────────────────────────────────────────
-- Allows unauthenticated users to look up an invite by token.
-- SECURITY DEFINER bypasses RLS — safe because the token is a random UUID
-- and we only return data for that exact token.

CREATE OR REPLACE FUNCTION get_invite_by_token(invite_token text)
RETURNS TABLE (
  id         uuid,
  email      text,
  org_id     uuid,
  role       text,
  invited_by uuid,
  expires_at timestamptz,
  org_type   text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    SELECT
      i.id,
      i.email,
      i.org_id,
      i.role,
      i.invited_by,
      i.expires_at,
      o.type::text AS org_type
    FROM public.invitations i
    JOIN public.organizations o ON o.id = i.org_id
    WHERE i.token = invite_token
      AND i.accepted_at IS NULL;
END;
$$;

-- Grant to anon so unauthenticated users can call it
GRANT EXECUTE ON FUNCTION get_invite_by_token(text) TO anon, authenticated;
