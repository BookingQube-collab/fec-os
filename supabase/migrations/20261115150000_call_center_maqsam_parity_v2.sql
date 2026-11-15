-- Maqsam parity v2: VIP contacts, queue skills/SL, agent auto-answer + away reason

alter table public.call_center_contacts
  add column if not exists is_priority boolean not null default false;

comment on column public.call_center_contacts.is_priority is
  'VIP / priority contact — can skip IVR and get preferred queue treatment';

alter table public.call_center_queues
  add column if not exists required_skills text[] not null default '{}',
  add column if not exists service_level_seconds integer not null default 20;

comment on column public.call_center_queues.required_skills is
  'When non-empty, only agents with intersecting skills are offered first';
comment on column public.call_center_queues.service_level_seconds is
  'Target answer time (seconds) for service-level % analytics';

alter table public.call_center_agent_status
  add column if not exists auto_answer boolean not null default false,
  add column if not exists away_reason text not null default '';

comment on column public.call_center_agent_status.auto_answer is
  'When true, softphone auto-answers offered PSTN/test calls';
comment on column public.call_center_agent_status.away_reason is
  'Optional label when status is away (On Break, Training, Admin Work, …)';
