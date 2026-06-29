-- Qatar FEC: replace UAE demo branches, default currency QAR

UPDATE public.locations
SET status = 'closed', updated_at = now()
WHERE code IN ('DXB-MOE', 'DXB-DXM', 'AUH-YMA', 'SHJ-CTY', 'RAK-ALH');

ALTER TABLE public.locations
  ALTER COLUMN country SET DEFAULT 'QA',
  ALTER COLUMN timezone SET DEFAULT 'Asia/Qatar';

INSERT INTO public.locations (code, name, city, region, country, timezone, status, launched_on) VALUES
  ('KDS', 'Kids driving School (KDS)', 'Doha', 'City Center Doha', 'QA', 'Asia/Qatar', 'active', '2022-03-15'),
  ('INFLATAPARK', 'Inflatapark', 'Doha', 'City Center Doha', 'QA', 'Asia/Qatar', 'active', '2022-06-01'),
  ('URBAN-ARENA', 'Urban Arena', 'Doha', 'Doha Mall', 'QA', 'Asia/Qatar', 'active', '2023-01-10'),
  ('CRAYONS-VENDOME', 'Crayons & Bricks', 'Doha', 'Vendome Mall', 'QA', 'Asia/Qatar', 'active', '2023-04-20'),
  ('CRAYONS-DAS', 'Crayons & Bricks', 'Doha', 'Dar Al Salam Mall', 'QA', 'Asia/Qatar', 'active', '2023-09-01'),
  ('CARAOUSEL', 'Caraousel', 'Doha', 'Aspire Park', 'QA', 'Asia/Qatar', 'active', '2024-02-14')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  region = EXCLUDED.region,
  country = EXCLUDED.country,
  timezone = EXCLUDED.timezone,
  status = EXCLUDED.status,
  updated_at = now();

ALTER TABLE public.transactions ALTER COLUMN currency SET DEFAULT 'QAR';
ALTER TABLE public.purchase_orders ALTER COLUMN currency SET DEFAULT 'QAR';

UPDATE public.transactions SET currency = 'QAR' WHERE currency = 'AED';
UPDATE public.purchase_orders SET currency = 'QAR' WHERE currency = 'AED';

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  _location_id uuid, _vendor_name text, _amount numeric,
  _category text DEFAULT NULL, _description text DEFAULT NULL, _currency text DEFAULT 'QAR'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid; _num text;
BEGIN
  IF NOT public.user_can_access_location(_location_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _num := 'PO-' || to_char(now(),'YYMM') || '-' || upper(substr(md5(random()::text), 1, 6));
  INSERT INTO public.purchase_orders(location_id, po_number, vendor_name, category, description, amount, currency, status, requested_by)
    VALUES (_location_id, _num, _vendor_name, _category, _description, _amount, _currency, 'draft', auth.uid())
    RETURNING id INTO _id;
  PERFORM public.log_audit('po.created','purchase_orders',_id,_location_id, NULL,
    jsonb_build_object('po_number',_num,'vendor',_vendor_name,'amount',_amount,'currency',_currency), NULL, '{}'::jsonb);
  RETURN _id;
END; $$;
