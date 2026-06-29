-- ============================================================
-- Sprint 3: Inventory & consumables
-- ============================================================

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'consumable',
  unit text NOT NULL DEFAULT 'each',
  reorder_level numeric(10,2) NOT NULL DEFAULT 0,
  par_level numeric(10,2),
  cost_per_unit numeric(12,2),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  quantity_on_hand numeric(12,2) NOT NULL DEFAULT 0,
  quantity_reserved numeric(12,2) NOT NULL DEFAULT 0,
  last_counted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, location_id)
);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  movement_type text NOT NULL,
  quantity numeric(12,2) NOT NULL,
  quantity_before numeric(12,2) NOT NULL,
  quantity_after numeric(12,2) NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_stock_location ON public.inventory_stock(location_id);
CREATE INDEX idx_inventory_movements_item ON public.inventory_movements(item_id, created_at DESC);
CREATE INDEX idx_inventory_movements_location ON public.inventory_movements(location_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.inventory_items, public.inventory_stock, public.inventory_movements
TO authenticated;
GRANT ALL ON
  public.inventory_items, public.inventory_stock, public.inventory_movements
TO service_role;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_items read all" ON public.inventory_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventory_items manage exec" ON public.inventory_items FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 70)
  WITH CHECK (public.current_user_role_level() >= 70);

CREATE POLICY "inventory_stock scoped" ON public.inventory_stock FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

CREATE POLICY "inventory_movements scoped" ON public.inventory_movements FOR ALL TO authenticated
  USING (public.user_can_access_location(location_id))
  WITH CHECK (public.user_can_access_location(location_id));

-- Seed common FEC consumables
INSERT INTO public.inventory_items (sku, name, category, unit, reorder_level, par_level, cost_per_unit) VALUES
  ('CON-WIPE', 'Sanitizing wipes', 'cleaning', 'pack', 10, 25, 12.50),
  ('CON-GLOVE', 'Disposable gloves (L)', 'safety', 'box', 5, 15, 8.00),
  ('CON-TOKEN', 'Game tokens', 'operations', 'bag', 20, 50, 45.00),
  ('CON-PAPER', 'Receipt paper rolls', 'pos', 'roll', 8, 20, 3.50),
  ('CON-CABLE', 'HDMI cable spare', 'it', 'each', 2, 5, 35.00)
ON CONFLICT (sku) DO NOTHING;
