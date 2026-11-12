-- Leave policy: annual entitlement tiers, sandwich defaults, GM approval seat,
-- optional is_management flag, and request policy_meta for sick→annual splits.
-- Additive only. Defaults documented in src/lib/hr-leave-policy.ts.

-- ---------------------------------------------------------------------------
-- Approval seat: add `gm` (General Manager) for sick→annual HR → GM path
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_leave_approvals
  DROP CONSTRAINT IF EXISTS hr_leave_approvals_role_chk;

ALTER TABLE public.hr_leave_approvals
  ADD CONSTRAINT hr_leave_approvals_role_chk
  CHECK (step_role IN ('manager', 'site', 'ops', 'hr', 'gm'));

COMMENT ON COLUMN public.hr_leave_approvals.step_role IS
  'Leave seats: manager (Supervisor) → site (Sr. Site) → ops (HoO/F&B); hr/gm for sick→annual follow-on and legacy.';

-- ---------------------------------------------------------------------------
-- Request metadata for policy outcomes (sandwich / sick split / tier stamp)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_leave_requests
  ADD COLUMN IF NOT EXISTS policy_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hr_leave_requests.policy_meta IS
  'Leave policy stamps: annual_tier, sandwich, sick_annual_split, linked_leave_id, approval_profile.';

-- ---------------------------------------------------------------------------
-- Optional explicit management flag (overrides title heuristics when true)
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_profile_ext
  ADD COLUMN IF NOT EXISTS is_management boolean;

COMMENT ON COLUMN public.staff_profile_ext.is_management IS
  'When true, annual leave uses management tier (30d). Null = use title/department heuristics.';

-- ---------------------------------------------------------------------------
-- Policy seeds (idempotent) — calendar year, DOJ=hire_date, sandwich=block
-- ---------------------------------------------------------------------------
INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (
  VALUES
    ('leave', 'annual_days_under_5y', '21'),
    ('leave', 'annual_days_5y_plus', '28'),
    ('leave', 'annual_days_management', '30'),
    ('leave', 'annual_tenure_years_threshold', '5'),
    ('leave', 'sandwich_block_submit', 'true'),
    (
      'leave',
      'management_title_keywords',
      '["manager","director","general manager","gm","head of","hoo","head of operations","chief"]'
    )
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);
