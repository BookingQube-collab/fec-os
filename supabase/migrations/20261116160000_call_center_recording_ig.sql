-- Recording storage base URL + Instagram Messaging settings (Call Center Settings UI).

BEGIN;

ALTER TABLE public.call_center_settings
  ADD COLUMN IF NOT EXISTS recording_storage_base_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_page_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_ig_user_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_page_access_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_verify_token text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.call_center_settings.recording_storage_base_url IS
  'Public HTTPS base for LiveKit egress / S3 / CDN recordings. Used to write call recording_url (filepath call-center/<id>.mp4).';
COMMENT ON COLUMN public.call_center_settings.instagram_enabled IS
  'When true, Instagram Messaging credentials in settings are considered active for Meta webhooks / send.';
COMMENT ON COLUMN public.call_center_settings.instagram_page_id IS
  'Facebook Page ID linked to the Instagram Professional account.';
COMMENT ON COLUMN public.call_center_settings.instagram_ig_user_id IS
  'Instagram Business / Professional account ID (IG user id).';
COMMENT ON COLUMN public.call_center_settings.instagram_page_access_token IS
  'Page access token with instagram_manage_messages (or META_PAGE_ACCESS_TOKEN env fallback).';
COMMENT ON COLUMN public.call_center_settings.instagram_verify_token IS
  'Webhook hub.verify_token for /api/public/meta/instagram (falls back to META_WEBHOOK_VERIFY_TOKEN / INSTAGRAM_VERIFY_TOKEN).';

COMMIT;
