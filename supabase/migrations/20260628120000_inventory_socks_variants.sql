-- ============================================================
-- Inventory: size variants (grip socks) + per-location stock seed
-- ============================================================

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_inventory_items_size
  ON public.inventory_items(size)
  WHERE size IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_not_deleted
  ON public.inventory_items(id)
  WHERE deleted_at IS NULL;

-- Grip sock catalog by size (global SKUs, stock per branch)
INSERT INTO public.inventory_items (sku, name, category, unit, size, reorder_level, par_level, cost_per_unit) VALUES
  ('SOCK-S', 'Grip socks — Small', 'consumable', 'pair', 'S', 30, 80, 8.00),
  ('SOCK-M', 'Grip socks — Medium', 'consumable', 'pair', 'M', 40, 100, 8.00),
  ('SOCK-L', 'Grip socks — Large', 'consumable', 'pair', 'L', 35, 90, 8.00),
  ('SOCK-XL', 'Grip socks — XL', 'consumable', 'pair', 'XL', 25, 60, 8.50)
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  unit = EXCLUDED.unit,
  size = EXCLUDED.size,
  reorder_level = EXCLUDED.reorder_level,
  par_level = EXCLUDED.par_level,
  cost_per_unit = EXCLUDED.cost_per_unit,
  updated_at = now();

-- Per-location opening stock for sock sizes
DO $$
DECLARE
  loc RECORD;
  item RECORD;
  qty numeric;
BEGIN
  FOR loc IN
    SELECT id, code FROM public.locations
    WHERE status IN ('active', 'maintenance')
  LOOP
    FOR item IN
      SELECT id, sku, size FROM public.inventory_items
      WHERE sku LIKE 'SOCK-%' AND deleted_at IS NULL
    LOOP
      qty := CASE loc.code
        WHEN 'INF-CC' THEN CASE item.size WHEN 'S' THEN 45 WHEN 'M' THEN 52 WHEN 'L' THEN 38 WHEN 'XL' THEN 22 ELSE 30 END
        WHEN 'KDS-CC' THEN CASE item.size WHEN 'S' THEN 38 WHEN 'M' THEN 44 WHEN 'L' THEN 32 WHEN 'XL' THEN 18 ELSE 28 END
        WHEN 'KDS-DM' THEN CASE item.size WHEN 'S' THEN 28 WHEN 'M' THEN 35 WHEN 'L' THEN 26 WHEN 'XL' THEN 14 ELSE 22 END
        WHEN 'UA-DM'  THEN CASE item.size WHEN 'S' THEN 32 WHEN 'M' THEN 40 WHEN 'L' THEN 28 WHEN 'XL' THEN 16 ELSE 24 END
        WHEN 'CB-VM'  THEN CASE item.size WHEN 'S' THEN 30 WHEN 'M' THEN 38 WHEN 'L' THEN 24 WHEN 'XL' THEN 12 ELSE 20 END
        WHEN 'CB-DSM' THEN CASE item.size WHEN 'S' THEN 26 WHEN 'M' THEN 34 WHEN 'L' THEN 22 WHEN 'XL' THEN 10 ELSE 18 END
        WHEN 'CAR-AP' THEN CASE item.size WHEN 'S' THEN 24 WHEN 'M' THEN 30 WHEN 'L' THEN 20 WHEN 'XL' THEN 8  ELSE 16 END
        ELSE CASE item.size WHEN 'S' THEN 20 WHEN 'M' THEN 25 WHEN 'L' THEN 18 WHEN 'XL' THEN 10 ELSE 15 END
      END;

      INSERT INTO public.inventory_stock (item_id, location_id, quantity_on_hand, last_counted_at)
      VALUES (item.id, loc.id, qty, now())
      ON CONFLICT (item_id, location_id) DO UPDATE SET
        quantity_on_hand = EXCLUDED.quantity_on_hand,
        last_counted_at = EXCLUDED.last_counted_at,
        updated_at = now();
    END LOOP;
  END LOOP;
END $$;
