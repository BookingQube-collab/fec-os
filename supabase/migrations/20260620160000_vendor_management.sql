-- ============================================================
-- Sprint 2: Vendor & contract management
-- ============================================================

CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  contact_person text,
  phone text,
  email text,
  branch_coverage uuid[] NOT NULL DEFAULT '{}',
  amc_status text,
  payment_terms text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  phone text,
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  contract_ref text,
  title text NOT NULL,
  start_date date,
  end_date date,
  sla_terms text,
  value_amount numeric(12,2),
  currency text NOT NULL DEFAULT 'QAR',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_service_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.vendor_contracts(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  target_value text NOT NULL,
  penalty_clause text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  related_type text,
  related_id uuid,
  title text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.vendor_contracts(id) ON DELETE SET NULL,
  doc_type text NOT NULL,
  file_path text,
  file_name text,
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Link snags to vendors
ALTER TABLE public.snag_items
  ADD CONSTRAINT snag_items_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;

ALTER TABLE public.snag_assignments
  ADD CONSTRAINT snag_assignments_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX idx_vendors_category ON public.vendors(category);
CREATE INDEX idx_vendor_contracts_end ON public.vendor_contracts(end_date);
CREATE INDEX idx_vendor_followups_due ON public.vendor_followups(due_date, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.vendors, public.vendor_contacts, public.vendor_contracts,
  public.vendor_service_levels, public.vendor_followups, public.vendor_documents
TO authenticated;
GRANT ALL ON
  public.vendors, public.vendor_contacts, public.vendor_contracts,
  public.vendor_service_levels, public.vendor_followups, public.vendor_documents
TO service_role;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_service_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendors read all auth" ON public.vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendors write manager" ON public.vendors FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 60)
  WITH CHECK (public.current_user_role_level() >= 60);

CREATE POLICY "vendor_contacts via vendor" ON public.vendor_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vendor_contracts scoped" ON public.vendor_contracts FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY "vendor_sla via contract" ON public.vendor_service_levels FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vendor_followups scoped" ON public.vendor_followups FOR ALL TO authenticated
  USING (location_id IS NULL OR public.user_can_access_location(location_id))
  WITH CHECK (location_id IS NULL OR public.user_can_access_location(location_id));
CREATE POLICY "vendor_documents read" ON public.vendor_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendor_documents write" ON public.vendor_documents FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 60) WITH CHECK (public.current_user_role_level() >= 60);

CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_vendor_contracts_updated BEFORE UPDATE ON public.vendor_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_vendor_followups_updated BEFORE UPDATE ON public.vendor_followups
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
