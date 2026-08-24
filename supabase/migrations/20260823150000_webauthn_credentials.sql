-- WebAuthn / passkey credentials for device-bound fast login (Touch ID, Face ID, Windows Hello).
-- Public keys only — never store passwords. Challenges are short-lived and service-role only.

CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[],
  device_name text,
  aaguid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT webauthn_credentials_credential_id_key UNIQUE (credential_id)
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id
  ON public.webauthn_credentials (user_id);

CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL,
  type text NOT NULL CHECK (type IN ('registration', 'authentication')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webauthn_challenges_challenge_key UNIQUE (challenge)
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires
  ON public.webauthn_challenges (expires_at);

GRANT SELECT ON public.webauthn_credentials TO authenticated;
GRANT ALL ON public.webauthn_credentials TO service_role;
GRANT ALL ON public.webauthn_challenges TO service_role;

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webauthn_credentials own read" ON public.webauthn_credentials;
CREATE POLICY "webauthn_credentials own read" ON public.webauthn_credentials
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
