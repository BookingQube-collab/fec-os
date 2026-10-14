-- Add Burundi to the nationality list used by Add / Edit employee.
-- The original seed only copied distinct nationalities already on staff,
-- so a country with no current staff never appeared. Unique on lower(btrim(name)).

INSERT INTO public.master_nationalities (name)
SELECT seed.name
FROM (VALUES ('Burundi')) AS seed(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_nationalities n
  WHERE lower(btrim(n.name)) = lower(seed.name)
);
