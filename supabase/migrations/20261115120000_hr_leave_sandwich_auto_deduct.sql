-- Leave Policy (HR email): OFF+AL+OFF sandwich auto-deducts OFF days from annual.
-- Flip prior safer default (block submit) to PDF sample behavior (auto-deduct).

UPDATE public.hr_policy_settings
SET value = 'false'::jsonb,
    updated_at = now()
WHERE company_id IS NULL
  AND section = 'leave'
  AND key = 'sandwich_block_submit';

INSERT INTO public.hr_policy_settings (company_id, section, key, value)
SELECT NULL, v.section, v.key, v.value::jsonb
FROM (
  VALUES
    ('leave', 'sandwich_block_submit', 'false'),
    ('leave', 'sandwich_auto_deduct', 'true')
) AS v(section, key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_policy_settings p
  WHERE p.company_id IS NULL AND p.section = v.section AND p.key = v.key
);

COMMENT ON TABLE public.hr_policy_settings IS
  'HR policy key/values. Leave sandwich: sandwich_block_submit=false + sandwich_auto_deduct=true charges unauthorized OFF+AL+OFF to annual (HR Leave Policy email).';
