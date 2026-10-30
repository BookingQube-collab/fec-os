-- ============================================================
-- Event PM Phase 6 — Collaboration & meetings (additive)
-- Discussions, meetings/MoM, action items, decision log, thin wiki.
-- Do NOT apply to production without staging verify.
-- ============================================================

-- Threaded discussions per event
CREATE TABLE IF NOT EXISTS public.event_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_id uuid REFERENCES public.event_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_discussions_event
  ON public.event_discussions (event_id, updated_at DESC);

COMMENT ON TABLE public.event_discussions IS
  'Event project discussion threads (Phase 6). Optional link to event_documents.';

CREATE TABLE IF NOT EXISTS public.event_discussion_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  discussion_id uuid NOT NULL REFERENCES public.event_discussions(id) ON DELETE CASCADE,
  parent_post_id uuid REFERENCES public.event_discussion_posts(id) ON DELETE CASCADE,
  body text NOT NULL,
  author_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  mentioned_staff_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_discussion_posts_thread
  ON public.event_discussion_posts (discussion_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_event_discussion_posts_event
  ON public.event_discussion_posts (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_discussion_posts_parent
  ON public.event_discussion_posts (parent_post_id)
  WHERE parent_post_id IS NOT NULL;

COMMENT ON TABLE public.event_discussion_posts IS
  'Posts/replies in event discussions. Mentions stored as staff uuid array.';

-- Meetings: agenda + minutes
CREATE TABLE IF NOT EXISTS public.event_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  agenda text,
  minutes text,
  attendee_staff_ids uuid[] NOT NULL DEFAULT '{}',
  phase_code text,
  document_id uuid REFERENCES public.event_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_meetings_event
  ON public.event_meetings (event_id, scheduled_at DESC);

COMMENT ON TABLE public.event_meetings IS
  'Event meetings with agenda/minutes (Phase 6). Optional phase_code + document link.';

-- Action items from meetings (optional link to event_tasks)
CREATE TABLE IF NOT EXISTS public.event_meeting_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.event_meetings(id) ON DELETE CASCADE,
  title text NOT NULL,
  assignee_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done', 'cancelled')),
  task_id uuid REFERENCES public.event_tasks(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_meeting_actions_meeting
  ON public.event_meeting_actions (meeting_id, status);
CREATE INDEX IF NOT EXISTS idx_event_meeting_actions_event
  ON public.event_meeting_actions (event_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_event_meeting_actions_assignee
  ON public.event_meeting_actions (assignee_staff_id)
  WHERE assignee_staff_id IS NOT NULL;

COMMENT ON TABLE public.event_meeting_actions IS
  'Lightweight meeting action items; optional event_tasks link (Phase 6).';

-- Decision log (NOT full change-control — Phase 7)
CREATE TABLE IF NOT EXISTS public.event_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  decision text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  decided_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  context text,
  meeting_id uuid REFERENCES public.event_meetings(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.event_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_decisions_event
  ON public.event_decisions (event_id, decided_at DESC);

COMMENT ON TABLE public.event_decisions IS
  'Simple event decision log (Phase 6). Change requests deferred to Phase 7.';

-- Thin wiki: one default Notes page per event (unique slug)
CREATE TABLE IF NOT EXISTS public.event_wiki_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  slug text NOT NULL DEFAULT 'notes',
  title text NOT NULL DEFAULT 'Notes',
  body_md text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT event_wiki_pages_slug_ok CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  CONSTRAINT event_wiki_pages_event_slug UNIQUE (event_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_event_wiki_pages_event
  ON public.event_wiki_pages (event_id);

COMMENT ON TABLE public.event_wiki_pages IS
  'Thin per-event markdown Notes/Wiki (Phase 6). Prefer slug=notes as default page.';

-- ---------- RLS ----------
ALTER TABLE public.event_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_discussion_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_meeting_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_wiki_pages ENABLE ROW LEVEL SECURITY;

-- discussions
DROP POLICY IF EXISTS "event_discussions_select" ON public.event_discussions;
DROP POLICY IF EXISTS "event_discussions_insert" ON public.event_discussions;
DROP POLICY IF EXISTS "event_discussions_update" ON public.event_discussions;
DROP POLICY IF EXISTS "event_discussions_delete" ON public.event_discussions;
CREATE POLICY "event_discussions_select" ON public.event_discussions
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_discussions_insert" ON public.event_discussions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_discussions_update" ON public.event_discussions
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_discussions_delete" ON public.event_discussions
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- posts
DROP POLICY IF EXISTS "event_discussion_posts_select" ON public.event_discussion_posts;
DROP POLICY IF EXISTS "event_discussion_posts_insert" ON public.event_discussion_posts;
DROP POLICY IF EXISTS "event_discussion_posts_update" ON public.event_discussion_posts;
DROP POLICY IF EXISTS "event_discussion_posts_delete" ON public.event_discussion_posts;
CREATE POLICY "event_discussion_posts_select" ON public.event_discussion_posts
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_discussion_posts_insert" ON public.event_discussion_posts
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_discussion_posts_update" ON public.event_discussion_posts
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_discussion_posts_delete" ON public.event_discussion_posts
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- meetings
DROP POLICY IF EXISTS "event_meetings_select" ON public.event_meetings;
DROP POLICY IF EXISTS "event_meetings_insert" ON public.event_meetings;
DROP POLICY IF EXISTS "event_meetings_update" ON public.event_meetings;
DROP POLICY IF EXISTS "event_meetings_delete" ON public.event_meetings;
CREATE POLICY "event_meetings_select" ON public.event_meetings
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_meetings_insert" ON public.event_meetings
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_meetings_update" ON public.event_meetings
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_meetings_delete" ON public.event_meetings
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- meeting actions
DROP POLICY IF EXISTS "event_meeting_actions_select" ON public.event_meeting_actions;
DROP POLICY IF EXISTS "event_meeting_actions_insert" ON public.event_meeting_actions;
DROP POLICY IF EXISTS "event_meeting_actions_update" ON public.event_meeting_actions;
DROP POLICY IF EXISTS "event_meeting_actions_delete" ON public.event_meeting_actions;
CREATE POLICY "event_meeting_actions_select" ON public.event_meeting_actions
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_meeting_actions_insert" ON public.event_meeting_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_meeting_actions_update" ON public.event_meeting_actions
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_meeting_actions_delete" ON public.event_meeting_actions
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- decisions
DROP POLICY IF EXISTS "event_decisions_select" ON public.event_decisions;
DROP POLICY IF EXISTS "event_decisions_insert" ON public.event_decisions;
DROP POLICY IF EXISTS "event_decisions_update" ON public.event_decisions;
DROP POLICY IF EXISTS "event_decisions_delete" ON public.event_decisions;
CREATE POLICY "event_decisions_select" ON public.event_decisions
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_decisions_insert" ON public.event_decisions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_decisions_update" ON public.event_decisions
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_decisions_delete" ON public.event_decisions
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- wiki
DROP POLICY IF EXISTS "event_wiki_pages_select" ON public.event_wiki_pages;
DROP POLICY IF EXISTS "event_wiki_pages_insert" ON public.event_wiki_pages;
DROP POLICY IF EXISTS "event_wiki_pages_update" ON public.event_wiki_pages;
DROP POLICY IF EXISTS "event_wiki_pages_delete" ON public.event_wiki_pages;
CREATE POLICY "event_wiki_pages_select" ON public.event_wiki_pages
  FOR SELECT TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.view'));
CREATE POLICY "event_wiki_pages_insert" ON public.event_wiki_pages
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_wiki_pages_update" ON public.event_wiki_pages
  FOR UPDATE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'))
  WITH CHECK (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));
CREATE POLICY "event_wiki_pages_delete" ON public.event_wiki_pages
  FOR DELETE TO authenticated
  USING (public.user_can_access_event(event_id) AND public.events_capability_allows('events.edit'));

-- Same-event integrity for FKs that can drift
CREATE OR REPLACE FUNCTION public.enforce_event_collab_same_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_event uuid;
BEGIN
  IF TG_TABLE_NAME = 'event_discussion_posts' THEN
    SELECT event_id INTO ref_event FROM public.event_discussions WHERE id = NEW.discussion_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_discussion_posts discussion_id must belong to the same event';
    END IF;
    IF NEW.parent_post_id IS NOT NULL THEN
      SELECT event_id INTO ref_event FROM public.event_discussion_posts WHERE id = NEW.parent_post_id;
      IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
        RAISE EXCEPTION 'event_discussion_posts parent_post_id must belong to the same event';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'event_meeting_actions' THEN
    SELECT event_id INTO ref_event FROM public.event_meetings WHERE id = NEW.meeting_id;
    IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
      RAISE EXCEPTION 'event_meeting_actions meeting_id must belong to the same event';
    END IF;
    IF NEW.task_id IS NOT NULL THEN
      SELECT event_id INTO ref_event FROM public.event_tasks WHERE id = NEW.task_id;
      IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
        RAISE EXCEPTION 'event_meeting_actions task_id must belong to the same event';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'event_decisions' THEN
    IF NEW.meeting_id IS NOT NULL THEN
      SELECT event_id INTO ref_event FROM public.event_meetings WHERE id = NEW.meeting_id;
      IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
        RAISE EXCEPTION 'event_decisions meeting_id must belong to the same event';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('event_discussions', 'event_meetings', 'event_decisions') THEN
    IF NEW.document_id IS NOT NULL THEN
      SELECT event_id INTO ref_event FROM public.event_documents WHERE id = NEW.document_id;
      IF ref_event IS NULL OR ref_event <> NEW.event_id THEN
        RAISE EXCEPTION '% document_id must belong to the same event', TG_TABLE_NAME;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_discussions_same_event ON public.event_discussions;
CREATE TRIGGER trg_event_discussions_same_event
  BEFORE INSERT OR UPDATE OF event_id, document_id ON public.event_discussions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_collab_same_event();

DROP TRIGGER IF EXISTS trg_event_discussion_posts_same_event ON public.event_discussion_posts;
CREATE TRIGGER trg_event_discussion_posts_same_event
  BEFORE INSERT OR UPDATE OF event_id, discussion_id, parent_post_id ON public.event_discussion_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_collab_same_event();

DROP TRIGGER IF EXISTS trg_event_meetings_same_event ON public.event_meetings;
CREATE TRIGGER trg_event_meetings_same_event
  BEFORE INSERT OR UPDATE OF event_id, document_id ON public.event_meetings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_collab_same_event();

DROP TRIGGER IF EXISTS trg_event_meeting_actions_same_event ON public.event_meeting_actions;
CREATE TRIGGER trg_event_meeting_actions_same_event
  BEFORE INSERT OR UPDATE OF event_id, meeting_id, task_id ON public.event_meeting_actions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_collab_same_event();

DROP TRIGGER IF EXISTS trg_event_decisions_same_event ON public.event_decisions;
CREATE TRIGGER trg_event_decisions_same_event
  BEFORE INSERT OR UPDATE OF event_id, meeting_id, document_id ON public.event_decisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_collab_same_event();
