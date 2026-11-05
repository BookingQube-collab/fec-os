-- Rename event crew assignment type labour → joker (FEC joker employment pool).

UPDATE public.event_staff_assignments
  SET assignment_type = 'joker'
  WHERE assignment_type = 'labour';

ALTER TABLE public.event_staff_assignments
  DROP CONSTRAINT IF EXISTS event_staff_assignments_assignment_type_check;

ALTER TABLE public.event_staff_assignments
  ADD CONSTRAINT event_staff_assignments_assignment_type_check
  CHECK (assignment_type IN ('joker', 'loaned', 'event_hire'));

COMMENT ON TABLE public.event_staff_assignments IS
  'Operational event crew (joker / loaned / event-only hire) with date ranges. Not PM team (event_team_members) and not Phase 5 resource allocations.';
