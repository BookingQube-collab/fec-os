-- ============================================================
-- Phase 0d — Cross-event referential integrity
-- Ensures child FKs that point at sibling tables stay on the
-- same event_id as the row (triggers; composite FKs are not
-- uniquely supported for all of these shapes).
--
-- Pre-apply validation queries (must return 0 rows before apply,
-- or clean orphans first — do NOT delete production data blindly):
--
-- -- WBS parent same event
-- SELECT c.id, c.event_id AS child_event, p.event_id AS parent_event
-- FROM public.event_wbs_nodes c
-- JOIN public.event_wbs_nodes p ON p.id = c.parent_id
-- WHERE c.parent_id IS NOT NULL AND c.event_id <> p.event_id;
--
-- -- Task WBS / parent task same event
-- SELECT t.id, t.event_id, w.event_id AS wbs_event
-- FROM public.event_tasks t
-- JOIN public.event_wbs_nodes w ON w.id = t.wbs_id
-- WHERE t.wbs_id IS NOT NULL AND t.event_id <> w.event_id;
--
-- SELECT t.id, t.event_id, p.event_id AS parent_event
-- FROM public.event_tasks t
-- JOIN public.event_tasks p ON p.id = t.parent_task_id
-- WHERE t.parent_task_id IS NOT NULL AND t.event_id <> p.event_id;
--
-- -- Dependencies
-- SELECT d.id, d.event_id, pred.event_id AS pred_event, succ.event_id AS succ_event
-- FROM public.event_task_dependencies d
-- JOIN public.event_tasks pred ON pred.id = d.predecessor_id
-- JOIN public.event_tasks succ ON succ.id = d.successor_id
-- WHERE d.event_id <> pred.event_id OR d.event_id <> succ.event_id;
--
-- -- Milestones
-- SELECT m.id, m.event_id, w.event_id AS wbs_event, t.event_id AS task_event
-- FROM public.event_milestones m
-- LEFT JOIN public.event_wbs_nodes w ON w.id = m.wbs_id
-- LEFT JOIN public.event_tasks t ON t.id = m.task_id
-- WHERE (m.wbs_id IS NOT NULL AND m.event_id <> w.event_id)
--    OR (m.task_id IS NOT NULL AND m.event_id <> t.event_id);
--
-- -- Budget lines
-- SELECT l.id, l.event_id, b.event_id AS budget_event
-- FROM public.event_budget_lines l
-- JOIN public.event_budgets b ON b.id = l.budget_id
-- WHERE l.event_id <> b.event_id;
--
-- -- Documents WBS
-- SELECT d.id, d.event_id, w.event_id AS wbs_event
-- FROM public.event_documents d
-- JOIN public.event_wbs_nodes w ON w.id = d.wbs_id
-- WHERE d.wbs_id IS NOT NULL AND d.event_id <> w.event_id;
--
-- -- BOQ lines vs document
-- SELECT l.id, l.event_id, d.event_id AS doc_event
-- FROM public.event_boq_lines l
-- JOIN public.event_documents d ON d.id = l.document_id
-- WHERE l.event_id <> d.event_id;
--
-- Rollback (manual)
-- -----------------
-- DROP TRIGGER IF EXISTS trg_event_*_same_event ON ...;
-- DROP FUNCTION IF EXISTS public.enforce_event_*_same_event();
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_event_wbs_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_event uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT event_id INTO parent_event FROM public.event_wbs_nodes WHERE id = NEW.parent_id;
  IF parent_event IS NULL THEN
    RAISE EXCEPTION 'event_wbs_nodes.parent_id % not found', NEW.parent_id;
  END IF;
  IF parent_event <> NEW.event_id THEN
    RAISE EXCEPTION 'event_wbs_nodes.parent_id must belong to the same event';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_wbs_same_event ON public.event_wbs_nodes;
CREATE TRIGGER trg_event_wbs_same_event
  BEFORE INSERT OR UPDATE OF event_id, parent_id ON public.event_wbs_nodes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_wbs_same_event();

CREATE OR REPLACE FUNCTION public.enforce_event_task_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_event uuid;
BEGIN
  IF NEW.wbs_id IS NOT NULL THEN
    SELECT event_id INTO ref_event FROM public.event_wbs_nodes WHERE id = NEW.wbs_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_tasks.wbs_id must belong to the same event';
    END IF;
  END IF;
  IF NEW.parent_task_id IS NOT NULL THEN
    SELECT event_id INTO ref_event FROM public.event_tasks WHERE id = NEW.parent_task_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_tasks.parent_task_id must belong to the same event';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_task_same_event ON public.event_tasks;
CREATE TRIGGER trg_event_task_same_event
  BEFORE INSERT OR UPDATE OF event_id, wbs_id, parent_task_id ON public.event_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_task_same_event();

CREATE OR REPLACE FUNCTION public.enforce_event_dep_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pred_event uuid;
  succ_event uuid;
BEGIN
  SELECT event_id INTO pred_event FROM public.event_tasks WHERE id = NEW.predecessor_id;
  SELECT event_id INTO succ_event FROM public.event_tasks WHERE id = NEW.successor_id;
  IF pred_event IS NULL OR succ_event IS NULL THEN
    RAISE EXCEPTION 'event_task_dependencies predecessor/successor task not found';
  END IF;
  IF pred_event <> NEW.event_id OR succ_event <> NEW.event_id THEN
    RAISE EXCEPTION 'event_task_dependencies predecessor and successor must share the dependency event_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_dep_same_event ON public.event_task_dependencies;
CREATE TRIGGER trg_event_dep_same_event
  BEFORE INSERT OR UPDATE OF event_id, predecessor_id, successor_id ON public.event_task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_dep_same_event();

CREATE OR REPLACE FUNCTION public.enforce_event_milestone_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_event uuid;
BEGIN
  IF NEW.wbs_id IS NOT NULL THEN
    SELECT event_id INTO ref_event FROM public.event_wbs_nodes WHERE id = NEW.wbs_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_milestones.wbs_id must belong to the same event';
    END IF;
  END IF;
  IF NEW.task_id IS NOT NULL THEN
    SELECT event_id INTO ref_event FROM public.event_tasks WHERE id = NEW.task_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_milestones.task_id must belong to the same event';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_milestone_same_event ON public.event_milestones;
CREATE TRIGGER trg_event_milestone_same_event
  BEFORE INSERT OR UPDATE OF event_id, wbs_id, task_id ON public.event_milestones
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_milestone_same_event();

CREATE OR REPLACE FUNCTION public.enforce_event_budget_line_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  budget_event uuid;
BEGIN
  SELECT event_id INTO budget_event FROM public.event_budgets WHERE id = NEW.budget_id;
  IF budget_event IS NULL OR budget_event <> NEW.event_id THEN
    RAISE EXCEPTION 'event_budget_lines.budget_id must match event_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_budget_line_same_event ON public.event_budget_lines;
CREATE TRIGGER trg_event_budget_line_same_event
  BEFORE INSERT OR UPDATE OF event_id, budget_id ON public.event_budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_budget_line_same_event();

CREATE OR REPLACE FUNCTION public.enforce_event_document_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_event uuid;
BEGIN
  IF NEW.wbs_id IS NOT NULL THEN
    SELECT event_id INTO ref_event FROM public.event_wbs_nodes WHERE id = NEW.wbs_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_documents.wbs_id must belong to the same event';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_document_same_event ON public.event_documents;
CREATE TRIGGER trg_event_document_same_event
  BEFORE INSERT OR UPDATE OF event_id, wbs_id ON public.event_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_document_same_event();

CREATE OR REPLACE FUNCTION public.enforce_event_boq_line_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doc_event uuid;
BEGIN
  SELECT event_id INTO doc_event FROM public.event_documents WHERE id = NEW.document_id;
  IF doc_event IS NULL OR doc_event <> NEW.event_id THEN
    RAISE EXCEPTION 'event_boq_lines.document_id must belong to the same event';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_boq_line_same_event ON public.event_boq_lines;
CREATE TRIGGER trg_event_boq_line_same_event
  BEFORE INSERT OR UPDATE OF event_id, document_id ON public.event_boq_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_boq_line_same_event();
