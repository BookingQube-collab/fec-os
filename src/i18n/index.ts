import i18n, { type TFunction } from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import { overridesToNested, type I18nOverrideRow } from "./overlay";

export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const APP_STORE_KEY = "fec-os-app";

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === "en" || value === "ar";
}

export function readStoredLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const raw = window.localStorage.getItem(APP_STORE_KEY);
    const lang = raw ? (JSON.parse(raw) as { state?: { language?: unknown } }).state?.language : null;
    if (isSupportedLanguage(lang)) return lang;
  } catch {
    /* ignore */
  }
  return "en";
}

export function applyLanguageToDocument(lang: SupportedLanguage) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "ar" ? "ar-QA" : "en";
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

const initialLng = readStoredLanguage();

let arabicLocaleLoad: Promise<void> | null = null;
let arabicFileLoaded = false;

/** Load Arabic strings on demand so English-first routes skip ~290KB of JSON. */
export function loadArabicLocale(): Promise<void> {
  if (arabicFileLoaded) return Promise.resolve();
  arabicLocaleLoad ??= import("./locales/ar.json").then((mod) => {
    i18n.addResourceBundle("ar", "translation", mod.default, true, false);
    arabicFileLoaded = true;
  });
  return arabicLocaleLoad;
}

/**
 * One in-flight apply so a click cannot set Arabic before the bundle exists,
 * and a later English default cannot finish after Arabic and stick.
 */
let desiredLanguage: SupportedLanguage | null = null;
let languageFlush: Promise<void> | null = null;

export function applyAppLanguage(lang: SupportedLanguage): Promise<void> {
  desiredLanguage = lang;
  applyLanguageToDocument(lang);
  if (languageFlush) return languageFlush;
  languageFlush = (async () => {
    try {
      while (desiredLanguage) {
        const next = desiredLanguage;
        desiredLanguage = null;
        await i18nReady;
        if (desiredLanguage) continue;
        if (next === "ar") await loadArabicLocale();
        if (desiredLanguage) continue;
        await i18n.changeLanguage(next);
        if (desiredLanguage) continue;
        applyLanguageToDocument(next);
      }
    } finally {
      languageFlush = null;
      if (desiredLanguage) void applyAppLanguage(desiredLanguage);
    }
  })();
  return languageFlush;
}

const i18nReady: Promise<void> = i18n.isInitialized
  ? Promise.resolve()
  : i18n
      .use(initReactI18next)
      .init({
        resources: {
          en: { translation: en },
        },
        // Stay on English until the Arabic bundle is in memory. applyAppLanguage switches after.
        lng: "en",
        fallbackLng: "en",
        interpolation: { escapeValue: false },
        react: {
          useSuspense: false,
          bindI18n: "languageChanged",
          bindI18nStore: "added",
        },
      })
      .then(
        () => undefined,
        () => undefined,
      );

if (typeof document !== "undefined") {
  applyLanguageToDocument(initialLng);
}

if (initialLng === "ar") {
  void applyAppLanguage("ar");
}

const i18nWithFlag = i18n as typeof i18n & { __dirBound?: boolean };
if (!i18nWithFlag.__dirBound) {
  i18nWithFlag.__dirBound = true;
  i18n.on("languageChanged", (lng) => {
    if (isSupportedLanguage(lng)) applyLanguageToDocument(lng);
  });
}

export function applyResourceOverlay(locale: SupportedLanguage, items: I18nOverrideRow[]) {
  const nested = overridesToNested(items.filter((row) => row.locale === locale));
  i18n.addResourceBundle(locale, "translation", nested, true, true);
}

export function translateRole(t: TFunction, role?: string | null) {
  if (!role) return t("nav.dashboard");
  const key = `roles.${role}`;
  const label = t(key);
  return label === key ? role.replace(/_/g, " ") : label;
}

export default i18n;