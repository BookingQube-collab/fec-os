-- DB overrides for role × capability access (admin Roles page toggles).
-- No row = fall back to code map in src/lib/rbac.ts CAPABILITIES.

CREATE TABLE IF NOT EXISTS public.role_capability_grants (
  role public.app_role NOT NULL,
  capability text NOT NULL,
  allowed boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (role, capability)
);

CREATE INDEX IF NOT EXISTS idx_role_capability_grants_capability
  ON public.role_capability_grants (capability);

GRANT SELECT ON public.role_capability_grants TO authenticated;
GRANT ALL ON public.role_capability_grants TO service_role;

ALTER TABLE public.role_capability_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read capability grants"
  ON public.role_capability_grants FOR SELECT TO authenticated
  USING (true);

-- Writes go through service_role server actions only (admin.manage_roles).
