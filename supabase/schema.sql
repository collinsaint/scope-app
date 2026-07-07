-- ProScope Database Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- ─── Profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Projects ──────────────────────────────────────────────────────────────
-- `data` stores the full Project JSON (scope items, walks, notes, photos, etc.)
CREATE TABLE IF NOT EXISTS public.projects (
  id          TEXT PRIMARY KEY,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data        JSONB NOT NULL DEFAULT '{}'
);

-- ─── Project Access Grants ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_access (
  project_id  TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by  UUID NOT NULL REFERENCES auth.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- ─── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_access  ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see/update their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Projects: owner has full access
CREATE POLICY "projects_all_owner" ON public.projects
  FOR ALL USING (owner_id = auth.uid());

-- Projects: granted users can view (read-only for now)
CREATE POLICY "projects_select_granted" ON public.projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.project_access
      WHERE project_id = public.projects.id
        AND user_id = auth.uid()
    )
  );

-- Project access: owner (granted_by) can manage grants; participants can view
CREATE POLICY "access_select_participant" ON public.project_access
  FOR SELECT USING (granted_by = auth.uid() OR user_id = auth.uid());

CREATE POLICY "access_insert_owner" ON public.project_access
  FOR INSERT WITH CHECK (granted_by = auth.uid());

CREATE POLICY "access_update_owner" ON public.project_access
  FOR UPDATE USING (granted_by = auth.uid());

CREATE POLICY "access_delete_owner" ON public.project_access
  FOR DELETE USING (granted_by = auth.uid());

-- ─── Auto-create profile on signup ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'display_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── Index for faster project lookups ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS project_access_user_id_idx ON public.project_access(user_id);
