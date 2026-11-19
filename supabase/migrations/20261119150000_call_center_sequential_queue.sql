-- Sequential queue ringing: one agent at a time with per-offer ring timer.
-- Venue queues (Inflata / Urban Arena / KDS / Birthday / General) default to sequential @ 15s.

BEGIN;

ALTER TABLE public.call_center_queues
  DROP CONSTRAINT IF EXISTS call_center_queues_strategy_check;

ALTER TABLE public.call_center_queues
  ADD CONSTRAINT call_center_queues_strategy_check
    CHECK (strategy IN ('simultaneous', 'round_robin', 'longest_idle', 'sequential'));

ALTER TABLE public.call_center_queues
  ADD COLUMN IF NOT EXISTS offer_ring_seconds integer NOT NULL DEFAULT 15
    CHECK (offer_ring_seconds >= 0 AND offer_ring_seconds <= 120);

COMMENT ON COLUMN public.call_center_queues.offer_ring_seconds IS
  'Per-agent ring window for sequential / ordered strategies. 0 disables auto-advance. Default 15.';

COMMENT ON COLUMN public.call_center_queues.strategy IS
  'simultaneous = ring all; round_robin / longest_idle / sequential = one agent; sequential advances on offer_ring_seconds timeout.';

-- Venue / E3 skill queues: cascade ring (not ring-all).
UPDATE public.call_center_queues
SET
  strategy = 'sequential',
  offer_ring_seconds = 15,
  updated_at = now()
WHERE id IN (
  '00000000-0000-4000-8000-0000000000d1', -- InflataPark
  '00000000-0000-4000-8000-0000000000d2', -- Urban Arena
  '00000000-0000-4000-8000-0000000000d3', -- Kids Driving School
  '00000000-0000-4000-8000-0000000000d4', -- Birthday enquiry
  '00000000-0000-4000-8000-0000000000d5'  -- E3 General Support
);

COMMIT;
