import type { Json } from "@/integrations/supabase/types";

/** Cast dynamic values into Supabase Json column types. */
export function asJson(value: unknown): Json {
  return value as Json;
}
