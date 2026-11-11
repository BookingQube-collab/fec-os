-- Speed up monthly roster change history (action prefix roster.* / attendance.roster_from_punches).
CREATE INDEX IF NOT EXISTS idx_att_audit_roster_actions
  ON public.attendance_audit_events (created_at DESC)
  WHERE action LIKE 'roster.%' OR action = 'attendance.roster_from_punches';
