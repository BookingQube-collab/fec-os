-- Extend staff employment_type for attendance shift rules:
-- permanent (9h), secondment (10h), joker (10h). Keep temporary for legacy rows.
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_employment_type_chk;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_employment_type_chk
  CHECK (
    employment_type IS NULL
    OR employment_type IN ('permanent', 'temporary', 'secondment', 'joker')
  );
