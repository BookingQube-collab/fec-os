-- ============================================================
-- Dedupe AMC contracts: same location + category + vendor.
-- Keeps E3-AMC-* (or any contract_ref), else newest updated_at.
-- Does NOT merge distinct sites (KDS-CC vs INF-CC differ by location_id).
-- ============================================================

DO $$
DECLARE
  dup_ids uuid[];
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY location_id, category, vendor_name
        ORDER BY
          CASE
            WHEN contract_ref LIKE 'E3-AMC-%' THEN 0
            WHEN contract_ref IS NOT NULL THEN 1
            ELSE 2
          END,
          updated_at DESC NULLS LAST
      ) AS rn
    FROM public.amc_contracts
  )
  SELECT array_agg(id) INTO dup_ids FROM ranked WHERE rn > 1;

  IF dup_ids IS NULL OR array_length(dup_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.amc_payment_lines WHERE contract_id = ANY (dup_ids);
  DELETE FROM public.amc_attachments WHERE contract_id = ANY (dup_ids);
  DELETE FROM public.amc_service_schedules WHERE contract_id = ANY (dup_ids);
  DELETE FROM public.amc_contracts WHERE id = ANY (dup_ids);
END $$;
