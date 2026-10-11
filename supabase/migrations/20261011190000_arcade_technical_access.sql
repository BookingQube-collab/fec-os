-- Arcade Technical access.
-- FEC technicians, supervisors, and non-F&B managers may use a branch they are assigned to.
-- F&B managers are excluded from Arcade Technical.
-- Head of Operations is super admin: role level at least 80, every branch.
-- Keep aligned with src/lib/arcade/access.ts.

CREATE OR REPLACE FUNCTION public.arcade_text_is_food_beverage(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_text, '') ~* '(f[[:space:]]*&[[:space:]]*b|f[[:space:]]+and[[:space:]]+b|\mfnb\M|food[[:space:]]*(&|and)[[:space:]]*beverage)';
$$;

CREATE OR REPLACE FUNCTION public.arcade_text_has_word(p_text text, p_word text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_text, '') ~* ('(^|[^[:alpha:]])' || p_word || '($|[^[:alpha:]])');
$$;

CREATE OR REPLACE FUNCTION public.arcade_is_fnb_manager(p_title text, p_department text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
      public.arcade_text_has_word(p_title, 'manager')
      OR public.arcade_text_has_word(p_department, 'manager')
    )
    AND (
      public.arcade_text_is_food_beverage(p_title)
      OR public.arcade_text_is_food_beverage(p_department)
    );
$$;

CREATE OR REPLACE FUNCTION public.arcade_is_fec_technician(p_title text, p_staff_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_staff_role = 'technician'
    OR COALESCE(p_title, '') ~* '(^|[^[:alpha:]])(fec[[:space:]]+arcade|fec|arcade)[[:space:]]+technician($|[^[:alpha:]])';
$$;

CREATE OR REPLACE FUNCTION public.arcade_is_supervisor(p_title text, p_staff_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_staff_role = 'venue_supervisor'
    OR public.arcade_text_has_word(p_title, 'supervisor');
$$;

CREATE OR REPLACE FUNCTION public.staff_row_is_arcade_technical(p_title text, p_staff_role text, p_department text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.arcade_is_fec_technician(p_title, p_staff_role)
    OR public.arcade_is_supervisor(p_title, p_staff_role)
    OR (
      (
        public.arcade_text_has_word(p_title, 'manager')
        OR public.arcade_text_has_word(p_department, 'manager')
      )
      AND NOT public.arcade_is_fnb_manager(p_title, p_department)
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role_level()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE((
      SELECT MAX(role_level)
      FROM public.user_roles
      WHERE user_id = auth.uid()
    ), 0),
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.user_id = auth.uid()
          AND s.deleted_at IS NULL
          AND COALESCE(s.job_title, '') ~* 'head of operations'
      ) THEN 80
      ELSE 0
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_location(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role_level() >= 80
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND _location_id = ANY(location_ids)
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_fnb_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.deleted_at IS NULL
      AND public.arcade_is_fnb_manager(s.job_title, s.department)
  );
$$;

CREATE OR REPLACE FUNCTION public.arcade_fnb_manager_blocked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_fnb_manager()
    AND public.current_user_role_level() < 80;
$$;

CREATE OR REPLACE FUNCTION public.staff_has_arcade_technical_at(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.deleted_at IS NULL
      AND public.staff_row_is_arcade_technical(s.job_title, s.staff_role::text, s.department)
      AND (
        s.location_id = _location_id
        OR EXISTS (
          SELECT 1
          FROM public.staff_work_locations w
          WHERE w.staff_id = s.id
            AND w.location_id = _location_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_arcade(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.arcade_fnb_manager_blocked() THEN false
    WHEN public.current_user_role_level() >= 80 THEN true
    WHEN public.user_can_access_location(_location_id) THEN true
    WHEN public.staff_has_arcade_technical_at(_location_id) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_operate_arcade(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.arcade_fnb_manager_blocked() THEN false
    WHEN public.current_user_role_level() >= 30 AND public.user_can_access_location(_location_id) THEN true
    WHEN public.staff_has_arcade_technical_at(_location_id) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_holds_arcade_operate()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.arcade_fnb_manager_blocked()
    AND (
      public.current_user_role_level() >= 30
      OR EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.user_id = auth.uid()
          AND s.deleted_at IS NULL
          AND public.staff_row_is_arcade_technical(s.job_title, s.staff_role::text, s.department)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_operate_arcade_row(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _location_id IS NULL THEN public.user_holds_arcade_operate()
    ELSE public.user_can_operate_arcade(_location_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_open_arcade()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.arcade_fnb_manager_blocked()
    AND (
      public.current_user_role_level() >= 80
      OR public.user_holds_arcade_operate()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN (
            'ceo', 'coo', 'cfo', 'regional_ops', 'branch_gm', 'duty_manager',
            'tech_supervisor', 'technician', 'auditor'
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.arcade_text_is_food_beverage(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_text_has_word(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_is_fnb_manager(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_is_fec_technician(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_is_supervisor(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_row_is_arcade_technical(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_fnb_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_fnb_manager_blocked() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_has_arcade_technical_at(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_read_arcade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_operate_arcade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_holds_arcade_operate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_operate_arcade_row(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_open_arcade() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_can_read_arcade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_operate_arcade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_holds_arcade_operate() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_operate_arcade_row(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_open_arcade() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role_level() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_location(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.arcade_consume_part(
  p_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_machine_id uuid,
  p_fault_id uuid,
  p_part_id uuid,
  p_staff_id uuid,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_stock_id uuid;
  v_before numeric;
  v_after numeric;
  v_min numeric;
  v_cost numeric;
  v_movement uuid;
  v_usage uuid;
  v_status text;
BEGIN
  IF NOT public.user_can_operate_arcade(p_location_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT id, quantity_on_hand
    INTO v_stock_id, v_before
  FROM public.inventory_stock
  WHERE item_id = p_item_id AND location_id = p_location_id
  FOR UPDATE;

  IF v_stock_id IS NULL THEN
    RAISE EXCEPTION 'Insufficient stock for this movement.';
  END IF;
  IF p_qty > v_before THEN
    RAISE EXCEPTION 'Insufficient stock for this movement.';
  END IF;

  v_after := v_before - p_qty;
  UPDATE public.inventory_stock
    SET quantity_on_hand = v_after, updated_at = now()
    WHERE id = v_stock_id;

  INSERT INTO public.inventory_movements (
    item_id, location_id, movement_type, quantity, quantity_before, quantity_after,
    reference_type, reference_id, notes, created_by
  ) VALUES (
    p_item_id, p_location_id, 'issue', p_qty, v_before, v_after,
    'arcade_fault', p_fault_id, p_notes, auth.uid()
  ) RETURNING id INTO v_movement;

  SELECT min_stock, unit_cost INTO v_min, v_cost
  FROM public.arcade_spare_parts WHERE id = p_part_id;

  INSERT INTO public.arcade_part_usages (
    part_id, inventory_item_id, machine_id, fault_id, location_id, qty, unit_cost,
    technician_staff_id, movement_id, notes, created_by
  ) VALUES (
    p_part_id, p_item_id, p_machine_id, p_fault_id, p_location_id, p_qty, v_cost,
    p_staff_id, v_movement, p_notes, auth.uid()
  ) RETURNING id INTO v_usage;

  v_status := CASE
    WHEN v_after <= 0 THEN 'OUT_OF_STOCK'
    WHEN v_after <= coalesce(v_min, 0) THEN 'LOW_STOCK'
    ELSE 'IN_STOCK'
  END;

  UPDATE public.arcade_spare_parts
    SET supply_status = CASE
          WHEN supply_status IN ('REQUESTED','APPROVAL_PENDING','ORDERED','IN_TRANSIT') THEN supply_status
          ELSE v_status
        END,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = p_part_id;

  RETURN v_usage;
END;
$fn$;

DROP POLICY IF EXISTS "arcade_machines_read" ON public.arcade_machines;
DROP POLICY IF EXISTS "arcade_machines_insert" ON public.arcade_machines;
DROP POLICY IF EXISTS "arcade_machines_update" ON public.arcade_machines;
DROP POLICY IF EXISTS "arcade_machines_delete" ON public.arcade_machines;
DROP POLICY IF EXISTS "arcade_faults_read" ON public.arcade_faults;
DROP POLICY IF EXISTS "arcade_faults_write" ON public.arcade_faults;
DROP POLICY IF EXISTS "arcade_faults_update" ON public.arcade_faults;
DROP POLICY IF EXISTS "arcade_repairs_all" ON public.arcade_repairs;
DROP POLICY IF EXISTS "arcade_repairs_insert" ON public.arcade_repairs;
DROP POLICY IF EXISTS "arcade_repairs_update" ON public.arcade_repairs;
DROP POLICY IF EXISTS "arcade_history_read" ON public.arcade_status_history;
DROP POLICY IF EXISTS "arcade_history_insert" ON public.arcade_status_history;
DROP POLICY IF EXISTS "arcade_updates_read" ON public.arcade_fault_updates;
DROP POLICY IF EXISTS "arcade_updates_insert" ON public.arcade_fault_updates;
DROP POLICY IF EXISTS "arcade_pm_sched_read" ON public.arcade_pm_schedules;
DROP POLICY IF EXISTS "arcade_pm_sched_write" ON public.arcade_pm_schedules;
DROP POLICY IF EXISTS "arcade_pm_rec_read" ON public.arcade_pm_records;
DROP POLICY IF EXISTS "arcade_pm_rec_insert" ON public.arcade_pm_records;
DROP POLICY IF EXISTS "arcade_pm_rec_update" ON public.arcade_pm_records;
DROP POLICY IF EXISTS "arcade_pm_res_read" ON public.arcade_pm_results;
DROP POLICY IF EXISTS "arcade_pm_res_insert" ON public.arcade_pm_results;
DROP POLICY IF EXISTS "arcade_obs_read" ON public.arcade_observations;
DROP POLICY IF EXISTS "arcade_obs_write" ON public.arcade_observations;
DROP POLICY IF EXISTS "arcade_obs_update" ON public.arcade_observations;
DROP POLICY IF EXISTS "arcade_obs_chk_read" ON public.arcade_observation_checks;
DROP POLICY IF EXISTS "arcade_obs_chk_insert" ON public.arcade_observation_checks;
DROP POLICY IF EXISTS "arcade_vendor_profiles_read" ON public.arcade_vendor_profiles;
DROP POLICY IF EXISTS "arcade_vendor_profiles_write" ON public.arcade_vendor_profiles;
DROP POLICY IF EXISTS "arcade_vendor_profiles_update" ON public.arcade_vendor_profiles;
DROP POLICY IF EXISTS "arcade_cases_read" ON public.arcade_supplier_cases;
DROP POLICY IF EXISTS "arcade_cases_insert" ON public.arcade_supplier_cases;
DROP POLICY IF EXISTS "arcade_cases_update" ON public.arcade_supplier_cases;
DROP POLICY IF EXISTS "arcade_case_upd_read" ON public.arcade_supplier_case_updates;
DROP POLICY IF EXISTS "arcade_case_upd_insert" ON public.arcade_supplier_case_updates;
DROP POLICY IF EXISTS "arcade_parts_read" ON public.arcade_spare_parts;
DROP POLICY IF EXISTS "arcade_parts_insert" ON public.arcade_spare_parts;
DROP POLICY IF EXISTS "arcade_parts_update" ON public.arcade_spare_parts;
DROP POLICY IF EXISTS "arcade_part_machines_read" ON public.arcade_part_machines;
DROP POLICY IF EXISTS "arcade_part_machines_write" ON public.arcade_part_machines;
DROP POLICY IF EXISTS "arcade_part_machines_delete" ON public.arcade_part_machines;
DROP POLICY IF EXISTS "arcade_part_req_read" ON public.arcade_part_requests;
DROP POLICY IF EXISTS "arcade_part_req_insert" ON public.arcade_part_requests;
DROP POLICY IF EXISTS "arcade_part_req_update" ON public.arcade_part_requests;
DROP POLICY IF EXISTS "arcade_usage_read" ON public.arcade_part_usages;
DROP POLICY IF EXISTS "arcade_usage_insert" ON public.arcade_part_usages;
DROP POLICY IF EXISTS "arcade_docs_read" ON public.arcade_documents;
DROP POLICY IF EXISTS "arcade_docs_insert" ON public.arcade_documents;
DROP POLICY IF EXISTS "arcade_docs_update" ON public.arcade_documents;
DROP POLICY IF EXISTS "arcade_damage_read" ON public.arcade_damage_reports;
DROP POLICY IF EXISTS "arcade_damage_insert" ON public.arcade_damage_reports;
DROP POLICY IF EXISTS "arcade_damage_update" ON public.arcade_damage_reports;
DROP POLICY IF EXISTS "arcade_install_read" ON public.arcade_installations;
DROP POLICY IF EXISTS "arcade_install_insert" ON public.arcade_installations;
DROP POLICY IF EXISTS "arcade_install_update" ON public.arcade_installations;
DROP POLICY IF EXISTS "arcade_attach_read" ON public.arcade_attachments;
DROP POLICY IF EXISTS "arcade_attach_insert" ON public.arcade_attachments;
DROP POLICY IF EXISTS "arcade_week_read" ON public.arcade_week_tasks;
DROP POLICY IF EXISTS "arcade_week_insert" ON public.arcade_week_tasks;
DROP POLICY IF EXISTS "arcade_week_update" ON public.arcade_week_tasks;
DROP POLICY IF EXISTS "arcade_import_read" ON public.arcade_import_queue;
DROP POLICY IF EXISTS "arcade_import_insert" ON public.arcade_import_queue;
DROP POLICY IF EXISTS "arcade_alerts_read" ON public.arcade_alert_fires;
DROP POLICY IF EXISTS "arcade_alerts_insert" ON public.arcade_alert_fires;
DROP POLICY IF EXISTS "arcade_alerts_update" ON public.arcade_alert_fires;

CREATE POLICY arcade_machines_read ON public.arcade_machines FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_machines_insert ON public.arcade_machines FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 70 AND public.user_can_read_arcade(location_id));
CREATE POLICY arcade_machines_update ON public.arcade_machines FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade(location_id))
  WITH CHECK (public.user_can_operate_arcade(location_id));
CREATE POLICY arcade_machines_delete ON public.arcade_machines FOR DELETE TO authenticated
  USING (public.current_user_role_level() >= 80 AND public.user_can_read_arcade(location_id));

CREATE POLICY arcade_faults_read ON public.arcade_faults FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_faults_write ON public.arcade_faults FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade(location_id));
CREATE POLICY arcade_faults_update ON public.arcade_faults FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade(location_id))
  WITH CHECK (public.user_can_operate_arcade(location_id));

CREATE POLICY arcade_repairs_all ON public.arcade_repairs FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_repairs_insert ON public.arcade_repairs FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade(location_id));
CREATE POLICY arcade_repairs_update ON public.arcade_repairs FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade(location_id))
  WITH CHECK (public.user_can_operate_arcade(location_id));

CREATE POLICY arcade_history_read ON public.arcade_status_history FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_read_arcade(location_id));
CREATE POLICY arcade_history_insert ON public.arcade_status_history FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade_row(location_id));

CREATE POLICY arcade_updates_read ON public.arcade_fault_updates FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_read_arcade(location_id));
CREATE POLICY arcade_updates_insert ON public.arcade_fault_updates FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade_row(location_id));

CREATE POLICY arcade_pm_sched_read ON public.arcade_pm_schedules FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_read_arcade(location_id));
CREATE POLICY arcade_pm_sched_write ON public.arcade_pm_schedules FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 50 AND (location_id IS NULL OR public.user_can_read_arcade(location_id)))
  WITH CHECK (public.current_user_role_level() >= 50 AND (location_id IS NULL OR public.user_can_read_arcade(location_id)));

CREATE POLICY arcade_pm_rec_read ON public.arcade_pm_records FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_pm_rec_insert ON public.arcade_pm_records FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade(location_id));
CREATE POLICY arcade_pm_rec_update ON public.arcade_pm_records FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade(location_id))
  WITH CHECK (public.user_can_operate_arcade(location_id));

CREATE POLICY arcade_pm_res_read ON public.arcade_pm_results FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_pm_res_insert ON public.arcade_pm_results FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade(location_id));

CREATE POLICY arcade_obs_read ON public.arcade_observations FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_obs_write ON public.arcade_observations FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade(location_id));
CREATE POLICY arcade_obs_update ON public.arcade_observations FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade(location_id))
  WITH CHECK (public.user_can_operate_arcade(location_id));

CREATE POLICY arcade_obs_chk_read ON public.arcade_observation_checks FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_obs_chk_insert ON public.arcade_observation_checks FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade(location_id));

CREATE POLICY arcade_vendor_profiles_read ON public.arcade_vendor_profiles FOR SELECT TO authenticated
  USING (public.user_can_open_arcade());
CREATE POLICY arcade_vendor_profiles_write ON public.arcade_vendor_profiles FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 50);
CREATE POLICY arcade_vendor_profiles_update ON public.arcade_vendor_profiles FOR UPDATE TO authenticated
  USING (public.current_user_role_level() >= 50)
  WITH CHECK (public.current_user_role_level() >= 50);

CREATE POLICY arcade_cases_read ON public.arcade_supplier_cases FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_read_arcade(location_id));
CREATE POLICY arcade_cases_insert ON public.arcade_supplier_cases FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade_row(location_id));
CREATE POLICY arcade_cases_update ON public.arcade_supplier_cases FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade_row(location_id))
  WITH CHECK (public.user_can_operate_arcade_row(location_id));

CREATE POLICY arcade_case_upd_read ON public.arcade_supplier_case_updates FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_read_arcade(location_id));
CREATE POLICY arcade_case_upd_insert ON public.arcade_supplier_case_updates FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade_row(location_id));

CREATE POLICY arcade_parts_read ON public.arcade_spare_parts FOR SELECT TO authenticated
  USING (public.user_can_open_arcade());
CREATE POLICY arcade_parts_insert ON public.arcade_spare_parts FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 60);
CREATE POLICY arcade_parts_update ON public.arcade_spare_parts FOR UPDATE TO authenticated
  USING (NOT public.arcade_fnb_manager_blocked() AND public.current_user_role_level() >= 30)
  WITH CHECK (NOT public.arcade_fnb_manager_blocked() AND public.current_user_role_level() >= 30);

CREATE POLICY arcade_part_machines_read ON public.arcade_part_machines FOR SELECT TO authenticated
  USING (public.user_can_open_arcade());
CREATE POLICY arcade_part_machines_write ON public.arcade_part_machines FOR INSERT TO authenticated
  WITH CHECK (NOT public.arcade_fnb_manager_blocked() AND public.current_user_role_level() >= 30);
CREATE POLICY arcade_part_machines_delete ON public.arcade_part_machines FOR DELETE TO authenticated
  USING (public.current_user_role_level() >= 60);

CREATE POLICY arcade_part_req_read ON public.arcade_part_requests FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_part_req_insert ON public.arcade_part_requests FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade(location_id));
CREATE POLICY arcade_part_req_update ON public.arcade_part_requests FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade(location_id))
  WITH CHECK (public.user_can_operate_arcade(location_id));

CREATE POLICY arcade_usage_read ON public.arcade_part_usages FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_usage_insert ON public.arcade_part_usages FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade(location_id));

CREATE POLICY arcade_docs_read ON public.arcade_documents FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_read_arcade(location_id));
CREATE POLICY arcade_docs_insert ON public.arcade_documents FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade_row(location_id));
CREATE POLICY arcade_docs_update ON public.arcade_documents FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade_row(location_id))
  WITH CHECK (public.user_can_operate_arcade_row(location_id));

CREATE POLICY arcade_damage_read ON public.arcade_damage_reports FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_read_arcade(location_id) OR needs_mapping);
CREATE POLICY arcade_damage_insert ON public.arcade_damage_reports FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade_row(location_id));
CREATE POLICY arcade_damage_update ON public.arcade_damage_reports FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade_row(location_id))
  WITH CHECK (public.user_can_operate_arcade_row(location_id));

CREATE POLICY arcade_install_read ON public.arcade_installations FOR SELECT TO authenticated
  USING (public.user_can_read_arcade(location_id));
CREATE POLICY arcade_install_insert ON public.arcade_installations FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade(location_id));
CREATE POLICY arcade_install_update ON public.arcade_installations FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade(location_id))
  WITH CHECK (public.user_can_operate_arcade(location_id));

CREATE POLICY arcade_attach_read ON public.arcade_attachments FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_read_arcade(location_id));
CREATE POLICY arcade_attach_insert ON public.arcade_attachments FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade_row(location_id));

CREATE POLICY arcade_week_read ON public.arcade_week_tasks FOR SELECT TO authenticated
  USING (location_id IS NULL OR public.user_can_read_arcade(location_id));
CREATE POLICY arcade_week_insert ON public.arcade_week_tasks FOR INSERT TO authenticated
  WITH CHECK (public.user_can_operate_arcade_row(location_id));
CREATE POLICY arcade_week_update ON public.arcade_week_tasks FOR UPDATE TO authenticated
  USING (public.user_can_operate_arcade_row(location_id))
  WITH CHECK (public.user_can_operate_arcade_row(location_id));

CREATE POLICY arcade_import_read ON public.arcade_import_queue FOR SELECT TO authenticated
  USING (public.current_user_role_level() >= 50);
CREATE POLICY arcade_import_insert ON public.arcade_import_queue FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 50);

CREATE POLICY arcade_alerts_read ON public.arcade_alert_fires FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY arcade_alerts_insert ON public.arcade_alert_fires FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY arcade_alerts_update ON public.arcade_alert_fires FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());



DROP POLICY IF EXISTS "arcade technical read" ON storage.objects;
DROP POLICY IF EXISTS "arcade technical insert" ON storage.objects;
CREATE POLICY "arcade technical read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'arcade-technical' AND public.user_can_open_arcade());
CREATE POLICY "arcade technical insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'arcade-technical' AND public.user_holds_arcade_operate());

