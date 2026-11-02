-- Revert leave HoO (ops) / HR seats that Sr. Site Supervisor Mary Wangare Muiruri
-- stamped by mistake when branch_gm granted hr.leave.manage (including the HR admin
-- final-approve path that marked every remaining pending step as approved by her).
--
-- Keeps supervisor (manager) and Sr. Site (site) stamps intact.
-- Keeps ops stamps by the real Head of Operations (acted_by <> Mary).
-- Reopens affected requests at the earliest mistaken seat so HoO / HR can approve again.
-- Removes attendance_leave_records written by the mistaken finalize.
--
-- Idempotent. Safe to re-run (already-pending Mary ops/hr rows are no-ops).

DO $$
DECLARE
  v_mary_ids uuid[];
  v_leave_ids uuid[];
  v_leave_id uuid;
  v_reopen_role text;
  v_was_approved boolean;
  v_rowcount int;
  v_steps_reset int := 0;
  v_leaves_reopened int := 0;
  v_leave_rows_deleted int := 0;
  v_roster_rows_deleted int := 0;
BEGIN
  SELECT array_agg(DISTINCT uid)
    INTO v_mary_ids
  FROM (
    SELECT s.user_id AS uid
    FROM public.staff s
    WHERE s.deleted_at IS NULL
      AND s.user_id IS NOT NULL
      AND (
        lower(btrim(s.full_name)) = 'mary wangare muiruri'
        OR upper(btrim(coalesce(s.employee_code, ''))) = 'INF-CC-VS'
        OR btrim(coalesce(s.qid, '')) IN ('29440401619', '29440401419')
      )
    UNION
    SELECT p.id AS uid
    FROM public.profiles p
    WHERE lower(btrim(coalesce(p.display_name, ''))) = 'mary wangare muiruri'
       OR upper(btrim(coalesce(p.employee_code, ''))) IN ('INF-CC-VS', '29440401619', '29440401419')
    UNION
    SELECT u.id AS uid
    FROM auth.users u
    WHERE lower(u.email) IN (
      'mary.supervisor@fec.test',
      'mary.supervisor@fec.com',
      'srsupervisor@fec.qa'
    )
  ) targets
  WHERE uid IS NOT NULL;

  IF v_mary_ids IS NULL OR cardinality(v_mary_ids) = 0 THEN
    RAISE NOTICE 'leave_revert_sr_site_mistaken_ops_hr: Mary user_id not found; skipping';
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT a.leave_id)
    INTO v_leave_ids
  FROM public.hr_leave_approvals a
  WHERE a.acted_by = ANY (v_mary_ids)
    AND a.step_role IN ('ops', 'hr')
    AND a.status IN ('approved', 'skipped');

  IF v_leave_ids IS NULL OR cardinality(v_leave_ids) = 0 THEN
    RAISE NOTICE 'leave_revert_sr_site_mistaken_ops_hr: no mistaken Mary ops/hr stamps; skipping';
    RETURN;
  END IF;

  FOREACH v_leave_id IN ARRAY v_leave_ids
  LOOP
    v_reopen_role := NULL;
    SELECT EXISTS (
      SELECT 1
      FROM public.hr_leave_requests r
      WHERE r.id = v_leave_id
        AND r.status = 'approved'
    )
      INTO v_was_approved;

    -- Prefer reopening at ops when Mary stamped HoO; otherwise legacy HR.
    IF EXISTS (
      SELECT 1
      FROM public.hr_leave_approvals a
      WHERE a.leave_id = v_leave_id
        AND a.acted_by = ANY (v_mary_ids)
        AND a.step_role = 'ops'
        AND a.status IN ('approved', 'skipped')
    ) THEN
      v_reopen_role := 'ops';
    ELSIF EXISTS (
      SELECT 1
      FROM public.hr_leave_approvals a
      WHERE a.leave_id = v_leave_id
        AND a.acted_by = ANY (v_mary_ids)
        AND a.step_role = 'hr'
        AND a.status IN ('approved', 'skipped')
    ) THEN
      v_reopen_role := 'hr';
    END IF;

    IF v_reopen_role IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.hr_leave_approvals a
    SET
      status = 'pending',
      acted_by = NULL,
      acted_at = NULL,
      comments = NULL
    WHERE a.leave_id = v_leave_id
      AND a.acted_by = ANY (v_mary_ids)
      AND a.step_role IN ('ops', 'hr')
      AND a.status IN ('approved', 'skipped');

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    v_steps_reset := v_steps_reset + v_rowcount;

    -- When Mary finalized (or her ops stamp skipped HR), undo roster leave rows.
    IF v_was_approved THEN
      DELETE FROM public.attendance_leave_records alr
      WHERE alr.hr_leave_request_id = v_leave_id
         OR (
           alr.source = 'hr_leave'
           AND alr.notes = 'hr_leave:' || v_leave_id::text
         );
      GET DIAGNOSTICS v_rowcount = ROW_COUNT;
      v_leave_rows_deleted := v_leave_rows_deleted + v_rowcount;

      -- Placeholder roster cells created only for this leave finalize (no prior shift).
      DELETE FROM public.attendance_roster_assignments ara
      USING public.hr_leave_requests r
      WHERE r.id = v_leave_id
        AND ara.staff_id = r.staff_id
        AND ara.work_date BETWEEN r.date_from AND r.date_to
        AND ara.source = 'hr_leave'
        AND ara.shift_template_id IS NULL
        AND ara.shift_start IS NULL
        AND ara.shift_end IS NULL;
      GET DIAGNOSTICS v_rowcount = ROW_COUNT;
      v_roster_rows_deleted := v_roster_rows_deleted + v_rowcount;

      UPDATE public.hr_leave_requests r
      SET
        status = 'pending',
        reviewed_by = NULL,
        reviewed_at = NULL,
        review_note = NULL,
        current_step_role = v_reopen_role,
        updated_at = now()
      WHERE r.id = v_leave_id
        AND r.status = 'approved';

      IF FOUND THEN
        v_leaves_reopened := v_leaves_reopened + 1;
      END IF;
    ELSE
      -- Mid-flight: point the waiting seat back at the earliest mistaken role.
      UPDATE public.hr_leave_requests r
      SET
        current_step_role = v_reopen_role,
        updated_at = now()
      WHERE r.id = v_leave_id
        AND r.status = 'pending'
        AND (
          r.current_step_role IS DISTINCT FROM v_reopen_role
          OR r.current_step_role IS NULL
        );
    END IF;
  END LOOP;

  RAISE NOTICE
    'leave_revert_sr_site_mistaken_ops_hr: leaves=% steps_reset=% reopened=% leave_rows_deleted=% roster_placeholder_deleted=%',
    cardinality(v_leave_ids),
    v_steps_reset,
    v_leaves_reopened,
    v_leave_rows_deleted,
    v_roster_rows_deleted;
END $$;
