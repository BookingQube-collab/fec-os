-- Link order inside each sidebar department, on the same row as the department order.

BEGIN;

ALTER TABLE public.sidebar_nav_order
  ADD COLUMN IF NOT EXISTS item_orders jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.sidebar_nav_order.item_orders IS
  'Per-department link order. Keys are department ids or department:group ids. Values are labelKey|href lists. Missing keys keep the catalog order.';

COMMIT;
