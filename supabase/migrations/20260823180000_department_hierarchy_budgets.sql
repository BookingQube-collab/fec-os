-- Department tree (parent → sub-department) and per-department year budgets.
-- Excess-budget approval reuses existing PR DOA steps (no second engine).

ALTER TABLE public.master_departments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.master_departments(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'master_departments_parent_not_self'
  ) THEN
    ALTER TABLE public.master_departments
      ADD CONSTRAINT master_departments_parent_not_self
      CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_master_departments_parent
  ON public.master_departments (parent_id);

CREATE TABLE IF NOT EXISTS public.department_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.master_departments(id) ON DELETE CASCADE,
  year int NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (department_id, year)
);

CREATE TABLE IF NOT EXISTS public.department_budget_increases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.master_departments(id) ON DELETE CASCADE,
  budget_id uuid REFERENCES public.department_budgets(id) ON DELETE SET NULL,
  year int NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  pr_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  acted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_department_budgets_year
  ON public.department_budgets (year, department_id);
CREATE INDEX IF NOT EXISTS idx_department_budget_increases_dept
  ON public.department_budget_increases (department_id, year, created_at DESC);

ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS over_budget boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excess_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_increase_pending boolean NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS trg_department_budgets_updated ON public.department_budgets;
CREATE TRIGGER trg_department_budgets_updated
  BEFORE UPDATE ON public.department_budgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_budgets TO authenticated;
GRANT SELECT, INSERT ON public.department_budget_increases TO authenticated;
GRANT ALL ON public.department_budgets, public.department_budget_increases TO service_role;

ALTER TABLE public.department_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_budget_increases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "department_budgets read" ON public.department_budgets;
CREATE POLICY "department_budgets read" ON public.department_budgets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "department_budgets write" ON public.department_budgets;
CREATE POLICY "department_budgets write" ON public.department_budgets
  FOR ALL TO authenticated
  USING (public.current_user_role_level() >= 55)
  WITH CHECK (public.current_user_role_level() >= 55);

DROP POLICY IF EXISTS "department_budget_increases read" ON public.department_budget_increases;
CREATE POLICY "department_budget_increases read" ON public.department_budget_increases
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "department_budget_increases insert" ON public.department_budget_increases;
CREATE POLICY "department_budget_increases insert" ON public.department_budget_increases
  FOR INSERT TO authenticated WITH CHECK (true);
