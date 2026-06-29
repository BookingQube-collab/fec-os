
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'fec-escalation-sweep',
  '*/5 * * * *',
  $$
  SELECT public.run_escalation_sweep();
  $$
);
