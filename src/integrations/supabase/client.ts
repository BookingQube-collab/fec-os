import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const missing = [
      ...(!supabaseUrl ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
      ...(!supabaseKey ? ["NEXT_PUBLIC_SUPABASE_ANON_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Add them to .env.local.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
