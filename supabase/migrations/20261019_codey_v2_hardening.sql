-- PROPOSED migration (Codey v2) — NOT applied. Review, then run in the Supabase SQL editor
-- on a staging project first. Every statement is idempotent.

-- 1. Prevent users from escalating their own profiles.role via the self-update policy.
CREATE OR REPLACE FUNCTION public.profiles_block_role_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'role cannot be changed by the user';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_block_role_change ON public.profiles;
CREATE TRIGGER profiles_block_role_change BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_block_role_change();

-- 2. Subs may update a project's JSON (pending approvals) but never its ownership columns.
CREATE OR REPLACE FUNCTION public.projects_protect_ownership()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.org_id IS DISTINCT FROM OLD.org_id)
     AND OLD.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'only the owner can change project ownership';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS projects_protect_ownership ON public.projects;
CREATE TRIGGER projects_protect_ownership BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_protect_ownership();

-- 3. Make the po-documents bucket private (app should then use createSignedUrl instead of getPublicUrl).
-- UPDATE storage.buckets SET public = false WHERE id = 'po-documents';

-- 4. Index used by the optimistic-concurrency check (id + updated_at).
CREATE INDEX IF NOT EXISTS projects_id_updated_at_idx ON public.projects (id, updated_at);
