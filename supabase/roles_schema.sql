-- ─── Role System Migration ─────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor AFTER the base schema.sql has been applied.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE throughout).

-- ─── Organizations ─────────────────────────────────────────────────────────
-- One row per contractor company or subcontractor company.
CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('contractor', 'subcontractor')),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Contractor Org Members ────────────────────────────────────────────────
-- Links a user to a contractor org with a role.
CREATE TABLE IF NOT EXISTS public.org_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'superintendent')),
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

-- ─── Subcontractor Orgs ────────────────────────────────────────────────────
-- Links a subcontractor org to a contractor org.
CREATE TABLE IF NOT EXISTS public.contractor_subcontractors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_org_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subcontractor_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  added_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contractor_org_id, subcontractor_org_id)
);

-- ─── Subcontractor Org Members ─────────────────────────────────────────────
-- Links a user to a subcontractor org with a role.
CREATE TABLE IF NOT EXISTS public.subcontractor_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('manager', 'crew')),
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

-- ─── Invitations ───────────────────────────────────────────────────────────
-- Pending email invitations. Token is sent in the invite link.
CREATE TABLE IF NOT EXISTS public.invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token       TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE public.organizations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations             ENABLE ROW LEVEL SECURITY;

-- ── Organizations ──
-- Members of an org can read it; authenticated users can create one (onboarding)
CREATE POLICY "org_select_member" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = public.organizations.id AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.subcontractor_members
      WHERE org_id = public.organizations.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "org_insert_authenticated" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "org_update_admin" ON public.organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = public.organizations.id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );

CREATE POLICY "org_delete_admin" ON public.organizations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = public.organizations.id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- ── Org Members (contractor) ──
-- Members of the same org can see the list; admins and managers can add/remove
CREATE POLICY "orgmembers_select_sameorg" ON public.org_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.org_id = public.org_members.org_id AND om2.user_id = auth.uid()
    )
  );

CREATE POLICY "orgmembers_insert_admin_manager" ON public.org_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.org_id = public.org_members.org_id
        AND om2.user_id = auth.uid()
        AND om2.role IN ('admin', 'manager')
    )
    OR
    -- Allow first member (org creator) to insert themselves
    NOT EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.org_id = public.org_members.org_id
    )
  );

CREATE POLICY "orgmembers_delete_admin_or_self" ON public.org_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.org_id = public.org_members.org_id
        AND om2.user_id = auth.uid()
        AND om2.role = 'admin'
    )
  );

-- ── Contractor–Subcontractor Links ──
CREATE POLICY "contractorsub_select_member" ON public.contractor_subcontractors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = public.contractor_subcontractors.contractor_org_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.subcontractor_members
      WHERE org_id = public.contractor_subcontractors.subcontractor_org_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "contractorsub_insert_admin_manager" ON public.contractor_subcontractors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = public.contractor_subcontractors.contractor_org_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "contractorsub_delete_admin" ON public.contractor_subcontractors
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = public.contractor_subcontractors.contractor_org_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- ── Subcontractor Members ──
CREATE POLICY "submembers_select_sameorg" ON public.subcontractor_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.subcontractor_members sm2
      WHERE sm2.org_id = public.subcontractor_members.org_id AND sm2.user_id = auth.uid()
    )
    OR EXISTS (
      -- Contractor members can see sub members for their linked subs
      SELECT 1 FROM public.contractor_subcontractors cs
      JOIN public.org_members om ON om.org_id = cs.contractor_org_id
      WHERE cs.subcontractor_org_id = public.subcontractor_members.org_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "submembers_insert_manager" ON public.subcontractor_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.subcontractor_members sm2
      WHERE sm2.org_id = public.subcontractor_members.org_id
        AND sm2.user_id = auth.uid()
        AND sm2.role = 'manager'
    )
    OR
    NOT EXISTS (
      SELECT 1 FROM public.subcontractor_members sm2
      WHERE sm2.org_id = public.subcontractor_members.org_id
    )
  );

CREATE POLICY "submembers_delete_manager_or_self" ON public.subcontractor_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.subcontractor_members sm2
      WHERE sm2.org_id = public.subcontractor_members.org_id
        AND sm2.user_id = auth.uid()
        AND sm2.role = 'manager'
    )
  );

-- ── Invitations ──
-- Anyone can read an invitation by its token (for the accept flow)
CREATE POLICY "invitations_select_token_or_org" ON public.invitations
  FOR SELECT USING (
    invited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = public.invitations.org_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.subcontractor_members
      WHERE org_id = public.invitations.org_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "invitations_insert_admin_manager" ON public.invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = public.invitations.org_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'manager')
    )
    OR EXISTS (
      SELECT 1 FROM public.subcontractor_members
      WHERE org_id = public.invitations.org_id
        AND user_id = auth.uid()
        AND role = 'manager'
    )
  );

-- Invited user can mark their own invitation as accepted
CREATE POLICY "invitations_update_accept" ON public.invitations
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "invitations_delete_admin" ON public.invitations
  FOR DELETE USING (invited_by = auth.uid());

-- ─── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS org_members_org_id_idx        ON public.org_members(org_id);
CREATE INDEX IF NOT EXISTS org_members_user_id_idx       ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS submembers_org_id_idx         ON public.subcontractor_members(org_id);
CREATE INDEX IF NOT EXISTS submembers_user_id_idx        ON public.subcontractor_members(user_id);
CREATE INDEX IF NOT EXISTS invitations_token_idx         ON public.invitations(token);
CREATE INDEX IF NOT EXISTS invitations_email_idx         ON public.invitations(email);
CREATE INDEX IF NOT EXISTS invitations_org_id_idx        ON public.invitations(org_id);
