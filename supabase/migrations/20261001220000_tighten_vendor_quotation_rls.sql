-- Replace open write policies with the sibling authorization pattern.
-- vendor_contacts follows vendors / vendor_documents: any signed-in user may
-- read; writes require role level >= 60 (branch GM and above, including duty
-- manager at the database layer, matching "vendors write manager").
-- vendor_service_levels follows vendor_contracts: access is the parent
-- contract's location scope (null location stays visible).
-- proc_quotation_lines follows proc_quotations: any signed-in user may read;
-- writes require role level >= 60.

DROP POLICY IF EXISTS "vendor_contacts via vendor" ON public.vendor_contacts;
CREATE POLICY "vendor_contacts read" ON public.vendor_contacts
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "vendor_contacts write" ON public.vendor_contacts
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 60)
  WITH CHECK (public.current_user_role_level() >= 60);

DROP POLICY IF EXISTS "vendor_sla via contract" ON public.vendor_service_levels;
CREATE POLICY "vendor_sla via contract" ON public.vendor_service_levels
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_contracts c
      WHERE c.id = contract_id
        AND (c.location_id IS NULL OR public.user_can_access_location(c.location_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendor_contracts c
      WHERE c.id = contract_id
        AND (c.location_id IS NULL OR public.user_can_access_location(c.location_id))
    )
  );

DROP POLICY IF EXISTS "proc_quote_lines via quote" ON public.proc_quotation_lines;
CREATE POLICY "proc_quote_lines read" ON public.proc_quotation_lines
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "proc_quote_lines write" ON public.proc_quotation_lines
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 60)
  WITH CHECK (public.current_user_role_level() >= 60);
