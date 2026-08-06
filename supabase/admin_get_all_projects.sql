-- ─── Admin: fetch all projects ───────────────────────────────────────────────
-- Run in the Supabase SQL Editor.
-- Returns every project row to admin@proscope.app, bypassing RLS.

CREATE OR REPLACE FUNCTION admin_get_all_projects()
RETURNS TABLE (data jsonb)
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
LANGUAGE plpgsql
AS $$
BEGIN
  IF (auth.jwt() ->> 'email') != 'admin@proscope.app' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY
    SELECT p.data FROM public.projects p ORDER BY p.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_all_projects() TO authenticated;
