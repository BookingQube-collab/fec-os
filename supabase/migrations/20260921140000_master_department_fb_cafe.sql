-- F&B Cafe as a master department (staff classification via existing staff_departments)
INSERT INTO public.master_departments (name, code, sort_order, active)
VALUES ('F&B Cafe', 'FB_CAFE', 245, true)
ON CONFLICT (name) DO NOTHING;
