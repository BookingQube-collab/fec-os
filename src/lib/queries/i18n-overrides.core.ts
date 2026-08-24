import { ApiValidationError } from "@/core/api/validation";
import type { AuthContext } from "@/lib/server/auth";

export type I18nOverrideRecord = {
  locale: string;
  key: string;
  value: string;
  updated_at: string;
};

const KEY_RE = /^[a-zA-Z0-9_.]+$/;

export async function fetchI18nOverrides(
  context: AuthContext,
  locale: string,
): Promise<I18nOverrideRecord[]> {
  const { data, error } = await context.supabase
    .from("i18n_overrides")
    .select("locale, key, value, updated_at")
    .eq("locale", locale)
    .order("key");

  if (error) throw error;
  return (data ?? []) as I18nOverrideRecord[];
}

export async function upsertI18nOverride(
  context: AuthContext,
  input: { locale: string; key: string; value: string },
): Promise<I18nOverrideRecord> {
  const locale = input.locale.trim();
  const key = input.key.trim();
  const value = input.value.trim();

  if (locale !== "ar") {
    throw new ApiValidationError("Only Arabic (ar) overrides can be saved here.");
  }
  if (!KEY_RE.test(key) || key.length > 200) {
    throw new ApiValidationError("Invalid translation key.");
  }
  if (!value || value.length > 2000) {
    throw new ApiValidationError("Arabic value must be between 1 and 2000 characters.");
  }

  const { data, error } = await context.supabase
    .from("i18n_overrides")
    .upsert(
      {
        locale,
        key,
        value,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "locale,key" },
    )
    .select("locale, key, value, updated_at")
    .single();

  if (error) throw error;
  return data as I18nOverrideRecord;
}
