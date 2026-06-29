-- ============================================================
-- Sprint 2: Snag management
-- ============================================================

CREATE SEQUENCE public.snag_number_seq START 1000;

CREATE TABLE public.snag_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  list_type text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.snag_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snag_number text NOT NULL UNIQUE DEFAULT ('SN-' || lpad(nextval('public.snag_number_seq')::text, 5, '0')),
  list_id uuid REFERENCES public.snag_lists(id) ON DELETE SET NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  raised_at date NOT NULL DEFAULT CURRENT_DATE,
  area text,
  department text,
  category text NOT NULL DEFAULT 'other',
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor_id uuid,
  target_date date,
  status text NOT NULL DEFAULT 'open',
  risk_score int NOT NULL DEFAULT 0,
  action_remarks text,
  closure_date date,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reopen_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.snag_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snag_id uuid NOT NULL REFERENCES public.snag_items(id) ON DELETE CASCADE,
  photo_type text NOT NULL DEFAULT 'before',
  file_path text NOT NULL,
  file_name text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.snag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snag_id uuid NOT NULL REFERENCES public.snag_items(id) ON DELETE CASCADE,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor_id uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE public.snag_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snag_id uuid NOT NULL REFERENCES public.snag_items(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_snag_items_location ON public.snag_items(location_id);
CREATE INDEX idx_snag_items_status ON public.snag_items(status);
CREATE INDEX idx_snag_items_target ON public.snag_items(target_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.snag_lists, public.snag_items, public.snag_photos,
  public.snag_assignments, public.snag_status_history
TO authenticated;
GRANT ALL ON public.snag_lists, public.snag_items, public.snag_photos,
  public.snag_assignments, public.snag_status_history TO service_role;
GRANT USAGE ON SEQUENCE public.snag_number_seq TO authenticated, service_role;

ALTER TABLE public.snag_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snag_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snag_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snag_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snag_lists scoped" ON public.snag_lists FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "snag_items scoped" ON public.snag_items FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "snag_photos via snag" ON public.snag_photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.snag_items s WHERE s.id = snag_id AND public.user_can_access_location(s.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.snag_items s WHERE s.id = snag_id AND public.user_can_access_location(s.location_id)));

CREATE POLICY "snag_assignments via snag" ON public.snag_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.snag_items s WHERE s.id = snag_id AND public.user_can_access_location(s.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.snag_items s WHERE s.id = snag_id AND public.user_can_access_location(s.location_id)));

CREATE POLICY "snag_status_history via snag" ON public.snag_status_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.snag_items s WHERE s.id = snag_id AND public.user_can_access_location(s.location_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.snag_items s WHERE s.id = snag_id AND public.user_can_access_location(s.location_id)));

CREATE TRIGGER trg_snag_lists_updated BEFORE UPDATE ON public.snag_lists
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_snag_items_updated BEFORE UPDATE ON public.snag_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('snag-photos', 'snag-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "snag photos read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'snag-photos');
CREATE POLICY "snag photos insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'snag-photos');
CREATE POLICY "snag photos delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'snag-photos' AND public.current_user_role_level() >= 60);
