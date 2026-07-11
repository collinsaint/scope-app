-- ─── Test Accounts ────────────────────────────────────────────────────────────
-- Creates 4 test users covering every role except dev admin and contractor admin.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- Accounts created:
--   manager      (manager@proscope.app)    — contractor manager       at Partners in Construction
--   super        (super@proscope.app)      — contractor superintendent at Partners in Construction
--   submanager   (submanager@proscope.app) — subcontractor manager    at Test Sub Co
--   crew         (crew@proscope.app)       — subcontractor crew       at Test Sub Co
--
-- Password for all accounts: password
-- Sign in with just the username (manager, super, submanager, crew) or full email.
--
-- Job assignment:
--   "Test Super"   is added to the org superintendent list → appears in Project Details dropdown
--   "Test Sub Co"  is added to globalSubcontractors for manager + super accounts → appears in
--                  the subcontractor assignment list on walks
--   Crew members access projects via their subcontractor org (Test Sub Co)
-- ──────────────────────────────────────────────────────────────────────────────

-- Contractor org ID (Partners in Construction)
DO $$
DECLARE
  contractor_org_id uuid := '9c78bfcb-5209-4c50-a0b0-a5e28bca2029';
  sub_org_id        uuid;

  manager_id  uuid := gen_random_uuid();
  super_id    uuid := gen_random_uuid();
  submgr_id   uuid := gen_random_uuid();
  crew_id     uuid := gen_random_uuid();

  sub_co_entry jsonb := '[{"id":"test-sub-co-001","name":"Test Sub Co","percentage":null}]';
BEGIN

  -- ── 1. Create a test subcontractor org ────────────────────────────────────
  INSERT INTO public.organizations (id, name, type, created_at)
  VALUES (gen_random_uuid(), 'Test Sub Co', 'subcontractor', now())
  ON CONFLICT DO NOTHING
  RETURNING id INTO sub_org_id;

  -- If the org already existed, look it up
  IF sub_org_id IS NULL THEN
    SELECT id INTO sub_org_id FROM public.organizations WHERE name = 'Test Sub Co' AND type = 'subcontractor';
  END IF;

  -- Link Test Sub Co to Partners in Construction
  INSERT INTO public.contractor_subcontractors (contractor_org_id, subcontractor_org_id, added_at)
  VALUES (contractor_org_id, sub_org_id, now())
  ON CONFLICT DO NOTHING;

  -- ── 2. Create auth users ─────────────────────────────────────────────────
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES
    (manager_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'manager@proscope.app', crypt('password', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"display_name":"Test Manager"}',
     now(), now()),
    (super_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'super@proscope.app', crypt('password', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"display_name":"Test Super"}',
     now(), now()),
    (submgr_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'submanager@proscope.app', crypt('password', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"display_name":"Test Sub Manager"}',
     now(), now()),
    (crew_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'crew@proscope.app', crypt('password', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"display_name":"Test Crew"}',
     now(), now())
  ON CONFLICT (email) DO NOTHING;

  -- Re-fetch IDs in case users already existed
  SELECT id INTO manager_id FROM auth.users WHERE email = 'manager@proscope.app';
  SELECT id INTO super_id   FROM auth.users WHERE email = 'super@proscope.app';
  SELECT id INTO submgr_id  FROM auth.users WHERE email = 'submanager@proscope.app';
  SELECT id INTO crew_id    FROM auth.users WHERE email = 'crew@proscope.app';

  -- ── 3. Create identity records (required for email/password sign-in) ──────
  INSERT INTO auth.identities (id, user_id, provider, identity_data, created_at, updated_at)
  VALUES
    (gen_random_uuid(), manager_id, 'email',
     json_build_object('sub', manager_id::text, 'email', 'manager@proscope.app'), now(), now()),
    (gen_random_uuid(), super_id, 'email',
     json_build_object('sub', super_id::text, 'email', 'super@proscope.app'), now(), now()),
    (gen_random_uuid(), submgr_id, 'email',
     json_build_object('sub', submgr_id::text, 'email', 'submanager@proscope.app'), now(), now()),
    (gen_random_uuid(), crew_id, 'email',
     json_build_object('sub', crew_id::text, 'email', 'crew@proscope.app'), now(), now())
  ON CONFLICT DO NOTHING;

  -- ── 4. Assign contractor org memberships ─────────────────────────────────
  INSERT INTO public.org_members (org_id, user_id, role, joined_at)
  VALUES
    (contractor_org_id, manager_id, 'manager',       now()),
    (contractor_org_id, super_id,   'superintendent', now())
  ON CONFLICT (org_id, user_id) DO NOTHING;

  -- ── 5. Assign subcontractor org memberships ───────────────────────────────
  INSERT INTO public.subcontractor_members (org_id, user_id, role, joined_at)
  VALUES
    (sub_org_id, submgr_id, 'manager', now()),
    (sub_org_id, crew_id,   'crew',    now())
  ON CONFLICT (org_id, user_id) DO NOTHING;

  -- ── 6. Add "Test Super" to org superintendent list ────────────────────────
  -- Appends to the existing superintendents array in org_settings so "Test Super"
  -- appears in the superintendent dropdown on Project Details.
  UPDATE public.org_settings
  SET data = jsonb_set(
    data,
    '{superintendents}',
    (data->'superintendents') || '[{"id":"test-super-001","name":"Test Super"}]'::jsonb
  ),
  updated_at = now()
  WHERE org_id = contractor_org_id
    AND NOT (data->'superintendents' @> '[{"id":"test-super-001"}]');

  -- ── 7. Seed globalSubcontractors for manager + super accounts ────────────
  -- Both contractor accounts get "Test Sub Co" so it appears in the subcontractor
  -- assignment list on walks from day one (without needing to add it via settings).
  INSERT INTO public.user_settings (user_id, data, updated_at)
  VALUES
    (manager_id, jsonb_build_object('globalSubcontractors', sub_co_entry, 'walkPresets', '[]'::jsonb), now()),
    (super_id,   jsonb_build_object('globalSubcontractors', sub_co_entry, 'walkPresets', '[]'::jsonb), now())
  ON CONFLICT (user_id) DO UPDATE
    SET data = public.user_settings.data || jsonb_build_object('globalSubcontractors', sub_co_entry),
        updated_at = now();

END $$;
