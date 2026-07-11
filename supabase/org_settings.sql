-- ─── Org-level settings table ───────────────────────────────────────────────
-- Stores shared settings (jobGroups, superintendents) per organization.

CREATE TABLE IF NOT EXISTS public.org_settings (
  org_id     uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's settings
CREATE POLICY "org_settings_select_member" ON public.org_settings
  FOR SELECT USING (org_id = ANY(auth_user_org_ids()));

-- Org members can write (upsert handled by INSERT + UPDATE)
CREATE POLICY "org_settings_insert_member" ON public.org_settings
  FOR INSERT WITH CHECK (org_id = ANY(auth_user_org_ids()));

CREATE POLICY "org_settings_update_member" ON public.org_settings
  FOR UPDATE USING (org_id = ANY(auth_user_org_ids()));

-- Dev admin full access
CREATE POLICY "org_settings_admin" ON public.org_settings
  FOR ALL USING ((auth.jwt() ->> 'email') = 'admin@proscope.app');

-- ── Transfer Partners in Construction data ──────────────────────────────────
INSERT INTO public.org_settings (org_id, data)
VALUES (
  '9c78bfcb-5209-4c50-a0b0-a5e28bca2029',
  '{
    "jobGroups": [
      {"id": "ohhqx95fbomredqv7x", "name": "BDO - Pinellas Recovers"},
      {"id": "ym9umudv69gmrf751r7", "name": "BDO - Lee Cares"}
    ],
    "superintendents": [
      {"id": "eysr5nn8k26mredr6lv", "name": "Stephen B"},
      {"id": "i7lteszqubmrf760td", "name": "Trevor Riley"}
    ]
  }'::jsonb
)
ON CONFLICT (org_id) DO UPDATE
  SET data = EXCLUDED.data, updated_at = now();

-- ── Remove jobGroups + superintendents from admin's personal user_settings ──
UPDATE public.user_settings
SET data       = data - 'jobGroups' - 'superintendents',
    updated_at = now()
WHERE user_id = 'd6f88820-592f-4d88-ba17-20d8e7eeaff9';
