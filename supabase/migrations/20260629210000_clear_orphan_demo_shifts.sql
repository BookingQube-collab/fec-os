-- Remove demo seed shifts that lost staff links after staff directory replace.
-- Roster-generated shifts always set staff_id. Orphan rows are stale demo data.

DELETE FROM public.shifts
WHERE staff_id IS NULL;