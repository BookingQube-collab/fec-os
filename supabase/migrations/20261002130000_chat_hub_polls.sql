-- Chat Hub phase 14: anonymous poll totals without voter identity.
-- Not applied by the agent. Do not run this against production from the app.
--
-- chat_poll_votes RLS hides other people's rows when the poll is anonymous,
-- including from moderators. A user-scoped select therefore cannot tally.
-- This function returns option counts only. It does not return user_id.
-- Membership is required via chat_can_see_poll. Non-members get no rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.chat_poll_option_counts(_poll_ids uuid[])
RETURNS TABLE (poll_id uuid, option_id uuid, vote_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.poll_id, o.id, count(v.user_id)::integer
  FROM public.chat_poll_options o
  LEFT JOIN public.chat_poll_votes v
    ON v.poll_id = o.poll_id
   AND v.option_id = o.id
  WHERE _poll_ids IS NOT NULL
    AND cardinality(_poll_ids) BETWEEN 1 AND 100
    AND o.poll_id = ANY (_poll_ids)
    AND public.chat_can_see_poll(o.poll_id)
  GROUP BY o.poll_id, o.id;
$$;

COMMENT ON FUNCTION public.chat_poll_option_counts(uuid[]) IS
  'Option totals for polls the caller can see. Does not return user_id. Anonymous and named polls use the same counts.';

REVOKE ALL ON FUNCTION public.chat_poll_option_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_poll_option_counts(uuid[]) TO authenticated, service_role;

COMMIT;
