-- ─── Admin user management functions ────────────────────────────────────────
-- Run this in the Supabase SQL Editor after admin_policies.sql
-- These functions bypass RLS using SECURITY DEFINER, but check the caller
-- is admin@proscope.app before doing anything.

-- ── Get all org members with email from auth.users ──
CREATE OR REPLACE FUNCTION admin_get_users()
RETURNS TABLE (
  user_id      uuid,
  email        text,
  org_id       uuid,
  org_name     text,
  org_type     text,
  role         text,
  joined_at    timestamptz,
  last_sign_in timestamptz
)
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
  IF (auth.jwt() ->> 'email') != 'admin@proscope.app' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
    SELECT
      om.user_id,
      au.email::text,
      om.org_id,
      o.name::text   AS org_name,
      o.type::text   AS org_type,
      om.role::text,
      om.joined_at,
      au.last_sign_in_at AS last_sign_in
    FROM public.org_members om
    JOIN auth.users        au ON au.id  = om.user_id
    JOIN public.organizations o ON o.id = om.org_id
    ORDER BY om.joined_at DESC;
END;
$$;

-- ── Update a user's role in their org ──
CREATE OR REPLACE FUNCTION admin_update_user_role(target_user_id uuid, new_role text)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF (auth.jwt() ->> 'email') != 'admin@proscope.app' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.org_members SET role = new_role WHERE user_id = target_user_id;
END;
$$;

-- ── Delete a user (removes org membership + auth account) ──
CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
  IF (auth.jwt() ->> 'email') != 'admin@proscope.app' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM public.org_members WHERE user_id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Grant execute to authenticated role (the functions enforce admin-only internally)
GRANT EXECUTE ON FUNCTION admin_get_users() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_user(uuid) TO authenticated;
