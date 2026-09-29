-- Game purchase payment and the latest technician fix live on the machine.
-- A later bulk upload of purchase invoices writes supplier_name, amount_paid, paid_currency, and paid_on.
-- Logging or completing a fault or repair stamps last_fix_* on that same game.

ALTER TABLE public.arcade_machines
  ADD COLUMN supplier_name text,
  ADD COLUMN amount_paid numeric(12,2),
  ADD COLUMN paid_currency text,
  ADD COLUMN paid_on date,
  ADD COLUMN last_fix_at timestamptz,
  ADD COLUMN last_fix_summary text,
  ADD COLUMN last_fix_status text,
  ADD COLUMN last_fix_technician_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE public.arcade_machines
  ADD CONSTRAINT arcade_machines_amount_paid_nonnegative
  CHECK (amount_paid IS NULL OR amount_paid >= 0);

COMMENT ON COLUMN public.arcade_machines.supplier_name IS 'Supplier name on the purchase invoice. Bulk upload writes this column.';
COMMENT ON COLUMN public.arcade_machines.amount_paid IS 'Amount paid to the supplier for this game.';
COMMENT ON COLUMN public.arcade_machines.paid_currency IS 'Currency of amount_paid. Venue default is QAR.';
COMMENT ON COLUMN public.arcade_machines.paid_on IS 'Date the supplier was paid.';
COMMENT ON COLUMN public.arcade_machines.last_fix_summary IS 'Latest technician fix on this game.';

CREATE OR REPLACE FUNCTION public.trg_arcade_stamp_game_fix()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine uuid;
  v_at timestamptz;
  v_summary text;
  v_status text;
  v_tech uuid;
  v_completed boolean;
BEGIN
  IF TG_TABLE_NAME = 'arcade_faults' THEN
    v_machine := NEW.machine_id;
    v_status := NEW.status;
    v_at := CASE
      WHEN NEW.status IN ('RESOLVED', 'CLOSED') THEN COALESCE(NEW.resolved_at, NEW.closed_at, now())
      ELSE COALESCE(NEW.reported_at, now())
    END;
    v_tech := NEW.technician_staff_id;
    v_summary := left(btrim(regexp_replace(coalesce(
      NULLIF(btrim(coalesce(NEW.action_taken, '')), ''),
      NULLIF(btrim(coalesce(NEW.final_result, '')), ''),
      NULLIF(btrim(coalesce(NEW.diagnosis, '')), ''),
      NEW.description,
      ''
    ), '\s+', ' ', 'g')), 500);
    v_completed := NEW.status IN ('RESOLVED', 'CLOSED');
  ELSE
    v_machine := NEW.machine_id;
    v_status := NEW.status;
    v_at := COALESCE(NEW.completed_at, NEW.started_at, now());
    v_tech := NEW.technician_staff_id;
    v_summary := left(btrim(regexp_replace(coalesce(
      NULLIF(btrim(coalesce(NEW.notes, '')), ''),
      CASE NEW.status
        WHEN 'IN_PROGRESS' THEN 'Repair started'
        WHEN 'PAUSED' THEN 'Repair paused'
        WHEN 'COMPLETED' THEN 'Repair completed'
        ELSE 'Repair update'
      END
    ), '\s+', ' ', 'g')), 500);
    v_completed := NEW.status = 'COMPLETED';
  END IF;

  IF v_machine IS NULL OR v_summary IS NULL OR length(v_summary) < 2 THEN
    RETURN NEW;
  END IF;

  UPDATE public.arcade_machines
     SET last_fix_at = v_at,
         last_fix_summary = v_summary,
         last_fix_status = v_status,
         last_fix_technician_staff_id = COALESCE(v_tech, last_fix_technician_staff_id),
         last_repair_at = CASE WHEN v_completed THEN v_at ELSE last_repair_at END,
         updated_by = COALESCE(auth.uid(), updated_by)
   WHERE id = v_machine
     AND (last_fix_at IS NULL OR last_fix_at <= v_at);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_arcade_fault_stamp_game
  AFTER INSERT OR UPDATE OF status, description, action_taken, final_result, diagnosis, technician_staff_id, resolved_at, closed_at
  ON public.arcade_faults
  FOR EACH ROW EXECUTE FUNCTION public.trg_arcade_stamp_game_fix();

CREATE TRIGGER trg_arcade_repair_stamp_game
  AFTER INSERT OR UPDATE OF status, notes, completed_at, started_at, technician_staff_id
  ON public.arcade_repairs
  FOR EACH ROW EXECUTE FUNCTION public.trg_arcade_stamp_game_fix();
