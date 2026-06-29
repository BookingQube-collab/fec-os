-- ============================================================
-- Sprint 3: Notification center
-- ============================================================

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text,
  severity text NOT NULL DEFAULT 'info',
  source_type text,
  source_id uuid,
  action_url text,
  read_at timestamptz,
  dismissed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  channel_in_app boolean NOT NULL DEFAULT true,
  channel_email boolean NOT NULL DEFAULT false,
  channel_sms boolean NOT NULL DEFAULT false,
  channel_whatsapp boolean NOT NULL DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

CREATE TABLE public.notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel text NOT NULL,
  provider text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'pending',
  provider_ref text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notification_prefs_user ON public.notification_preferences(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.notifications, public.notification_preferences, public.notification_delivery_logs
TO authenticated;
GRANT ALL ON
  public.notifications, public.notification_preferences, public.notification_delivery_logs
TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications own read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications own update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications insert scoped" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_role_level() >= 80
  );

CREATE POLICY "notification_prefs own" ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "delivery_logs via notification" ON public.notification_delivery_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.id = notification_id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "delivery_logs insert exec" ON public.notification_delivery_logs FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role_level() >= 70);

-- Default preference rows for common categories
INSERT INTO public.notification_preferences (user_id, category)
SELECT u.id, c.category
FROM auth.users u
CROSS JOIN (VALUES
  ('escalation'), ('kpi'), ('sop'), ('compliance'), ('snag'), ('inventory'), ('general')
) AS c(category)
ON CONFLICT (user_id, category) DO NOTHING;
