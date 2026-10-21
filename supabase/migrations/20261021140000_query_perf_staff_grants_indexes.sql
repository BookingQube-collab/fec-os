-- Query performance: hot PostgREST paths from API Gateway (last 60m after reset).
--
-- Hottest REST by count:
--   GET /rest/v1/role_capability_grants?select=role,capability,allowed  (~224)
--   GET /rest/v1/staff?select=id,job_title,staff_role,department,...   (~321)
--
-- staff lookups are loadLinkedStaffRecord: eq(user_id) + deleted_at IS NULL
-- + order(created_at DESC, id DESC) LIMIT 1 on nearly every authenticated action.
-- There was no index on staff.user_id (only idx_staff_not_deleted on id).
--
-- role_capability_grants is a tiny override table (PK already covers SELECT *);
-- call-volume cuts are in app cache (longer TTL + session payload). No new
-- index needed beyond the existing capability index.
--
-- Out of scope: Query Performance self-query, auth token refresh latency,
-- connection-pool idle sessions.

-- Newest active staff row for a login (loadLinkedStaffRecord primary path)
CREATE INDEX IF NOT EXISTS idx_staff_user_id_active
  ON public.staff (user_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND user_id IS NOT NULL;

-- Fallback path when user_id is null / desynced: email match (ilike still needs
-- seq scan for patterns, but exact lower(email) helps common synced logins)
CREATE INDEX IF NOT EXISTS idx_staff_email_active
  ON public.staff (lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;
