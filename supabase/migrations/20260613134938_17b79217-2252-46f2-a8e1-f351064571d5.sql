
CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'custom',
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_templates TO authenticated;
GRANT ALL ON public.task_templates TO service_role;
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_templates scoped" ON public.task_templates FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE TRIGGER trg_tt_updated BEFORE UPDATE ON public.task_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.task_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.task_templates(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  requires_photo boolean NOT NULL DEFAULT false,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_template_items TO authenticated;
GRANT ALL ON public.task_template_items TO service_role;
ALTER TABLE public.task_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_template_items scoped" ON public.task_template_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.task_templates t WHERE t.id = template_id AND public.user_can_access_location(t.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.task_templates t WHERE t.id = template_id AND public.user_can_access_location(t.location_id)));
CREATE INDEX IF NOT EXISTS idx_tti_template ON public.task_template_items (template_id, position);

CREATE TABLE IF NOT EXISTS public.task_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.task_templates(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_instances TO authenticated;
GRANT ALL ON public.task_instances TO service_role;
ALTER TABLE public.task_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_instances scoped" ON public.task_instances FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));
CREATE INDEX IF NOT EXISTS idx_ti_loc_status ON public.task_instances (location_id, status, due_at);
CREATE TRIGGER trg_ti_updated BEFORE UPDATE ON public.task_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_instances;

CREATE TABLE IF NOT EXISTS public.task_item_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.task_instances(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.task_template_items(id) ON DELETE CASCADE,
  checked boolean NOT NULL DEFAULT false,
  photo_path text,
  note text,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_item_results TO authenticated;
GRANT ALL ON public.task_item_results TO service_role;
ALTER TABLE public.task_item_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_item_results scoped" ON public.task_item_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.task_instances i WHERE i.id = instance_id AND public.user_can_access_location(i.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.task_instances i WHERE i.id = instance_id AND public.user_can_access_location(i.location_id)));
CREATE TRIGGER trg_tir_updated BEFORE UPDATE ON public.task_item_results
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RPCs
CREATE OR REPLACE FUNCTION public.spawn_task_instance(_template_id uuid, _due_at timestamptz DEFAULT NULL, _assigned_to uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tpl record; _id uuid;
BEGIN
  SELECT * INTO _tpl FROM public.task_templates WHERE id = _template_id AND active = true;
  IF _tpl IS NULL THEN RAISE EXCEPTION 'template not found or inactive'; END IF;
  IF NOT public.user_can_access_location(_tpl.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.task_instances (template_id, location_id, title, due_at, assigned_to)
  VALUES (_template_id, _tpl.location_id, _tpl.title, _due_at, _assigned_to)
  RETURNING id INTO _id;
  INSERT INTO public.task_item_results (instance_id, item_id, checked)
  SELECT _id, i.id, false FROM public.task_template_items i WHERE i.template_id = _template_id;
  PERFORM public.log_audit('task.instance_spawned','task_instances',_id,_tpl.location_id,NULL,
    jsonb_build_object('template_id',_template_id),NULL,'{}'::jsonb);
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_task_item(
  _instance_id uuid, _item_id uuid, _checked boolean, _photo_path text DEFAULT NULL, _note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inst record; _item record;
BEGIN
  SELECT * INTO _inst FROM public.task_instances WHERE id = _instance_id;
  IF _inst IS NULL THEN RAISE EXCEPTION 'instance not found'; END IF;
  IF NOT public.user_can_access_location(_inst.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _inst.status NOT IN ('open','overdue') THEN RAISE EXCEPTION 'instance is locked'; END IF;
  SELECT * INTO _item FROM public.task_template_items WHERE id = _item_id;
  IF _item IS NULL THEN RAISE EXCEPTION 'item not found'; END IF;
  IF _checked AND _item.requires_photo AND (_photo_path IS NULL OR length(_photo_path) = 0) THEN
    RAISE EXCEPTION 'photo proof required for this item';
  END IF;
  INSERT INTO public.task_item_results (instance_id, item_id, checked, photo_path, note, completed_by, completed_at)
  VALUES (_instance_id, _item_id, _checked, _photo_path, _note,
          CASE WHEN _checked THEN auth.uid() ELSE NULL END,
          CASE WHEN _checked THEN now() ELSE NULL END)
  ON CONFLICT (instance_id, item_id) DO UPDATE
    SET checked = EXCLUDED.checked,
        photo_path = COALESCE(EXCLUDED.photo_path, task_item_results.photo_path),
        note = COALESCE(EXCLUDED.note, task_item_results.note),
        completed_by = CASE WHEN EXCLUDED.checked THEN auth.uid() ELSE NULL END,
        completed_at = CASE WHEN EXCLUDED.checked THEN now() ELSE NULL END;
  PERFORM public.log_audit('task.item_completed','task_item_results',_item_id,_inst.location_id,NULL,
    jsonb_build_object('instance_id',_instance_id,'checked',_checked,'has_photo',_photo_path IS NOT NULL),
    NULL,'{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.submit_task_instance(_instance_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inst record; _missing int;
BEGIN
  SELECT * INTO _inst FROM public.task_instances WHERE id = _instance_id;
  IF _inst IS NULL THEN RAISE EXCEPTION 'instance not found'; END IF;
  IF NOT public.user_can_access_location(_inst.location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _inst.status NOT IN ('open','overdue') THEN RAISE EXCEPTION 'already submitted'; END IF;
  SELECT count(*) INTO _missing
  FROM public.task_template_items it
  LEFT JOIN public.task_item_results r ON r.item_id = it.id AND r.instance_id = _instance_id
  WHERE it.template_id = _inst.template_id
    AND it.required = true
    AND (r.checked IS NOT TRUE
         OR (it.requires_photo AND (r.photo_path IS NULL OR length(r.photo_path) = 0)));
  IF _missing > 0 THEN
    RAISE EXCEPTION '% required item(s) incomplete or missing photo', _missing;
  END IF;
  UPDATE public.task_instances
    SET status = 'submitted', submitted_by = auth.uid(), submitted_at = now()
    WHERE id = _instance_id;
  PERFORM public.log_audit('task.instance_submitted','task_instances',_instance_id,_inst.location_id,NULL,
    jsonb_build_object('template_id',_inst.template_id),NULL,'{}'::jsonb);
END; $$;

GRANT EXECUTE ON FUNCTION public.spawn_task_instance(uuid, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_task_item(uuid, uuid, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_task_instance(uuid) TO authenticated;
