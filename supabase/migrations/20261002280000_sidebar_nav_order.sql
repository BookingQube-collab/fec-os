-- Master sidebar department order. One row. The browser does not select this table.
-- Signed-in users receive the order through a server action. Only an administrator saves it.

BEGIN;

CREATE TABLE public.sidebar_nav_order (
  id uuid PRIMARY KEY,
  department_ids text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.sidebar_nav_order IS
  'Saved order of sidebar department titles. Service role only. Empty department_ids means the built-in catalog order.';

INSERT INTO public.sidebar_nav_order (id, department_ids)
VALUES ('00000000-0000-4000-8000-0000000000c6', '{}')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.sidebar_nav_order ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sidebar_nav_order FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.sidebar_nav_order TO service_role;

COMMIT;
