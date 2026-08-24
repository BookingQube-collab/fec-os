-- Unique daily subject key for unmapped and mapped employees (PostgREST upsert).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_summary_subject_key'
  ) THEN
    UPDATE public.attendance_daily_summary
    SET subject_key = CASE
      WHEN staff_id IS NOT NULL THEN 'staff:' || staff_id::text
      ELSE coalesce(subject_key, 'row:' || id::text)
    END
    WHERE subject_key IS NULL OR subject_key = '';

    ALTER TABLE public.attendance_daily_summary
      ALTER COLUMN subject_key SET DEFAULT '',
      ALTER COLUMN subject_key SET NOT NULL;

    ALTER TABLE public.attendance_daily_summary
      ADD CONSTRAINT attendance_daily_summary_subject_key UNIQUE (location_id, subject_key, work_date);
  END IF;
END $$;
