import type { Database as DatabaseGenerated } from "./types";

/**
 * Client-facing Database shape used by createClient / createServerClient.
 *
 * postgrest-js RejectExcessProperties rejects `Record<string, unknown>` write
 * payloads (index signature → `{ [x: string]: never }`). Many server actions
 * build inserts/updates dynamically; loosening Insert/Update to Record keeps
 * Row/select typing strict while unblocking Vercel typecheck.
 *
 * Prefer `TablesInsert` / `TablesUpdate` from `./types` at new call sites.
 */
type LooseTable<T> = T extends {
  Row: infer R;
  Insert: unknown;
  Update: unknown;
  Relationships: infer Rel;
}
  ? {
      Row: R;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: Rel;
    }
  : T;

export type Database = Omit<DatabaseGenerated, "public"> & {
  public: Omit<DatabaseGenerated["public"], "Tables"> & {
    Tables: {
      [K in keyof DatabaseGenerated["public"]["Tables"]]: LooseTable<
        DatabaseGenerated["public"]["Tables"][K]
      >;
    };
  };
};
