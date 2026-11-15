-- Call-center-only login role. App capabilities live in src/lib/rbac.ts:
-- call_center.view / call_center.agent only (no dashboard, HR, or admin access).
-- Role level 25 matches ROLE_LEVELS.call_center_agent.
-- ADD VALUE must commit before the value is used, so keep this migration free of other statements.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'call_center_agent';
