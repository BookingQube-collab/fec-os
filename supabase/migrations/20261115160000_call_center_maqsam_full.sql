-- Full Maqsam parity: QA scorecards, scheduled reports, WhatsApp templates,
-- campaign pacing / AMD flags, keyword alerts, conference participant notes.

-- Campaign power-dialer pacing
alter table public.call_center_campaigns
  add column if not exists max_attempts integer not null default 3,
  add column if not exists dial_interval_seconds integer not null default 5,
  add column if not exists amd_enabled boolean not null default false,
  add column if not exists play_recording_url text not null default '',
  add column if not exists auto_start boolean not null default false;

comment on column public.call_center_campaigns.max_attempts is
  'Max dial attempts per contact before marking skipped';
comment on column public.call_center_campaigns.dial_interval_seconds is
  'Minimum seconds between auto dial-next attempts';
comment on column public.call_center_campaigns.amd_enabled is
  'Answering-machine detection flag (carrier AMD when available)';
comment on column public.call_center_campaigns.play_recording_url is
  'Optional pre-recorded message when no agent is required';
comment on column public.call_center_campaigns.auto_start is
  'When true and scheduled_start is reached, campaign may auto-dial';

-- QA evaluation templates + scorecards
create table if not exists public.call_center_qa_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  criteria_json jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.call_center_qa_evaluations (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.call_center_calls(id) on delete cascade,
  template_id uuid references public.call_center_qa_templates(id) on delete set null,
  agent_user_id uuid,
  evaluator_user_id uuid,
  scores_json jsonb not null default '{}'::jsonb,
  total_score numeric(6,2) not null default 0,
  notes text not null default '',
  ai_flags_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cc_qa_eval_call on public.call_center_qa_evaluations (call_id);
create index if not exists idx_cc_qa_eval_agent on public.call_center_qa_evaluations (agent_user_id);

-- Scheduled analytics reports
create table if not exists public.call_center_report_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  frequency text not null default 'daily',
  emails text[] not null default '{}',
  include_whatsapp boolean not null default true,
  include_agents boolean not null default true,
  is_active boolean not null default true,
  last_sent_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- WhatsApp message templates (Meta template names + body preview)
create table if not exists public.call_center_whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text not null default 'en',
  body text not null default '',
  category text not null default 'utility',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_cc_wa_templates_name_lang
  on public.call_center_whatsapp_templates (name, language);

-- Keyword alerts (notify when keyword appears in transcript / notes)
create table if not exists public.call_center_keyword_alerts (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  notify_emails text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Conference participants journaled on call metadata; no extra table required.
-- Softphone park notify channel uses outbound webhooks already.

alter table public.call_center_calls
  add column if not exists conference_active boolean not null default false,
  add column if not exists keyword_hits text[] not null default '{}';

comment on column public.call_center_calls.conference_active is
  'True while a multi-party conference is open on the LiveKit room';
comment on column public.call_center_calls.keyword_hits is
  'Keywords matched in notes/transcript for alerts and search';

-- RLS / grants (service_role only — same pattern as other CC tables)
alter table public.call_center_qa_templates enable row level security;
alter table public.call_center_qa_evaluations enable row level security;
alter table public.call_center_report_schedules enable row level security;
alter table public.call_center_whatsapp_templates enable row level security;
alter table public.call_center_keyword_alerts enable row level security;

revoke all on table public.call_center_qa_templates from public, anon, authenticated;
revoke all on table public.call_center_qa_evaluations from public, anon, authenticated;
revoke all on table public.call_center_report_schedules from public, anon, authenticated;
revoke all on table public.call_center_whatsapp_templates from public, anon, authenticated;
revoke all on table public.call_center_keyword_alerts from public, anon, authenticated;

grant all on table public.call_center_qa_templates to service_role;
grant all on table public.call_center_qa_evaluations to service_role;
grant all on table public.call_center_report_schedules to service_role;
grant all on table public.call_center_whatsapp_templates to service_role;
grant all on table public.call_center_keyword_alerts to service_role;
