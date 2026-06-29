-- ============================================================
-- Dedupe AMC contracts: remove legacy amc_scheduler demo seed
-- (no contract_ref) while keeping E3-AMC-* acceptance contracts.
-- ============================================================

DO $$
DECLARE
  legacy_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO legacy_ids
  FROM public.amc_contracts
  WHERE contract_ref IS NULL
    AND vendor_name IN (
      'Al Safe Fire & Safety',
      'SecureVision Qatar',
      'CoolTech Services',
      'PestGuard LLC',
      'FEC Legal Dept',
      'Sparkle Clean Co.'
    );

  IF legacy_ids IS NULL OR array_length(legacy_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.amc_payment_lines WHERE contract_id = ANY (legacy_ids);
  DELETE FROM public.amc_attachments WHERE contract_id = ANY (legacy_ids);
  DELETE FROM public.amc_service_schedules WHERE contract_id = ANY (legacy_ids);
  DELETE FROM public.amc_contracts WHERE id = ANY (legacy_ids);
END $$;
