-- Telnyx SIP Trunking + Qatar DID + LiveKit inbound trunk fields.
-- inbound_mode:
--   telnyx_sip_trunk     — Telnyx Elastic SIP → LiveKit SIP (recommended by Telnyx)
--   telnyx_call_control  — Telnyx Call Control IVR/hold, then transfer to LiveKit on answer

alter table public.call_center_settings
  add column if not exists inbound_mode text not null default 'telnyx_sip_trunk',
  add column if not exists livekit_sip_inbound_trunk_id text not null default '',
  add column if not exists telnyx_dtmf_mode text not null default 'rfc2833',
  add column if not exists qatar_did_e164 text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'call_center_settings_inbound_mode_check'
  ) then
    alter table public.call_center_settings
      add constraint call_center_settings_inbound_mode_check
      check (inbound_mode in ('telnyx_sip_trunk', 'telnyx_call_control'));
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'call_center_settings_telnyx_dtmf_mode_check'
  ) then
    alter table public.call_center_settings
      add constraint call_center_settings_telnyx_dtmf_mode_check
      check (telnyx_dtmf_mode in ('rfc2833', 'inband', 'sip_info'));
  end if;
end $$;

comment on column public.call_center_settings.inbound_mode is
  'telnyx_sip_trunk = Telnyx SIP origination to LiveKit; telnyx_call_control = Call Control webhook IVR then LiveKit bridge';
comment on column public.call_center_settings.livekit_sip_inbound_trunk_id is
  'LiveKit inbound SIP trunk id (ST_…) that accepts Telnyx origination';
comment on column public.call_center_settings.telnyx_dtmf_mode is
  'Telnyx DTMF setting; rfc2833 (RTP telephone-event) recommended for IVR';
comment on column public.call_center_settings.qatar_did_e164 is
  'Primary Qatar +974 DID E.164 used for inbound mapping reminders';
