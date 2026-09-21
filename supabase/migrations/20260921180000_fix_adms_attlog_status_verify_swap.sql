-- Positional ATTLOG was ingested as verify,status instead of status,verify.
-- Fingerprint punches (verify=1) all landed in in_out_status, so device logs
-- showed every punch under Punch out. Re-derive from raw (idempotent).
UPDATE public.attendance_logs AS al
SET
  in_out_status = parsed.m[2]::integer,
  verify_method = parsed.m[3]::integer
FROM (
  SELECT
    id,
    regexp_match(
      raw_payload->>'raw',
      '(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s+(\d+)\s+(\d+)'
    ) AS m
  FROM public.attendance_logs
  WHERE source = 'adms_push'
    AND raw_payload ? 'raw'
) AS parsed
WHERE al.id = parsed.id
  AND parsed.m IS NOT NULL
  AND (
    al.in_out_status IS DISTINCT FROM parsed.m[2]::integer
    OR al.verify_method IS DISTINCT FROM parsed.m[3]::integer
  );
