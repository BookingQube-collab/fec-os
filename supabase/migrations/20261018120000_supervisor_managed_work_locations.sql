-- Venue / Site Supervisor + F&B Manager dedicated work sites for location chips.
-- Attendance / roster / team overview use staff.location_id + staff_work_locations
-- (not punch history). Seed this estate when prod work sites are empty.
--
-- Matrix:
--   Ashfaq  → INF-CC, KDS-CC, CAR-AP
--   Romel   → CB-DSM
--   Rosebelt→ CB-VM
--   Waqar   → KDS-DM, UA-DM, INF-CC
--   Ruben   → INF-CC, KDS-CC, UA-DM (F&B Manager)
--
-- Idempotent: inserts missing (staff_id, location_id) pairs only.
-- Does not change staff.location_id (home) or delete existing work sites.

DO $$
DECLARE
  v_name text;
  v_employee_codes text[];
  v_location_codes text[];
  v_staff_id uuid;
  v_loc_id uuid;
  v_code text;
BEGIN
  FOR v_name, v_employee_codes, v_location_codes IN
    SELECT *
    FROM (
      VALUES
        ('ashfaq noori', ARRAY['KDS-CC-VS', '29735603636']::text[], ARRAY['INF-CC', 'KDS-CC', 'CAR-AP']::text[]),
        ('romel chavez pusung', ARRAY['CB-DSM-VS', '28360804725']::text[], ARRAY['CB-DSM']::text[]),
        ('rosebelt fatal', ARRAY['CB-VM-BM2', 'CB-VM-VS', '29660806855', '29660800835']::text[], ARRAY['CB-VM']::text[]),
        ('waqar asghar', ARRAY['UA-DM-VS', '29658611062']::text[], ARRAY['KDS-DM', 'UA-DM', 'INF-CC']::text[]),
        ('ruben yaralyan', ARRAY['FB-1']::text[], ARRAY['INF-CC', 'KDS-CC', 'UA-DM']::text[])
    ) AS t(name_needle, employee_codes, location_codes)
  LOOP
    FOR v_staff_id IN
      SELECT s.id
      FROM public.staff s
      WHERE s.deleted_at IS NULL
        AND (
          lower(btrim(s.full_name)) = v_name
          OR upper(btrim(coalesce(s.employee_code, ''))) = ANY (
            SELECT upper(btrim(c)) FROM unnest(v_employee_codes) AS c
          )
          OR btrim(coalesce(s.qid, '')) = ANY (v_employee_codes)
        )
    LOOP
      FOREACH v_code IN ARRAY v_location_codes
      LOOP
        SELECT l.id
          INTO v_loc_id
        FROM public.locations l
        WHERE upper(btrim(l.code)) = upper(btrim(v_code))
          AND l.status = 'active'
        LIMIT 1;

        IF v_loc_id IS NULL THEN
          RAISE NOTICE 'supervisor work site skip: location % missing for %', v_code, v_name;
          CONTINUE;
        END IF;

        INSERT INTO public.staff_work_locations (staff_id, location_id)
        VALUES (v_staff_id, v_loc_id)
        ON CONFLICT (staff_id, location_id) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
