-- Allow authenticated users with RLS write policy to mutate e3_compliance_items.

GRANT INSERT, UPDATE, DELETE ON public.e3_compliance_items TO authenticated;
