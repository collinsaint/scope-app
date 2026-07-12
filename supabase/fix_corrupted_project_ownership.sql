-- Recovery: restore owner_id and org_id for projects whose ownership was
-- corrupted when a subcontractor user's upsert overwrote these columns.
--
-- A project is "corrupted" when its current owner_id belongs to a
-- subcontractor user. We restore using project_access.granted_by, which
-- holds the contractor user who originally shared the project.
--
-- Run this once in the Supabase SQL editor. Verify with the SELECT first.

-- 1. Diagnostic — shows affected projects before you fix them.
SELECT
  p.id,
  p.name,
  p.owner_id                                     AS bad_owner_id,
  (SELECT email FROM auth.users WHERE id = p.owner_id) AS bad_owner_email,
  pa.granted_by                                  AS correct_owner_id,
  (SELECT email FROM auth.users WHERE id = pa.granted_by) AS correct_owner_email,
  om.org_id                                      AS correct_org_id
FROM projects p
JOIN LATERAL (
  SELECT granted_by FROM project_access
  WHERE project_id = p.id AND granted_by IS NOT NULL
  LIMIT 1
) pa ON true
JOIN org_members om ON om.user_id = pa.granted_by
JOIN organizations o ON o.id = om.org_id AND o.type = 'contractor'
WHERE EXISTS (
  SELECT 1 FROM subcontractor_members sm WHERE sm.user_id = p.owner_id
);

-- 2. Fix — run after confirming the diagnostic looks correct.
UPDATE projects p
SET
  owner_id = pa.granted_by,
  org_id   = om.org_id
FROM (
  SELECT DISTINCT ON (project_id) project_id, granted_by
  FROM project_access
  WHERE granted_by IS NOT NULL
  ORDER BY project_id
) pa
JOIN org_members om ON om.user_id = pa.granted_by
JOIN organizations o ON o.id = om.org_id AND o.type = 'contractor'
WHERE pa.project_id = p.id
  AND EXISTS (
    SELECT 1 FROM subcontractor_members sm WHERE sm.user_id = p.owner_id
  );
