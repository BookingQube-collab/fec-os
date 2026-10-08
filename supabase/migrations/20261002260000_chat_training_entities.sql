-- Chat hub may share a training course, certificate, or session as an entity card.
-- The check list keeps the earlier types. Access is still the viewer's own select.

ALTER TABLE public.chat_entity_links
  DROP CONSTRAINT IF EXISTS chat_entity_links_type_chk;

ALTER TABLE public.chat_entity_links
  ADD CONSTRAINT chat_entity_links_type_chk CHECK (entity_type IN (
    'MAINTENANCE_TICKET', 'PURCHASE_REQUEST', 'INCIDENT', 'TASK', 'ROSTER',
    'ATTENDANCE_ISSUE', 'INVENTORY_REQUEST', 'EMPLOYEE', 'ARCADE_MACHINE',
    'EVENT', 'BIRTHDAY_BOOKING', 'APPROVAL',
    'TRAINING_COURSE', 'TRAINING_CERTIFICATE', 'TRAINING_SESSION'
  ));
