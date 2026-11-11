/**
 * Keys copied into `locales/en-shell.json` and imported by the shared client bundle.
 * Everything else in `en.json` loads in a separate chunk via `loadEnglishCatalog()`.
 * Keep the shell file in sync — `catalog.test.ts` fails when `en.json` drifts.
 */
/** Includes `nav` so AppShell can paint without waiting on the full en.json chunk. */
export const ENGLISH_SHELL_NAMESPACES = ["app", "auth", "common", "errors", "nav", "trainingVerify"] as const;

/** Nested slices for public pages that render before the full catalog arrives. */
export const ENGLISH_SHELL_SLICES = {
  trainingCertificates: ["statuses"],
} as const;
