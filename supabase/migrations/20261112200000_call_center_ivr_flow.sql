-- Visual IVR flow canvas: store node graph on menus; extend options for nested menus / agent route.

BEGIN;

ALTER TABLE public.call_center_ivr_menus
  ADD COLUMN IF NOT EXISTS flow_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.call_center_ivr_menus.flow_json IS
  'React Flow graph: { version, nodes, edges, viewport }. Source of truth for visual IVR builder; options are synced for runtime.';

ALTER TABLE public.call_center_ivr_options
  DROP CONSTRAINT IF EXISTS call_center_ivr_options_action_check;

ALTER TABLE public.call_center_ivr_options
  ADD CONSTRAINT call_center_ivr_options_action_check
  CHECK (action IN ('queue', 'voicemail', 'hangup', 'transfer_sip', 'repeat', 'menu', 'agent'));

ALTER TABLE public.call_center_ivr_options
  ADD COLUMN IF NOT EXISTS next_menu_id uuid REFERENCES public.call_center_ivr_menus(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_node_id text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.call_center_ivr_options.next_menu_id IS
  'When action=menu, jump to this IVR menu (nested menu).';
COMMENT ON COLUMN public.call_center_ivr_options.agent_user_id IS
  'When action=agent, offer directly to this agent user id.';
COMMENT ON COLUMN public.call_center_ivr_options.target_node_id IS
  'Canvas node id this option routes to (for flow walker / preview).';

COMMIT;
