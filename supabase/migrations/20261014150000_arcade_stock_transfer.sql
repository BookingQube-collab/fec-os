-- Spare-part transfers and task sign-off.
-- Stock stays on inventory_stock. A transfer writes two ledger rows and cannot go negative.
-- Sign-off of someone else's card stays with supervisors and operations leads.

CREATE OR REPLACE FUNCTION public.arcade_is_operations_lead(p_title text, p_department text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
      public.arcade_text_has_word(p_title, 'manager')
      OR public.arcade_text_has_word(p_department, 'manager')
    )
    AND NOT public.arcade_is_fnb_manager(p_title, p_department)
    AND (COALESCE(p_title, '') || ' ' || COALESCE(p_department, '')) ~* '(operations|duty|branch|general|venue)';
$$;

CREATE OR REPLACE FUNCTION public.user_can_move_arcade_stock(_from uuid, _to uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _from IS NOT NULL
    AND _to IS NOT NULL
    AND _from IS DISTINCT FROM _to
    AND NOT public.arcade_fnb_manager_blocked()
    AND public.user_can_read_arcade(_from)
    AND public.user_can_read_arcade(_to)
    AND (
      public.current_user_role_level() >= 80
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text IN ('ceo', 'coo', 'cfo', 'regional_ops', 'branch_gm', 'duty_manager')
      )
      OR EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.user_id = auth.uid()
          AND s.deleted_at IS NULL
          AND public.arcade_is_operations_lead(s.job_title, s.department)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_verify_arcade_task(p_technician_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.arcade_fnb_manager_blocked()
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE p_technician_staff_id IS NOT NULL
        AND s.id = p_technician_staff_id
        AND s.user_id = auth.uid()
    )
    AND (
      public.current_user_role_level() >= 80
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text IN ('ceo', 'coo', 'regional_ops', 'branch_gm', 'duty_manager', 'tech_supervisor')
      )
      OR EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.user_id = auth.uid()
          AND s.deleted_at IS NULL
          AND (
            public.arcade_is_supervisor(s.job_title, s.staff_role::text)
            OR public.arcade_is_operations_lead(s.job_title, s.department)
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.arcade_transfer_stock(
  p_part_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_qty numeric,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_item uuid;
  v_first uuid;
  v_second uuid;
  v_from_id uuid;
  v_to_id uuid;
  v_from_before numeric;
  v_to_before numeric;
  v_from_reserved numeric;
  v_from_after numeric;
  v_to_after numeric;
BEGIN
  IF NOT public.user_can_move_arcade_stock(p_from_location_id, p_to_location_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT inventory_item_id INTO v_item
  FROM public.arcade_spare_parts
  WHERE id = p_part_id;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'This part is not linked to inventory stock';
  END IF;

  IF p_from_location_id < p_to_location_id THEN
    v_first := p_from_location_id;
    v_second := p_to_location_id;
  ELSE
    v_first := p_to_location_id;
    v_second := p_from_location_id;
  END IF;

  PERFORM 1
  FROM public.inventory_stock
  WHERE item_id = v_item AND location_id IN (v_first, v_second)
  ORDER BY location_id
  FOR UPDATE;

  SELECT id, quantity_on_hand, quantity_reserved
    INTO v_from_id, v_from_before, v_from_reserved
  FROM public.inventory_stock
  WHERE item_id = v_item AND location_id = p_from_location_id;

  IF v_from_id IS NULL OR p_qty > COALESCE(v_from_before, 0) THEN
    RAISE EXCEPTION 'Insufficient stock for this movement.';
  END IF;

  v_from_after := v_from_before - p_qty;
  IF v_from_after < COALESCE(v_from_reserved, 0) THEN
    RAISE EXCEPTION 'Insufficient stock for this movement.';
  END IF;

  SELECT id, quantity_on_hand
    INTO v_to_id, v_to_before
  FROM public.inventory_stock
  WHERE item_id = v_item AND location_id = p_to_location_id;

  v_to_before := COALESCE(v_to_before, 0);
  v_to_after := v_to_before + p_qty;

  UPDATE public.inventory_stock
    SET quantity_on_hand = v_from_after, updated_at = now()
    WHERE id = v_from_id;

  IF v_to_id IS NULL THEN
    INSERT INTO public.inventory_stock (item_id, location_id, quantity_on_hand)
    VALUES (v_item, p_to_location_id, v_to_after);
  ELSE
    UPDATE public.inventory_stock
      SET quantity_on_hand = v_to_after, updated_at = now()
      WHERE id = v_to_id;
  END IF;

  INSERT INTO public.inventory_movements (
    item_id, location_id, movement_type, quantity, quantity_before, quantity_after,
    reference_type, reference_id, notes, created_by
  ) VALUES
    (v_item, p_from_location_id, 'transfer_out', p_qty, v_from_before, v_from_after, 'arcade_part', p_part_id, p_notes, auth.uid()),
    (v_item, p_to_location_id, 'transfer_in', p_qty, v_to_before, v_to_after, 'arcade_part', p_part_id, p_notes, auth.uid());

  RETURN jsonb_build_object('from_on_hand', v_from_after, 'to_on_hand', v_to_after);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.arcade_tasks_signoff_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.verification IS DISTINCT FROM OLD.verification
     AND NEW.verification IN ('APPROVED', 'RETURNED')
     AND NOT public.user_can_verify_arcade_task(NEW.technician_staff_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_arcade_tasks_signoff ON public.arcade_tasks;
CREATE TRIGGER trg_arcade_tasks_signoff
  BEFORE UPDATE ON public.arcade_tasks
  FOR EACH ROW EXECUTE FUNCTION public.arcade_tasks_signoff_guard();

REVOKE ALL ON FUNCTION public.arcade_is_operations_lead(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_move_arcade_stock(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_verify_arcade_task(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_transfer_stock(uuid, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.arcade_tasks_signoff_guard() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_can_move_arcade_stock(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_verify_arcade_task(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_transfer_stock(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;
